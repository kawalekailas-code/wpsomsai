import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { startWorker } from "../services/worker.js";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import nock from "nock";
import axios from "axios";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import InboundEvent from "../models/InboundEvent.js";
import TemplateJob from "../models/TemplateJob.js";
import TemplateRecipient from "../models/TemplateRecipient.js";
import TemplateUpload from "../models/TemplateUpload.js";
import WorkerLease from "../models/WorkerLease.js";
import { acceptWebhook, drainInbox, processEvent } from "../services/inbox.js";
import { approvedTemplates, describeTemplate, compileTemplate, resetTemplateCache } from "../services/templates.js";
import { recipientPreview, sealPreview, createJob, senderStep, recoverSender, syncTemplateReceipt, acquireLease, releaseLease, senderGap } from "../services/template-sender.js";
import { resetStorageCache, sendingSafety } from "../services/safety.js";
import { recordReceipt } from "../services/messages.js";
process.env.JWT_SECRET = "test-secret-for-template-sender-only-1234567890";
process.env.APP_SECRET = "test-only-meta-secret"; process.env.PHONE_ID = "test-phone"; process.env.TOKEN = "test-only-token"; process.env.WABA_ID = "test-waba"; process.env.FRONTEND_URL = "http://localhost:5173";
process.env.WHATSAPP_API_VERSION = "v25.0"; process.env.SENDER_ENABLED = "true";
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = "true";
process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server/", import.meta.url));
axios.defaults.proxy = false;
const phone = "919000000001";
const io = { emit() {}, to() { return { emit() {} }; } };
const app = createApp(io);
const greeting = { name: "approved_greeting", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "Hello {{1}}" }] };
const photo = { name: "approved_photo", language: "mr", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "नमस्कार" }] };
let mongo, user, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const templates = (rows = [greeting, photo]) => nock("https://graph.facebook.com").get("/v25.0/test-waba/message_templates").query(true).reply(200, { data: rows });
const envelope = value => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: process.env.PHONE_ID }, ...value } }] }] });
const incoming = (id = crypto.randomUUID(), extra = {}) => ({ from: phone, id: `wamid.${id}`, type: "text", text: { body: "Incoming safety test" }, timestamp: String(Math.floor(Date.now() / 1000)), ...extra });
const signed = payload => { const raw = JSON.stringify(payload); return request(app).post("/webhook").set("Content-Type", "application/json").set("x-hub-signature-256", `sha256=${crypto.createHmac("sha256", process.env.APP_SECRET).update(raw).digest("hex")}`).send(raw); };
async function readyInput(rows = [{ phone, name: "Fictional friend" }], more = {}) {
  const preview = await recipientPreview({ source: "rows", recipients: rows });
  const definition = more.name === photo.name ? photo : greeting;
  return { source: "rows", recipients: preview.rows.filter(r => r.action === "ready").map(r => ({ phone: r.phone, name: r.name })), previewToken: sealPreview(preview, user._id), requestId: crypto.randomUUID(), name: greeting.name, language: "en", parameters: ["Friend"], templateSignature: describeTemplate(definition).signature, consentConfirmed: true, chargesConfirmed: true, ...more };
}
async function apiJob(rows, more = {}) { const body = await readyInput(rows, more); const r = await request(app).post("/api/template-sender/jobs").set(auth()).send(body); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; }
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { maxPoolSize: 10 });
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
  nock.disableNetConnect(); nock.enableNetConnect(host => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));
});
after(async () => { nock.cleanAll(); nock.enableNetConnect(); await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  nock.cleanAll(); resetTemplateCache(); resetStorageCache();
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).deleteMany()));
  process.env.SENDER_ENABLED = "true"; process.env.STORAGE_LIMIT_MB = "512";
  user = await User.create({ username: "sender-admin", password: await bcrypt.hash("test-password", 4), role: "admin" });
  token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "1h" });
});

