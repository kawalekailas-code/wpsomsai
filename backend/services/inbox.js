import crypto from "node:crypto";
import InboundEvent from "../models/InboundEvent.js";
import { receiveMessage, eventTime } from "./incoming.js";
import { recordReceipt } from "./messages.js";
import { syncTemplateReceipt } from "./template-sender.js";
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function webhookEvents(body) {
  const events = [];
  const unknown = (payload, summary) => events.push({ key: `u:${hash({ summary, payload: payload ?? null })}`, kind: "unknown", payload: payload ?? null, summary });
  if (!Array.isArray(body?.entry) || !body.entry.length) {
    unknown(body, "Unrecognized webhook envelope");
    return events;
  }
  for (const entry of body.entry) {
    if (!Array.isArray(entry?.changes) || !entry.changes.length) { unknown(entry, "Webhook entry has no recognized changes"); continue; }
    for (const change of entry.changes) {
      const value = change?.value;
      if (!value || typeof value !== "object" || !value.metadata?.phone_number_id) { unknown(change, "Webhook change has no phone-number metadata"); continue; }
      // This is a single-number workspace; leave other configured numbers alone.
      if (value.metadata.phone_number_id !== process.env.PHONE_ID) continue;
      let captured = false;
      for (const status of (Array.isArray(value.statuses) ? value.statuses : [])) {
        captured = true;
        if (!status || typeof status !== "object" || Array.isArray(status)) { unknown({ malformedStatus: status }, "Malformed status captured for review"); continue; }
        events.push({ key: `s:${hash(status)}`, kind: "status", payload: status, summary: `Status ${String(status.status || "unknown").slice(0, 40)}` });
      }
      for (const message of (Array.isArray(value.messages) ? value.messages : [])) {
        captured = true;
        if (!message || typeof message !== "object" || Array.isArray(message)) { unknown({ malformedMessage: message }, "Malformed message captured for review"); continue; }
        const contacts = (Array.isArray(value.contacts) ? value.contacts : []).filter(c => c && ((message.from && c.wa_id === message.from) || (message.from_user_id && c.user_id === message.from_user_id))).map(c => ({ wa_id: c.wa_id, user_id: c.user_id, profile: c.profile }));
        events.push({ key: `m:${typeof message.id === "string" && message.id ? message.id : hash(message)}`, kind: "message", payload: { message, contacts }, summary: `${String(message.from || message.from_user_id || "Unknown sender").slice(0, 140)} · ${String(message.type || "unknown").slice(0, 40)}` });
      }
      if (!captured || (value.messages != null && !Array.isArray(value.messages)) || (value.statuses != null && !Array.isArray(value.statuses))) unknown(change, "Unrecognized/empty webhook change retained");
    }
  }
  return events;
}
export async function processEvent(id, io) {
  const now = new Date();
  const event = await InboundEvent.findOneAndUpdate({ _id: id, $or: [
    { state: { $in: ["pending", "failed"] }, $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] },
    { state: "processing", leaseUntil: { $lte: now } }
  ] }, { $set: { state: "processing", leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: "after" });
  if (!event) return;
  try {
    let outcome;
    if (event.kind === "message") outcome = await receiveMessage(event.payload.message, event.payload, io);
    else if (event.kind === "status") {
      const s = event.payload;
      if (!s.id || !["sent", "delivered", "read", "played", "failed"].includes(s.status)) outcome = { attention: true, reason: "UNKNOWN_STATUS: Original event retained." };
      else {
        const error = s.errors?.[0]?.message || s.errors?.[0]?.error_data?.details;
        await recordReceipt(s.id, s.status, eventTime(s.timestamp), error, io);
        await syncTemplateReceipt(s, io);
      }
    } else outcome = { attention: true, reason: "UNKNOWN_EVENT: Original payload retained for administrator review." };
    const state = outcome?.attention ? "attention" : "processed";
    await InboundEvent.updateOne({ _id: event._id, state: "processing", attempts: event.attempts }, { $set: { state, reason: outcome?.reason || "", processedAt: new Date(), ...(state === "processed" ? { expiresAt: new Date(Date.now() + 86400000) } : {}) }, $unset: { leaseUntil: 1, nextAttemptAt: 1, ...(state === "attention" ? { expiresAt: 1 } : {}) } });
    if (state === "attention") io?.emit("safety:update", {});
  } catch (err) {
    // Never acknowledge a failed write as a safely processed event. Raw payload
    // remains durable when possible; upstream non-200 retries are an extra safety net.
    await InboundEvent.updateOne({ _id: event._id, state: "processing", attempts: event.attempts }, { $set: { state: "failed", reason: `Processing failed (${String(err.code || err.name || "ERROR").slice(0, 80)}). Safe retry pending.`, nextAttemptAt: new Date(Date.now() + Math.min(300000, 2000 * 2 ** Math.min(event.attempts, 7))) }, $unset: { leaseUntil: 1, expiresAt: 1 } }).catch(() => {});
    io?.emit("safety:update", {});
    throw err;
  }
}
export async function acceptWebhook(body, io) {
  const events = webhookEvents(body);
  if (!events.length) return;
  // Insert every event before acknowledging ANY batch; never fire-and-forget to memory.
  await InboundEvent.bulkWrite(events.map(e => ({ updateOne: { filter: { key: e.key }, update: { $setOnInsert: { ...e, state: "pending", attempts: 0 } }, upsert: true } })), { ordered: false });
  // Keep small normal webhooks immediately visible. Larger batches drain from the
  // durable inbox after acknowledgement; a crash leaves their pending rows intact.
  const first = await InboundEvent.find({ key: { $in: events.slice(0, 8).map(e => e.key) }, state: { $in: ["pending", "failed", "processing"] } }).select("_id").lean();
  for (const e of first) await processEvent(e._id, io);
}
export async function drainInbox(io, limit = 20) {
  const now = new Date();
  const pending = await InboundEvent.find({ $or: [{ state: { $in: ["pending", "failed"] }, $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] }, { state: "processing", leaseUntil: { $lte: now } }] }).sort({ createdAt: 1 }).limit(limit).select("_id").lean();
  for (const row of pending) { try { await processEvent(row._id, io); } catch { break; } }
  return pending.length;
}
