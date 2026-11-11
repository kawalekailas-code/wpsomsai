import mongoose from "mongoose";
import InboundEvent from "../models/InboundEvent.js";
let storageCache, storageUntil = 0, storageLoading;
export function resetStorageCache() { storageCache = undefined; storageUntil = 0; storageLoading = undefined; }
export async function storageStatus(force = false) {
  if (!force && storageCache && Date.now() < storageUntil) return storageCache;
  if (storageLoading) return storageLoading;
  storageLoading = (async () => {
    try {
      const stats = await mongoose.connection.db.stats({ scale: 1, maxTimeMS: 2000, timeoutMS: 2500 });
      const dataBytes = stats.dataSize, indexBytes = stats.indexSize;
      if (![dataBytes, indexBytes].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) throw new Error("Invalid storage counters");
      const bytes = dataBytes + indexBytes;
      const configuredMB = Number(process.env.STORAGE_LIMIT_MB);
      const limitMB = Math.max(16, Number.isFinite(configuredMB) && configuredMB > 0 ? configuredMB : 512);
      storageCache = { available: true, bytes, dataBytes, indexBytes, allocatedDataBytes: Number.isFinite(stats.storageSize) ? stats.storageSize : null, indexCount: Number.isFinite(stats.indexes) ? stats.indexes : null, limitBytes: limitMB * 1024 * 1024, percent: Math.round(bytes / (limitMB * 1024 * 1024) * 1000) / 10, measuredAt: new Date().toISOString(), scope: "This database: logical data plus indexes. Atlas cluster usage is authoritative; other databases are not included." };
    } catch { storageCache = { available: false, percent: null, measuredAt: new Date().toISOString(), scope: "Could not read database statistics. Check Atlas usage and database permissions." }; }
    storageUntil = Date.now() + 60000;
    return storageCache;
  })().finally(() => { storageLoading = undefined; });
  return storageLoading;
}
export async function sendingSafety() {
  if (mongoose.connection.readyState !== 1) return "Database disconnected. Outgoing queue paused.";
  const oldest = await InboundEvent.findOne({ state: { $in: ["pending", "processing", "failed"] } }).sort({ createdAt: 1 }).select("createdAt state").lean();
  if (oldest && (oldest.state === "failed" || Date.now() - oldest.createdAt.getTime() > 30000)) return "Incoming webhook backlog/error requires attention. Outgoing queue paused.";
  if (await InboundEvent.exists({ state: "attention", acknowledgedAt: { $exists: false } })) return "Review the captured incoming event in Incoming Safety before sending.";
  const storage = await storageStatus();
  if (!storage.available) return "Database storage measurement unavailable. Check permissions/Atlas before resuming.";
  if (storage.percent >= 90) return "Database usage is at least 90% of the configured budget. Outgoing queue paused; incoming is not deliberately blocked.";
  return "";
}
