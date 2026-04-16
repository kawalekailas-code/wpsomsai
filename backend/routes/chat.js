import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();


// ✅ GET CONTACTS (latest first)
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching contacts");
  }
});


// ✅ GET MESSAGES (chat order)
router.get("/messages/:phone", async (req, res) => {
  try {
    const messages = await Message.find({ phone: req.params.phone })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching messages");
  }
});


// 🔥 MARK AS SEEN + REALTIME
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;

    // unread reset
    await Contact.updateOne({ phone }, { unread: 0 });

    // message status update
    await Message.updateMany(
      { phone, direction: "incoming" },
      { status: "seen" }
    );

    // 🔥 realtime seen event
    req.io?.to(phone).emit("message_status", {
      phone,
      status: "seen"
    });

    res.send("Seen updated");

  } catch (err) {
    console.log(err);
    res.status(500).send("Error updating seen");
  }
});


// 🔍 SEARCH CONTACTS
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";

    const contacts = await Contact.find({
      $or: [
        { phone: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { lastMessage: { $regex: q, $options: "i" } }
      ]
    }).sort({ updatedAt: -1 });

    res.json(contacts);

  } catch (err) {
    console.log(err);
    res.status(500).send("Search error");
  }
});

export default router;
