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

    // 🔥 realtime
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


// 📎 UPLOAD MEDIA TO WHATSAPP (FIXED)
const uploadToWhatsApp = async (filePath) => {
  const form = new FormData();

  form.append("file", fs.createReadStream(filePath), {
    filename: "file" // 🔥 IMPORTANT FIX
  });

  form.append("messaging_product", "whatsapp");

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

    // ✅ upload
    const mediaId = await uploadToWhatsApp(file.path);

    console.log("MEDIA ID:", mediaId);

    // detect type
    let type = "document";
    if (mimeType.startsWith("image")) type = "image";
    if (mimeType.startsWith("video")) type = "video";

    // ✅ send to WhatsApp
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

    // ✅ SAVE LOCAL FILE NAME (for UI preview)
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

    // ❌ IMPORTANT: delete करू नको (preview साठी लागतो)
    // fs.unlinkSync(file.path);

    res.json({ success: true });

  } catch (err) {
    console.log("MEDIA ERROR:", err.response?.data || err);
    res.status(500).send("Media send failed");
  }
});

export default router;
