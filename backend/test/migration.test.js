import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Message from "../models/Message.js";
import { migrateLegacyMedia } from "../services/legacy-media.js";

process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = "true";
process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server/", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=", "base64");
let mongo, directory;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false, autoCreate: false, maxPoolSize: 2 });
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "omsai-legacy-test-"));
  await fs.writeFile(path.join(directory, "old-photo"), png);
  await fs.writeFile(path.join(directory, "old-text"), "A retained plain-text attachment");
  const large = await fs.open(path.join(directory, "too-large"), "w"); await large.truncate(17 * 1024 * 1024); await large.close();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); if (directory) await fs.rm(directory, { recursive: true, force: true }); });
beforeEach(async () => { await Message.deleteMany(); });
const message = extra => Message.create({ phone: "919876543210", message: "old-photo", direction: "outgoing", media: true, mimeType: "image/png", ...extra });

test("legacy-media dry run never writes IDs, alters TTL, creates indexes or calls Meta", async () => {
  const original = await message({ createdAt: new Date(Date.now() - 2 * 86400000) });
  await message({ message: "old-text", mimeType: "text/plain" });
  await message({ message: "missing-file" });
  await message({ message: "too-large" });
  await message({ message: "old-photo", createdAt: new Date(Date.now() - 31 * 86400000) });
  await message({ message: "old-photo", mediaId: "already-migrated" });
  const before = await Message.findById(original._id).lean();
  const counts = await migrateLegacyMedia({ directory, upload: () => { throw new Error("Dry run must not upload"); } });
  assert.deepEqual(counts, { found: 2, missing: 1, skipped: 1, uploaded: 0, failed: 0 });
  assert.deepEqual(await Message.findById(original._id).lean(), before);
  assert.equal(await Message.countDocuments({ mediaId: { $exists: true } }), 1);
  assert.deepEqual((await Message.collection.indexes()).map(i => i.name), ["_id_"]);
});

test("legacy-media apply adds retrievable metadata, preserves originals and is repeat-safe", async () => {
  const original = await message({ createdAt: new Date(Date.now() - 2 * 86400000) });
  let calls = 0;
  const upload = async (filePath, mime, filename) => {
    calls++; assert.deepEqual(await fs.readFile(filePath), png);
    assert.equal(mime, "image/png"); assert.equal(filename, "old-photo.png"); return "migrated-photo-id";
  };
  assert.equal((await migrateLegacyMedia({ directory, apply: true, upload })).uploaded, 1);
  const actual = await Message.findById(original._id).lean();
  assert.equal(actual.mediaId, "migrated-photo-id"); assert.equal(actual.type, "image");
  assert.equal(actual.createdAt.getTime(), original.createdAt.getTime());
  assert.ok(actual.mediaExpiresAt > new Date(Date.now() + 29 * 86400000));
  assert.deepEqual(await fs.readFile(path.join(directory, "old-photo")), png);
  assert.equal((await migrateLegacyMedia({ directory, apply: true, upload })).uploaded, 0); assert.equal(calls, 1);
});

test("legacy-media failed uploads never mark a message migrated or remove original files", async () => {
  const original = await message();
  const counts = await migrateLegacyMedia({ directory, apply: true, upload: async () => { throw new Error("mock Meta failure"); } });
  assert.equal(counts.failed, 1); assert.equal(counts.uploaded, 0);
  assert.equal((await Message.findById(original._id)).mediaId, undefined);
  assert.deepEqual(await fs.readFile(path.join(directory, "old-photo")), png);
});
