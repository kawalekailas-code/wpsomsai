import express from "express";
import mongoose from "mongoose";
import axios from "axios";
import { Transform } from "node:stream";
import { once } from "node:events";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import ChatState from "../models/ChatState.js";
import User from "../models/User.js";
import { asyncRoute, cleanText, cursorCondition, encodeCursor, escapeRegex, HttpError, limitOf, normalizePhone, objectId, preview, publicMessage, safeUser } from "../lib/utils.js";
import { visibleMessage, assertWindow } from "../services/messages.js";
import { graphUrl, markRead, mediaInfo, metaHeaders, metaError, sendPayload } from "../services/whatsapp.js";

const router = express.Router();
const epoch = new Date(0);
const notHidden = userId => ({ hiddenFor: { $ne: userId } });

router.get("/config", (req, res) => res.json({
  name: "OmSai Chat", connection: "cloud-api", retentionDays: 30,
  incomingMediaDays: 7, outgoingMediaDays: 30, maxUploadMB: 16,
  voiceNotes: fs.existsSync(process.env.FFMPEG_PATH || ffmpegPath || ""),
  displayPhone: process.env.DISPLAY_PHONE_NUMBER || "",
  templatesAvailable: Boolean(process.env.WABA_ID),
  capabilities: { replies: true, reactions: true, media: true, location: true, contacts: true, groups: false, statusStories: false, personalCalls: false, personalQrLogin: false }
}));

router.patch("/me", asyncRoute(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (Object.hasOwn(req.body, "displayName")) {
    if (typeof req.body.displayName !== "string" || !req.body.displayName.trim()) throw new HttpError(400, "Display name cannot be empty.");
    user.displayName = cleanText(req.body.displayName, 80);
  }
  if (Object.hasOwn(req.body, "about")) user.about = cleanText(req.body.about, 140);
  const p = req.body.preferences;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const enums = { theme: ["light", "dark", "system"], wallpaper: ["doodle", "sage", "sand", "plain"], fontSize: ["small", "medium", "large"] };
    for (const [key, values] of Object.entries(enums)) {
      if (Object.hasOwn(p, key)) {
        if (!values.includes(p[key])) throw new HttpError(400, `Invalid ${key}.`);
        user.preferences[key] = p[key];
      }
    }
    for (const key of ["sound", "desktopNotifications", "enterToSend"]) {
      if (Object.hasOwn(p, key)) {
        if (typeof p[key] !== "boolean") throw new HttpError(400, `Invalid ${key}.`);
        user.preferences[key] = p[key];
      }
    }
    if (Object.hasOwn(p, "quickReplies")) {
      if (!Array.isArray(p.quickReplies) || p.quickReplies.length > 20 || p.quickReplies.some(s => typeof s !== "string" || s.length > 300)) throw new HttpError(400, "Use up to 20 quick replies, each under 300 characters.");
      user.preferences.quickReplies = [...new Set(p.quickReplies.map(s => s.trim()).filter(Boolean))];
    }
  }
  await user.save();
  res.json(safeUser(user));
}));

