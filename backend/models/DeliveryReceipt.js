import mongoose from "mongoose";

// A receipt can arrive before the send response is persisted. Retain a small,
// TTL-bounded receipt record so that early webhooks do not lose delivery state.
const schema = new mongoose.Schema({
  waMessageId: { type: String, unique: true, required: true },
  status: { type: String, required: true },
  rank: { type: Number, default: 0 },
  deliveredAt: Date,
  readAt: Date,
  playedAt: Date,
  error: String,
  expiresAt: { type: Date, required: true }
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("DeliveryReceipt", schema);