test("sender and original event payloads are admin-only and never publicly cached", async () => {
  assert.equal((await request(app).get("/api/template-sender/jobs")).status, 401);
  await User.updateOne({ _id: user._id }, { $set: { role: "agent" } });
  for (const url of ["/api/template-sender/jobs", "/api/safety/health", "/api/safety/events"]) assert.equal((await request(app).get(url).set(auth())).status, 403);
  await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });
  const h = await request(app).get("/api/safety/health").set(auth()); assert.equal(h.status, 200); assert.match(h.headers["cache-control"], /no-store/);
  assert.ok(!JSON.stringify(h.body).includes(process.env.TOKEN));
});
test("approved-template fetch follows cursor pages and never exposes the token", async () => {
  nock("https://graph.facebook.com").get("/v25.0/test-waba/message_templates").query(q => !q.after).reply(200, { data: [greeting, { ...photo, status: "REJECTED" }], paging: { next: "https://untrusted.invalid/not-followed", cursors: { after: "cursor-two" } } });
  nock("https://graph.facebook.com").get("/v25.0/test-waba/message_templates").query(q => q.after === "cursor-two").reply(200, { data: [photo] });
  const r = await request(app).get("/api/template-sender/templates").set(auth()); assert.equal(r.status, 200); assert.equal(r.body.templates.length, 2); assert.equal(r.body.templates[1].language, "mr"); assert.ok(!JSON.stringify(r.body).includes(process.env.TOKEN));
  assert.equal((await approvedTemplates()).length, 2); // cached, no third HTTP request
});
test("template compiler supports named/body parameters and rejects unsupported components", () => {
  const t = describeTemplate({ ...greeting, parameter_format: "NAMED", components: [{ type: "BODY", text: "Hello {{person}}" }] });
  assert.deepEqual(compileTemplate(t, { parameters: ["Neha"] }).template.components[0].parameters[0], { type: "text", text: "Neha", parameter_name: "person" });
  assert.throws(() => compileTemplate(t, { parameters: [] }), /exactly 1/);
  assert.equal(describeTemplate({ ...greeting, components: [{ type: "HEADER", format: "DOCUMENT" }] }).supported, false);
  assert.equal(describeTemplate({ ...greeting, components: [{ type: "BUTTONS", buttons: [{ type: "URL", url: "https://example.invalid/{{1}}" }] }] }).supported, false);
});
test("recipient preview reports invalid, duplicate and opt-out numbers without writes or sends", async () => {
  await Contact.create({ phone, doNotMessage: true, name: "Protected contact" });
  const r = await request(app).post("/api/template-sender/preview").set(auth()).send({ recipients: [{ phone }, { phone }, { phone: "1e10" }, { phone: "919000000002" }] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.summary, { total: 4, ready: 1, invalid: 1, duplicate: 1, blocked: 1 });
  assert.ok(r.body.previewToken); assert.equal(await TemplateJob.countDocuments(), 0); assert.equal(await Message.countDocuments(), 0);
});
test("saved-book preview includes all pages and enforces the configured job cap", async () => {
  await Contact.insertMany(Array.from({ length: 105 }, (_, i) => ({ phone: `91900000${String(i).padStart(4, "0")}`, name: "Fictional" })));
  assert.equal((await recipientPreview({ source: "book" })).summary.ready, 105);
  process.env.SENDER_MAX_RECIPIENTS = "100"; await assert.rejects(recipientPreview({ source: "book" }), /between 1 and 100/); delete process.env.SENDER_MAX_RECIPIENTS;
});
test("signed preview freezes recipients and rejects edits, cross-admin replay and expiry", async () => {
  templates(); const body = await readyInput();
  const tampered = { ...body, recipients: [{ phone: "919000000009" }] };
  assert.equal((await request(app).post("/api/template-sender/jobs").set(auth()).send(tampered)).status, 400);
  assert.equal(await TemplateJob.countDocuments(), 0);
  const foreign = { ...body, previewToken: sealPreview(await recipientPreview({ recipients: body.recipients }), new mongoose.Types.ObjectId()) };
  assert.equal((await request(app).post("/api/template-sender/jobs").set(auth()).send(foreign)).status, 400);
  const expired = { ...body, previewToken: `${Date.now() - 16 * 60000}.${"a".repeat(64)}` };
  assert.equal((await request(app).post("/api/template-sender/jobs").set(auth()).send(expired)).status, 400);
  const r = await request(app).post("/api/template-sender/jobs").set(auth()).send(body); assert.equal(r.status, 201);
  const again = await request(app).post("/api/template-sender/jobs").set(auth()).send(body); assert.equal(again.status, 200); assert.equal(r.body._id, again.body._id); assert.equal(await TemplateRecipient.countDocuments(), 1);
});
test("consent/charges and enable-switch gates cannot be bypassed by a direct request", async () => {
  const body = await readyInput(); templates();
  for (const field of ["consentConfirmed", "chargesConfirmed"]) assert.equal((await request(app).post("/api/template-sender/jobs").set(auth()).send({ ...body, [field]: false })).status, 400);
  process.env.SENDER_ENABLED = "false"; const r = await request(app).post("/api/template-sender/jobs").set(auth()).send(body); assert.equal(r.status, 409); assert.equal(r.body.code, "SENDER_DISABLED"); assert.equal(await TemplateJob.countDocuments(), 0);
});
test("media is uploaded once and matched to template, user, byte type and language", async () => {
  templates();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=", "base64");
  const upload = nock("https://graph.facebook.com").post("/v25.0/test-phone/media").reply(200, { id: "media-shared-one" });
  const r = await request(app).post("/api/template-sender/upload").set(auth()).field("name", photo.name).field("language", "mr").attach("file", png, { filename: "photo.png", contentType: "image/png" });
  assert.equal(r.status, 201); assert.ok(upload.isDone()); assert.ok(r.body.uploadId); assert.equal(r.body.mediaId, undefined);
  const bad = await request(app).post("/api/template-sender/upload").set(auth()).field("name", photo.name).field("language", "mr").attach("file", Buffer.from("not an image"), { filename: "fake.png", contentType: "image/png" }); assert.equal(bad.status, 400);
  const j = await apiJob([{ phone }, { phone: "919000000002" }], { name: photo.name, language: "mr", parameters: [], uploadId: r.body.uploadId });
  let count = 0;
  const send = async (to, payload) => { count++; assert.equal(payload.template.components[0].parameters[0].image.id, "media-shared-one"); return `wamid.media.${count}`; };
  await senderStep(io, { send }); await TemplateJob.updateOne({ _id: j._id }, { $unset: { nextSendAt: 1 } }); await senderStep(io, { send });
  assert.equal(count, 2); assert.equal(await TemplateUpload.countDocuments(), 1); assert.equal(await Message.countDocuments({ mediaId: "media-shared-one", mediaKind: "image", caption: "नमस्कार" }), 2);
});
test("single sequential worker persists API ID and differentiates accepted from delivered", async () => {
  templates(); const j = await apiJob();
  nock("https://graph.facebook.com").post("/v25.0/test-phone/messages", p => p.template.name === greeting.name && p.biz_opaque_callback_data.startsWith("tpl_")).reply(200, { messages: [{ id: "wamid.accepted" }] });
  assert.equal(await senderStep(io), true);
  let r = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(r.state, "accepted"); assert.equal(r.attempts, 1);
  assert.equal((await Message.findById(r.messageId)).status, "sent");
  await signed(envelope({ statuses: [{ id: "wamid.accepted", status: "read", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: phone, biz_opaque_callback_data: r.clientId }] })).expect(200);
  r = await TemplateRecipient.findById(r._id); assert.equal(r.state, "seen"); assert.equal((await Message.findById(r.messageId)).status, "seen");
});
test("global lease and minimum gap prevent concurrent/burst sends", async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }]); let inFlight = 0, peak = 0, calls = 0;
  const send = async () => { calls++; inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 25)); inFlight--; return `wamid.serial.${calls}`; };
  await Promise.all([senderStep(io, { send }), senderStep(io, { send })]); assert.equal(peak, 1); assert.equal(calls, 1);
  assert.equal(await senderStep(io, { send }), false); assert.equal(calls, 1); assert.ok(senderGap() >= 300);
  assert.equal((await TemplateJob.findById(j._id)).state, "running");
});
test("pause, explicit resume, cancellation and late opt-out affect only unsent rows", async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }]);
  await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "pause" }).expect(200);
  let calls = 0; assert.equal(await senderStep(io, { send: async () => { calls++; } }), false); assert.equal(calls, 0);
  await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "resume" }).expect(200);
  await Contact.create({ phone, doNotMessage: true }); await senderStep(io, { send: async () => { calls++; } }); assert.equal(calls, 0);
  await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "cancel" }).expect(200);
  assert.equal(await TemplateRecipient.countDocuments({ jobId: j._id, state: "cancelled" }), 2);
});
test("ambiguous timeout is retained for review, never automatically resent or expired", async () => {
  templates(); const j = await apiJob(); let calls = 0;
  const send = async () => { calls++; const e = new Error("timeout"); e.code = "DELIVERY_UNCERTAIN"; throw e; };
  await senderStep(io, { send }); await senderStep(io, { send }); assert.equal(calls, 1);
  const item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "uncertain"); assert.equal(item.expiresAt, undefined); assert.equal((await TemplateJob.findById(j._id)).state, "attention");
  assert.equal((await recipientPreview({ recipients: [{ phone }] })).summary.blocked, 1);
  await request(app).post(`/api/template-sender/jobs/${j._id}/review/${item._id}`).set(auth()).send({ confirmed: false }).expect(400);
  await request(app).post(`/api/template-sender/jobs/${j._id}/review/${item._id}`).set(auth()).send({ confirmed: true }).expect(200);
  assert.equal((await TemplateRecipient.findById(item._id)).state, "reviewed"); assert.equal(calls, 1);
});
test("early opaque status recovers an uncertain send without a duplicate network attempt", async () => {
  templates(); const j = await apiJob();
  await senderStep(io, { send: async (to, payload) => {
    await signed(envelope({ statuses: [{ id: "wamid.early-opaque", status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: to, biz_opaque_callback_data: payload.biz_opaque_callback_data }] })).expect(200);
    const err = new Error("response lost after acceptance"); err.code = "DELIVERY_UNCERTAIN"; throw err;
  } });
  const item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "delivered"); assert.equal(item.waMessageId, "wamid.early-opaque"); assert.equal((await Message.findById(item.messageId)).status, "delivered");
});
test("restart requeues only never-attempted leases and quarantines in-flight sends", async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }]); const rows = await TemplateRecipient.find({ jobId: j._id }).sort({ phone: 1 });
  await TemplateRecipient.updateOne({ _id: rows[0]._id }, { $set: { state: "leased", attempts: 0, leaseUntil: new Date(0) } });
  await TemplateRecipient.updateOne({ _id: rows[1]._id }, { $set: { state: "sending", attempts: 1, leaseUntil: new Date(0) } });
  await recoverSender(); assert.equal((await TemplateRecipient.findById(rows[0]._id)).state, "pending"); assert.equal((await TemplateRecipient.findById(rows[1]._id)).state, "uncertain"); assert.equal((await TemplateJob.findById(j._id)).state, "paused");
  assert.ok(await acquireLease("test-lease", "owner-a")); assert.equal(await acquireLease("test-lease", "owner-b"), null); await releaseLease("test-lease", "owner-a");
});
test("DB write failure before webhook acknowledgement returns non-200 and retry recovers", async () => {
  const original = Message.create; let first = true;
  Message.create = async (...args) => { if (first) { first = false; throw new Error("simulated database interruption"); } return original.apply(Message, args); };
  const payload = envelope({ messages: [incoming("db-retry")] });
  try { assert.equal((await signed(payload)).status, 500); } finally { Message.create = original; }
  let event = await InboundEvent.findOne(); assert.equal(event.state, "failed"); assert.ok(event.payload.message.text.body); assert.equal(event.expiresAt, undefined);
  await InboundEvent.updateOne({ _id: event._id }, { $unset: { nextAttemptAt: 1 } }); await signed(payload).expect(200); assert.equal(await Message.countDocuments(), 1); assert.equal((await InboundEvent.findById(event._id)).state, "processed");
});
test("persisted incoming survives a crash between its message and contact writes", async () => {
  const original = Contact.updateOne; Contact.updateOne = () => Promise.reject(new Error("simulated contact failure"));
  const payload = envelope({ messages: [incoming("partial-save")] });
  try { await signed(payload).expect(500); } finally { Contact.updateOne = original; }
  assert.equal(await Message.countDocuments(), 1); await InboundEvent.updateMany({}, { $unset: { nextAttemptAt: 1 } }); await signed(payload).expect(200);
  assert.equal(await Message.countDocuments(), 1); assert.ok(await Contact.exists({ phone }));
});
test("BSUID-only and unsupported events are retained privately, review does not delete them", async () => {
  await signed(envelope({ messages: [incoming("bsuid", { from: undefined, from_user_id: "IN.FICTIONAL_ONLY" })] })).expect(200);
  const event = await InboundEvent.findOne(); assert.equal(event.state, "attention"); assert.equal(event.expiresAt, undefined); assert.equal(await Message.countDocuments(), 0); assert.match(await sendingSafety(), /Review/);
  const list = await request(app).get("/api/safety/events").set(auth()); assert.equal(list.body.events[0].payload, undefined);
  const detail = await request(app).get(`/api/safety/events/${event._id}`).set(auth()); assert.equal(detail.body.payload.message.from_user_id, "IN.FICTIONAL_ONLY");
  await request(app).post(`/api/safety/events/${event._id}/acknowledge`).set(auth()).expect(200); assert.equal(await sendingSafety(), ""); assert.ok((await InboundEvent.findById(event._id)).payload);
});
test("batched webhook capture saves every event before bounded processing and drains after restart", async () => {
  const messages = Array.from({ length: 35 }, (_, i) => incoming(`batch-${i}`));
  await signed(envelope({ messages })).expect(200); assert.equal(await InboundEvent.countDocuments(), 35); assert.equal(await Message.countDocuments(), 8);
  await drainInbox(io, 20); await drainInbox(io, 20); assert.equal(await Message.countDocuments(), 35); assert.equal(await InboundEvent.countDocuments({ state: "processed" }), 35);
  await signed(envelope({ messages })).expect(200); assert.equal(await Message.countDocuments(), 35);
});
test("outgoing work pauses for incoming attention, inaccessible stats or high storage", async () => {
  templates(); const j = await apiJob(); let calls = 0;
  await senderStep(io, { safetyCheck: async () => "High storage pressure", send: async () => { calls++; } }); assert.equal(calls, 0); assert.equal((await TemplateJob.findById(j._id)).state, "paused");
  const stats = mongoose.connection.db.stats; mongoose.connection.db.stats = async () => ({ dataSize: 500 * 1048576, indexSize: 1 }); resetStorageCache();
  try { assert.match(await sendingSafety(), /90%/); mongoose.connection.db.stats = async () => { throw new Error("stats unavailable"); }; resetStorageCache(); assert.match(await sendingSafety(), /unavailable/); } finally { mongoose.connection.db.stats = stats; resetStorageCache(); }
});
test("creator removal/password revocation pauses a saved job before another send", async () => {
  templates(); const j = await apiJob(); await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  let calls = 0; await senderStep(io, { send: async () => { calls++; } }); assert.equal(calls, 0); assert.match((await TemplateJob.findById(j._id)).pauseReason, /access\/session/);
});
test("catch-up uses server update time, paginates and preserves delayed incoming after clear", async () => {
  await Contact.create({ phone });
  const first = await request(app).get(`/api/messages/${phone}`).set(auth()); assert.equal(first.status, 200); const after = first.body.syncCursor;
  await request(app).post(`/api/chats/${phone}/clear`).set(auth()).expect(200);
  await signed(envelope({ messages: [incoming("late-after-clear", { timestamp: String(Math.floor((Date.now() - 3600000) / 1000)) })] })).expect(200);
  const result = await request(app).get(`/api/chats/${phone}/sync`).set(auth()).query({ after }); assert.equal(result.status, 200); assert.equal(result.body.messages.length, 1); assert.ok(result.body.messages[0].receivedAt);
  const normal = await request(app).get(`/api/messages/${phone}`).set(auth()); assert.equal(normal.body.messages.length, 1);
  const c = await request(app).get(`/api/contacts/${phone}`).set(auth()); assert.equal(c.body.hasUnread, true);
  await request(app).get(`/api/chats/${phone}/sync`).set(auth()).query({ after: "not-a-cursor" }).expect(400);
});
test("full report exports are formula-safe and do-not-send removal requires renewed consent", async () => {
  templates(); const j = await apiJob([{ phone, name: "=danger" }]);
  const report = await request(app).get(`/api/template-sender/jobs/${j._id}/export`).set(auth()); assert.equal(report.status, 200); assert.ok(report.text.includes("'=danger")); assert.ok(report.text.includes("'+919000000001"));
  await request(app).post("/api/template-sender/suppression").set(auth()).send({ phone, blocked: true }).expect(200);
  await request(app).post("/api/template-sender/suppression").set(auth()).send({ phone, blocked: false }).expect(400);
  await request(app).post("/api/template-sender/suppression").set(auth()).send({ phone, blocked: false, consentConfirmed: true }).expect(200);
});
test("1000 mocked sends stay sequential while 40 incoming webhooks are durably stored", { timeout: 180000 }, async () => {
  // Accelerated scheduler clock: reset only nextSendAt between steps. Production
  // gap enforcement is separately tested above; this is not a real throughput promise.
  const templateScope = nock("https://graph.facebook.com").get("/v25.0/test-waba/message_templates").query(true).reply(200, { data: [greeting] }).persist();
  const rows = Array.from({ length: 1000 }, (_, i) => ({ phone: `91900000${String(i).padStart(4, "0")}`, name: `Fictional ${i}` }));
  const j = await apiJob(rows); let calls = 0, live = 0, peak = 0; const durations = [], rssStart = process.memoryUsage().rss, start = performance.now();
  let concurrentIncoming, capturedDuringSend = 0;
  const send = async () => { live++; peak = Math.max(peak, live); calls++; if (concurrentIncoming) { const capture = concurrentIncoming; concurrentIncoming = null; await capture(); assert.equal(live, 1); capturedDuringSend++; } live--; return `wamid.stress.${calls}`; };
  for (let i = 0; i < 1000; i++) {
    if (i % 25 === 0) concurrentIncoming = async () => { const t = performance.now(); await signed(envelope({ messages: [incoming(`stress-in-${i}`)] })).expect(200); durations.push(performance.now() - t); };
    await TemplateJob.updateOne({ _id: j._id }, { $unset: { nextSendAt: 1 } }); assert.equal(await senderStep(io, { send }), true);
  }
  await signed(envelope({ messages: [incoming("stress-in-0")] })).expect(200);
  assert.equal(capturedDuringSend, 40); assert.equal(calls, 1000); assert.equal(peak, 1); assert.equal(await Message.countDocuments({ direction: "incoming" }), 40); assert.equal(await Message.countDocuments({ direction: "outgoing" }), 1000); assert.equal(await TemplateRecipient.countDocuments({ state: "accepted" }), 1000); assert.equal((await TemplateJob.findById(j._id)).state, "completed");
  durations.sort((a, b) => a - b); console.log("MOCKED_LOAD_RESULT", JSON.stringify({ recipients: calls, incoming: 40, incomingDuringMockSend: capturedDuringSend, maxConcurrentSends: peak, elapsedSeconds: +(performance.now() - start).toFixed(0) / 1000, incomingP95ms: +durations[Math.floor(durations.length * .95)].toFixed(1), incomingMaxMs: +durations.at(-1).toFixed(1), nodeRssStartMB: +(rssStart / 1048576).toFixed(1), nodeRssEndMB: +(process.memoryUsage().rss / 1048576).toFixed(1), testOnlyAcceleratedClock: true }));
  templateScope.persist(false);
});

