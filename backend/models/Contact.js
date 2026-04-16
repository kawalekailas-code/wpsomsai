import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  lastMessage: String,

  // 🔴 unread count (WhatsApp style)
  unread: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true // ✅ important for sorting
});

export default mongoose.model("Contact", schema);
