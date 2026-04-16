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

    // 🔥 realtime update
    req.io?.to(phone).emit("new_message", {
      phone,
      message,
      direction: "outgoing",
      status: "sent"
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err.response?.data || err);
    res.status(500).send("Send failed");
  }
});


// 📎 UPLOAD MEDIA
const uploadToWhatsApp = async (filePath) => {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
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
    const mimeType = file.mimetype;

    // ✅ upload to WhatsApp
    const mediaId = await uploadToWhatsApp(file.path);

    // detect type
    let type = "document";
    if (mimeType.startsWith("image")) type = "image";
    if (mimeType.startsWith("video")) type = "video";

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

    // 🔥 IMPORTANT FIX
    // 👉 frontend ला local file लागतो preview साठी
    const fileName = file.filename;

    await Message.create({
      phone,
      message: fileName,
      direction: "outgoing",
      status: "sent",
      media: true,
      mimeType
    });

    // 🔥 realtime emit
    req.io?.to(phone).emit("new_message", {
      phone,
      message: fileName,
      direction: "outgoing",
      media: true,
      mimeType,
      status: "sent"
    });

    // 🧹 cleanup temp file
    fs.unlinkSync(file.path);

    res.json({ success: true });

  } catch (err) {
    console.log(err.response?.data || err);
    res.status(500).send("Media send failed");
  }
});

export default router;
