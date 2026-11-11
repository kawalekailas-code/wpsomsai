import Message from "../models/Message.js";
import { cleanText } from "../lib/utils.js";
import { touchContact } from "./messages.js";

export const eventTime = ts => {
  const time = Number(ts) * 1000;
  return new Date(Number.isFinite(time) && time > 0 ? Math.min(time, Date.now() + 300000) : Date.now());
};

export async function receiveMessage(msg, value, io) {
  const phone = typeof msg?.from === "string" ? msg.from : "";
  if (!/^\d{6,15}$/.test(phone)) return { attention: true, reason: msg.from_user_id ? "BSUID_ONLY: Message safely captured. This phone-based chat UI cannot yet reply to a hidden-number sender. Export or review this event; do not guess a phone number." : "MISSING_SENDER: Sender number missing or invalid; original event retained." };
  if (typeof msg.id !== "string" || !msg.id) return { attention: true, reason: "MISSING_MESSAGE_ID: Original event retained for review." };
  if (msg.type === "reaction" || msg.reaction) {
    const emoji = cleanText(msg.reaction?.emoji, 32);
    const target = await Message.findOneAndUpdate({ waMessageId: msg.reaction?.message_id, phone }, { $set: { "reactions.contact": emoji } }, { returnDocument: "after" });
    if (target) io?.emit("message:update", { phone, id: String(target._id) });
    return target ? {} : { attention: true, reason: "REACTION_TARGET_MISSING: Original reaction retained. Retry after its target arrives." };
  }
  const type = msg.type || "unsupported";
  const at = eventTime(msg.timestamp);
  const fields = { phone, waMessageId: msg.id, direction: "incoming", status: "delivered", type: "unsupported", message: "Unsupported WhatsApp message", createdAt: at, updatedAt: new Date(), receivedAt: new Date() };
  if (type === "text" && typeof msg.text?.body === "string") Object.assign(fields, { type, message: cleanText(msg.text?.body, 4096) });
  else if (["image", "video", "audio", "document", "sticker"].includes(type) && msg[type]?.id) {
    const media = msg[type];
    Object.assign(fields, { type, media: true, mediaId: media.id, mimeType: cleanText(media.mime_type, 100), filename: cleanText(media.filename, 100) || `${type}-${Date.now()}`, caption: cleanText(media.caption, 1024), message: cleanText(media.caption || media.filename || type, 1024), voice: Boolean(media.voice), mediaExpiresAt: new Date(at.getTime() + 7 * 86400000) });
  } else if (type === "location" && typeof msg.location?.latitude === "number" && typeof msg.location?.longitude === "number" && Number.isFinite(msg.location.latitude) && Number.isFinite(msg.location.longitude) && Math.abs(msg.location.latitude) <= 90 && Math.abs(msg.location.longitude) <= 180) {
    Object.assign(fields, { type, message: cleanText(msg.location?.name, 100) || "Location", location: { latitude: msg.location?.latitude, longitude: msg.location?.longitude, name: cleanText(msg.location?.name, 100), address: cleanText(msg.location?.address, 300) } });
  } else if (type === "contacts" && Array.isArray(msg.contacts) && msg.contacts.some(c => c && typeof c === "object")) {
    const contacts = msg.contacts.filter(c => c && typeof c === "object").slice(0, 10).map(c => ({ name: cleanText(c.name?.formatted_name || c.name?.first_name, 100), phone: String(c.phones?.[0]?.wa_id || c.phones?.[0]?.phone || "").replace(/\D/g, "").slice(0, 15) }));
    Object.assign(fields, { type, contacts, message: contacts[0]?.name || "Contact" });
  } else if ((type === "interactive" || type === "button") && typeof (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.button?.text) === "string") {
    Object.assign(fields, { type: "text", message: cleanText(msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.button?.text, 4096) });
  }
  if (msg.context?.id) {
    const original = await Message.findOne({ phone, waMessageId: msg.context.id }).select("_id message direction type caption").lean();
    fields.context = { waMessageId: msg.context.id, messageId: original?._id, message: (original?.caption || original?.message || "Earlier message").slice(0, 300), direction: original?.direction, type: original?.type };
  }
  let message;
  try { [message] = await Message.create([fields], { timestamps: { updatedAt: false } }); }
  catch (err) {
    if (err.code !== 11000) throw err;
    message = await Message.findOne({ waMessageId: msg.id });
  }
  if (!message) throw new Error("Duplicate message could not be recovered.");
  const profile = value.contacts?.find(c => c.wa_id === phone)?.profile?.name || "";
  await touchContact(message, cleanText(profile, 100));
  // Re-emit on a retry too: a prior write may have succeeded before a contact/socket failure.
  {
    io?.emit("message:new", { phone, id: String(message._id) });
    io?.emit("chat:update", { phone });
  }
  return fields.type === "unsupported" ? { attention: true, reason: `UNSUPPORTED_TYPE: ${String(type).slice(0, 80)}. Original event retained.` } : {};
}
