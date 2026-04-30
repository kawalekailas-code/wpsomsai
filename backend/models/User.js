import mongoose from "mongoose";

const schema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "agent"], default: "agent" },
  displayName: { type: String, default: "" },
  avatar: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("User", schema);
