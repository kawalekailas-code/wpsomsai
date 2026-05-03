import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import Reminder from "../models/Reminder.js";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import axios from "axios";

const router = express.Router();

// 🔒 File upload — size limit 10MB, only safe types
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg","image/png","image/gif","image/webp","video/mp4","audio/mpeg","audio/ogg","audio/wav","application/pdf","text/csv"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed"), false);
  }
});

// CSV upload — only CSV, 5MB max
const csvUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) cb(null, true);
    else cb(new Error("Only CSV files allowed"), false);
  }
});

// 🔒 Phone number validation helper
const isValidPhone = (phone) => /^\d{10,15}$/.test(phone);

// 🔒 Regex escape — ReDoS prevent करा
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// ✅ GET CONTACTS
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ pinned: -1, updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Error fetching contacts" });
  }
});

// ✅ GET MESSAGES
router.get("/messages/:phone", async (req, res) => {
  try {
    const messages = await Message.find({ phone: req.params.phone }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

// ✅ MARK AS SEEN
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;
    await Contact.updateOne({ phone }, { unread: 0 });
    await Message.updateMany({ phone, direction: "incoming" }, { status: "seen" });
    req.io?.to(phone).emit("message_status", { phone, status: "seen" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error updating seen" });
  }
});

// 🔍 SEARCH CONTACTS — ReDoS fixed
router.get("/search", async (req, res) => {
  try {
    const q = escapeRegex(req.query.q || "");
    if (!q) { const all = await Contact.find().sort({ pinned: -1, updatedAt: -1 }); return res.json(all); }
    const contacts = await Contact.find({
      $or: [
        { phone: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { lastMessage: { $regex: q, $options: "i" } }
      ]
    }).sort({ pinned: -1, updatedAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Search error" });
  }
});

// ✅ ADD CONTACT — phone validation added
router.post("/add-contact", async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });

    let p = phone.toString().trim().replace(/\D/g, ""); // digits only
    if (!isValidPhone(p) && !isValidPhone(p.replace(/^91/, ""))) {
      return res.status(400).json({ error: "Invalid phone number" });
    }
    if (!p.startsWith("91")) p = "91" + p;

    const exists = await Contact.findOne({ phone: p });
    if (exists) return res.status(409).json({ error: "Contact already exists" });

    const contact = await Contact.create({ name: (name || "").trim().substring(0, 100), phone: p, lastMessage: "", unread: 0 });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: "Add contact error" });
  }
});

// ✅ DELETE CONTACT
router.delete("/delete-contact/:phone", async (req, res) => {
  try {
    await Contact.deleteOne({ phone: req.params.phone });
    await Message.deleteMany({ phone: req.params.phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete error" });
  }
});

// 🏷️ UPDATE LABEL
router.post("/label/:phone", async (req, res) => {
  try {
    const allowed = ["", "Hot Lead", "Cold Lead", "Customer", "VIP"];
    const label = req.body.label;
    if (!allowed.includes(label)) return res.status(400).json({ error: "Invalid label" });
    await Contact.updateOne({ phone: req.params.phone }, { label });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Label update error" });
  }
});

// 📝 UPDATE NOTES
router.post("/notes/:phone", async (req, res) => {
  try {
    const notes = (req.body.notes || "").substring(0, 2000); // max 2000 chars
    await Contact.updateOne({ phone: req.params.phone }, { notes });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Notes update error" });
  }
});

// 📌 PIN / UNPIN
router.post("/pin/:phone", async (req, res) => {
  try {
    const contact = await Contact.findOne({ phone: req.params.phone });
    if (!contact) return res.status(404).json({ error: "Not found" });
    contact.pinned = !contact.pinned;
    await contact.save();
    res.json({ pinned: contact.pinned });
  } catch (err) {
    res.status(500).json({ error: "Pin error" });
  }
});

// 🔍 SEARCH MESSAGES — ReDoS fixed
router.get("/search-messages/:phone", async (req, res) => {
  try {
    const q = escapeRegex(req.query.q || "");
    if (!q) return res.json([]);
    const messages = await Message.find({
      phone: req.params.phone,
      message: { $regex: q, $options: "i" }
    }).sort({ createdAt: 1 }).limit(100); // limit 100 results
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Message search error" });
  }
});

// 📥 EXPORT CSV
router.get("/export-csv", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });
    const header = "Name,Phone,Label,Notes,Last Message,Created At\n";
    const rows = contacts.map(c => {
      const clean = (s) => `"${(s || "").replace(/"/g, "'").replace(/\n/g, " ")}"`;
      return `${clean(c.name)},${c.phone},${c.label || ""},${clean(c.notes)},${clean(c.lastMessage)},${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}`;
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
    res.send(header + rows.join("\n"));
  } catch (err) {
    res.status(500).json({ error: "Export error" });
  }
});

