import mongoose from "mongoose";

const recipientSchema = new mongoose.Schema({
  phone: String,
  name: String,
  status: { 
    type: String, 
    enum: ["pending", "sent", "failed"],
    default: "pending"
  },
  error: { type: String, default: "" },
  sentAt: Date
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },
  templateName: String,
  message: { type: String, required: true },     // Final message (variables replaced preview)
  useWaTemplate: { type: Boolean, default: false }, // WhatsApp approved template use करायचा का
  waTemplateName: { type: String, default: "" },
  
  recipients: [recipientSchema],
  
  totalCount: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  
  status: {
    type: String,
    enum: ["draft", "running", "completed", "failed"],
    default: "draft"
  },
  
  scheduledAt: Date,       // null = immediate
  startedAt: Date,
  completedAt: Date,
  
  labelFilter: { type: String, default: "" },   // कोणत्या label ला पाठवला
  createdBy: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.model("Campaign", schema);
