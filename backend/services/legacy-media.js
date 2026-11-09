import fs from "node:fs/promises";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import Message from "../models/Message.js";
import { uploadMedia } from "./whatsapp.js";

// Manual, opt-in migration only. Never called by server startup or a request.
// The caller supplies a private DB connection with autoIndex/autoCreate off.
export async function migrateLegacyMedia({ directory, apply = false, upload = uploadMedia }) {
  const dir = await fs.realpath(path.resolve(directory));
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const counts = { found: 0, missing: 0, skipped: 0, uploaded: 0, failed: 0 };
  const cursor = Message.find({ media: true, mediaId: { $exists: false }, createdAt: { $gt: cutoff } }).lean().cursor();
  try {
    for await (const message of cursor) {
      const filePath = await fs.realpath(path.join(dir, path.basename(message.message || ""))).catch(() => null);
      if (!filePath) { counts.missing++; continue; }
      // Do not follow an old uploads symlink into another private directory.
      if (!filePath.startsWith(`${dir}${path.sep}`)) { counts.skipped++; continue; }
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) { counts.missing++; continue; }
      if (stat.size > 16 * 1024 * 1024) { counts.skipped++; continue; }
      const detected = await fileTypeFromFile(filePath).catch(() => null);
      let mime = detected?.mime;
      if (!detected && message.mimeType === "text/plain") {
        const bytes = await fs.readFile(filePath);
        if (!bytes.includes(0)) mime = "text/plain";
      }
      const image = ["image/jpeg", "image/png"].includes(mime);
      const audio = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/ogg"].includes(mime);
      const document = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime);
      const video = ["video/mp4", "video/3gpp"].includes(mime);
      const sticker = mime === "image/webp" && stat.size <= 100 * 1024;
      if (!image && !audio && !document && !video && !sticker || image && stat.size > 5 * 1024 * 1024) { counts.skipped++; continue; }
      counts.found++;
      if (!apply) continue;
      let filename = path.basename(filePath).replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "attachment";
      if (!path.extname(filename)) filename += `.${detected?.ext || "txt"}`;
      try {
        const id = await upload(filePath, mime, filename);
        const type = image ? "image" : audio ? "audio" : video ? "video" : sticker ? "sticker" : "document";
        // Preserve createdAt/TTL and don't overwrite a mediaId added meanwhile.
        const result = await Message.updateOne({ _id: message._id, mediaId: { $exists: false } }, { $set: { mediaId: id, type, mimeType: mime, filename, mediaExpiresAt: new Date(Date.now() + 30 * 86400000) } });
        if (result.modifiedCount) counts.uploaded++; else counts.skipped++;
      } catch { counts.failed++; }
    }
  } finally { await cursor.close(); }
  return counts;
}