function contactsPipeline(userId, { phone, q = "", filter = "all" } = {}) {
  const query = phone ? { phone } : { chatStarted: { $ne: false } };
  if (q) query.$or = ["name", "phone", "lastMessage"].map(key => ({ [key]: { $regex: escapeRegex(q), $options: "i" } }));
  const pipeline = [
    { $match: query },
    { $lookup: { from: "chatstates", let: { phone: "$phone" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$phone", "$$phone"] }, { $eq: ["$userId", userId] }] } } }], as: "state" } },
    { $unwind: { path: "$state", preserveNullAndEmptyArrays: true } },
    { $set: {
      pinned: { $ifNull: ["$state.pinned", { $ifNull: ["$pinned", false] }] },
      archived: { $ifNull: ["$state.archived", false] },
      mutedUntil: "$state.mutedUntil",
      activity: { $ifNull: ["$lastActivityAt", "$updatedAt"] },
      hasUnread: { $or: [
        { $eq: ["$state.manualUnread", true] },
        { $gt: [{ $ifNull: ["$lastInboundAt", epoch] }, { $ifNull: ["$state.lastReadAt", epoch] }] },
        { $and: [{ $eq: [{ $ifNull: ["$lastInboundAt", null] }, null] }, { $eq: [{ $ifNull: ["$state.lastReadAt", null] }, null] }, { $gt: ["$unread", 0] }] }
      ] }
    } },
    { $match: { $expr: { $or: [{ $eq: [{ $ifNull: ["$state.hiddenAt", null] }, null] }, { $gt: ["$activity", "$state.hiddenAt"] }] } } }
  ];
  if (!phone) {
    pipeline.push({ $match: { archived: filter === "archived", ...(filter === "unread" ? { hasUnread: true } : {}) } });
  }
  return pipeline;
}
const latestLookup = userId => ({ $lookup: {
  from: "messages", let: { phone: "$phone", clearedAt: { $ifNull: ["$state.clearedAt", epoch] } },
  pipeline: [
    { $match: { $expr: { $and: [
      { $eq: ["$phone", "$$phone"] }, { $gt: ["$createdAt", "$$clearedAt"] },
      { $not: [{ $in: [userId, { $ifNull: ["$hiddenFor", []] }] }] }
    ] } } },
    { $sort: { createdAt: -1, _id: -1 } }, { $limit: 1 },
    { $project: { message: 1, type: 1, direction: 1, status: 1, createdAt: 1, media: 1, caption: 1, location: 1, contacts: 1 } }
  ], as: "latest"
} });
function contactOutput(c) {
  const m = c.latest?.[0];
  return {
    _id: c._id, phone: c.phone, name: c.name || "", notes: c.notes || "", isSaved: c.isSaved !== false, chatStarted: c.chatStarted !== false,
    createdAt: c.createdAt, lastInboundAt: c.lastInboundAt,
    lastActivityAt: c.activity || c.updatedAt,
    lastMessage: preview(m), lastMessageAt: m?.createdAt,
    lastDirection: m?.direction, lastStatus: m?.status,
    pinned: Boolean(c.pinned), archived: Boolean(c.archived),
    hasUnread: Boolean(c.hasUnread), mutedUntil: c.mutedUntil || null
  };
}
router.get("/contacts", asyncRoute(async (req, res) => {
  const page = Math.min(1000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const limit = limitOf(req.query.limit, 40);
  const q = cleanText(req.query.q, 80);
  const filter = ["all", "unread", "archived"].includes(req.query.filter) ? req.query.filter : "all";
  const [result] = await Contact.aggregate([
    ...contactsPipeline(req.user._id, { q, filter }),
    { $facet: {
      total: [{ $count: "count" }],
      contacts: [{ $sort: { pinned: -1, activity: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, latestLookup(req.user._id)]
    } }
  ]);
  res.json({ contacts: result.contacts.map(contactOutput), total: result.total[0]?.count || 0, page, hasMore: page * limit < (result.total[0]?.count || 0) });
}));
router.get("/contacts/:phone", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const [contact] = await Contact.aggregate([...contactsPipeline(req.user._id, { phone }), latestLookup(req.user._id)]);
  if (!contact) throw new HttpError(404, "Contact not found.");
  res.json(contactOutput(contact));
}));
router.patch("/chats/:phone", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const contact = await Contact.findOne({ phone }).lean();
  if (!contact) throw new HttpError(404, "Contact not found.");
  const state = await ChatState.findOne({ userId: req.user._id, phone }) || new ChatState({ userId: req.user._id, phone, pinned: contact.pinned || false });
  for (const key of ["pinned", "archived", "manualUnread"]) {
    if (Object.hasOwn(req.body, key)) {
      if (typeof req.body[key] !== "boolean") throw new HttpError(400, `Invalid ${key}.`);
      state[key] = req.body[key];
    }
  }
  if (Object.hasOwn(req.body, "mutedUntil")) {
    const date = req.body.mutedUntil ? new Date(req.body.mutedUntil) : null;
    if (date && (!Number.isFinite(date.getTime()) || date < new Date())) throw new HttpError(400, "Select a future mute time.");
    state.mutedUntil = date;
  }
  await state.save();
  req.io?.to(`user:${req.user._id}`).emit("chat:state", { phone });
  res.json({ success: true });
}));
router.post("/chats/:phone/read", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (!await Contact.exists({ phone })) throw new HttpError(404, "Contact not found.");
  await ChatState.updateOne({ userId: req.user._id, phone }, { $set: { lastReadAt: new Date(), manualUnread: false } }, { upsert: true });
  const latest = await Message.findOne({ phone, direction: "incoming", waMessageId: { $exists: true } }).sort({ createdAt: -1 }).select("waMessageId").lean();
  let receiptWarning;
  if (latest) {
    try { await markRead(latest.waMessageId); }
    catch { receiptWarning = "Marked read in this app, but WhatsApp could not confirm the read receipt."; }
  }
  req.io?.to(`user:${req.user._id}`).emit("chat:state", { phone });
  res.json({ success: true, ...(receiptWarning ? { warning: receiptWarning } : {}) });
}));
router.post("/chats/:phone/clear", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  await ChatState.updateOne({ userId: req.user._id, phone }, { $set: { clearedAt: new Date(), lastReadAt: new Date(), manualUnread: false } }, { upsert: true });
  await Message.updateMany({ phone }, { $pull: { starredBy: req.user._id } });
  req.io?.to(`user:${req.user._id}`).emit("chat:cleared", { phone });
  res.json({ success: true });
}));
router.delete("/chats/:phone", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  await ChatState.updateOne({ userId: req.user._id, phone }, { $set: { clearedAt: new Date(), hiddenAt: new Date(), manualUnread: false, pinned: false } }, { upsert: true });
  await Message.updateMany({ phone }, { $pull: { starredBy: req.user._id } });
  req.io?.to(`user:${req.user._id}`).emit("chat:cleared", { phone });
  res.json({ success: true });
}));

