import express from "express";
import axios from "axios";
import Message from "../models/Message.js";
import FormData from "form-data";
import fs from "fs";
import multer from "multer";

const router = express.Router();

// 🔒 File upload — size + type limits
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB — WhatsApp limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/3gpp",
      "audio/mpeg", "audio/ogg", "audio/wav", "audio/aac",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
});

// ✅ SEND TEXT
router.post("/", async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: "Phone and message required" });
    if (message.length > 4096) return res.status(400).json({ error: "Message too long" });

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
      { messaging_product: "whatsapp", to: phone, type: "text", text: { body: message } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );

    await Message.create({ phone, message, direction: "outgoing", status: "sent" });
    req.io?.to(phone).emit("new_message", { phone, message, direction: "outgoing", status: "sent" });
    res.json({ success: true });
  } catch (err) {
    console.log("Send error:", err.response?.data || err.message);
    res.status(500).json({ error: "Send failed" });
  }
});

// 📎 SEND MEDIA
router.post("/media", upload.single("file"), async (req, res) => {
  try {
    const { phone } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!phone) return res.status(400).json({ error: "Phone required" });

    const mimeType = file.mimetype;

    // WhatsApp ला upload करा
    const form = new FormData();
    let ext = "bin";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
    else if (mimeType.includes("png")) ext = "png";
    else if (mimeType.includes("gif")) ext = "gif";
    else if (mimeType.includes("webp")) ext = "webp";
    else if (mimeType.includes("pdf")) ext = "pdf";
    else if (mimeType.includes("mp4")) ext = "mp4";
    else if (mimeType.includes("mpeg")) ext = "mp3";

    form.append("file", fs.createReadStream(file.path), { filename: `file.${ext}` });
    form.append("messaging_product", "whatsapp");

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/media`,
      form,
      { headers: { Authorization: `Bearer ${process.env.TOKEN}`, ...form.getHeaders() } }
    );

    const mediaId = uploadRes.data.id;

    let type = "document";
    if (mimeType.startsWith("image")) type = "image";
    else if (mimeType.startsWith("video")) type = "video";
    else if (mimeType.startsWith("audio")) type = "audio";

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
      { messaging_product: "whatsapp", to: phone, type, [type]: { id: mediaId } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );

    const fileName = file.filename;
    await Message.create({ phone, message: fileName, direction: "outgoing", status: "sent", media: true, mimeType });
    req.io?.to(phone).emit("new_message", { phone, message: fileName, direction: "outgoing", media: true, mimeType, status: "sent" });

    res.json({ success: true });
  } catch (err) {
    console.log("Media send error:", err.response?.data || err.message);
    res.status(500).json({ error: "Media send failed" });
  }
});

// 🔒 Multer error handler
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large (max 16MB)" });
  if (err.message?.includes("not allowed")) return res.status(400).json({ error: err.message });
  next(err);
});

export default router;