test("journal-write failure never returns 200 or processes an unrecorded incoming message", async () => {
  const original = InboundEvent.bulkWrite; InboundEvent.bulkWrite = () => Promise.reject(new Error("simulated journal outage"));
  try { await signed(envelope({ messages: [incoming("journal-unavailable")] })).expect(500); } finally { InboundEvent.bulkWrite = original; }
  assert.equal(await Message.countDocuments(), 0); assert.equal(await InboundEvent.countDocuments(), 0);
  await signed(envelope({ messages: [incoming("journal-unavailable")] })).expect(200); assert.equal(await Message.countDocuments(), 1);
});
test("catch-up paginates equal update timestamps and returns private deletion tombstones", async () => {
  const start = Buffer.from(JSON.stringify({ t: new Date(Date.now() - 2000).toISOString() })).toString("base64url");
  const at = new Date();
  const records = await Message.insertMany(Array.from({ length: 205 }, (_, i) => ({ phone, type: "text", message: `Stored ${i}`, direction: "incoming", createdAt: at, updatedAt: at, waMessageId: `wamid.sync.${i}` })));
  await Message.updateOne({ _id: records[100]._id }, { $addToSet: { hiddenFor: user._id } });
  let after = start, ids = [], removed = [], pages = 0;
  do { const r = await request(app).get(`/api/chats/${phone}/sync`).set(auth()).query({ after }); assert.equal(r.status, 200); ids.push(...r.body.messages.map(m => m._id)); removed.push(...r.body.removed); pages++; after = r.body.syncCursor; if (!r.body.hasMore) break; } while (pages < 5);
  assert.equal(pages, 3); assert.equal(new Set(ids).size, 204); assert.deepEqual(removed, [String(records[100]._id)]);
});
test("read checkpoint does not mark an incoming arriving after the loaded snapshot as read", async () => {
  await Contact.create({ phone });
  const snapshot = await request(app).get(`/api/messages/${phone}`).set(auth());
  await signed(envelope({ messages: [incoming("after-read-snapshot")] })).expect(200);
  await request(app).post(`/api/chats/${phone}/read`).set(auth()).send({ through: snapshot.body.readThrough }).expect(200);
  const c = await request(app).get(`/api/contacts/${phone}`).set(auth()); assert.equal(c.body.hasUnread, true);
});

