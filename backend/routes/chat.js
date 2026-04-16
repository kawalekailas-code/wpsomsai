import express from "express";
import Contact from "../models/Contact.js";
import Message from "../models/Message.js";

// 🆕 ADD
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";

const router = express.Router();

// 🆕 ADD
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


// 🔥 MARK AS SEEN + REALTIME
router.post("/seen/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;

    await Contact.updateOne({ phone }, { unread: 0 });

    await Message.updateMany(
      { phone, direction: "incoming" },
      { status: "seen" }
    );

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


// 🚀🔥 CSV UPLOAD (UPGRADED - NAME FIX ONLY ADD)
router.post("/upload-csv", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const results = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", async () => {

        for (let row of results) {

          // 🔥 SMART COLUMN DETECT (NEW ADD)
          const keys = Object.keys(row);

          const phoneKey = keys.find(k =>
            k.toLowerCase().includes("phone")
          );

          const nameKey = keys.find(k =>
            k.toLowerCase().includes("name")
          );

          if (!phoneKey) continue;

          let phone = row[phoneKey]?.toString().trim();

          if (!phone) continue;

          // 🔥 +91 auto add
          if (!phone.startsWith("91")) {
            phone = "91" + phone;
          }

          const name = nameKey ? row[nameKey] : "";

          const exists = await Contact.findOne({ phone });

          if (!exists) {
            await Contact.create({
              phone,
              name: name || "",
              lastMessage: "",
              unread: 0
            });
          }
        }

        fs.unlinkSync(req.file.path);

        res.json({ success: true, count: results.length });
      });

  } catch (err) {
    console.log("CSV ERROR:", err);
    res.status(500).send("Upload error");
  }
});


export default router;