router.get("/messages/:phone", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const state = await ChatState.findOne({ userId: req.user._id, phone }).lean();
  const base = { phone, ...notHidden(req.user._id), ...(state?.clearedAt ? { createdAt: { $gt: state.clearedAt } } : {}) };
  if (req.query.around) {
    const anchor = await visibleMessage(objectId(req.query.around), req.user._id);
    if (anchor.phone !== phone) throw new HttpError(400, "This message belongs to another chat.");
    const older = await Message.find({ ...base, $or: [{ createdAt: { $lt: anchor.createdAt } }, { createdAt: anchor.createdAt, _id: { $lt: anchor._id } }] }).sort({ createdAt: -1, _id: -1 }).limit(25).lean();
    const newer = await Message.find({ ...base, $or: [{ createdAt: { $gt: anchor.createdAt } }, { createdAt: anchor.createdAt, _id: { $gte: anchor._id } }] }).sort({ createdAt: 1, _id: 1 }).limit(26).lean();
    const nextCursor = older.length === 25 ? encodeCursor(older[older.length - 1]) : null;
    return res.json({ messages: [...older.reverse(), ...newer].map(m => publicMessage(m, req.user._id)), nextCursor, around: true });
  }
  const query = { ...base, ...cursorCondition(req.query.before) };
  const limit = limitOf(req.query.limit);
  const messages = await Message.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();
  const nextCursor = hasMore && messages.length ? encodeCursor(messages[messages.length - 1]) : null;
  res.json({ messages: messages.reverse().map(m => publicMessage(m, req.user._id)), nextCursor });
}));
router.get("/message/:id", asyncRoute(async (req, res) => res.json(publicMessage(await visibleMessage(objectId(req.params.id), req.user._id), req.user._id))));
router.get("/search-messages", asyncRoute(async (req, res) => {
  const q = cleanText(req.query.q, 100);
  if (!q) return res.json({ messages: [] });
  const query = { ...notHidden(req.user._id), $or: [{ message: { $regex: escapeRegex(q), $options: "i" } }, { caption: { $regex: escapeRegex(q), $options: "i" } }] };
  if (req.query.phone) query.phone = normalizePhone(req.query.phone);
  const states = await ChatState.find({ userId: req.user._id, clearedAt: { $exists: true } }).select("phone clearedAt").lean();
  if (states.length) query.$nor = states.map(s => ({ phone: s.phone, createdAt: { $lte: s.clearedAt } }));
  const messages = await Message.find(query).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
  res.json({ messages: messages.map(m => publicMessage(m, req.user._id)) });
}));
router.get("/starred", asyncRoute(async (req, res) => {
  const limit = limitOf(req.query.limit);
  const messages = await Message.find({ starredBy: req.user._id, ...notHidden(req.user._id), ...cursorCondition(req.query.before) }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();
  res.json({ messages: messages.map(m => publicMessage(m, req.user._id)), nextCursor: hasMore ? encodeCursor(messages[messages.length - 1]) : null });
}));
router.patch("/messages/:id/star", asyncRoute(async (req, res) => {
  const message = await visibleMessage(objectId(req.params.id), req.user._id);
  if (typeof req.body.starred !== "boolean") throw new HttpError(400, "Choose whether to star the message.");
  await Message.updateOne({ _id: message._id }, { [req.body.starred ? "$addToSet" : "$pull"]: { starredBy: req.user._id } });
  req.io?.to(`user:${req.user._id}`).emit("message:update", { phone: message.phone, id: String(message._id) });
  res.json({ success: true, starred: req.body.starred });
}));
router.delete("/messages/:id", asyncRoute(async (req, res) => {
  const message = await visibleMessage(objectId(req.params.id), req.user._id);
  await Message.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: req.user._id }, $pull: { starredBy: req.user._id } });
  req.io?.to(`user:${req.user._id}`).emit("message:hidden", { phone: message.phone, id: String(message._id) });
  res.json({ success: true });
}));
router.post("/messages/:id/reaction", asyncRoute(async (req, res) => {
  const message = await visibleMessage(objectId(req.params.id), req.user._id);
  const emoji = req.body.emoji;
  if (typeof emoji !== "string" || emoji.length > 32 || [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(emoji)].length > 1) throw new HttpError(400, "Choose one emoji, or an empty string to remove it.");
  if (!message.waMessageId || Date.now() - message.createdAt.getTime() > 30 * 86400000) throw new HttpError(409, "A reaction needs a WhatsApp message ID less than 30 days old.");
  await assertWindow(message.phone);
  await sendPayload(message.phone, { type: "reaction", reaction: { message_id: message.waMessageId, emoji } });
  message.set("reactions.self", emoji);
  await message.save();
  req.io?.emit("message:update", { phone: message.phone, id: String(message._id) });
  res.json(publicMessage(message, req.user._id));
}));

