import express from "express";
import axios from "axios";
import Message from "../models/Message.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { phone, message } = req.body;

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

  await Message.create({ phone, message, direction: "outgoing" });

  res.json({ success: true });
});

export default router;