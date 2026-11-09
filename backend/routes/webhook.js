import express from "express";
import crypto from "node:crypto";
import Message from "../models/Message.js";
import { asyncRoute, cleanText } from "../lib/utils.js";
import { recordReceipt, touchContact } from "../services/messages.js";

const router = express.Router();
export function verifyWebhookSignature(req, res, next) {
  const secret = process.env.APP_SECRET;
  if (!secret) return res.status(503).json({ error: "Webhook signing is not configured." });
  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !Buffer.isBuffer(req.rawBody)) return res.sendStatus(403);
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex")}`;
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(403);
  next();
}
router.get("/", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) return res.status(200).send(String(req.query["hub.challenge"] || ""));
  res.sendStatus(403);
});
const eventTime = ts => {
  const time = Number(ts) * 1000;
  return new Date(Number.isFinite(time) && time > 0 ? Math.min(time, Date.now() + 300000) : Date.now());
};

async function receiveMessage(msg, value, io) {
  const phone = String(msg.from || "");
  if (!/^\d{6,15}$/.test(phone) || typeof msg.id !== "string") return;
  if (msg.type === "reaction" || msg.reaction) {
    const emoji = cleanText(msg.reaction?.emoji, 32);
    const target = await Message.findOneAndUpdate({ waMessageId: msg.reaction?.message_id, phone }, { $set: { "reactions.contact": emoji } }, { returnDocument: "after" });
    if (target) io?.emit("message:update", { phone, id: String(target._id) });
    return;
  }
  const type = msg.type || "unsupported";
  const at = eventTime(msg.timestamp);
  const fields = { phone, waMessageId: msg.id, direction: "incoming", status: "delivered", type: "unsupported", message: "Unsupported WhatsApp message", createdAt: at };
  if (type === "text") Object.assign(fields, { type, message: cleanText(msg.text?.body, 4096) });
  else if (["image", "video", "audio", "document", "sticker"].includes(type) && msg[type]?.id) {
    const media = msg[type];
    Object.assign(fields, { type, media: true, mediaId: media.id, mimeType: cleanText(media.mime_type, 100), filename: cleanText(media.filename, 100) || `${type}-${Date.now()}`, caption: cleanText(media.caption, 1024), message: cleanText(media.caption || media.filename || type, 1024), voice: Boolean(media.voice), mediaExpiresAt: new Date(at.getTime() + 7 * 86400000) });
  } else if (type === "location") {
    Object.assign(fields, { type, message: cleanText(msg.location?.name, 100) || "Location", location: { latitude: msg.location?.latitude, longitude: msg.location?.longitude, name: cleanText(msg.location?.name, 100), address: cleanText(msg.location?.address, 300) } });
  } else if (type === "contacts") {
    const contacts = (msg.contacts || []).slice(0, 10).map(c => ({ name: cleanText(c.name?.formatted_name || c.name?.first_name, 100), phone: String(c.phones?.[0]?.wa_id || c.phones?.[0]?.phone || "").replace(/\D/g, "").slice(0, 15) }));
    Object.assign(fields, { type, contacts, message: contacts[0]?.name || "Contact" });
  } else if (type === "interactive" || type === "button") {
    Object.assign(fields, { type: "text", message: cleanText(msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.button?.text || "Interactive response", 4096) });
  }
  if (msg.context?.id) {
    const original = await Message.findOne({ phone, waMessageId: msg.context.id }).select("_id message direction type caption").lean();
    fields.context = { waMessageId: msg.context.id, messageId: original?._id, message: (original?.caption || original?.message || "Earlier message").slice(0, 300), direction: original?.direction, type: original?.type };
  }
  let message, inserted = true;
  try { message = await Message.create(fields); }
  catch (err) {
    if (err.code !== 11000) throw err;
    inserted = false;
    message = await Message.findOne({ waMessageId: msg.id });
  }
  if (!message) return;
  const profile = value.contacts?.find(c => c.wa_id === phone)?.profile?.name || "";
  await touchContact(message, cleanText(profile, 100));
  if (inserted) {
    io?.emit("message:new", { phone, id: String(message._id) });
    io?.emit("chat:update", { phone });
  }
}
router.post("/", verifyWebhookSignature, asyncRoute(async (req, res) => {
  // No media download or other slow network call here. Acknowledge only after
  // durable writes; on a DB failure return 5xx so Meta can safely retry.
  for (const entry of (req.body.entry || [])) {
    for (const change of (entry.changes || [])) {
      const value = change.value || {};
      if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== process.env.PHONE_ID) continue;
      for (const status of (value.statuses || [])) {
        if (status.id && status.status) await recordReceipt(status.id, status.status, eventTime(status.timestamp), status.errors?.[0]?.message || status.errors?.[0]?.error_data?.details, req.io);
      }
      for (const message of (value.messages || [])) await receiveMessage(message, value, req.io);
    }
  }
  res.sendStatus(200);
}));
export default router;
