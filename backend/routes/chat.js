import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import Reminder from "../models/Reminder.js";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import axios from "axios";

const router = express.Router();
const upload = multer({ dest: "uploads/" });


// ✅ GET CONTACTS (pinned first, then latest)
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ pinned: -1, updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).send("Error fetching contacts");
  }
});


// ✅ GET MESSAGES
router.get("/messages/:phone", async (req, res) => {
  try {
    const messages = await Message.find({ phone: req.params.phone }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).send("Error fetching messages");
  }
});


// ✅ MARK AS SEEN
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;
    await Contact.updateOne({ phone }, { unread: 0 });
    await Message.updateMany({ phone, direction: "incoming" }, { status: "seen" });
    req.io?.to(phone).emit("message_status", { phone, status: "seen" });
    res.send("Seen updated");
  } catch (err) {
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
    }).sort({ pinned: -1, updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).send("Search error");
  }
});


// ✅ ADD CONTACT
router.post("/add-contact", async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).send("Phone required");
    let p = phone.toString().trim();
    if (!p.startsWith("91")) p = "91" + p;
    const exists = await Contact.findOne({ phone: p });
    if (exists) return res.status(409).send("Contact already exists");
    const contact = await Contact.create({ name: name || "", phone: p, lastMessage: "", unread: 0 });
    res.json(contact);
  } catch (err) {
    res.status(500).send("Add contact error");
  }
});


// ✅ DELETE CONTACT
router.delete("/delete-contact/:phone", async (req, res) => {
  try {
    await Contact.deleteOne({ phone: req.params.phone });
    await Message.deleteMany({ phone: req.params.phone });
    res.send("Deleted");
  } catch (err) {
    res.status(500).send("Delete error");
  }
});


// 🏷️ UPDATE LABEL
router.post("/label/:phone", async (req, res) => {
  try {
    await Contact.updateOne({ phone: req.params.phone }, { label: req.body.label });
    res.send("Label updated");
  } catch (err) {
    res.status(500).send("Label update error");
  }
});


// 📝 UPDATE NOTES
router.post("/notes/:phone", async (req, res) => {
  try {
    await Contact.updateOne({ phone: req.params.phone }, { notes: req.body.notes });
    res.send("Notes updated");
  } catch (err) {
    res.status(500).send("Notes update error");
  }
});


// 📌 PIN / UNPIN CONTACT
router.post("/pin/:phone", async (req, res) => {
  try {
    const contact = await Contact.findOne({ phone: req.params.phone });
    if (!contact) return res.status(404).send("Not found");
    contact.pinned = !contact.pinned;
    await contact.save();
    res.json({ pinned: contact.pinned });
  } catch (err) {
    res.status(500).send("Pin error");
  }
});


// 🔍 SEARCH MESSAGES (chat mein text search)
router.get("/search-messages/:phone", async (req, res) => {
  try {
    const q = req.query.q || "";
    const messages = await Message.find({
      phone: req.params.phone,
      message: { $regex: q, $options: "i" }
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).send("Message search error");
  }
});


// 📥 EXPORT CSV
router.get("/export-csv", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });
    const header = "Name,Phone,Label,Notes,Last Message,Created At\n";
    const rows = contacts.map(c => {
      const clean = (s) => (s || "").replace(/,/g, " ").replace(/\n/g, " ");
      return `${clean(c.name)},${c.phone},${c.label || ""},${clean(c.notes)},${clean(c.lastMessage)},${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}`;
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
    res.send(header + rows.join("\n"));
  } catch (err) {
    res.status(500).send("Export error");
  }
});


