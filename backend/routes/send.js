import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { fileTypeFromFile } from "file-type";
import Message from "../models/Message.js";
import { asyncRoute, cleanText, HttpError, normalizePhone, objectId, publicMessage } from "../lib/utils.js";
import { assertWindow, deliver, replyContext, visibleMessage } from "../services/messages.js";

const router = express.Router();
const temp = path.join(os.tmpdir(), "omsai-chat-uploads");
fs.mkdirSync(temp, { recursive: true });
const upload = multer({ dest: temp, limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 8, fieldSize: 8192 } });
const exec = promisify(execFile);
let convertingVoice = false;

function contextPayload(context) { return context?.waMessageId ? { context: { message_id: context.waMessageId } } : {}; }
function withDelivery(req, phone, payload, fields) {
  return deliver({ phone, clientId: req.body.clientId, senderId: req.user._id, payload, fields, io: req.io });
}
const respond = (res, message, userId) => {
  if (message.status === "failed") {
    const err = new HttpError(409, "The earlier attempt with this message ID failed. Check the recipient before manually retrying with a new message ID.", "PREVIOUS_SEND_FAILED");
    err.messageId = String(message._id); throw err;
  }
  return res.status(message.status === "pending" ? 202 : 200).json(publicMessage(message, userId));
};

router.post("/", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (typeof req.body.message !== "string" || !req.body.message.trim() || req.body.message.length > 4096) throw new HttpError(400, "Write a message between 1 and 4096 characters.");
  await assertWindow(phone);
  const context = await replyContext(req.body.replyToId ? objectId(req.body.replyToId) : null, phone, req.user._id);
  const text = req.body.message.trim();
  const m = await withDelivery(req, phone, { type: "text", text: { body: text, preview_url: false }, ...contextPayload(context) }, { type: "text", message: text, context });
  respond(res, m, req.user._id);
}));

router.post("/media", upload.single("file"), asyncRoute(async (req, res) => {
  const file = req.file;
  let converted;
  try {
    if (!file) throw new HttpError(400, "Choose a file to send.");
    const phone = normalizePhone(req.body.phone);
    await assertWindow(phone);
    const context = await replyContext(req.body.replyToId ? objectId(req.body.replyToId) : null, phone, req.user._id);
    if (typeof req.body.clientId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(req.body.clientId)) throw new HttpError(400, "A valid client message ID is required.");
    const existing = typeof req.body.clientId === "string" ? await Message.findOne({ clientId: req.body.clientId, senderId: req.user._id, phone }) : null;
    if (existing) { await fsp.unlink(file.path).catch(() => {}); return respond(res, existing, req.user._id); }
    const detected = await fileTypeFromFile(file.path);
    const voice = req.body.voice === "true";
    let mime = detected?.mime;
    let filename = path.basename(file.originalname).replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "attachment";
    let filePath = file.path;
    let type;
    if (voice) {
      if (!["audio/ogg", "audio/mpeg", "audio/mp4", "video/mp4", "audio/wav", "audio/x-wav", "video/webm", "audio/webm"].includes(mime)) throw new HttpError(400, "Unsupported voice recording format.");
      const executable = process.env.FFMPEG_PATH || ffmpegStatic;
      if (!executable || !fs.existsSync(executable)) throw new HttpError(503, "Voice conversion is not configured on this server. Send an OGG/MP3 audio attachment instead.");
      if (convertingVoice) throw new HttpError(429, "Another voice note is being processed. Please try again shortly.");
      convertingVoice = true;
      converted = `${file.path}.ogg`;
      try {
        await exec(executable, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", file.path, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "24k", "-threads", "1", "-t", "120", converted], { timeout: 45000, maxBuffer: 65536 });
      } catch { throw new HttpError(400, "This recording could not be converted to a WhatsApp voice note."); }
      finally { convertingVoice = false; }
      mime = "audio/ogg"; filename = "voice-note.ogg"; type = "audio"; filePath = converted;
    } else {
      const images = ["image/jpeg", "image/png"];
      const audio = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/ogg"];
      const documents = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
      if (images.includes(mime)) { type = "image"; if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "Photos must be under 5 MB."); }
      else if (mime === "image/webp" && req.body.kind === "sticker") { type = "sticker"; if (file.size > 100 * 1024) throw new HttpError(413, "Static WebP stickers must be under 100 KB."); }
      else if (["video/mp4", "video/3gpp"].includes(mime)) type = "video";
      else if (audio.includes(mime)) type = "audio";
      else if (documents.includes(mime)) type = "document";
      else if (!detected && file.mimetype === "text/plain" && /\.txt$/i.test(filename)) {
        const content = await fsp.readFile(file.path);
        if (content.includes(0)) throw new HttpError(400, "This is not a plain-text file.");
        type = "document"; mime = "text/plain";
      } else throw new HttpError(400, "Unsupported file. Use JPG/PNG, MP4, MP3/M4A/OGG, PDF, an Office document, TXT, or a static WebP sticker.");
    }
    const { uploadMedia } = await import("../services/whatsapp.js");
    const mediaId = await uploadMedia(filePath, mime, filename);
    const caption = cleanText(req.body.caption, 1024);
    const media = { id: mediaId };
    if (["image", "video", "document"].includes(type) && caption) media.caption = caption;
    if (type === "document") media.filename = filename;
    if (voice) media.voice = true;
    const message = await withDelivery(req, phone, { type, [type]: media, ...contextPayload(context) }, {
      type, media: true, mediaId, mimeType: mime, filename, caption: ["image", "video", "document"].includes(type) ? caption : "", message: caption || filename,
      voice, context, mediaExpiresAt: new Date(Date.now() + 30 * 86400000)
    });
    await fsp.unlink(file.path).catch(() => {});
    if (converted) await fsp.unlink(converted).catch(() => {});
    respond(res, message, req.user._id);
  } finally {
    if (file?.path) await fsp.unlink(file.path).catch(() => {});
    if (converted) await fsp.unlink(converted).catch(() => {});
  }
}));

