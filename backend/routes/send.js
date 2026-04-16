import express from "express";
import axios from "axios";
import Message from "../models/Message.js";
import FormData from "form-data";
import fs from "fs";
import multer from "multer";

const router = express.Router();

const upload = multer({ dest: "uploads/" });


// ✅ SEND TEXT
router.post("/", async (req, res) => {
  const { phone, message } = req.body;

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`
        }
      }
    );

    await Message.create({
      phone,
      message,
      direction: "outgoing",
      status: "sent"
    });

    req.io?.to(phone).emit("new_message", {
      phone,
      message,
      direction: "outgoing",
      status: "sent"
    });

    res.json({ success: true });

  } catch (err) {
    console.log("TEXT ERROR:", err.response?.data || err);
    res.status(500).send("Send failed");
  }
});


// 📎 UPLOAD MEDIA (FIXED)
const uploadToWhatsApp = async (filePath, mimeType) => {
  const form = new FormData();

  // 🔥 EXTENSION FIX
  let ext = "bin";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
  else if (mimeType.includes("png")) ext = "png";
  else if (mimeType.includes("pdf")) ext = "pdf";
  else if (mimeType.includes("mp4")) ext = "mp4";

  form.append("file", fs.createReadStream(filePath), {
    filename: `file.${ext}` // 🔥 MUST
  });

  form.append("messaging_product", "whatsapp");

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
          ...form.getHeaders()
        }
      }
    );

    return res.data.id;

  } catch (err) {
    console.log("UPLOAD ERROR:", err.response?.data || err);
    throw err;
  }
};


// 📎 SEND MEDIA
router.post("/media", upload.single("file"), async (req, res) => {
  const { phone } = req.body;
  const file = req.file;

  try {
    if (!file) {
      return res.status(400).send("No file uploaded");
    }

    const mimeType = file.mimetype;

    console.log("FILE:", file);

    // ✅ upload media
    const mediaId = await uploadToWhatsApp(file.path, mimeType);

    console.log("MEDIA ID:", mediaId);

    // 🔥 detect type
    let type = "document";
    if (mimeType.startsWith("image")) type = "image";
    else if (mimeType.startsWith("video")) type = "video";
    else if (mimeType.startsWith("audio")) type = "audio";

    // ✅ send message
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type,
        [type]: { id: mediaId }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`
        }
      }
    );

    // ✅ save for UI preview
    const fileName = file.filename;

    await Message.create({
      phone,
      message: fileName,
      direction: "outgoing",
      status: "sent",
      media: true,
      mimeType
    });

    // 🔥 realtime update
    req.io?.to(phone).emit("new_message", {
      phone,
      message: fileName,
      direction: "outgoing",
      media: true,
      mimeType,
      status: "sent"
    });

    // ❌ delete करू नको (preview साठी लागतो)
    // fs.unlinkSync(file.path);

    res.json({ success: true });

  } catch (err) {
    console.log("MEDIA ERROR:", err.response?.data || err);
    res.status(500).send("Media send failed");
  }
});

export default router;
