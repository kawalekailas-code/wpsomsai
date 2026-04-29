import mongoose from "mongoose";

const schema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: String,
  message: { type: String, required: true },
  dueAt: { type: Date, required: true },
  done: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("Reminder", schema);
