import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import nock from "nock";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import InboundEvent from "../models/InboundEvent.js";
import TemplateJob from "../models/TemplateJob.js";
import TemplateRecipient from "../models/TemplateRecipient.js";
import { databaseUsage, resetUsageCache } from "../services/system-usage.js";
import { storageStatus, resetStorageCache } from "../services/safety.js";
process.env.JWT_SECRET = "test-only-system-usage-secret-12345678901234567890";
process.env.PHONE_ID = "usage-test-phone";
process.env.TOKEN = "PRIVATE-META-ACCESS-TOKEN"; process.env.APP_SECRET = "PRIVATE-APP-SECRET";
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = "true";
process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server/", import.meta.url));
const app = createApp({ engine: { clientsCount: 3 }, emit() {}, to() { return { emit() {} }; } });
let mongo, user, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const usageRequest = () => request(app).get("/api/system/usage").set(auth());
before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { maxPoolSize: 10, monitorCommands: true });
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
  nock.disableNetConnect(); nock.enableNetConnect(host => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));
});
after(async () => { nock.cleanAll(); nock.enableNetConnect(); await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  resetUsageCache(); resetStorageCache(); nock.cleanAll(); process.env.STORAGE_LIMIT_MB = "512"; process.env.SENDER_ENABLED = "false";
  await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).deleteMany()));
  user = await User.create({ username: "usage-private-admin", password: "unused-test-hash", role: "admin" });
  token = jwt.sign({ id: String(user._id), v: 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
});

