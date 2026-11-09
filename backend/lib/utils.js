import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const objectId = value => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid item ID.");
  return new mongoose.Types.ObjectId(value);
};
export const cleanText = (value, max = 4096) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function normalizePhone(value) {
  const input = String(value || "").trim();
  const parsed = parsePhoneNumberFromString(input.startsWith("+") ? input : (input.replace(/\D/g, "").length === 10 ? input : `+${input}`), "IN");
  if (!parsed?.isPossible()) throw new HttpError(400, "Enter a valid phone number with its country code.", "INVALID_PHONE");
  return parsed.number.slice(1);
}
export const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const limitOf = (value, fallback = 50) => Math.max(1, Math.min(100, Number.parseInt(value, 10) || fallback));
export const preview = m => {
  if (!m) return "";
  if (m.type === "location") return `📍 ${m.location?.name || "Location"}`;
  if (m.type === "contacts") return `👤 ${m.contacts?.[0]?.name || "Contact"}`;
  if (m.media || ["image", "audio", "video", "document", "sticker"].includes(m.type)) {
    return m.caption || ({ image: "📷 Photo", video: "🎬 Video", audio: "🎙 Voice / audio", document: "📎 Document", sticker: "Sticker" }[m.type] || "📎 Attachment");
  }
  return m.message || "";
};
export function encodeCursor(message) {
  return Buffer.from(JSON.stringify({ t: new Date(message.createdAt).toISOString(), id: String(message._id) })).toString("base64url");
}
export function cursorCondition(value) {
  if (!value) return {};
  try {
    if (typeof value !== "string" || value.length > 250) throw new Error();
    const { t, id } = JSON.parse(Buffer.from(value, "base64url").toString());
    const date = new Date(t);
    if (!Number.isFinite(date.getTime())) throw new Error();
    const oid = objectId(id);
    return { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: oid } }] };
  } catch { throw new HttpError(400, "Invalid pagination cursor."); }
}
export function publicMessage(document, userId) {
  const m = document?.toObject ? document.toObject() : { ...document };
  m.starred = (m.starredBy || []).some(id => String(id) === String(userId));
  delete m.starredBy;
  delete m.hiddenFor;
  delete m.senderId;
  delete m.clientId;
  delete m.mediaId;
  return m;
}
export function safeUser(user) {
  const u = user.toObject ? user.toObject() : { ...user };
  delete u.password;
  delete u.tokenVersion;
  return u;
}
export const statusRank = { pending: 0, failed: 1.5, sent: 1, delivered: 2, seen: 3, played: 4 };
