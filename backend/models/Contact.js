import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, default: "", maxlength: 100 },
  phone: { type: String, unique: true, required: true },
  isSaved: { type: Boolean, default: true },
  chatStarted: { type: Boolean, default: true },
  notes: { type: String, default: "", maxlength: 2000 },
  lastMessage: { type: String, default: "" },
  lastMessageAt: Date,
  lastInboundAt: Date,
  lastActivityAt: Date,
  // Legacy fields are read, not used for new CRM workflows.
  unread: { type: Number, default: 0 },
  pinned: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ lastActivityAt: -1 });

export default mongoose.model("Contact", schema);
