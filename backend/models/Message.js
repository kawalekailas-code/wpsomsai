import mongoose from "mongoose";

const schema = new mongoose.Schema({
  phone: String,

  // text OR file name
  message: String,

  // incoming / outgoing
  direction: String,

  // ✔ message status system
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent"
  },

  // 📎 media support
  media: {
    type: Boolean,
    default: false
  },

  // image / pdf / video
  mimeType: String

}, {
  timestamps: true // ✅ auto createdAt + updatedAt
});

// ⏳ auto delete after 30 days
schema.index({ createdAt: 1 }, {
  expireAfterSeconds: 60 * 60 * 24 * 30
});

export default mongoose.model("Message", schema);
