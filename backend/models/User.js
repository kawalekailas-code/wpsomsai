import mongoose from "mongoose";

const preferences = new mongoose.Schema({
  theme: { type: String, enum: ["light", "dark", "system"], default: "light" },
  wallpaper: { type: String, enum: ["doodle", "sage", "sand", "plain"], default: "doodle" },
  fontSize: { type: String, enum: ["small", "medium", "large"], default: "medium" },
  sound: { type: Boolean, default: true },
  desktopNotifications: { type: Boolean, default: false },
  enterToSend: { type: Boolean, default: true },
  quickReplies: { type: [String], default: ["Namaskar! 👋", "I'll get back to you shortly.", "Thank you! 🙏"] }
}, { _id: false });

const schema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, maxlength: 20 },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "agent"], default: "agent" },
  displayName: { type: String, default: "", maxlength: 80 },
  avatar: { type: String, default: "" },
  about: { type: String, default: "Available", maxlength: 140 },
  preferences: { type: preferences, default: () => ({}) },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model("User", schema);
