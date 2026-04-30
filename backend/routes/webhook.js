import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";

import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();


// ✅ VERIFY
router.get("/", (req, res) => {
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (token === process.env.VERIFY_TOKEN) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});


// 📎 DOWNLOAD MEDIA
const downloadMedia = async (mediaId) => {
  try {
    const urlRes = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${process.env.TOKEN}` }
      }
    );

    const mediaUrl = urlRes.data.url;

    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${process.env.TOKEN}` },
      responseType: "arraybuffer"
    });

    const fileName = `${Date.now()}.bin`;
    const filePath = path.join("uploads", fileName);

    fs.writeFileSync(filePath, mediaRes.data);

    return fileName;

  } catch (err) {
    console.log("Media download error:", err.response?.data || err);
    return null;
  }
};


// ✅ RECEIVE MESSAGE
router.post("/", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg) {
      const phone = msg.from;

      let text = "";
      let media = false;
      let fileName = null;
      let mimeType = "";

      // 🟢 TEXT
      if (msg.text) {
        text = msg.text.body;
      }

      // 🟢 MEDIA
      if (msg.image || msg.document || msg.video) {
        media = true;

        const mediaObj = msg.image || msg.document || msg.video;
        const mediaId = mediaObj.id;

        mimeType = mediaObj.mime_type;

        fileName = await downloadMedia(mediaId);

        text = fileName || "media";
      }

      // ✅ SAVE MESSAGE
      await Message.create({
        phone,
        message: text,
        direction: "incoming",
        status: "delivered",
        media,
        mimeType
      });

      // ✅ CONTACT UPDATE
      let contact = await Contact.findOne({ phone });

      if (!contact) {
        contact = await Contact.create({
          phone,
          lastMessage: text,
          unread: 1
        });
      } else {
        contact.lastMessage = text;
        contact.unread += 1;
        await contact.save();
      }

      // 🔥 REALTIME MESSAGE
      req.io?.to(phone).emit("new_message", {
        phone,
        message: text,
        direction: "incoming",
        media,
        mimeType
      });

      // 🔥 DELIVERED STATUS (✔✔)
      req.io?.to(phone).emit("message_status", {
        phone,
        status: "delivered"
      });

      // 🔥 CONTACT UPDATE
      req.io?.emit("contact_update", {
        phone,
        lastMessage: text
      });
    }

    res.sendStatus(200);

  } catch (err) {
    console.log("Webhook error:", err);
    res.sendStatus(200);
  }
});

export default router;