test("book confirmation stays frozen when a new saved contact is added, and late suppression only reduces it", async () => {
  await Contact.create({ phone, name: "Already previewed", isSaved: true });
  const preview = await recipientPreview({ source: "book" }), frozen = preview.rows.filter(r => r.action === "ready");
  await Contact.create({ phone: "919000000002", isSaved: true }); templates();
  const body = await readyInput(frozen, { previewToken: sealPreview(preview, user._id), sourceLabel: "book" });
  await request(app).post("/api/template-sender/jobs").set(auth()).send({ ...body, source: "book" }).expect(400);
  const r = await request(app).post("/api/template-sender/jobs").set(auth()).send(body); assert.equal(r.status, 201); assert.equal(r.body.recipientCount, 1); assert.equal(r.body.source, "book");
  assert.equal(await TemplateRecipient.countDocuments({ phone: "919000000002" }), 0);
  await request(app).post(`/api/template-sender/jobs/${r.body._id}/control`).set(auth()).send({ action: "cancel" }).expect(200);
  const next = await readyInput([{ phone }, { phone: "919000000002" }]);
  await Contact.updateOne({ phone }, { $set: { doNotMessage: true } });
  const reduced = await request(app).post("/api/template-sender/jobs").set(auth()).send(next); assert.equal(reduced.status, 201); assert.equal(reduced.body.recipientCount, 1);
});
test("cancelled history and interrupted cancellation recover without leaving a pending outgoing bubble", async () => {
  templates(); const j = await apiJob(); const item = await TemplateRecipient.findOne({ jobId: j._id });
  const m = await Message.create({ phone, clientId: item.clientId, type: "template", direction: "outgoing", status: "pending" });
  // Simulate a stop after the job flag, before recipient/history cancellation.
  await TemplateJob.updateOne({ _id: j._id }, { $set: { state: "cancelled" } });
  process.env.SENDER_ENABLED = "false"; let calls = 0; await senderStep(io, { send: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal((await TemplateRecipient.findById(item._id)).state, "cancelled"); assert.equal((await Message.findById(m._id)).status, "failed");
});
test("cancelling during message persistence never starts a network send or resurrects pending work", async () => {
  templates(); const j = await apiJob(); const original = Message.create; let calls = 0;
  Message.create = async (...args) => {
    // Cancellation happens after the worker selected its row but before its
    // Message.create completes. This race is not an already in-flight send.
    await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "cancel" }).expect(200);
    return original.apply(Message, args);
  };
  try { await senderStep(io, { send: async () => { calls++; } }); } finally { Message.create = original; }
  assert.equal(calls, 0); const item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "cancelled"); assert.equal(item.attempts, 0); assert.equal((await Message.findOne({ clientId: item.clientId })).status, "failed");
});
test("cancelling a preparing job cannot be overwritten by a late insert batch", async () => {
  templates(); const original = TemplateRecipient.insertMany;
  TemplateRecipient.insertMany = async (rows, options) => {
    await request(app).post(`/api/template-sender/jobs/${rows[0].jobId}/control`).set(auth()).send({ action: "cancel" }).expect(200);
    return original.call(TemplateRecipient, rows, options);
  };
  try { const r = await request(app).post("/api/template-sender/jobs").set(auth()).send(await readyInput()); assert.equal(r.status, 409); } finally { TemplateRecipient.insertMany = original; }
  const job = await TemplateJob.findOne(); assert.equal(job.state, "cancelled"); assert.equal(await TemplateRecipient.countDocuments({ state: "pending" }), 0); assert.equal(await Message.countDocuments(), 0);
});
test("disabled-sender maintenance quarantines a stale attempted send but never calls Meta", async () => {
  templates(); const j = await apiJob(); await TemplateRecipient.updateMany({ jobId: j._id }, { $set: { state: "sending", attempts: 1, leaseUntil: new Date(0) } });
  process.env.SENDER_ENABLED = "false"; let calls = 0; await senderStep(io, { send: async () => { calls++; } });
  assert.equal(calls, 0); assert.equal((await TemplateRecipient.findOne()).state, "uncertain"); assert.equal((await TemplateJob.findById(j._id)).state, "attention");
});
test("failure saving a returned API ID is uncertain, not a safe resend; later ID-only receipt reconciles it", async () => {
  templates(); const j = await apiJob(); const original = Message.updateOne; let failNext = false, calls = 0;
  Message.updateOne = (...args) => { if (failNext) { failNext = false; return Promise.reject(new Error("simulated post-accept DB failure")); } return original.apply(Message, args); };
  try { await senderStep(io, { send: async () => { calls++; failNext = true; return "wamid.accepted-before-db-failure"; } }); } finally { Message.updateOne = original; }
  let item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "uncertain"); assert.equal(item.waMessageId, "wamid.accepted-before-db-failure");
  await senderStep(io, { send: async () => { calls++; } }); assert.equal(calls, 1);
  await signed(envelope({ statuses: [{ id: item.waMessageId, status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: phone }] })).expect(200);
  item = await TemplateRecipient.findById(item._id); assert.equal(item.state, "delivered"); assert.equal((await Message.findById(item.messageId)).status, "delivered");
});
test("recovery handles a pre-network DB failure as never attempted, exactly once after the safe lease expires", async () => {
  templates(); const j = await apiJob(); const original = Message.create; let calls = 0;
  Message.create = () => Promise.reject(new Error("simulated pre-send DB failure"));
  try { await assert.rejects(senderStep(io, { send: async () => { calls++; } }), /pre-send/); } finally { Message.create = original; }
  let item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "leased"); assert.equal(item.attempts, 0); assert.equal(calls, 0);
  await TemplateRecipient.updateOne({ _id: item._id }, { $set: { leaseUntil: new Date(0) } });
  await senderStep(io, { send: async () => { calls++; return "wamid.safe-lease-recovery"; } }); item = await TemplateRecipient.findById(item._id); assert.equal(calls, 1); assert.equal(item.state, "accepted");
});
test("status races and missing opaque data never downgrade delivery or auto-resend an unknown response", async () => {
  templates(); const j = await apiJob(); let clientId;
  await senderStep(io, { send: async (to, p) => { clientId = p.biz_opaque_callback_data; const e = new Error("lost response"); e.code = "DELIVERY_UNCERTAIN"; throw e; } });
  await signed(envelope({ statuses: [{ id: "wamid.no-opaque", status: "delivered", recipient_id: phone }] })).expect(200);
  let item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "uncertain");
  await signed(envelope({ statuses: [{ id: "wamid.correlated", status: "read", recipient_id: "919000000002", biz_opaque_callback_data: clientId }] })).expect(200);
  assert.equal((await TemplateRecipient.findById(item._id)).state, "uncertain");
  await Promise.all(["read", "delivered", "sent"].map(status => signed(envelope({ statuses: [{ id: "wamid.correlated", status, recipient_id: phone, biz_opaque_callback_data: clientId }] })).expect(200)));
  item = await TemplateRecipient.findById(item._id); assert.equal(item.state, "seen"); assert.equal((await Message.findById(item.messageId)).status, "seen"); assert.equal(item.attempts, 1);
});
test("unsupported/malformed entries and invalid statuses are journalled as attention, never silently acknowledged away", async () => {
  for (const payload of [{ entry: [null] }, { entry: [{ changes: [null] }] }, envelope({ messages: [null], statuses: [null] }), envelope({ messages: [incoming("unsupported", { type: "order", order: { text: "kept privately" } })] }), envelope({ messages: [incoming("bad-contact", { type: "contacts", contacts: "wrong shape" })] }), envelope({ statuses: [{ id: "wamid.unknown-status", status: "not-supported" }] })]) await signed(payload).expect(200);
  assert.equal(await InboundEvent.countDocuments({ state: "failed" }), 0); assert.equal(await InboundEvent.countDocuments({ state: "attention" }), 7); assert.equal(await Message.countDocuments({ type: "unsupported" }), 2);
  assert.equal(await InboundEvent.countDocuments({ expiresAt: { $exists: true } }), 0);
});
test("stale journal processing claims recover and repeat without duplicating persisted incoming", async () => {
  const event = await InboundEvent.create({ key: "m:wamid.abandoned-journal", kind: "message", payload: { message: incoming("abandoned-journal"), contacts: [] }, state: "processing", leaseUntil: new Date(0), attempts: 1 });
  await Promise.all([drainInbox(io), drainInbox(io)]); await processEvent(event._id, io);
  assert.equal(await Message.countDocuments(), 1); const saved = await InboundEvent.findById(event._id); assert.equal(saved.state, "processed"); assert.equal(saved.attempts, 2); assert.ok(saved.expiresAt);
});
test("a delayed incoming revives a hidden chat without showing pre-clear history or opening an expired reply window", async () => {
  await Contact.create({ phone, lastInboundAt: new Date(Date.now() - 2 * 86400000) });
  const old = await Message.create({ phone, direction: "incoming", message: "Hidden history", createdAt: new Date(Date.now() - 2 * 86400000), waMessageId: "wamid.old-hidden" });
  await request(app).delete(`/api/chats/${phone}`).set(auth()).expect(200);
  await signed(envelope({ messages: [incoming("hidden-delayed", { timestamp: String(Math.floor((Date.now() - 2 * 86400000) / 1000)) })] })).expect(200);
  const list = await request(app).get("/api/contacts").set(auth()); assert.equal(list.body.contacts.length, 1); assert.equal(list.body.contacts[0].hasUnread, true);
  const messages = await request(app).get(`/api/messages/${phone}`).set(auth()); assert.equal(messages.body.messages.length, 1); assert.notEqual(messages.body.messages[0]._id, String(old._id));
  await request(app).post("/api/send").set(auth()).send({ phone, message: "No expired-window bypass", clientId: crypto.randomUUID() }).expect(409);
});
test("template media appears in history/gallery and forwards as image, never as invalid template media", async () => {
  templates(); const uploaded = await TemplateUpload.create({ owner: user._id, templateName: photo.name, language: photo.language, mediaId: "media-forward-test", type: "image", mimeType: "image/png", filename: "header.png", expiresAt: new Date(Date.now() + 86400000) });
  const j = await apiJob([{ phone }], { name: photo.name, language: photo.language, parameters: [], uploadId: String(uploaded._id) });
  await senderStep(io, { send: async () => "wamid.template-media" }); const item = await TemplateRecipient.findOne({ jobId: j._id });
  const history = await request(app).get(`/api/messages/${phone}`).set(auth()); assert.equal(history.body.messages[0].mediaKind, "image"); assert.equal(history.body.messages[0].mediaId, undefined);
  const gallery = await request(app).get(`/api/chats/${phone}/shared`).set(auth()); assert.equal(gallery.body.messages[0]._id, String(item.messageId));
  await Contact.create({ phone: "919000000002", lastInboundAt: new Date() });
  const send = nock("https://graph.facebook.com").post("/v25.0/test-phone/messages", p => p.type === "image" && p.image.id === "media-forward-test" && p.image.caption === "नमस्कार").reply(200, { messages: [{ id: "wamid.forwarded-template-image" }] });
  await request(app).post("/api/send/forward").set(auth()).send({ phone: "919000000002", messageId: String(item.messageId), clientId: crypto.randomUUID() }).expect(200); assert.ok(send.isDone());
});
test("template media upload metadata cannot be borrowed by another admin or language", async () => {
  templates(); const upload = await TemplateUpload.create({ owner: new mongoose.Types.ObjectId(), templateName: photo.name, language: photo.language, mediaId: "private-media", type: "image", expiresAt: new Date(Date.now() + 86400000) });
  let body = await readyInput([{ phone }], { name: photo.name, language: photo.language, parameters: [], uploadId: String(upload._id) });
  await request(app).post("/api/template-sender/jobs").set(auth()).send(body).expect(400);
  await TemplateUpload.updateOne({ _id: upload._id }, { $set: { owner: user._id, language: "en" } });
  await request(app).post("/api/template-sender/jobs").set(auth()).send(body).expect(400); assert.equal(await TemplateJob.countDocuments(), 0);
});
test("persisted worker continues a saved queue without any polling UI/browser session", { timeout: 15000 }, async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }, { phone: "919000000003" }]);
  const bus = new EventEmitter(), workerIo = { emit: (type, payload) => bus.emit(type, payload), to: io.to }; let requests = 0, timer;
  nock("https://graph.facebook.com").post("/v25.0/test-phone/messages").times(3).reply(() => [200, { messages: [{ id: `wamid.headless-worker.${++requests}` }] }]);
  // No GET job/detail/heartbeat calls are made after creation. Only the real
  // Node worker and mocked provider keep operating, independent of a browser.
  const finished = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("worker did not complete saved queue")), 12000);
    bus.on("sender:update", async () => { try { if ((await TemplateJob.findById(j._id)).state === "completed") resolve(); } catch (err) { reject(err); } });
  });
  const stop = startWorker(workerIo);
  try { await finished; } finally { clearTimeout(timer); await stop(); bus.removeAllListeners(); }
  assert.equal(requests, 3); assert.equal(await TemplateRecipient.countDocuments({ state: "accepted" }), 3);
});