router.post("/location", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const lat = Number(req.body.latitude), lon = Number(req.body.longitude);
  if (req.body.latitude === "" || req.body.longitude === "" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "Enter valid latitude and longitude coordinates.");
  await assertWindow(phone);
  const location = { latitude: lat, longitude: lon, name: cleanText(req.body.name, 100), address: cleanText(req.body.address, 300) };
  const context = await replyContext(req.body.replyToId ? objectId(req.body.replyToId) : null, phone, req.user._id);
  const message = await withDelivery(req, phone, { type: "location", location, ...contextPayload(context) }, { type: "location", location, message: location.name || "Location", context });
  respond(res, message, req.user._id);
}));
router.post("/contact", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const sharedPhone = normalizePhone(req.body.sharedPhone);
  const name = cleanText(req.body.name, 100);
  if (!name) throw new HttpError(400, "Enter the contact's name.");
  await assertWindow(phone);
  const contacts = [{ name: { formatted_name: name, first_name: name }, phones: [{ phone: `+${sharedPhone}`, type: "CELL", wa_id: sharedPhone }] }];
  const context = await replyContext(req.body.replyToId ? objectId(req.body.replyToId) : null, phone, req.user._id);
  const message = await withDelivery(req, phone, { type: "contacts", contacts, ...contextPayload(context) }, { type: "contacts", contacts: [{ name, phone: sharedPhone }], message: name, context });
  respond(res, message, req.user._id);
}));
router.post("/forward", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const source = await visibleMessage(objectId(req.body.messageId), req.user._id);
  await assertWindow(phone);
  let payload;
  const fields = { type: source.type, message: source.message, forwarded: true };
  if (source.media) {
    if (!source.mediaId) throw new HttpError(410, "The original attachment is no longer available for forwarding.");
    const media = { id: source.mediaId };
    if (["image", "video", "document"].includes(source.type) && source.caption) media.caption = source.caption;
    if (source.type === "document") media.filename = source.filename || "document";
    if (source.voice) media.voice = true;
    payload = { type: source.type, [source.type]: media };
    Object.assign(fields, { media: true, mediaId: source.mediaId, mimeType: source.mimeType, filename: source.filename, caption: source.caption, voice: source.voice, mediaExpiresAt: source.mediaExpiresAt });
  } else if (source.type === "location") {
    fields.location = source.location;
    payload = { type: "location", location: source.location.toObject ? source.location.toObject() : source.location };
  } else if (source.type === "contacts") {
    fields.contacts = source.contacts;
    payload = { type: "contacts", contacts: source.contacts.map(c => ({ name: { formatted_name: c.name, first_name: c.name }, phones: [{ phone: `+${c.phone}`, type: "CELL" }] })) };
  } else if (["text", "template"].includes(source.type)) {
    fields.type = "text";
    payload = { type: "text", text: { body: source.message, preview_url: false } };
  } else throw new HttpError(400, "This message type cannot be forwarded.");
  respond(res, await withDelivery(req, phone, payload, fields), req.user._id);
}));

// This is a per-chat session-start action, NOT the removed marketing module.
router.post("/template", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = cleanText(req.body.name, 512);
  const language = cleanText(req.body.language, 16) || "en";
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) throw new HttpError(400, "Enter the exact approved template name and language code.");
  const params = req.body.parameters || [];
  if (!Array.isArray(params) || params.length > 10 || params.some(p => typeof p !== "string" || p.length > 1024)) throw new HttpError(400, "Use up to 10 text body parameters.");
  const template = { name, language: { code: language } };
  if (params.length) template.components = [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }];
  const text = `Template: ${name}${params.length ? ` · ${params.join(" · ")}` : ""}`;
  respond(res, await withDelivery(req, phone, { type: "template", template }, { type: "template", message: text }), req.user._id);
}));
export default router;
