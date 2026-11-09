import mongoose from "mongoose";

const contextSchema = new mongoose.Schema({
  messageId: mongoose.Schema.Types.ObjectId,
  waMessageId: String,
  message: String,
  direction: String,
  type: String,
  name: String
}, { _id: false });

const schema = new mongoose.Schema({
  phone: { type: String, required: true },
  message: { type: String, default: "" },
  direction: { type: String, enum: ["incoming", "outgoing"], required: true },
  type: { type: String, enum: ["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "template", "unsupported"], default: "text" },
  status: { type: String, enum: ["pending", "sent", "delivered", "seen", "played", "failed"], default: "sent" },
  waMessageId: String,
  clientId: String,
  senderId: mongoose.Schema.Types.ObjectId,
  media: { type: Boolean, default: false },
  mediaId: String,
  mimeType: String,
  filename: String,
  caption: String,
  voice: { type: Boolean, default: false },
  mediaExpiresAt: Date,
  context: contextSchema,
  forwarded: { type: Boolean, default: false },
  reactions: { self: { type: String, default: "" }, contact: { type: String, default: "" } },
  location: { latitude: Number, longitude: Number, name: String, address: String },
  contacts: [{ _id: false, name: String, phone: String }],
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deliveredAt: Date,
  readAt: Date,
  playedAt: Date,
  error: String
}, { timestamps: true });

// Keep the original 30-day retention policy. Starred messages expire too.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
schema.index({ phone: 1, createdAt: -1, _id: -1 });
schema.index({ waMessageId: 1 }, { unique: true, partialFilterExpression: { waMessageId: { $type: "string" } } });
schema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });
schema.index({ starredBy: 1, createdAt: -1 });

export default mongoose.model("Message", schema);