router.get("/media/:id", asyncRoute(async (req, res) => {
  const message = await visibleMessage(objectId(req.params.id), req.user._id);
  if (!message.mediaId) throw new HttpError(410, "This old local attachment is unavailable. Migrate legacy uploads before redeploying, or ask the sender to share it again.", "MEDIA_EXPIRED");
  const info = await mediaInfo(message.mediaId);
  let stream;
  try {
    stream = await axios.get(info.url, { headers: { ...metaHeaders(), ...(typeof req.headers.range === "string" && /^bytes=\d*-\d*$/.test(req.headers.range) ? { Range: req.headers.range } : {}) }, responseType: "stream", maxRedirects: 0, timeout: 45000 });
  } catch { throw new HttpError(410, "The attachment could not be downloaded. Please try again.", "MEDIA_EXPIRED"); }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", message.mimeType || info.mime_type || "application/octet-stream");
  const filename = (message.filename || "attachment").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (stream.status === 206) res.status(206);
  for (const key of ["content-length", "content-range", "accept-ranges"]) if (stream.headers[key]) res.setHeader(key, stream.headers[key]);
  let bytes = 0;
  const limiter = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(bytes > 16 * 1024 * 1024 ? new Error("Media exceeds the app limit") : null, chunk);
  } });
  const fail = () => { stream.data.destroy(); if (!res.destroyed) res.destroy(); };
  limiter.on("error", fail);
  stream.data.on("error", fail);
  res.on("close", () => stream.data.destroy());
  stream.data.pipe(limiter).pipe(res);
}));
router.get("/chats/:phone/shared", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const state = await ChatState.findOne({ userId: req.user._id, phone }).lean();
  const kind = req.query.kind;
  const query = { phone, ...notHidden(req.user._id), ...(state?.clearedAt ? { createdAt: { $gt: state.clearedAt } } : {}), ...cursorCondition(req.query.before) };
  if (kind === "links") { query.message = { $regex: "https?://" }; query.media = { $ne: true }; }
  else if (kind === "files") { query.media = true; query.type = "document"; }
  else { query.media = true; query.type = { $in: ["image", "video", "audio", "sticker"] }; }
  const limit = limitOf(req.query.limit, 12);
  const messages = await Message.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const more = messages.length > limit; if (more) messages.pop();
  res.json({ messages: messages.map(m => publicMessage(m, req.user._id)), nextCursor: more ? encodeCursor(messages[messages.length - 1]) : null });
}));
router.get("/chats/:phone/export", asyncRoute(async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const state = await ChatState.findOne({ userId: req.user._id, phone }).lean();
  const contact = await Contact.findOne({ phone }).lean();
  if (!contact) throw new HttpError(404, "Contact not found.");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="chat-${phone}.txt"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.write(`OmSai Chat — ${contact.name || phone}\nApp-visible history only; no attachment binaries. 30-day retention applies.\n\n`);
  const cursor = Message.find({ phone, ...notHidden(req.user._id), ...(state?.clearedAt ? { createdAt: { $gt: state.clearedAt } } : {}) }).sort({ createdAt: 1, _id: 1 }).lean().cursor();
  try {
    for await (const m of cursor) {
      if (res.destroyed) break;
      const row = `[${new Date(m.createdAt).toISOString()}] ${m.direction === "outgoing" ? "You" : (contact.name || phone)}: ${preview(m)}\n`;
      if (!res.write(row)) {
        const controller = new AbortController();
        try { await Promise.race([once(res, "drain", { signal: controller.signal }), once(res, "close", { signal: controller.signal })]); }
        finally { controller.abort(); }
      }
    }
    if (!res.destroyed) res.end();
  } finally { await cursor.close(); }
}));
router.get("/templates", asyncRoute(async (req, res) => {
  if (!process.env.WABA_ID) return res.json({ templates: [], manualEntry: true });
  try {
    const { data } = await axios.get(graphUrl(`${process.env.WABA_ID}/message_templates`), { headers: metaHeaders(), params: { fields: "name,language,status,components", limit: 100 }, timeout: 15000 });
    res.json({ templates: (data.data || []).filter(t => t.status === "APPROVED"), manualEntry: false });
  } catch (err) { throw metaError(err); }
}));
export default router;
