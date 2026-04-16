import express from "express";
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


// ✅ RECEIVE MESSAGE
router.post("/", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg) {
      const phone = msg.from;
      const text = msg.text?.body || "";

      // ✅ save message with status
      await Message.create({
        phone,
        message: text,
        direction: "incoming",
        status: "delivered"
      });

      // ✅ contact find or create
      let contact = await Contact.findOne({ phone });

      if (!contact) {
        contact = await Contact.create({
          phone,
          lastMessage: text,
          unread: 1
        });
      } else {
        contact.lastMessage = text;
        contact.unread += 1; // 🔴 unread increase
        await contact.save();
      }

      // ✅ realtime emit
      req.io?.to(phone).emit("new_message", {
        phone,
        message: text,
        direction: "incoming"
      });

      // ✅ update contact list realtime
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
