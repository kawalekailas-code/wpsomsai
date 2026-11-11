import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import ChatState from "../models/ChatState.js";
import DeliveryReceipt from "../models/DeliveryReceipt.js";
import { HttpError, preview, statusRank } from "../lib/utils.js";
import { sendPayload } from "./whatsapp.js";

export async function assertWindow(phone) {
  const contact = await Contact.findOne({ phone }).lean();
  let lastInboundAt = contact?.lastInboundAt;
  if (!lastInboundAt) {
    const last = await Message.findOne({ phone, direction: "incoming" }).sort({ createdAt: -1 }).select("createdAt").lean();
    lastInboundAt = last?.createdAt;
    if (lastInboundAt) await Contact.updateOne({ phone }, { $max: { lastInboundAt } });
  }
  if (!lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() >= 24 * 60 * 60 * 1000) {
    throw new HttpError(409, "The 24-hour reply window is closed. Ask the contact to message you, or send an approved template.", "WINDOW_CLOSED");
  }
}

export async function visibleMessage(id, userId) {
  const m = await Message.findOne({ _id: id, hiddenFor: { $ne: userId } });
  if (!m) throw new HttpError(404, "Message not found.");
  const state = await ChatState.findOne({ userId, phone: m.phone }).lean();
  if (state?.clearedAt && new Date(m.receivedAt || m.createdAt) <= state.clearedAt) throw new HttpError(404, "Message not found.");
  return m;
}

export async function replyContext(replyToId, phone, userId) {
  if (!replyToId) return undefined;
  const m = await visibleMessage(replyToId, userId);
  if (m.phone !== phone) throw new HttpError(400, "Reply must reference a message in this chat.");
  if (!m.waMessageId) throw new HttpError(409, "This legacy or pending message has no WhatsApp ID, so a native reply is not available.");
  return { messageId: m._id, waMessageId: m.waMessageId, message: preview(m).slice(0, 300), direction: m.direction, type: m.type };
}

export async function touchContact(message, profileName = "") {
  const at = message.createdAt || new Date();
  const update = { $setOnInsert: { name: profileName || "", phone: message.phone, isSaved: false }, $set: { chatStarted: true }, $max: { lastActivityAt: message.receivedAt || at } };
  if (message.direction === "incoming") { update.$max.lastInboundAt = at; update.$max.lastInboundReceivedAt = message.receivedAt || at; }
  await Contact.updateOne({ phone: message.phone }, update, { upsert: true });
  await Contact.updateOne({ phone: message.phone, $or: [{ lastMessageAt: { $lte: at } }, { lastMessageAt: { $exists: false } }] }, {
    $set: { lastMessage: preview(message).slice(0, 200), lastMessageAt: at }
  });
}

export async function applyReceipt(message, receipt) {
  if (!receipt) return message;
  const dates = {};
  for (const key of ["deliveredAt", "readAt", "playedAt"]) if (receipt[key]) dates[key] = receipt[key];
  if (Object.keys(dates).length) await Message.updateOne({ _id: message._id }, { $min: dates });
  // Check the persisted status atomically. Concurrent, out-of-order webhooks
  // cannot downgrade a read/delivered message to an earlier state.
  const allowed = Object.keys(statusRank).filter(status => statusRank[status] <= statusRank[receipt.status]);
  await Message.updateOne({ _id: message._id, status: { $in: allowed } }, {
    $set: { status: receipt.status, ...(receipt.status === "failed" && receipt.error ? { error: receipt.error } : {}) }
  });
  return await Message.findById(message._id) || message;
}

export async function recordReceipt(id, status, timestamp, error, io) {
  const normalized = status === "read" ? "seen" : status;
  if (!Object.hasOwn(statusRank, normalized)) return;
  const rank = statusRank[normalized];
  const expiresAt = new Date(Date.now() + 2 * 86400000);
  const dates = {};
  if (normalized === "delivered") dates.deliveredAt = timestamp;
  if (normalized === "seen") dates.readAt = timestamp;
  if (normalized === "played") dates.playedAt = timestamp;
  const fields = { expiresAt, ...(error ? { error: String(error).slice(0, 500) } : {}) };
  let receipt = await DeliveryReceipt.findOne({ waMessageId: id });
  if (!receipt) {
    try { receipt = await DeliveryReceipt.create({ waMessageId: id, status: normalized, rank, ...fields, ...dates }); }
    catch (err) { if (err.code !== 11000) throw err; receipt = await DeliveryReceipt.findOne({ waMessageId: id }); }
  }
  if (Object.keys(dates).length) await DeliveryReceipt.updateOne({ waMessageId: id }, { $min: dates });
  await DeliveryReceipt.updateOne({ waMessageId: id, rank: { $lte: rank } }, { $set: { ...fields, status: normalized, rank } });
  receipt = await DeliveryReceipt.findOne({ waMessageId: id });
  const m = await Message.findOne({ waMessageId: id });
  if (m) {
    await applyReceipt(m, receipt);
    io?.emit("message:update", { phone: m.phone, id: String(m._id) });
  }
}

// Persist before sending and use a unique clientId. An ambiguous network timeout
// is not automatically retried: Meta does not offer exactly-once sending here.
export async function deliver({ phone, clientId, senderId, payload, fields, io }) {
  if (!clientId || typeof clientId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(clientId)) throw new HttpError(400, "A valid client message ID is required.");
  let message;
  try {
    message = await Message.create({ phone, clientId, senderId, direction: "outgoing", status: "pending", ...fields });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const previous = await Message.findOne({ clientId });
    if (!previous || String(previous.senderId) !== String(senderId) || previous.phone !== phone) throw new HttpError(409, "Message ID already used.");
    return previous;
  }
  try {
    message.waMessageId = await sendPayload(phone, payload);
    message.status = "sent";
    await message.save();
    const receipt = await DeliveryReceipt.findOne({ waMessageId: message.waMessageId });
    message = await applyReceipt(message, receipt);
    await touchContact(message);
    io?.emit("message:new", { phone, id: String(message._id) });
    io?.emit("chat:update", { phone });
    return message;
  } catch (err) {
    if (message.waMessageId) {
      // The API accepted the send; don't label a later DB/contact-write problem
      // as a safely retryable send failure.
      throw new HttpError(503, "WhatsApp accepted this message, but saving its state failed. Refresh before sending again.", "DELIVERY_UNCERTAIN");
    }
    message.status = "failed";
    message.error = err.message.slice(0, 500);
    await message.save();
    io?.emit("message:update", { phone, id: String(message._id) });
    err.messageId = String(message._id);
    throw err;
  }
}
