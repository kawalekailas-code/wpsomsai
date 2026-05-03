import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();

// 🔒 Webhook Signature Verify — fake requests block करा
const verifyWebhookSignature = (req, res, next) => {
  const appSecret = process.env.APP_SECRET;

  // APP_SECRET नसेल तर skip (development mode)
  if (!appSecret) {
    console.warn("⚠️  APP_SECRET not set — webhook signature not verified!");
    return next();
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    console.warn("⚠️  Webhook request without signature rejected");
    return res.sendStatus(403);
  }

  const rawBody = JSON.stringify(req.body);
  const expectedSig = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    console.warn("⚠️  Webhook signature mismatch — request rejected");
    return res.sendStatus(403);
  }

  next();
};

// ✅ VERIFY (GET) — Meta webhook verification
router.get("/", (req, res) => {
  const token     = req.query["hub.verify_token"];
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
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );
    const mediaUrl = urlRes.data.url;
    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${process.env.TOKEN}` },
      responseType: "arraybuffer",
      maxContentLength: 20 * 1024 * 1024 // 20MB max incoming media
    });
    const fileName = `${Date.now()}.bin`;
    const filePath = path.join("uploads", fileName);
    fs.writeFileSync(filePath, mediaRes.data);
    return fileName;
  } catch (err) {
    console.log("Media download error:", err.message);
    return null;
  }
};

// ✅ RECEIVE MESSAGE (POST) — signature verify middleware लावला
router.post("/", verifyWebhookSignature, async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Status updates (delivered, read) — ignore करा
    if (value?.statuses) {
      return res.sendStatus(200);
    }

    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const phone = msg.from;
    let text = "";
    let media = false;
    let fileName = null;
    let mimeType = "";

    if (msg.text) {
      text = msg.text.body?.substring(0, 4096) || ""; // max length
    }

    if (msg.image || msg.document || msg.video || msg.audio) {
      media = true;
      const mediaObj = msg.image || msg.document || msg.video || msg.audio;
      mimeType = mediaObj.mime_type || "";
      fileName = await downloadMedia(mediaObj.id);
      text = fileName || "media";
    }

    // Message save
    await Message.create({ phone, message: text, direction: "incoming", status: "delivered", media, mimeType });

    // Contact update
    let contact = await Contact.findOne({ phone });
    if (!contact) {
      contact = await Contact.create({ phone, lastMessage: text.substring(0, 200), unread: 1 });
    } else {
      contact.lastMessage = text.substring(0, 200);
      contact.unread = (contact.unread || 0) + 1;
      await contact.save();
    }

    // Real-time emit
    req.io?.to(phone).emit("new_message", { phone, message: text, direction: "incoming", media, mimeType });
    req.io?.to(phone).emit("message_status", { phone, status: "delivered" });
    req.io?.emit("contact_update", { phone, lastMessage: text.substring(0, 200) });

    res.sendStatus(200);
  } catch (err) {
    console.log("Webhook error:", err.message);
    res.sendStatus(200); // Always 200 to Meta
  }
});

export default router;
