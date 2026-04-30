import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  lastMessage: String,

  unread: { type: Number, default: 0 },

  label: {
    type: String,
    enum: ["", "Hot Lead", "Cold Lead", "Customer", "VIP"],
    default: ""
  },

  notes: { type: String, default: "" },

  // 📌 Pinned contacts
  pinned: { type: Boolean, default: false }

}, { timestamps: true });

export default mongoose.model("Contact", schema);
