import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileTypeFromFile } from "file-type";
import { rateLimit } from "express-rate-limit";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute, HttpError, objectId, limitOf } from "../lib/utils.js";
import { contactPhone, safeCsvCell } from "../services/contacts.js";
import Contact from "../models/Contact.js";
import TemplateJob from "../models/TemplateJob.js";
import TemplateRecipient from "../models/TemplateRecipient.js";
import TemplateUpload from "../models/TemplateUpload.js";
import Message from "../models/Message.js";
import { approvedTemplates, findTemplate, compileTemplate, resetTemplateCache } from "../services/templates.js";
import { uploadMedia } from "../services/whatsapp.js";
import { maxRecipients, senderGap, recipientPreview, sealPreview, createJob, publicJob, controlJob, finishJob } from "../services/template-sender.js";
import { sendingSafety } from "../services/safety.js";
const router = express.Router();
router.use(requireAdmin);
const limited = rateLimit({ windowMs: 60000, limit: 20, keyGenerator: req => String(req.user._id), standardHeaders: "draft-8", legacyHeaders: false });
const temp = path.join(os.tmpdir(), "omsai-template-uploads"); fs.mkdirSync(temp, { recursive: true });
const upload = multer({ dest: temp, limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024 } });
router.get("/templates", asyncRoute(async (req, res) => res.json({ templates: await approvedTemplates(), maxRecipients: maxRecipients(), gapMs: senderGap(), workerEnabled: process.env.SENDER_ENABLED === "true" })));
router.post("/refresh-templates", limited, asyncRoute(async (req, res) => { resetTemplateCache(); res.json({ templates: await approvedTemplates(), maxRecipients: maxRecipients(), gapMs: senderGap(), workerEnabled: process.env.SENDER_ENABLED === "true" }); }));
router.post("/preview", limited, asyncRoute(async (req, res) => { const preview = await recipientPreview(req.body); res.json({ ...preview, previewToken: sealPreview(preview, req.user._id) }); }));
router.post("/upload", limited, upload.single("file"), asyncRoute(async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw new HttpError(400, "Select an image or MP4 file.");
    const template = await findTemplate(req.body.name, req.body.language);
    if (!["IMAGE", "VIDEO"].includes(template.header)) throw new HttpError(400, "This template does not require image/video media.");
    const detected = await fileTypeFromFile(file.path), type = template.header.toLowerCase();
    if (type === "image" && (!["image/jpeg", "image/png"].includes(detected?.mime) || file.size > 5 * 1024 * 1024)) throw new HttpError(400, "Use a genuine JPEG/PNG image up to 5 MB.");
    if (type === "video" && detected?.mime !== "video/mp4") throw new HttpError(400, "Use a genuine WhatsApp-compatible MP4 up to 16 MB. No conversion is performed.");
    const filename = path.basename(file.originalname).replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);
    const mediaId = await uploadMedia(file.path, detected.mime, filename);
    const media = await TemplateUpload.create({ owner: req.user._id, templateName: template.name, language: template.language, mediaId, type, mimeType: detected.mime, filename, bytes: file.size, expiresAt: new Date(Date.now() + 29 * 86400000) });
    res.status(201).json({ uploadId: media._id, type, filename, bytes: file.size });
  } finally { if (file) await fsp.unlink(file.path).catch(() => {}); }
}));
router.post("/jobs", limited, asyncRoute(async (req, res) => {
  if (process.env.SENDER_ENABLED !== "true") throw new HttpError(409, "Sending is disabled. Set SENDER_ENABLED=true privately after completing incoming/webhook checks.", "SENDER_DISABLED");
  const prior = typeof req.body.requestId === "string" ? await TemplateJob.findOne({ requestId: req.body.requestId, createdBy: req.user._id }) : null;
  if (prior) return res.json(await publicJob(prior));
  const reason = await sendingSafety(); if (reason) throw new HttpError(409, reason);
  const t = await findTemplate(req.body.name, req.body.language);
  if (req.body.templateSignature !== t.signature) throw new HttpError(409, "Template changed after selection. Refresh templates and review the content again before queueing.");
  let media;
  if (req.body.uploadId) {
    const uploaded = await TemplateUpload.findOne({ _id: objectId(req.body.uploadId), owner: req.user._id, templateName: t.name, language: t.language, expiresAt: { $gt: new Date() } }).lean();
    if (!uploaded) throw new HttpError(400, "Upload expired, belongs to another user, or does not match this template/language.");
    media = { mediaId: uploaded.mediaId, type: uploaded.type, mimeType: uploaded.mimeType, filename: uploaded.filename, createdAt: uploaded.createdAt, bytes: uploaded.bytes };
  }
  const compiled = compileTemplate(t, req.body, media);
  const job = await createJob({ input: req.body, user: req.user, ...compiled, media, signature: t.signature });
  req.io?.emit("sender:update", { jobId: String(job._id) }); res.status(201).json(await publicJob(job));
}));
router.get("/jobs", asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
  const jobs = await TemplateJob.find().sort({ createdAt: -1 }).skip((page - 1) * 10).limit(11).lean();
  res.json({ jobs: await Promise.all(jobs.slice(0, 10).map(publicJob)), hasMore: jobs.length > 10, page });
}));
router.get("/jobs/:id", asyncRoute(async (req, res) => {
  const job = await TemplateJob.findById(objectId(req.params.id)); if (!job) throw new HttpError(404, "Job not found or its retention period ended.");
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1)), limit = limitOf(req.query.limit, 50);
  const query = { jobId: job._id };
  if (req.query.state && ["pending", "sending", "accepted", "delivered", "seen", "played", "failed", "uncertain", "cancelled", "reviewed"].includes(req.query.state)) query.state = req.query.state;
  const [rows, total] = await Promise.all([TemplateRecipient.find(query).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).select("-clientId").lean(), TemplateRecipient.countDocuments(query)]);
  res.json({ job: await publicJob(job), recipients: rows, total, page, hasMore: page * limit < total });
}));
router.post("/jobs/:id/control", limited, asyncRoute(async (req, res) => {
  const job = await TemplateJob.findById(objectId(req.params.id)); if (!job) throw new HttpError(404, "Job not found.");
  if (req.body.action === "resume" && process.env.SENDER_ENABLED !== "true") throw new HttpError(409, "Sending is disabled by SENDER_ENABLED.");
  const result = await controlJob(job, req.body.action, req.user); req.io?.emit("sender:update", {}); res.json(await publicJob(result));
}));
router.post("/jobs/:id/review/:recipient", limited, asyncRoute(async (req, res) => {
  if (req.body.confirmed !== true) throw new HttpError(400, "Confirm you checked this recipient. This action does not resend anything.");
  const item = await TemplateRecipient.findOne({ _id: objectId(req.params.recipient), jobId: objectId(req.params.id), state: "uncertain" });
  if (!item) throw new HttpError(404, "Uncertain recipient not found.");
  await TemplateRecipient.updateOne({ _id: item._id, state: "uncertain" }, { $set: { state: "reviewed", error: "Manually reviewed; no automatic resend was made." } });
  await Message.updateOne({ _id: item.messageId, status: "pending" }, { $set: { status: "failed", error: "Manually reviewed uncertain send. No automatic resend was made." } });
  await finishJob(item.jobId); req.io?.emit("sender:update", {}); res.json({ success: true });
}));
router.get("/jobs/:id/export", asyncRoute(async (req, res) => {
  const id = objectId(req.params.id); if (!await TemplateJob.exists({ _id: id })) throw new HttpError(404, "Job not found.");
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="template-job-${id}.csv"`);
  res.write("\ufeff" + ["name", "phone", "state", "whatsapp_message_id", "error"].map(safeCsvCell).join(",") + "\r\n");
  const cursor = TemplateRecipient.find({ jobId: id }).sort({ _id: 1 }).lean().cursor();
  try { for await (const r of cursor) { if (res.destroyed) break; if (!res.write([r.name, `+${r.phone}`, r.state, r.waMessageId, r.error].map(safeCsvCell).join(",") + "\r\n")) { const ac = new AbortController(); try { await Promise.race([once(res, "drain", { signal: ac.signal }), once(res, "close", { signal: ac.signal })]); } finally { ac.abort(); } } } if (!res.destroyed) res.end(); }
  finally { await cursor.close(); }
}));
router.post("/suppression", limited, asyncRoute(async (req, res) => {
  const phone = contactPhone(req.body.phone); if (typeof req.body.blocked !== "boolean") throw new HttpError(400, "Choose block or unblock.");
  if (!req.body.blocked && req.body.consentConfirmed !== true) throw new HttpError(400, "Confirm the recipient opted in again before removing suppression.");
  await Contact.updateOne({ phone }, { $set: { doNotMessage: req.body.blocked }, $setOnInsert: { phone, name: "", isSaved: false, chatStarted: false } }, { upsert: true });
  res.json({ phone, blocked: req.body.blocked });
}));
export default router;
