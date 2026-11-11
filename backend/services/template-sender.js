import crypto from "node:crypto";
import mongoose from "mongoose";
import Contact from "../models/Contact.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import DeliveryReceipt from "../models/DeliveryReceipt.js";
import TemplateJob from "../models/TemplateJob.js";
import TemplateRecipient from "../models/TemplateRecipient.js";
import WorkerLease from "../models/WorkerLease.js";
import { HttpError, escapeRegex } from "../lib/utils.js";
import { contactPhone } from "./contacts.js";
import { findTemplate } from "./templates.js";
import { sendingSafety } from "./safety.js";
import { applyReceipt, touchContact } from "./messages.js";
import { sendPayload } from "./whatsapp.js";
export const maxRecipients = () => Math.max(1, Math.min(5000, Number(process.env.SENDER_MAX_RECIPIENTS) || 5000));
export const senderGap = () => Math.max(300, Math.min(60000, Number(process.env.SENDER_GAP_MS) || 1000));
const activeStates = ["preparing", "queued", "running", "paused"];
const pendingStates = ["pending", "leased", "sending"];
const owner = crypto.randomUUID();
const leaseMs = 180000;
export async function acquireLease(key, who = owner) {
  try {
    return await WorkerLease.findOneAndUpdate({ _id: key, $or: [{ owner: who }, { until: { $lte: new Date() } }] }, { $set: { owner: who, until: new Date(Date.now() + leaseMs) } }, { upsert: true, returnDocument: "after" });
  } catch (err) { if (err.code === 11000) return null; throw err; }
}
export async function releaseLease(key, who = owner) { await WorkerLease.deleteOne({ _id: key, owner: who }); }
export async function recipientPreview(input) {
  const source = input?.source || "rows";
  let entries;
  if (source === "book") {
    const q = typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
    entries = await Contact.find({ isSaved: { $ne: false }, ...(q ? { $or: ["name", "phone", "notes"].map(k => ({ [k]: { $regex: escapeRegex(q), $options: "i" } })) } : {}) }).sort({ phone: 1 }).limit(maxRecipients() + 1).select("phone name").lean();
  } else {
    if (!Array.isArray(input?.recipients)) throw new HttpError(400, "Choose saved contacts or provide CSV/selected recipients.");
    entries = input.recipients;
  }
  if (!entries.length || entries.length > maxRecipients()) throw new HttpError(400, `Choose between 1 and ${maxRecipients()} entries. Split a larger selection; nothing was queued.`);
  const seen = new Set();
  const rows = entries.map((entry, i) => {
    const r = { row: i + 1, phone: String(entry?.phone || "").slice(0, 80), name: String(entry?.name || "").slice(0, 100), action: "ready", reason: "" };
    try { r.phone = contactPhone(entry?.phone); if (seen.has(r.phone)) { r.action = "duplicate"; r.reason = "Repeated number in this selection."; } seen.add(r.phone); }
    catch (err) { r.action = "invalid"; r.reason = err.message; }
    return r;
  });
  const blocked = new Set((await Contact.find({ phone: { $in: [...seen] }, doNotMessage: true }).select("phone").lean()).map(c => c.phone));
  const uncertain = new Set((await TemplateRecipient.find({ phone: { $in: [...seen] }, state: "uncertain" }).select("phone").lean()).map(r => r.phone));
  for (const r of rows) if (r.action === "ready") {
    if (blocked.has(r.phone)) { r.action = "blocked"; r.reason = "Do-not-send / opt-out suppression."; }
    else if (uncertain.has(r.phone)) { r.action = "blocked"; r.reason = "An earlier send is uncertain. Review that recipient before any new job."; }
  }
  const summary = { total: rows.length, ready: 0, invalid: 0, duplicate: 0, blocked: 0 };
  for (const r of rows) summary[r.action]++;
  return { rows, summary, source };
}
export function sealPreview(preview, userId) {
  const phones = preview.rows.filter(r => r.action === "ready").map(r => r.phone);
  const time = Date.now().toString();
  const digest = crypto.createHash("sha256").update(JSON.stringify(phones)).digest("hex");
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${userId}|${time}|${digest}`).digest("hex");
  return `${time}.${signature}`;
}
export function verifyPreviewInput(input, userId) {
  if ((input.source && input.source !== "rows") || !Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > maxRecipients()) throw new HttpError(400, "Preview first and queue the frozen eligible recipient list, not a live address-book query.");
  const token = String(input.previewToken || ""), parts = token.split(".");
  if (parts.length !== 2 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1]) || Date.now() - Number(parts[0]) > 15 * 60000 || Number(parts[0]) > Date.now() + 60000) throw new HttpError(400, "Recipient preview expired or missing. Preview again before queueing.");
  const phones = input.recipients.map(r => contactPhone(r.phone));
  const digest = crypto.createHash("sha256").update(JSON.stringify(phones)).digest("hex");
  const expected = crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${userId}|${parts[0]}|${digest}`).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) throw new HttpError(400, "Recipient selection changed. Preview again; no message was queued.");
}
export async function jobCounts(id) {
  const rows = await TemplateRecipient.aggregate([{ $match: { jobId: new mongoose.Types.ObjectId(id) } }, { $group: { _id: "$state", count: { $sum: 1 } } }]);
  const counts = Object.fromEntries(rows.map(r => [r._id, r.count]));
  return { pending: 0, leased: 0, sending: 0, accepted: 0, delivered: 0, seen: 0, played: 0, failed: 0, uncertain: 0, cancelled: 0, reviewed: 0, ...counts };
}
export async function publicJob(job) {
  const j = job.toObject ? job.toObject() : { ...job };
  delete j.template; delete j.media; delete j.tokenVersion; delete j.requestId;
  j.counts = await jobCounts(j._id);
  return j;
}
export async function createJob({ input, user, template, text, media, signature }) {
  if (input.consentConfirmed !== true || input.chargesConfirmed !== true) throw new HttpError(400, "Confirm recipient opt-in/opt-out checks and possible Meta charges before queueing.");
  if (typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) throw new HttpError(400, "A valid job request ID is required.");
  const existing = await TemplateJob.findOne({ requestId: input.requestId });
  if (existing) { if (String(existing.createdBy) !== String(user._id)) throw new HttpError(409, "Request ID already used."); return existing; }
  verifyPreviewInput(input, user._id);
  const createOwner = crypto.randomUUID();
  if (!await acquireLease("sender-create", createOwner)) throw new HttpError(409, "Another job is being prepared. Please refresh shortly.");
  let job;
  try {
    if (await TemplateJob.exists({ state: { $in: activeStates } })) throw new HttpError(409, "One active/paused job is allowed. Finish or cancel it before creating another.");
    const preview = await recipientPreview({ source: "rows", recipients: input.recipients });
    const recipients = preview.rows.filter(r => r.action === "ready");
    if (!recipients.length) throw new HttpError(400, "No eligible recipients. Check the preview report.");
    job = await TemplateJob.create({ requestId: input.requestId, createdBy: user._id, tokenVersion: user.tokenVersion || 0, state: "preparing", templateName: template.name, language: template.language.code, template, templateSignature: signature, text, media, recipientCount: recipients.length, source: ["book", "selected", "csv"].includes(input.sourceLabel) ? input.sourceLabel : preview.source, consentConfirmedAt: new Date() });
    for (let offset = 0; offset < recipients.length; offset += 100) {
      if (!await TemplateJob.exists({ _id: job._id, state: "preparing" })) throw new HttpError(409, "Preparation was cancelled or interrupted. Nothing will be queued automatically.");
      await TemplateRecipient.insertMany(recipients.slice(offset, offset + 100).map(r => ({ jobId: job._id, phone: r.phone, name: r.name, clientId: `tpl_${job._id}_${crypto.createHash("sha256").update(r.phone).digest("hex").slice(0, 20)}`, state: "pending" })), { ordered: true });
    }
    const queued = await TemplateJob.findOneAndUpdate({ _id: job._id, state: "preparing" }, { $set: { state: "queued" } }, { returnDocument: "after" });
    if (!queued) throw new HttpError(409, "Preparation was cancelled or interrupted. Nothing will be queued automatically.");
    return queued;
  } catch (err) {
    if (job) {
      await TemplateJob.updateOne({ _id: job._id, state: "preparing" }, { $set: { state: "paused", pauseReason: "Preparation interrupted. Cancel this job and create a fresh preview; incomplete jobs cannot resume." } }).catch(() => {});
      if (await TemplateJob.exists({ _id: job._id, state: "cancelled" }).catch(() => false)) await cancelUnattempted(job._id).catch(() => {});
    }
    throw err;
  } finally { await releaseLease("sender-create", createOwner); }
}
export async function finishJob(id) {
  if (await TemplateRecipient.exists({ jobId: id, state: { $in: pendingStates } })) return;
  const attention = Boolean(await TemplateRecipient.exists({ jobId: id, state: "uncertain" }));
  const job = await TemplateJob.findById(id);
  if (!job) return;
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  job.state = attention ? "attention" : job.state === "cancelled" ? "cancelled" : "completed";
  job.completedAt = new Date();
  if (!attention) { job.expiresAt = expiresAt; await TemplateRecipient.updateMany({ jobId: id }, { $set: { expiresAt } }); }
  await job.save();
}
async function cancelUnattempted(jobId) {
  const unsent = await TemplateRecipient.find({ jobId, state: { $in: ["pending", "leased"] }, attempts: 0 }).select("clientId").lean();
  if (unsent.length) await Message.updateMany({ clientId: { $in: unsent.map(r => r.clientId) }, status: "pending" }, { $set: { status: "failed", error: "Cancelled before any network send." } });
  await TemplateRecipient.updateMany({ jobId, state: { $in: ["pending", "leased"] }, attempts: 0 }, { $set: { state: "cancelled", error: "Cancelled before network send." }, $unset: { leaseUntil: 1 } });
  await finishJob(jobId);
}
export async function recoverSender() {
  const now = new Date();
  await TemplateRecipient.updateMany({ state: "leased", leaseUntil: { $lte: now }, attempts: 0 }, { $set: { state: "pending" }, $unset: { leaseUntil: 1 } });
  const stale = await TemplateRecipient.find({ state: "sending", leaseUntil: { $lte: now } }).select("_id jobId messageId").limit(20).lean();
  for (const item of stale) {
    const changed = await TemplateRecipient.updateOne({ _id: item._id, state: "sending" }, { $set: { state: "uncertain", error: "Worker stopped during a send. Delivery is uncertain; not retried automatically.", finishedAt: now }, $unset: { leaseUntil: 1 } });
    if (!changed.modifiedCount) continue;
    await TemplateJob.updateOne({ _id: item.jobId, state: { $in: ["queued", "running"] } }, { $set: { state: "paused", pauseReason: "An interrupted send needs manual review. Other pending rows are saved." } });
    if (item.messageId) await Message.updateOne({ _id: item.messageId, status: "pending" }, { $set: { status: "failed", error: "Delivery uncertain after worker restart. Do not resend without checking the recipient." } });
    await finishJob(item.jobId);
  }
  // A process can stop between the cancellation flag and recipient writes, or
  // while a preparing batch commits. Reconcile that durable intent, never send it.
  const cancelled = await TemplateJob.aggregate([
    { $match: { state: "cancelled" } },
    { $lookup: { from: "templaterecipients", let: { job: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$jobId", "$$job"] }, state: { $in: ["pending", "leased"] }, attempts: 0 } }, { $limit: 1 }], as: "unsent" } },
    { $match: { "unsent.0": { $exists: true } } }, { $limit: 20 }
  ]);
  for (const job of cancelled) await cancelUnattempted(job._id);
  const abandoned = await TemplateJob.find({ state: "preparing", updatedAt: { $lt: new Date(Date.now() - leaseMs) } }).select("_id").limit(20).lean();
  for (const job of abandoned) await TemplateJob.updateOne({ _id: job._id, state: "preparing" }, { $set: { state: "paused", pauseReason: "Job preparation was interrupted. Cancel and create a fresh job." } });
}
const itemRank = { pending: -2, leased: -1, sending: 0, uncertain: 0, reviewed: 0, accepted: 1, failed: 1.5, delivered: 2, seen: 3, played: 4, cancelled: -3 };
export async function syncTemplateReceipt(status, io) {
  const normalized = status.status === "read" ? "seen" : status.status === "sent" ? "accepted" : status.status;
  if (!Object.hasOwn(itemRank, normalized)) return;
  const opaque = status.biz_opaque_callback_data;
  const item = await TemplateRecipient.findOne({ $or: [{ waMessageId: status.id }, ...(typeof opaque === "string" && /^tpl_[a-f\d]{24}_[a-f\d]{20}$/.test(opaque) ? [{ clientId: opaque, attempts: { $gt: 0 } }] : [])] });
  if (!item || (item.waMessageId && item.waMessageId !== status.id)) return;
  if (status.recipient_id && status.recipient_id !== item.phone) return;
  const allowed = Object.keys(itemRank).filter(key => itemRank[key] <= itemRank[normalized] && key !== "cancelled");
  await TemplateRecipient.updateOne({ _id: item._id, state: { $in: allowed }, $or: [{ waMessageId: { $exists: false } }, { waMessageId: status.id }] }, { $set: { state: normalized, waMessageId: status.id, finishedAt: new Date(), ...(normalized === "failed" ? { error: "Meta reported this message as failed. See message information.", errorCode: String(status.errors?.[0]?.code || "META_FAILED") } : { error: "", errorCode: "" }) }, $unset: { leaseUntil: 1 } });
  let m = await Message.findOne({ clientId: item.clientId });
  if (m && (!m.waMessageId || m.waMessageId === status.id)) {
    await Message.updateOne({ _id: m._id, $or: [{ waMessageId: { $exists: false } }, { waMessageId: status.id }] }, { $set: { waMessageId: status.id } });
    m = await applyReceipt(m, await DeliveryReceipt.findOne({ waMessageId: status.id }));
    await touchContact(m); io?.emit("message:update", { phone: m.phone, id: String(m._id) }); io?.emit("chat:update", { phone: m.phone });
  }
  await finishJob(item.jobId); io?.emit("sender:update", { jobId: String(item.jobId) });
}
export async function senderStep(io, { safetyCheck = sendingSafety, send = sendPayload } = {}) {
  const stepOwner = crypto.randomUUID();
  if (!await acquireLease("template-sender", stepOwner)) return false;
  try {
    await recoverSender();
    if (process.env.SENDER_ENABLED !== "true") return false;
    const job = await TemplateJob.findOne({ state: { $in: ["queued", "running"] }, $or: [{ nextSendAt: { $exists: false } }, { nextSendAt: { $lte: new Date() } }] }).sort({ createdAt: 1 });
    if (!job) return false;
    const user = await User.findById(job.createdBy).select("role tokenVersion").lean();
    let reason = !user || user.role !== "admin" || (user.tokenVersion || 0) !== job.tokenVersion ? "Creator access/session changed. An administrator must explicitly resume this job." : await safetyCheck();
    if (!reason && job.media?.createdAt && Date.now() - new Date(job.media.createdAt).getTime() >= 29 * 86400000) reason = "The shared media is near expiry. Cancel pending sends and create a fresh upload/job.";
    if (!reason) {
      try { const current = await findTemplate(job.templateName, job.language); if (current.signature !== job.templateSignature) reason = "Template content changed. Cancel and create a fresh preview."; }
      catch (err) { reason = err.message; }
    }
    if (reason) { await TemplateJob.updateOne({ _id: job._id, state: { $in: ["queued", "running"] } }, { $set: { state: "paused", pauseReason: reason.slice(0, 500) } }); io?.emit("sender:update", {}); return false; }
    const item = await TemplateRecipient.findOneAndUpdate({ jobId: job._id, state: "pending" }, { $set: { state: "leased", leaseUntil: new Date(Date.now() + leaseMs) } }, { sort: { _id: 1 }, returnDocument: "after" });
    if (!item) { await finishJob(job._id); return false; }
    if (await Contact.exists({ phone: item.phone, doNotMessage: true })) {
      await Message.updateOne({ clientId: item.clientId, status: "pending" }, { $set: { status: "failed", error: "Opt-out suppression added before network send." } });
      await TemplateRecipient.updateOne({ _id: item._id, state: "leased" }, { $set: { state: "cancelled", error: "Opt-out suppression added after preview." }, $unset: { leaseUntil: 1 } }); await finishJob(job._id); return true;
    }
    // Persist a unique outgoing record BEFORE a network attempt. A leased row with
    // attempts=0 is safe to resume; a sending row is NEVER reset to pending.
    let message = await Message.findOne({ clientId: item.clientId });
    if (!message) message = await Message.create({ phone: item.phone, clientId: item.clientId, senderId: job.createdBy, direction: "outgoing", status: "pending", type: "template", message: job.text, ...(job.media ? { media: true, mediaKind: job.media.type, caption: job.text, mediaId: job.media.mediaId, mimeType: job.media.mimeType, filename: job.media.filename, mediaExpiresAt: new Date(new Date(job.media.createdAt).getTime() + 30 * 86400000) } : {}) });
    // Attach history before checking controls, so cancellation can settle it.
    const attached = await TemplateRecipient.updateOne({ _id: item._id, state: "leased", attempts: 0 }, { $set: { messageId: message._id } });
    const currentJob = await TemplateJob.findById(job._id).select("state").lean();
    if (!attached.matchedCount || !currentJob || !["queued", "running"].includes(currentJob.state)) {
      const currentItem = await TemplateRecipient.findById(item._id).select("state attempts").lean();
      if (currentItem?.attempts === 0 && (currentItem.state === "cancelled" || !currentJob || currentJob.state === "cancelled")) {
        await Message.updateOne({ _id: message._id, status: "pending" }, { $set: { status: "failed", error: "Cancelled before any network send." } });
        await TemplateRecipient.updateOne({ _id: item._id, attempts: 0 }, { $set: { state: "cancelled", messageId: message._id }, $unset: { leaseUntil: 1 } });
      } else await TemplateRecipient.updateOne({ _id: item._id, state: "leased", attempts: 0 }, { $set: { state: "pending", messageId: message._id }, $unset: { leaseUntil: 1 } });
      return false;
    }
    const began = await TemplateRecipient.updateOne({ _id: item._id, state: "leased", attempts: 0 }, { $set: { state: "sending", messageId: message._id, beganAt: new Date(), leaseUntil: new Date(Date.now() + leaseMs) }, $inc: { attempts: 1 } });
    if (!began.modifiedCount) return false;
    await TemplateJob.updateOne({ _id: job._id, state: { $in: ["queued", "running"] } }, { $set: { state: "running", startedAt: job.startedAt || new Date() } });
    let waId;
    try {
      waId = await send(item.phone, { type: "template", template: job.template, biz_opaque_callback_data: item.clientId });
      // Bind response, but never downgrade a receipt which arrived first.
      await Message.updateOne({ _id: message._id }, { $set: { waMessageId: waId } });
      await Message.updateOne({ _id: message._id, status: "pending" }, { $set: { status: "sent", error: "" } });
      message = await applyReceipt(await Message.findById(message._id), await DeliveryReceipt.findOne({ waMessageId: waId }));
      await TemplateRecipient.updateOne({ _id: item._id, state: { $in: ["sending", "uncertain"] } }, { $set: { state: "accepted", waMessageId: waId, finishedAt: new Date(), error: "", errorCode: "" }, $unset: { leaseUntil: 1 } });
      // Reconcile a status buffered before the worker bound its API response.
      const receipt = await DeliveryReceipt.findOne({ waMessageId: waId });
      if (receipt) await syncTemplateReceipt({ id: waId, status: receipt.status === "seen" ? "read" : receipt.status, biz_opaque_callback_data: item.clientId }, io);
      await touchContact(message); io?.emit("message:new", { phone: item.phone, id: String(message._id) }); io?.emit("chat:update", { phone: item.phone });
    } catch (err) {
      const uncertain = Boolean(waId) || err.code === "DELIVERY_UNCERTAIN";
      const error = uncertain ? "Delivery uncertain. Check the recipient/status before any manual resend; this row will not auto-retry." : String(err.message || "Send failed.").slice(0, 500);
      await TemplateRecipient.updateOne({ _id: item._id, state: "sending" }, { $set: { state: uncertain ? "uncertain" : "failed", waMessageId: waId, error, errorCode: uncertain ? "DELIVERY_UNCERTAIN" : String(err.code || "SEND_FAILED"), finishedAt: new Date() }, $unset: { leaseUntil: 1 } });
      await Message.updateOne({ _id: message._id, status: "pending" }, { $set: { status: "failed", error } });
      await TemplateJob.updateOne({ _id: job._id, state: { $in: ["queued", "running"] } }, { $set: { state: "paused", pauseReason: error } });
      io?.emit("message:update", { phone: item.phone, id: String(message._id) });
    }
    await TemplateJob.updateOne({ _id: job._id }, { $set: { nextSendAt: new Date(Date.now() + senderGap()) } });
    await finishJob(job._id); io?.emit("sender:update", { jobId: String(job._id) }); return true;
  } finally { await releaseLease("template-sender", stepOwner); }
}
export async function controlJob(job, action, user) {
  if (action === "pause") await TemplateJob.updateOne({ _id: job._id, state: { $in: ["queued", "running"] } }, { $set: { state: "paused", pauseReason: "Paused by administrator. An already in-flight request may still finish." } });
  else if (action === "resume") {
    if (!["paused", "queued"].includes(job.state)) throw new HttpError(409, "Only paused/queued jobs can resume.");
    if (await TemplateRecipient.countDocuments({ jobId: job._id }) !== job.recipientCount) throw new HttpError(409, "Incomplete preparation. Cancel and create a new job.");
    const reason = await sendingSafety(); if (reason) throw new HttpError(409, reason);
    const t = await findTemplate(job.templateName, job.language);
    if (t.signature !== job.templateSignature) throw new HttpError(409, "Template changed. Cancel and create a new job.");
    await TemplateJob.updateOne({ _id: job._id, state: { $in: ["paused", "queued"] } }, { $set: { state: "queued", pauseReason: "", createdBy: user._id, tokenVersion: user.tokenVersion || 0 } });
  } else if (action === "cancel") {
    if (!activeStates.includes(job.state)) throw new HttpError(409, "Only preparing or active/paused jobs have pending work to cancel.");
    await TemplateJob.updateOne({ _id: job._id, state: { $in: activeStates } }, { $set: { state: "cancelled", pauseReason: "Cancelled. An already in-flight request may still finish." } });
    await cancelUnattempted(job._id);
  } else throw new HttpError(400, "Choose pause, resume or cancel.");
  return TemplateJob.findById(job._id);
}
