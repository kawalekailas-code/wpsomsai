import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();

router.get("/", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN)
    res.send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

router.post("/", async (req, res) => {
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (msg) {
    const phone = msg.from;
    const text = msg.text?.body || "";

    await Message.create({ phone, message: text, direction: "incoming" });

    let contact = await Contact.findOne({ phone });
    if (!contact) contact = await Contact.create({ phone });

    contact.lastMessage = text;
    await contact.save();

    req.io.to(phone).emit("new_message", {
      phone,
      message: text,
      direction: "incoming"
    });
  }

  res.sendStatus(200);
});

export default router;