import "dotenv/config";
import mongoose from "mongoose";
import { migrateLegacyMedia } from "../services/legacy-media.js";

if (process.argv.includes("--help")) {
  console.log("Usage: npm run migrate:media [-- --apply]\nDefault: inspect only. Requires private MONGO_URI; apply also requires TOKEN and PHONE_ID. Originals are never deleted.");
  process.exit(0);
}
if (process.argv.slice(2).some(arg => arg !== "--apply")) {
  console.error("Unknown option. Use --help, or --apply after backup.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
if (!process.env.MONGO_URI || apply && (!process.env.TOKEN || !process.env.PHONE_ID)) {
  console.error("Set MONGO_URI privately. Apply mode also needs TOKEN and PHONE_ID. See .env.example.");
  process.exit(1);
}
console.log(`${apply ? "APPLY" : "DRY RUN"}: inspecting retained legacy media. Originals will not be deleted.`);
try {
  await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 3, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const counts = await migrateLegacyMedia({ directory: process.env.LEGACY_UPLOAD_DIR || "uploads", apply });
  console.log(counts);
  if (counts.failed) { console.error("Some uploads failed. Original files remain untouched; review your Meta configuration before retrying."); process.exitCode = 1; }
  if (!apply) console.log("No writes performed. Review counts and back up first; use --apply only when ready.");
} catch {
  console.error("Migration stopped. Check your private database configuration and restored uploads directory. No originals were deleted. Credentials and file contents are not logged.");
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
