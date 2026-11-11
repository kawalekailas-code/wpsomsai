import mongoose from "mongoose";
const schema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  tokenVersion: { type: Number, default: 0 },
  state: { type: String, enum: ["preparing", "queued", "running", "paused", "completed", "cancelled", "attention"], default: "preparing" },
  templateName: String, language: String,
  template: mongoose.Schema.Types.Mixed,
  templateSignature: String,
  text: String,
  media: mongoose.Schema.Types.Mixed,
  recipientCount: Number,
  source: String,
  consentConfirmedAt: Date,
  pauseReason: String,
  nextSendAt: Date, startedAt: Date, completedAt: Date, expiresAt: Date
}, { timestamps: true });
schema.index({ state: 1, createdAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("TemplateJob", schema);
