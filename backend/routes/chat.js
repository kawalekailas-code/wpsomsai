import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

const router = express.Router();


// ✅ GET CONTACTS (sorted by latest chat)
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching contacts");
  }
});


// ✅ GET MESSAGES (latest first)
router.get("/messages/:phone", async (req, res) => {
  try {
    const messages = await Message.find({ phone: req.params.phone })
      .sort({ createdAt: 1 }); // oldest → newest

    res.json(messages);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching messages");
  }
});


// ✅ MARK AS SEEN (IMPORTANT)
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;

    // reset unread count
    await Contact.updateOne({ phone }, { unread: 0 });

    // update message status
    await Message.updateMany(
      { phone, direction: "incoming" },
      { status: "seen" }
    );

    res.send("Seen updated");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error updating seen");
  }
});


// ✅ SEARCH CONTACTS
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
