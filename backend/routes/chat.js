import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";

const router = express.Router();
const upload = multer({ dest: "uploads/" });


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


// 🔥 MARK AS SEEN
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;

    await Contact.updateOne({ phone }, { unread: 0 });

    await Message.updateMany(
      { phone, direction: "incoming" },
      { status: "seen" }
    );

    req.io?.to(phone).emit("message_status", { phone, status: "seen" });

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


// ✅ FIX: ADD CONTACT (was missing!)
router.post("/add-contact", async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!phone) return res.status(400).send("Phone required");

    let p = phone.toString().trim();
    if (!p.startsWith("91")) p = "91" + p;

    const exists = await Contact.findOne({ phone: p });
    if (exists) return res.status(409).send("Contact already exists");

    const contact = await Contact.create({
      name: name || "",
      phone: p,
      lastMessage: "",
      unread: 0
    });

    res.json(contact);
  } catch (err) {
    console.log(err);
    res.status(500).send("Add contact error");
  }
});


// ✅ FIX: DELETE CONTACT (was missing!)
router.delete("/delete-contact/:phone", async (req, res) => {
  try {
    await Contact.deleteOne({ phone: req.params.phone });
    await Message.deleteMany({ phone: req.params.phone });
    res.send("Deleted");
  } catch (err) {
    console.log(err);
    res.status(500).send("Delete error");
  }
});


// 🏷️ UPDATE LABEL
router.post("/label/:phone", async (req, res) => {
  try {
    const { label } = req.body;
    await Contact.updateOne({ phone: req.params.phone }, { label });
    res.send("Label updated");
  } catch (err) {
    console.log(err);
    res.status(500).send("Label update error");
  }
});


// 📝 UPDATE NOTES
router.post("/notes/:phone", async (req, res) => {
  try {
    const { notes } = req.body;
    await Contact.updateOne({ phone: req.params.phone }, { notes });
    res.send("Notes updated");
  } catch (err) {
    console.log(err);
    res.status(500).send("Notes update error");
  }
});


// 📥 EXPORT CONTACTS AS CSV
router.get("/export-csv", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });

    const header = "Name,Phone,Label,Last Message,Notes,Created At\n";

    const rows = contacts.map(c => {
      const name = (c.name || "").replace(/,/g, " ");
      const phone = c.phone || "";
      const label = c.label || "";
      const last = (c.lastMessage || "").replace(/,/g, " ").replace(/\n/g, " ");
      const notes = (c.notes || "").replace(/,/g, " ").replace(/\n/g, " ");
      const created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "";
      return `${name},${phone},${label},${last},${notes},${created}`;
    });

    const csv = header + rows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
    res.send(csv);

  } catch (err) {
    console.log(err);
    res.status(500).send("Export error");
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
    console.log("CSV ERROR:", err);
    res.status(500).send("Upload error");
  }
});


export default router;
