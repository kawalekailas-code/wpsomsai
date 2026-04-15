import mongoose from "mongoose";

export default mongoose.model("Message", {
  phone: String,
  message: String,
  direction: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30
  }
});