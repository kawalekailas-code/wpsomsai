import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  phone: { type: String, required: true },
  pinned: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  mutedUntil: Date,
  manualUnread: { type: Boolean, default: false },
  lastReadAt: Date,
  clearedAt: Date,
  hiddenAt: Date
}, { timestamps: true });
schema.index({ userId: 1, phone: 1 }, { unique: true });

export default mongoose.model("ChatState", schema);
