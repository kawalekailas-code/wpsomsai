import mongoose from "mongoose";
const schema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "TemplateJob" },
  phone: { type: String, required: true }, name: String,
  clientId: { type: String, required: true, unique: true },
  state: { type: String, enum: ["pending", "leased", "sending", "accepted", "delivered", "seen", "played", "failed", "uncertain", "cancelled", "reviewed"], default: "pending" },
  attempts: { type: Number, default: 0 },
  messageId: mongoose.Schema.Types.ObjectId,
  waMessageId: String,
  error: String, errorCode: String,
  leaseUntil: Date, beganAt: Date, finishedAt: Date, expiresAt: Date
}, { timestamps: true });
schema.index({ jobId: 1, phone: 1 }, { unique: true });
schema.index({ jobId: 1, state: 1, _id: 1 });
schema.index({ waMessageId: 1 }, { unique: true, partialFilterExpression: { waMessageId: { $type: "string" } } });
schema.index({ state: 1, phone: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("TemplateRecipient", schema);
