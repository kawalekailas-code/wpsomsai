import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import InboundEvent from "../models/InboundEvent.js";
import TemplateJob from "../models/TemplateJob.js";
import TemplateRecipient from "../models/TemplateRecipient.js";
import { storageStatus } from "./safety.js";
import { sampleRuntime } from "./system-runtime.js";

let cached, until = 0, loading;
export function resetUsageCache() { cached = undefined; until = 0; loading = undefined; }
const groupStates = Model => Model.aggregate([{ $group: { _id: "$state", count: { $sum: 1 } } }]).option({ maxTimeMS: 2000, timeoutMS: 2500 });
const stateMap = rows => Object.fromEntries(rows.map(r => [r._id, r.count]));

// At most two diagnostic reads at once: do not occupy the whole 10-connection
// application pool. Each count/aggregate is time-bounded and globally cached.
async function runReads(tasks) {
  const entries = Object.entries(tasks), results = {}, errors = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, entries.length) }, async () => {
    while (next < entries.length) {
      const [key, task] = entries[next++];
      try {
        if (mongoose.connection.readyState !== 1) throw new Error("Diagnostics skipped while disconnected");
        results[key] = await task();
      }
      catch { results[key] = null; errors.push(key); }
    }
  }));
  return { results, errors };
}
export async function databaseUsage() {
  if (mongoose.connection.readyState !== 1) return { ...(cached || {}), connected: false, stale: Boolean(cached), available: Boolean(cached?.available), warning: "Database disconnected. Any previous snapshot is stale; no diagnostics were queued while disconnected." };
  if (cached && Date.now() < until) return { ...cached, connected: true };
  if (loading) return loading;
  loading = (async () => {
    const time = new Date(), from = new Date(time.getTime() - 86400000), start = performance.now();
    const { results: r, errors } = await runReads({
      storage: () => storageStatus(),
      messageEstimate: () => Message.estimatedDocumentCount({ maxTimeMS: 2000, timeoutMS: 2500 }),
      contactEstimate: () => Contact.estimatedDocumentCount({ maxTimeMS: 2000, timeoutMS: 2500 }),
      savedContacts: () => Contact.countDocuments({ isSaved: { $ne: false } }).setOptions({ maxTimeMS: 2000, timeoutMS: 2500 }),
      activity: () => Message.aggregate([
        { $match: { $or: [{ direction: "incoming", receivedAt: { $gte: from, $lte: time } }, { direction: "incoming", receivedAt: null, createdAt: { $gte: from, $lte: time } }, { direction: "outgoing", createdAt: { $gte: from, $lte: time } }] } },
        { $group: { _id: { direction: "$direction", status: "$status", type: "$type" }, count: { $sum: 1 } } }
      ]).option({ maxTimeMS: 2500, timeoutMS: 2500 }),
      inbox: () => InboundEvent.aggregate([{ $group: { _id: "$state", count: { $sum: 1 }, unreviewed: { $sum: { $cond: [{ $and: [{ $eq: ["$state", "attention"] }, { $eq: [{ $ifNull: ["$acknowledgedAt", null] }, null] }] }, 1, 0] } } } }]).option({ maxTimeMS: 2000, timeoutMS: 2500 }),
      recipients: () => TemplateRecipient.aggregate([{ $match: { state: { $in: ["pending", "leased", "sending", "uncertain"] } } }, { $group: { _id: "$state", count: { $sum: 1 } } }]).option({ maxTimeMS: 2000, timeoutMS: 2500 }),
      jobs: () => groupStates(TemplateJob)
    });
    const activity = r.activity ? { from: from.toISOString(), through: time.toISOString(), incoming: 0, outgoing: 0, templateOutgoing: 0, outgoingStates: {} } : null;
    for (const row of r.activity || []) {
      if (row._id.direction === "incoming") activity.incoming += row.count;
      else {
        activity.outgoing += row.count;
        activity.outgoingStates[row._id.status] = (activity.outgoingStates[row._id.status] || 0) + row.count;
        if (row._id.type === "template") activity.templateOutgoing += row.count;
      }
    }
    if (!r.storage?.available) errors.push("storage");
    cached = {
      available: Object.entries(r).some(([key, value]) => value != null && (key !== "storage" || value.available)), connected: mongoose.connection.readyState === 1, stale: false, observedAt: time.toISOString(), cacheSeconds: 60, partial: errors.length > 0, unavailableMetrics: [...new Set(errors)],
      storage: r.storage || { available: false }, retainedMessageEstimate: r.messageEstimate, contactRecordsEstimate: r.contactEstimate, savedContacts: r.savedContacts, activity,
      inbox: r.inbox ? { states: stateMap(r.inbox), unreviewed: r.inbox.reduce((sum, row) => sum + row.unreviewed, 0) } : null,
      queue: { recipientStates: r.recipients ? stateMap(r.recipients) : null, jobStates: r.jobs ? stateMap(r.jobs) : null },
      diagnosticReadMs: Math.round((performance.now() - start) * 10) / 10,
      scope: "This database/app only. Activity counts retained message rows, not provider bills or all sends by external tools. Incoming uses receivedAt, with creation-time fallback for older records. Outgoing states are current record statuses, not a count of deliveries occurring in this time window. Retention/TTL can affect counts; estimates are labeled. Reads are not a transaction and active counts can change during measurement. No new metrics collection, writes or indexes."
    };
    until = Date.now() + (errors.length ? 15000 : 60000);
    return cached;
  })().finally(() => { loading = undefined; });
  return loading;
}
export async function systemUsage({ traffic, io }) {
  const [runtime, database] = await Promise.all([sampleRuntime(), databaseUsage()]);
  return {
    version: "2.3.0", generatedAt: new Date().toISOString(), runtime, database,
    http: traffic.snapshot(), connectedSockets: typeof io?.engine?.clientsCount === "number" ? io.engine.clientsCount : null,
    senderEnabled: process.env.SENDER_ENABLED === "true",
    unavailableProviderMetrics: ["Monthly hosting hours/bandwidth/billing", "Atlas cluster-wide quota/billing and other databases", "Meta account-wide messaging limits/charges and external-tool history"],
    note: "Live observations, not an uptime, capacity or zero-loss guarantee. Provider consoles remain authoritative. No paid monitoring, keepalive, test send or production data mutation is performed by this dashboard."
  };
}
