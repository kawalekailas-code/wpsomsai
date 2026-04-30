import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { 
    type: String, 
    enum: ["MARKETING", "UTILITY", "AUTHENTICATION"],
    default: "MARKETING"
  },
  language: { type: String, default: "en" },
  body: { type: String, required: true },       // Message body with {{1}} {{2}} placeholders
  header: { type: String, default: "" },         // Optional header text
  footer: { type: String, default: "" },         // Optional footer text
  variables: [{ type: String }],                 // Variable names e.g. ["name", "amount"]
  waTemplateName: { type: String, default: "" }, // WhatsApp approved template name
  status: { 
    type: String, 
    enum: ["draft", "pending", "approved", "rejected"],
    default: "draft"
  },
  createdBy: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("Template", schema);
