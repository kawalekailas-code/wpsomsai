import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  lastMessage: String,

  // 🔴 unread count (WhatsApp style)
  unread: {
    type: Number,
    default: 0
  },

  // 🏷️ Label
  label: {
    type: String,
    enum: ["", "Hot Lead", "Cold Lead", "Customer", "VIP"],
    default: ""
  },

  // 📝 Notes
  notes: {
    type: String,
    default: ""
  }

}, {
  timestamps: true
});

export default mongoose.model("Contact", schema);
