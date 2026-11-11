import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: mongoose.Schema.Types.ObjectId, templateName: String, language: String,
  mediaId: String, type: String, mimeType: String, filename: String, bytes: Number,
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("TemplateUpload", schema);
