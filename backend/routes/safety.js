import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute, objectId, HttpError } from "../lib/utils.js";
import InboundEvent from "../models/InboundEvent.js";
import Message from "../models/Message.js";
import { storageStatus, sendingSafety } from "../services/safety.js";
const router = express.Router(); router.use(requireAdmin);
router.get("/health", asyncRoute(async (req, res) => {
  const [storage, counts, last, lastIncoming, outgoingPause] = await Promise.all([
    storageStatus(), InboundEvent.aggregate([{ $group: { _id: "$state", count: { $sum: 1 } } }]),
    InboundEvent.findOne().sort({ createdAt: -1 }).select("createdAt").lean(),
    Message.findOne({ direction: "incoming" }).sort({ receivedAt: -1, createdAt: -1 }).select("createdAt receivedAt").lean(), sendingSafety()
  ]);
  res.json({ version: "2.3.0", storage, counts: Object.fromEntries(counts.map(c => [c._id, c.count])), lastWebhookAt: last?.createdAt || null, lastIncomingAt: lastIncoming?.receivedAt || lastIncoming?.createdAt || null, outgoingPause, senderEnabled: process.env.SENDER_ENABLED === "true", note: "Last observed webhook is not proof that Meta subscriptions are healthy. No absolute zero-loss guarantee. Incoming/chat retention remains 30 days; captured unresolved events do not auto-expire." });
}));
router.get("/events", asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const states = req.query.state === "all" ? {} : { state: { $in: ["pending", "processing", "failed", "attention"] } };
  const [events, total] = await Promise.all([InboundEvent.find(states).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30).select("-payload -key").lean(), InboundEvent.countDocuments(states)]);
  res.json({ events, total, page, hasMore: page * 30 < total });
}));
router.get("/events/:id", asyncRoute(async (req, res) => {
  const event = await InboundEvent.findById(objectId(req.params.id)).select("-key").lean(); if (!event) throw new HttpError(404, "Event not found or processed-event retention ended.");
  res.json(event);
}));
router.post("/events/:id/retry", asyncRoute(async (req, res) => {
  const result = await InboundEvent.updateOne({ _id: objectId(req.params.id), state: { $in: ["failed", "attention", "pending"] } }, { $set: { state: "pending", nextAttemptAt: new Date(), reason: "Administrator requested safe reprocessing." }, $unset: { expiresAt: 1, acknowledgedAt: 1, acknowledgedBy: 1, leaseUntil: 1 } });
  if (!result.matchedCount) throw new HttpError(409, "Event is processing, already processed, or no longer available.");
  res.json({ success: true });
}));
router.post("/events/:id/acknowledge", asyncRoute(async (req, res) => {
  const result = await InboundEvent.updateOne({ _id: objectId(req.params.id), state: "attention" }, { $set: { acknowledgedAt: new Date(), acknowledgedBy: req.user._id } });
  if (!result.matchedCount) throw new HttpError(409, "Only captured attention events can be acknowledged. Pending/failed work must be recovered, not dismissed.");
  res.json({ success: true, note: "Payload retained. This does not convert a BSUID-only event into a phone chat or send any message." });
}));
export default router;
