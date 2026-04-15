import mongoose from "mongoose";

export default mongoose.model("Contact", {
  name: String,
  phone: { type: String, unique: true },
  lastMessage: String
});