import mongoose from "mongoose";
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  kind: { type: String, enum: ["message", "status", "unknown"], required: true },
  payload: mongoose.Schema.Types.Mixed,
  state: { type: String, enum: ["pending", "processing", "processed", "failed", "attention"], default: "pending" },
  summary: { type: String, maxlength: 300 },
  attempts: { type: Number, default: 0 },
  reason: { type: String, maxlength: 600 },
  nextAttemptAt: Date, leaseUntil: Date, processedAt: Date,
  acknowledgedAt: Date, acknowledgedBy: mongoose.Schema.Types.ObjectId,
  expiresAt: Date
}, { timestamps: true });
schema.index({ state: 1, nextAttemptAt: 1, createdAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("InboundEvent", schema);
