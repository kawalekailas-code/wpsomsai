import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import request from "supertest";
import nock from "nock";
import axios from "axios";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { createHttpServer } from "../http.js";
import { io as makeSocketClient } from "socket.io-client";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import ChatState from "../models/ChatState.js";
import DeliveryReceipt from "../models/DeliveryReceipt.js";
import { normalizePhone } from "../lib/utils.js";

process.env.JWT_SECRET = "test-secret-only-never-use-in-production-123456";
process.env.APP_SECRET = "test-meta-app-secret";
process.env.VERIFY_TOKEN = "test-verification-token";
process.env.PHONE_ID = "123456789";
process.env.TOKEN = "test-meta-token";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.WHATSAPP_API_VERSION = "v25.0";
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = "true";
process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server/", import.meta.url));
axios.defaults.proxy = false;
const phone = "919876543210";
const io = { emit() {}, to() { return { emit() {} }; } };
const app = createApp(io);
let mongo, user, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const signed = payload => { const raw = typeof payload === "string" ? payload : JSON.stringify(payload); return request(app).post("/webhook").set("Content-Type", "application/json").set("x-hub-signature-256", `sha256=${crypto.createHmac("sha256", process.env.APP_SECRET).update(raw).digest("hex")}`).send(raw); };
const envelope = value => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: process.env.PHONE_ID }, ...value } }] }] });
const mockSend = (id, matcher = () => true) => nock("https://graph.facebook.com").post(`/v25.0/${process.env.PHONE_ID}/messages`, matcher).reply(200, { messages: [{ id }] });
const addContact = (extra = {}) => Contact.create({ phone, name: "Neha", lastInboundAt: new Date(), lastActivityAt: new Date(), ...extra });
const addMessage = (extra = {}) => Message.create({ phone, message: "Hello", direction: "incoming", waMessageId: `wamid.${crypto.randomUUID()}`, ...extra });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { maxPoolSize: 5 });
  await Promise.all([User.init(), Contact.init(), Message.init(), ChatState.init(), DeliveryReceipt.init()]);
  nock.disableNetConnect(); nock.enableNetConnect(host => /^(127\.0\.0\.1|localhost|\[::1\])/.test(host));
});
after(async () => { nock.cleanAll(); nock.enableNetConnect(); await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  nock.cleanAll();
  await Promise.all([User.deleteMany(), Contact.deleteMany(), Message.deleteMany(), ChatState.deleteMany(), DeliveryReceipt.deleteMany(), mongoose.connection.collection("setuplocks").deleteMany()]);
  process.env.ALLOW_FIRST_USER_SETUP = "false";
  user = await User.create({ username: "owner", displayName: "Owner", password: await bcrypt.hash("correct-password", 4), role: "admin" });
  token = jwt.sign({ id: String(user._id), role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
});

test("authentication, safe profile and removed modules", async () => {
  assert.equal((await request(app).get("/api/contacts")).status, 401);
  const me = await request(app).get("/auth/me").set(auth()); assert.equal(me.status, 200); assert.equal(me.body.password, undefined); assert.equal(me.body.preferences.theme, "light");
  for (const url of ["/api/broadcast", "/api/marketing/campaigns", "/api/marketing/templates"]) assert.equal((await request(app).post(url).set(auth()).send({})).status, 404);
  assert.equal((await request(app).get("/uploads/images.jpg")).status, 404);
});
test("normalizes Indian and international phones without the old starts-with-91 bug", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91 91234 56789"), "919123456789");
  assert.equal(normalizePhone("+1 202 555 0123"), "12025550123");
  assert.throws(() => normalizePhone({ $ne: null }));
});
test("first-account setup is explicitly locked and requires the setup key", async () => {
  await User.deleteMany();
  assert.equal((await request(app).post("/auth/register").send({ username: "first", password: "a-long-safe-password" })).status, 403);
  process.env.ALLOW_FIRST_USER_SETUP = "true"; process.env.SETUP_KEY = "one-time-test-key";
  const r = await request(app).post("/auth/register").set("x-setup-key", process.env.SETUP_KEY).send({ username: "first", password: "a-long-safe-password" });
  assert.equal(r.status, 201); assert.equal(r.body.role, "admin");
  const login = await request(app).post("/auth/login").send({ username: "first", password: "a-long-safe-password" }); assert.equal(login.status, 200); assert.ok(login.body.token);
});
test("stores whitelisted preferences without allowing privilege changes", async () => {
  const r = await request(app).patch("/api/me").set(auth()).send({ displayName: "Kailas", role: "intruder", preferences: { theme: "dark", quickReplies: ["Hi", "Thanks"], sound: false } });
  assert.equal(r.status, 200); assert.equal(r.body.displayName, "Kailas"); assert.equal(r.body.role, "admin"); assert.equal(r.body.preferences.theme, "dark");
  assert.equal((await request(app).patch("/api/me").set(auth()).send({ preferences: { theme: "invalid" } })).status, 400);
});
test("pin, archive, mute and unread state are scoped to the signed-in user", async () => {
  await addContact();
  await request(app).patch(`/api/chats/${phone}`).set(auth()).send({ pinned: true, archived: true, manualUnread: true, mutedUntil: "2099-01-01T00:00:00.000Z" }).expect(200);
  const mine = await request(app).get("/api/contacts?filter=archived").set(auth()); assert.equal(mine.body.contacts.length, 1); assert.equal(mine.body.contacts[0].pinned, true); assert.equal(mine.body.contacts[0].hasUnread, true);
  const other = await User.create({ username: "other", password: "not-used" });
  const otherToken = jwt.sign({ id: String(other._id) }, process.env.JWT_SECRET);
  const theirs = await request(app).get("/api/contacts").set("Authorization", `Bearer ${otherToken}`); assert.equal(theirs.body.contacts[0].archived, false); assert.equal(theirs.body.contacts[0].pinned, false);
});
test("sends native replies and deduplicates repeated client message IDs", async () => {
  await addContact(); const parent = await addMessage({ waMessageId: "wamid.parent" });
  const scope = mockSend("wamid.outgoing", body => body.to === phone && body.context.message_id === "wamid.parent" && body.text.body === "A reply");
  const payload = { phone, message: "A reply", replyToId: String(parent._id), clientId: "client_reply_00000001" };
  const one = await request(app).post("/api/send").set(auth()).send(payload); assert.equal(one.status, 200); assert.equal(one.body.status, "sent"); assert.equal(one.body.context.messageId, String(parent._id));
  const two = await request(app).post("/api/send").set(auth()).send(payload); assert.equal(two.body._id, one.body._id); assert.equal(await Message.countDocuments(), 2); assert.ok(scope.isDone()); assert.equal(one.body.clientId, undefined);
});
test("rejects free-form sends outside 24 hours but can send an approved template", async () => {
  await addContact({ lastInboundAt: new Date(Date.now() - 25 * 3600000) });
  const denied = await request(app).post("/api/send").set(auth()).send({ phone, message: "Hello", clientId: "client_window_000001" }); assert.equal(denied.status, 409); assert.equal(denied.body.code, "WINDOW_CLOSED");
  const scope = mockSend("wamid.template", body => body.type === "template" && body.template.components[0].parameters[0].text === "Neha");
  const allowed = await request(app).post("/api/send/template").set(auth()).send({ phone, name: "approved_greeting", language: "en", parameters: ["Neha"], clientId: "client_template_00001" }); assert.equal(allowed.status, 200); assert.ok(scope.isDone());
  assert.ok(new Date((await Contact.findOne({ phone })).lastInboundAt) < new Date(Date.now() - 24 * 3600000));
});
test("webhook verification uses original raw bytes and handles every message idempotently", async () => {
  const value = envelope({ contacts: [{ wa_id: phone, profile: { name: "Neha Patil" } }], messages: [1, 2].map(i => ({ from: phone, id: `wamid.in.${i}`, type: "text", timestamp: String(Math.floor(Date.now() / 1000)), text: { body: `Hello ${i}` } })) });
  const raw = JSON.stringify(value, null, 3);
  assert.equal((await signed(raw)).status, 200); assert.equal((await signed(raw)).status, 200);
  assert.equal(await Message.countDocuments(), 2); assert.equal((await Contact.findOne({ phone })).name, "Neha Patil");
  assert.equal((await request(app).post("/webhook").set("x-hub-signature-256", "bad-signature").send(value)).status, 403);
});
test("delivery, read and failed receipts never regress confirmed delivery", async () => {
  const m = await addMessage({ direction: "outgoing", waMessageId: "wamid.status", status: "sent" });
  for (const status of ["delivered", "read", "sent", "failed"]) await signed(envelope({ statuses: [{ id: m.waMessageId, status, timestamp: String(Math.floor(Date.now() / 1000)) }] })).expect(200);
  const updated = await Message.findById(m._id); assert.equal(updated.status, "seen"); assert.ok(updated.deliveredAt); assert.ok(updated.readAt);
  const failed = await addMessage({ direction: "outgoing", waMessageId: "wamid.failure", status: "sent" });
  await signed(envelope({ statuses: [{ id: failed.waMessageId, status: "failed", errors: [{ message: "Recipient unavailable" }] }] })).expect(200);
  assert.equal((await Message.findById(failed._id)).status, "failed");
});
test("early status webhooks are reconciled after the send response", async () => {
  await addContact();
  await signed(envelope({ statuses: [{ id: "wamid.early", status: "read", timestamp: String(Math.floor(Date.now() / 1000)) }] })).expect(200);
  mockSend("wamid.early");
  const r = await request(app).post("/api/send").set(auth()).send({ phone, message: "Hello", clientId: "client_early_00000001" }); assert.equal(r.status, 200); assert.equal(r.body.status, "seen");
});
test("stars and delete-for-me do not leak another user's state", async () => {
  await addContact(); const m = await addMessage();
  await request(app).patch(`/api/messages/${m._id}/star`).set(auth()).send({ starred: true }).expect(200);
  assert.equal((await request(app).get("/api/starred").set(auth())).body.messages.length, 1);
  const other = await User.create({ username: "friend", password: "not-used" }); const otherAuth = { Authorization: `Bearer ${jwt.sign({ id: String(other._id) }, process.env.JWT_SECRET)}` };
  const theirs = await request(app).get(`/api/message/${m._id}`).set(otherAuth); assert.equal(theirs.body.starred, false); assert.equal(theirs.body.starredBy, undefined); assert.equal(theirs.body.hiddenFor, undefined);
  await request(app).delete(`/api/messages/${m._id}`).set(auth()).expect(200);
  assert.equal((await request(app).get(`/api/message/${m._id}`).set(auth())).status, 404); assert.equal((await request(app).get(`/api/message/${m._id}`).set(otherAuth)).status, 200);
});
test("message pagination is stable at equal timestamps, and around-message navigation works", async () => {
  await addContact(); const time = new Date();
  const messages = await Message.insertMany(Array.from({ length: 7 }, (_, i) => ({ phone, direction: "incoming", message: `Message ${i}`, createdAt: time })));
  const first = await request(app).get(`/api/messages/${phone}?limit=2`).set(auth()); assert.equal(first.body.messages.length, 2); assert.ok(first.body.nextCursor);
  const second = await request(app).get(`/api/messages/${phone}?limit=2&before=${first.body.nextCursor}`).set(auth()); assert.equal(second.body.messages.length, 2); assert.ok(first.body.messages.every(m => !second.body.messages.some(n => n._id === m._id)));
  const around = await request(app).get(`/api/messages/${phone}?around=${messages[2]._id}`).set(auth()); assert.ok(around.body.messages.some(m => m._id === String(messages[2]._id)));
  assert.equal((await request(app).get(`/api/messages/${phone}?before=badcursor`).set(auth())).status, 400);
});
test("clear-for-me hides search, stars and export history only for that user", async () => {
  await addContact(); const m = await addMessage({ message: "Remember value[1]", starredBy: [user._id] });
  const search = await request(app).get("/api/search-messages").query({ q: "value[1]" }).set(auth()); assert.equal(search.body.messages.length, 1);
  const exported = await request(app).get(`/api/chats/${phone}/export`).set(auth()); assert.match(exported.text, /Remember value\[1\]/);
  await request(app).post(`/api/chats/${phone}/clear`).set(auth()).expect(200);
  assert.equal((await request(app).get(`/api/messages/${phone}`).set(auth())).body.messages.length, 0); assert.equal((await request(app).get("/api/starred").set(auth())).body.messages.length, 0);
  assert.equal((await request(app).get("/api/search-messages?q=Remember").set(auth())).body.messages.length, 0); assert.ok(await Message.findById(m._id));
});
test("native reactions use the original WhatsApp ID and can be removed", async () => {
  await addContact(); const m = await addMessage({ waMessageId: "wamid.react" });
  for (const emoji of ["👍", ""]) {
    const scope = mockSend(`wamid.reaction.${emoji ? "add" : "remove"}`, body => body.type === "reaction" && body.reaction.message_id === "wamid.react" && body.reaction.emoji === emoji);
    const r = await request(app).post(`/api/messages/${m._id}/reaction`).set(auth()).send({ emoji }); assert.equal(r.status, 200); assert.equal(r.body.reactions.self, emoji); assert.ok(scope.isDone());
  }
});
test("sends location and contact-card messages through Meta", async () => {
  await addContact();
  const loc = mockSend("wamid.location", body => body.type === "location" && body.location.latitude === 19.1);
  await request(app).post("/api/send/location").set(auth()).send({ phone, latitude: 19.1, longitude: 74.7, name: "Meeting point", clientId: "client_location_00001" }).expect(200); assert.ok(loc.isDone());
  const contact = mockSend("wamid.contact", body => body.type === "contacts" && body.contacts[0].phones[0].phone === "+12025550123");
  await request(app).post("/api/send/contact").set(auth()).send({ phone, name: "Friend", sharedPhone: "+1 202 555 0123", clientId: "client_contact_000001" }).expect(200); assert.ok(contact.isDone());
  assert.equal((await request(app).post("/api/send/location").set(auth()).send({ phone, latitude: 91, longitude: 0, clientId: "client_bad_location01" })).status, 400);
});
test("uploads checked file bytes, stores only the media ID, and cleans temporary files", async () => {
  await addContact();
  const media = nock("https://graph.facebook.com").post(`/v25.0/${process.env.PHONE_ID}/media`).reply(200, { id: "meta-media-id" });
  const sent = mockSend("wamid.photo", body => body.type === "image" && body.image.id === "meta-media-id");
  const r = await request(app).post("/api/send/media").set(auth()).field("phone", phone).field("clientId", "client_photo_00000001").field("caption", "A picture").attach("file", path.resolve("../frontend/public/icon-192.png"));
  assert.equal(r.status, 200); assert.equal(r.body.mediaId, undefined); assert.ok(media.isDone()); assert.ok(sent.isDone());
  const stored = await Message.findById(r.body._id); assert.equal(stored.mediaId, "meta-media-id"); assert.equal(stored.mimeType, "image/png");
  assert.deepEqual(await fs.readdir(path.join(os.tmpdir(), "omsai-chat-uploads")), []);
  const bad = await request(app).post("/api/send/media").set(auth()).field("phone", phone).field("clientId", "client_bad_file_00001").attach("file", Buffer.from("<svg><script>alert(1)</script></svg>"), { filename: "unsafe.svg", contentType: "image/svg+xml" }); assert.equal(bad.status, 400);
});
test("private media proxy requires auth and resolves fresh Meta URLs", async () => {
  await addContact(); const m = await addMessage({ media: true, type: "image", mediaId: "media123", filename: "picture.png", mimeType: "image/png" });
  assert.equal((await request(app).get(`/api/media/${m._id}`)).status, 401);
  nock("https://graph.facebook.com").get("/v25.0/media123").reply(200, { url: "https://lookaside.fbsbx.com/example-media", file_size: 8, mime_type: "image/png" });
  nock("https://lookaside.fbsbx.com").get("/example-media").reply(200, Buffer.from("png-data"), { "Content-Type": "image/png" });
  const r = await request(app).get(`/api/media/${m._id}`).set(auth()); assert.equal(r.status, 200); assert.match(r.headers["content-disposition"], /attachment/); assert.match(r.headers["cache-control"], /no-store/);
});
test("voice notes are actually transcoded to OGG/Opus before upload", async () => {
  await addContact();
  const samples = 8000, wav = Buffer.alloc(44 + samples * 2); wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  let uploaded;
  nock("https://graph.facebook.com").post(`/v25.0/${process.env.PHONE_ID}/media`).reply(function (uri, body) { uploaded = Buffer.isBuffer(body) ? body : Buffer.from(String(body), /^[a-f0-9]+$/i.test(String(body)) ? "hex" : "utf8"); return [200, { id: "voice-media-id" }]; });
  const sent = mockSend("wamid.voice", body => body.audio.voice === true && body.audio.id === "voice-media-id");
  const r = await request(app).post("/api/send/media").set(auth()).field("phone", phone).field("voice", "true").field("clientId", "client_voice_00000001").attach("file", wav, { filename: "recording.wav", contentType: "audio/wav" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.voice, true); assert.equal(r.body.mimeType, "audio/ogg"); assert.ok(sent.isDone());
  assert.deepEqual(await fs.readdir(path.join(os.tmpdir(), "omsai-chat-uploads")), []);
});


test("password changes invalidate existing JWTs and administrative registration", async () => {
  await request(app).post("/auth/change-password").set(auth()).send({ oldPassword: "correct-password", newPassword: "new-correct-password" }).expect(200);
  await request(app).get("/auth/me").set(auth()).expect(401);
  await request(app).post("/auth/register").set(auth()).send({ username: "revoked_user", password: "a-long-new-password" }).expect(403);
  const login = await request(app).post("/auth/login").send({ username: "owner", password: "new-correct-password" });
  assert.equal(login.status, 200);
  await request(app).get("/auth/me").set("Authorization", `Bearer ${login.body.token}`).expect(200);
});

test("concurrent out-of-order receipts remain monotonic and retain known timestamps", async () => {
  const m = await addMessage({ direction: "outgoing", waMessageId: "wamid.concurrent", status: "sent" });
  await Promise.all(["read", "sent", "delivered", "failed", "delivered", "read"].map(status => signed(envelope({ statuses: [{ id: m.waMessageId, status, timestamp: String(Math.floor(Date.now() / 1000)) }] })).expect(200)));
  const actual = await Message.findById(m._id); assert.equal(actual.status, "seen"); assert.ok(actual.readAt); assert.ok(actual.deliveredAt);
});

test("Socket.IO polling shares the HTTP server without double-handling requests", async () => {
  const live = createHttpServer();
  await new Promise(resolve => live.server.listen(0, "127.0.0.1", resolve));
  const client = makeSocketClient(`http://127.0.0.1:${live.server.address().port}`, { transports: ["polling"], auth: { token }, reconnection: false });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket handshake timed out")), 4000);
      client.once("connect", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", err => { clearTimeout(timer); reject(err); });
    });
    const received = new Promise(resolve => client.once("test:private", resolve));
    live.io.to(`user:${user._id}`).emit("test:private", { ok: true });
    assert.deepEqual(await received, { ok: true });
    assert.equal(live.server.listeners("request").length, 1);
  } finally { client.disconnect(); await new Promise(resolve => live.io.close(resolve)); }
});