// 📊 DASHBOARD STATS
router.get("/stats", async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [totalContacts, totalUnread, hotLeads, customers, vip, msgToday, sentToday, receivedToday, totalSent, totalDelivered, totalSeen, coldLeads, untagged] = await Promise.all([
      Contact.countDocuments(),
      Contact.countDocuments({ unread: { $gt: 0 } }),
      Contact.countDocuments({ label: "Hot Lead" }),
      Contact.countDocuments({ label: "Customer" }),
      Contact.countDocuments({ label: "VIP" }),
      Message.countDocuments({ createdAt: { $gte: today } }),
      Message.countDocuments({ createdAt: { $gte: today }, direction: "outgoing" }),
      Message.countDocuments({ createdAt: { $gte: today }, direction: "incoming" }),
      Message.countDocuments({ direction: "outgoing" }),
      Message.countDocuments({ direction: "outgoing", status: "delivered" }),
      Message.countDocuments({ direction: "outgoing", status: "seen" }),
      Contact.countDocuments({ label: "Cold Lead" }),
      Contact.countDocuments({ label: "" })
    ]);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);
      const count = await Message.countDocuments({ createdAt: { $gte: d, $lte: dEnd } });
      days.push({ date: d.toLocaleDateString("en-IN", { weekday: "short" }), count });
    }

    res.json({
      totalContacts, totalUnread, hotLeads, customers, vip,
      msgToday, sentToday, receivedToday,
      totalSent, totalDelivered, totalSeen,
      days,
      labels: { "Hot Lead": hotLeads, "Cold Lead": coldLeads, "Customer": customers, "VIP": vip, "None": untagged }
    });
  } catch (err) {
    res.status(500).json({ error: "Stats error" });
  }
});

// 📢 BROADCAST
router.post("/broadcast", async (req, res) => {
  try {
    const { phones, message } = req.body;
    if (!phones?.length || !message) return res.status(400).json({ error: "Phones and message required" });
    if (phones.length > 500) return res.status(400).json({ error: "Max 500 contacts per broadcast" });
    if (message.length > 4096) return res.status(400).json({ error: "Message too long (max 4096 chars)" });

    res.json({ success: true, total: phones.length });

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
          await Contact.updateOne({ phone }, { lastMessage: message.substring(0, 200), updatedAt: new Date() });
        } catch (err) {
          console.log(`Broadcast failed ${phone}:`, err.message);
        }
        if (i < phones.length - 1) await new Promise(r => setTimeout(r, 1200));
      }
    };
    sendWithDelay();
  } catch (err) {
    res.status(500).json({ error: "Broadcast error" });
  }
});

// ⏰ REMINDERS
router.get("/reminders", async (req, res) => {
  try {
    const reminders = await Reminder.find({ done: false }).sort({ dueAt: 1 });
    res.json(reminders);
  } catch (err) { res.status(500).json({ error: "Reminders error" }); }
});

router.post("/reminders", async (req, res) => {
  try {
    const { phone, name, message, dueAt } = req.body;
    if (!phone || !message || !dueAt) return res.status(400).json({ error: "Missing fields" });
    if (message.length > 1000) return res.status(400).json({ error: "Message too long" });
    const due = new Date(dueAt);
    if (isNaN(due) || due < new Date()) return res.status(400).json({ error: "Invalid or past date" });
    const reminder = await Reminder.create({ phone, name: (name||"").substring(0,100), message, dueAt: due });
    res.json(reminder);
  } catch (err) { res.status(500).json({ error: "Create reminder error" }); }
});

router.delete("/reminders/:id", async (req, res) => {
  try {
    await Reminder.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Delete error" }); }
});

router.post("/reminders/:id/done", async (req, res) => {
  try {
    await Reminder.updateOne({ _id: req.params.id }, { done: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 📂 CSV UPLOAD with progress
router.post("/upload-csv", csvUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => { if (results.length < 10000) results.push(data); }) // max 10k rows
      .on("end", async () => {
        let added = 0, skipped = 0, errors = 0;
        const total = results.length;
        for (let i = 0; i < results.length; i++) {
          const row = results[i];
          try {
            const keys = Object.keys(row);
            const phoneKey = keys.find(k => k.toLowerCase().includes("phone"));
            const nameKey = keys.find(k => k.toLowerCase().includes("name"));
            if (!phoneKey) { errors++; continue; }
            let phone = row[phoneKey]?.toString().trim().replace(/\D/g, "");
            if (!phone || !isValidPhone(phone)) { errors++; continue; }
            if (!phone.startsWith("91")) phone = "91" + phone;
            const name = (nameKey ? row[nameKey] : "").substring(0, 100);
            const exists = await Contact.findOne({ phone });
            if (!exists) { await Contact.create({ phone, name, lastMessage: "", unread: 0 }); added++; }
            else skipped++;
          } catch { errors++; }

          if (req.io && (i % 10 === 0 || i === total - 1)) {
            req.io.emit("csv_progress", { current: i + 1, total, added, skipped, percent: Math.round(((i + 1) / total) * 100) });
          }
        }
        try { fs.unlinkSync(req.file.path); } catch {}
        res.json({ success: true, total, added, skipped, errors });
      })
      .on("error", () => res.status(500).json({ error: "CSV parse error" }));
  } catch (err) {
    res.status(500).json({ error: "Upload error" });
  }
});

// 🗑️ BULK DELETE — fixed (was after export before!)
router.post("/bulk-delete", async (req, res) => {
  try {
    const { phones } = req.body;
    if (!phones?.length) return res.status(400).json({ error: "No phones provided" });
    if (phones.length > 1000) return res.status(400).json({ error: "Max 1000 at a time" });
    await Contact.deleteMany({ phone: { $in: phones } });
    await Message.deleteMany({ phone: { $in: phones } });
    res.json({ success: true, deleted: phones.length });
  } catch (err) {
    res.status(500).json({ error: "Bulk delete error" });
  }
});

export default router;