test("template signature binds selected content and changes pause saved work before sending", async () => {
  templates(); const body = await readyInput();
  await request(app).post("/api/template-sender/jobs").set(auth()).send({ ...body, templateSignature: "stale-template-signature" }).expect(409); assert.equal(await TemplateJob.countDocuments(), 0);
  const created = await request(app).post("/api/template-sender/jobs").set(auth()).send(body).expect(201);
  resetTemplateCache(); templates([{ ...greeting, components: [{ type: "BODY", text: "Changed {{1}}" }] }]);
  let calls = 0; await senderStep(io, { send: async () => { calls++; } }); assert.equal(calls, 0); assert.match((await TemplateJob.findById(created.body._id)).pauseReason, /content changed/);
});
test("actual adapter treats an HTTP 5xx after send as uncertain and never automatically retries it", async () => {
  templates(); const j = await apiJob(); const scope = nock("https://graph.facebook.com").post("/v25.0/test-phone/messages").reply(503, { error: { message: "temporary provider issue" } });
  await senderStep(io); assert.ok(scope.isDone()); await senderStep(io);
  const item = await TemplateRecipient.findOne({ jobId: j._id }); assert.equal(item.state, "uncertain"); assert.equal(item.errorCode, "DELIVERY_UNCERTAIN"); assert.equal(item.attempts, 1);
});
test("definite provider rejection pauses remaining rows; resume attempts only the previously unsent recipient", async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }]);
  nock("https://graph.facebook.com").post("/v25.0/test-phone/messages").reply(400, { error: { code: 132001, message: "Template rejected" } });
  await senderStep(io); assert.equal((await TemplateJob.findById(j._id)).state, "paused"); assert.equal(await TemplateRecipient.countDocuments({ state: "failed" }), 1);
  await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "resume" }).expect(200);
  await TemplateJob.updateOne({ _id: j._id }, { $unset: { nextSendAt: 1 } }); let calls = 0;
  await senderStep(io, { send: async to => { calls++; assert.equal(to, "919000000002"); return "wamid.remaining-after-explicit-resume"; } });
  assert.equal(calls, 1); assert.equal(await TemplateRecipient.countDocuments({ state: "failed", attempts: 1 }), 1); assert.equal((await TemplateJob.findById(j._id)).state, "completed");
});
test("incoming journal drains in the real worker even with template sending disabled", { timeout: 10000 }, async () => {
  process.env.SENDER_ENABLED = "false";
  await signed(envelope({ messages: Array.from({ length: 35 }, (_, i) => incoming(`disabled-worker-${i}`)) })).expect(200); assert.equal(await Message.countDocuments(), 8);
  const bus = new EventEmitter(); let timer, count = 0;
  const finished = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("disabled worker did not drain incoming")), 8000); bus.on("message:new", () => { if (++count === 27) resolve(); }); });
  const stop = startWorker({ emit: (type, p) => bus.emit(type, p), to: io.to });
  try { await finished; } finally { clearTimeout(timer); await stop(); bus.removeAllListeners(); }
  assert.equal(await Message.countDocuments(), 35); assert.equal(await InboundEvent.countDocuments({ state: "processed" }), 35); assert.equal(await TemplateRecipient.countDocuments(), 0);
});