test("usage is admin-only, rejects revoked sessions, and cannot be queried anonymously", async () => {
  assert.equal((await request(app).get("/api/system/usage")).status, 401);
  await User.updateOne({ _id: user._id }, { $set: { role: "agent" } }); assert.equal((await usageRequest()).status, 403);
  await User.updateOne({ _id: user._id }, { $set: { role: "admin", tokenVersion: 1 } }); assert.equal((await usageRequest()).status, 401);
  token = jwt.sign({ id: String(user._id), v: 1 }, process.env.JWT_SECRET); assert.equal((await usageRequest()).status, 200);
  await User.deleteOne({ _id: user._id }); assert.equal((await usageRequest()).status, 401);
});
test("usage returns scoped measurements, no-store headers and no secrets/contact content", async () => {
  await Contact.create({ phone: "919999999999", name: "PRIVATE CONTACT NAME", notes: "PRIVATE CONTACT NOTE" });
  await Message.create({ phone: "919999999999", direction: "incoming", message: "PRIVATE MESSAGE CONTENT", receivedAt: new Date() });
  const res = await usageRequest(); assert.equal(res.status, 200, JSON.stringify(res.body)); assert.match(res.headers["cache-control"], /private.*no-store/);
  const r = res.body; assert.equal(r.version, "2.3.0"); assert.equal(r.connectedSockets, 3); assert.equal(r.senderEnabled, false); assert.ok(r.runtime.memory.nodeRssBytes > 0); assert.ok(r.runtime.uptimeSeconds >= 0); assert.ok(r.database.connected); assert.equal(r.database.storage.limitBytes, 512 * 1048576);
  assert.ok(r.unavailableProviderMetrics.some(s => /billing/.test(s))); assert.match(r.database.storage.scope, /This database/); assert.match(r.http.scope, /reset on restart/);
  assert.ok(!/PRIVATE-|PRIVATE CONTACT|PRIVATE MESSAGE|919999999999|unused-test-hash|usage-private-admin|mongodb:\/\/|\/sys\/fs\/cgroup\//.test(JSON.stringify(r)));
  assert.equal((await request(app).get("/")).body.version, "2.3.0");
});
test("24h activity uses actual incoming receipt time, legacy fallback and current outgoing states", async () => {
  const recent = new Date(Date.now() - 60000), old = new Date(Date.now() - 48 * 3600000), future = new Date(Date.now() + 3600000), phone = "919000000001";
  await Message.insertMany([
    { phone, direction: "incoming", createdAt: old, receivedAt: recent },
    { phone, direction: "incoming", createdAt: recent },
    { phone, direction: "incoming", createdAt: recent, receivedAt: null },
    { phone, direction: "incoming", createdAt: old, receivedAt: old },
    { phone, direction: "incoming", createdAt: recent, receivedAt: future },
    { phone, direction: "outgoing", createdAt: recent, status: "seen" },
    { phone, direction: "outgoing", createdAt: recent, status: "failed" },
    { phone, direction: "outgoing", createdAt: recent, status: "pending" },
    { phone, direction: "outgoing", createdAt: recent, status: "delivered", type: "template" },
    { phone, direction: "outgoing", createdAt: old, status: "sent" },
    { phone, direction: "outgoing", createdAt: future, status: "sent" }
  ]);
  const r = await databaseUsage(); assert.equal(r.activity.incoming, 3); assert.equal(r.activity.outgoing, 4); assert.equal(r.activity.templateOutgoing, 1); assert.deepEqual(r.activity.outgoingStates, { delivered: 1, failed: 1, pending: 1, seen: 1 }); assert.equal(r.retainedMessageEstimate, 11); assert.match(r.scope, /not a count of deliveries/);
});
test("contact, inbox and saved queue summaries distinguish captured attention and uncertainty", async () => {
  await Contact.create([{ phone: "919000000001", isSaved: true }, { phone: "919000000002", isSaved: false }]);
  await Contact.collection.insertOne({ phone: "919000000003", name: "Legacy saved contact" });
  await InboundEvent.create(["pending", "processing", "failed", "processed", "attention"].map(state => ({ key: crypto.randomUUID(), kind: "message", state })));
  await InboundEvent.create({ key: crypto.randomUUID(), kind: "message", state: "attention", acknowledgedAt: new Date() });
  const states = ["preparing", "queued", "running", "paused", "completed", "cancelled", "attention"];
  const jobs = await TemplateJob.create(states.map(state => ({ requestId: crypto.randomUUID(), createdBy: user._id, state })));
  await TemplateRecipient.create(["pending", "pending", "leased", "sending", "uncertain", "accepted"].map((state, i) => ({ jobId: jobs[0]._id, phone: `91900000000${i}`, clientId: crypto.randomUUID(), state })));
  const r = await databaseUsage(); assert.equal(r.savedContacts, 2); assert.equal(r.contactRecordsEstimate, 3); assert.equal(r.inbox.states.attention, 2); assert.equal(r.inbox.unreviewed, 1); assert.deepEqual(r.queue.recipientStates, { leased: 1, pending: 2, sending: 1, uncertain: 1 }); assert.equal(Object.keys(r.queue.jobStates).length, 7); assert.equal(r.queue.jobStates.paused, 1);
});
test("diagnostics coalesce/cache all database reads, cap concurrency at two and set maxTimeMS", async () => {
  const client = mongoose.connection.getClient(), active = new Set(), commands = []; let maximum = 0;
  const start = e => { if (["count", "aggregate", "dbStats"].includes(e.commandName)) { active.add(e.requestId); maximum = Math.max(maximum, active.size); commands.push(e.command); } };
  const finish = e => active.delete(e.requestId); client.on("commandStarted", start); client.on("commandSucceeded", finish); client.on("commandFailed", finish);
  try {
    const results = await Promise.all(Array.from({ length: 6 }, () => databaseUsage())); assert.ok(results.every(r => r.observedAt === results[0].observedAt)); assert.equal(commands.length, 8); assert.ok(maximum <= 2, `Concurrent diagnostics: ${maximum}`); assert.ok(commands.every(c => c.maxTimeMS > 0 && c.maxTimeMS <= 2500));
    await databaseUsage(); assert.equal(commands.length, 8); assert.equal(active.size, 0);
  } finally { client.off("commandStarted", start); client.off("commandSucceeded", finish); client.off("commandFailed", finish); }
});
test("usage performs no Mongo writes, sends, index creation or background history collection", async () => {
  const before = await mongoose.connection.db.listCollections().toArray(), client = mongoose.connection.getClient(), writes = [];
  const observe = e => { if (["insert", "update", "delete", "findAndModify", "create", "createIndexes", "drop", "dropDatabase"].includes(e.commandName)) writes.push(e.commandName); };
  client.on("commandStarted", observe);
  try { await usageRequest().expect(200); await usageRequest().expect(200); assert.deepEqual(writes, []); assert.equal(await Message.countDocuments(), 0); assert.equal(await TemplateJob.countDocuments(), 0); assert.equal(await InboundEvent.countDocuments(), 0); } finally { client.off("commandStarted", observe); }
  const after = await mongoose.connection.db.listCollections().toArray(); assert.deepEqual(after.map(r => r.name).sort(), before.map(r => r.name).sort()); assert.deepEqual(nock.pendingMocks(), []);
});
test("one failed count yields partial/unknown, never a fabricated zero or private database error", async t => {
  t.mock.method(Message, "aggregate", () => ({ option: async () => { throw new Error("PRIVATE-DATABASE-HOST-AND-ERROR"); } }));
  const r = await usageRequest(); assert.equal(r.status, 200); assert.equal(r.body.database.partial, true); assert.ok(r.body.database.unavailableMetrics.includes("activity")); assert.equal(r.body.database.activity, null); assert.equal(r.body.database.savedContacts, 0); assert.ok(!JSON.stringify(r.body).includes("PRIVATE-DATABASE-HOST-AND-ERROR"));
});
test("storage includes data + indexes, labels its budget, and treats failed/malformed stats as unknown", async t => {
  let reply = { dataSize: 100, indexSize: 50, storageSize: 200, indexes: 3 }, received;
  t.mock.method(mongoose.connection.db, "stats", async options => { received = options; if (reply instanceof Error) throw reply; return reply; });
  process.env.STORAGE_LIMIT_MB = "Infinity"; const r = await storageStatus(); assert.equal(r.bytes, 150); assert.equal(r.dataBytes, 100); assert.equal(r.indexBytes, 50); assert.equal(r.allocatedDataBytes, 200); assert.equal(r.limitBytes, 512 * 1048576); assert.equal(received.maxTimeMS, 2000);
  for (const invalid of [{}, { dataSize: -1, indexSize: 0 }, { dataSize: NaN, indexSize: 0 }, new Error("PRIVATE-STATS-ERROR")]) { reply = invalid; resetStorageCache(); const unknown = await storageStatus(); assert.equal(unknown.available, false); assert.equal(unknown.percent, null); assert.ok(!JSON.stringify(unknown).includes("PRIVATE-STATS-ERROR")); }
});
test("disconnect returns a visibly stale snapshot without queueing buffered diagnostic queries", async () => {
  const previous = await databaseUsage(); await mongoose.disconnect();
  try {
    const start = Date.now(), r = await databaseUsage(); assert.ok(Date.now() - start < 200); assert.equal(r.connected, false); assert.equal(r.stale, true); assert.equal(r.observedAt, previous.observedAt); assert.match(r.warning, /stale/);
    resetUsageCache(); const none = await databaseUsage(); assert.equal(none.available, false); assert.equal(none.stale, false); assert.equal(none.storage, undefined);
  } finally { await mongoose.connect(mongo.getUri(), { maxPoolSize: 10, monitorCommands: true }); }
});

test("cold dashboard diagnostics coexist with signed incoming webhooks without sending or duplicating", async () => {
  const signed = i => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: process.env.PHONE_ID }, messages: [{ from: "919000000001", id: `wamid.usage-coexist-${i}`, type: "text", text: { body: "Fictional concurrent incoming" }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
    return request(app).post("/webhook").set("Content-Type", "application/json").set("x-hub-signature-256", `sha256=${crypto.createHmac("sha256", process.env.APP_SECRET).update(raw).digest("hex")}`).send(raw);
  };
  const responses = await Promise.all([...Array.from({ length: 3 }, () => usageRequest()), ...Array.from({ length: 20 }, (_, i) => signed(i))]);
  assert.ok(responses.every(r => r.status === 200), responses.map(r => r.status).join(","));
  assert.equal(await Message.countDocuments({ direction: "incoming" }), 20); assert.equal(await Message.countDocuments({ direction: "outgoing" }), 0); assert.equal(await TemplateJob.countDocuments(), 0); assert.equal(await InboundEvent.countDocuments({ state: "processed" }), 20);
  await signed(0).expect(200); assert.equal(await Message.countDocuments(), 20);
});