// 📊 DASHBOARD STATS
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalContacts = await Contact.countDocuments();
    const totalUnread = await Contact.countDocuments({ unread: { $gt: 0 } });
    const hotLeads = await Contact.countDocuments({ label: "Hot Lead" });
    const customers = await Contact.countDocuments({ label: "Customer" });
    const vip = await Contact.countDocuments({ label: "VIP" });

    const msgToday = await Message.countDocuments({ createdAt: { $gte: today } });
    const sentToday = await Message.countDocuments({ createdAt: { $gte: today }, direction: "outgoing" });
    const receivedToday = await Message.countDocuments({ createdAt: { $gte: today }, direction: "incoming" });

    const totalSent = await Message.countDocuments({ direction: "outgoing" });
    const totalDelivered = await Message.countDocuments({ direction: "outgoing", status: "delivered" });
    const totalSeen = await Message.countDocuments({ direction: "outgoing", status: "seen" });

    // Last 7 days messages
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dEnd = new Date(d);
      dEnd.setHours(23, 59, 59, 999);
      const count = await Message.countDocuments({ createdAt: { $gte: d, $lte: dEnd } });
      days.push({
        date: d.toLocaleDateString("en-IN", { weekday: "short" }),
        count
      });
    }

    // Label breakdown
    const labels = {
      "Hot Lead": hotLeads,
      "Cold Lead": await Contact.countDocuments({ label: "Cold Lead" }),
      "Customer": customers,
      "VIP": vip,
      "None": await Contact.countDocuments({ label: "" })
    };

    res.json({
      totalContacts, totalUnread, hotLeads, customers, vip,
      msgToday, sentToday, receivedToday,
      totalSent, totalDelivered, totalSeen,
      days, labels
    });
  } catch (err) {
    res.status(500).send("Stats error");
  }
});


// 📢 BROADCAST MESSAGE
router.post("/broadcast", async (req, res) => {
  try {
    const { phones, message } = req.body;
    if (!phones || !phones.length || !message) {
      return res.status(400).send("Phones and message required");
    }

    res.json({ success: true, total: phones.length });

    // Send in background with delay (1.2s between each to avoid rate limit)
    const sendWithDelay = async () => {
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];
        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
            { messaging_product: "whatsapp", to: phone, type: "text", text: { body: message } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
          );

          await Message.create({ phone, message, direction: "outgoing", status: "sent" });

          await Contact.updateOne(
            { phone },
            { lastMessage: message, updatedAt: new Date() },
            { upsert: false }
          );

        } catch (err) {
          console.log(`Broadcast failed for ${phone}:`, err.response?.data || err.message);
        }

        // 1.2 second delay
        if (i < phones.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
      console.log(`✅ Broadcast done: ${phones.length} contacts`);
    };

    sendWithDelay();

  } catch (err) {
    console.log("Broadcast error:", err);
    res.status(500).send("Broadcast error");
  }
});


// ⏰ REMINDERS - Get all
router.get("/reminders", async (req, res) => {
  try {
    const reminders = await Reminder.find({ done: false }).sort({ dueAt: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).send("Reminders error");
  }
});


// ⏰ REMINDERS - Create
router.post("/reminders", async (req, res) => {
  try {
    const { phone, name, message, dueAt } = req.body;
    if (!phone || !message || !dueAt) return res.status(400).send("Missing fields");
    const reminder = await Reminder.create({ phone, name, message, dueAt: new Date(dueAt) });
    res.json(reminder);
  } catch (err) {
    res.status(500).send("Create reminder error");
  }
});


// ⏰ REMINDERS - Delete
router.delete("/reminders/:id", async (req, res) => {
  try {
    await Reminder.deleteOne({ _id: req.params.id });
    res.send("Deleted");
  } catch (err) {
    res.status(500).send("Delete reminder error");
  }
});


// ⏰ REMINDERS - Mark done
router.post("/reminders/:id/done", async (req, res) => {
  try {
    await Reminder.updateOne({ _id: req.params.id }, { done: true });
    res.send("Done");
  } catch (err) {
    res.status(500).send("Error");
  }
});


// 🚀 CSV UPLOAD
router.post("/upload-csv", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded");
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        let added = 0;
        for (let row of results) {
          const keys = Object.keys(row);
          const phoneKey = keys.find(k => k.toLowerCase().includes("phone"));
          const nameKey = keys.find(k => k.toLowerCase().includes("name"));
          if (!phoneKey) continue;
          let phone = row[phoneKey]?.toString().trim();
          if (!phone) continue;
          if (!phone.startsWith("91")) phone = "91" + phone;
          const name = nameKey ? row[nameKey] : "";
          const exists = await Contact.findOne({ phone });
          if (!exists) {
            await Contact.create({ phone, name: name || "", lastMessage: "", unread: 0 });
            added++;
          }
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, count: results.length, added });
      });
  } catch (err) {
    res.status(500).send("Upload error");
  }
});


export default router;