test("per-chat approved-template action also honors shared opt-out suppression", async () => {
  await Contact.create({ phone, doNotMessage: true });
  const r = await request(app).post("/api/send/template").set(auth()).send({ phone, name: greeting.name, language: "en", parameters: ["Friend"], clientId: crypto.randomUUID() });
  assert.equal(r.status, 409); assert.equal(r.body.code, "RECIPIENT_SUPPRESSED"); assert.equal(await Message.countDocuments(), 0);
});
test("cancel cannot unsend a request already in flight, but remaining recipients are never attempted", async () => {
  templates(); const j = await apiJob([{ phone }, { phone: "919000000002" }]); let calls = 0;
  await senderStep(io, { send: async () => {
    calls++; await request(app).post(`/api/template-sender/jobs/${j._id}/control`).set(auth()).send({ action: "cancel" }).expect(200);
    return "wamid.in-flight-at-cancel";
  } });
  await senderStep(io, { send: async () => { calls++; } }); assert.equal(calls, 1);
  assert.equal(await TemplateRecipient.countDocuments({ state: "accepted" }), 1); assert.equal(await TemplateRecipient.countDocuments({ state: "cancelled", attempts: 0 }), 1); assert.equal((await TemplateJob.findById(j._id)).state, "cancelled");
});
