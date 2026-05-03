import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import axios from "axios";

import webhook from "./routes/webhook.js";
import chat from "./routes/chat.js";
import send from "./routes/send.js";
import auth from "./routes/auth.js";
import marketing from "./routes/marketing.js";
import { initSocket } from "./socket/index.js";
import { requireAuth } from "./middleware/auth.js";
import Reminder from "./models/Reminder.js";
import Message from "./models/Message.js";

dotenv.config();

// 🔒 Required env variables check
const required = ["MONGO_URI", "TOKEN", "PHONE_ID", "JWT_SECRET", "VERIFY_TOKEN"];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing required env variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = express();

// 🔒 CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://wpsomsai-1.onrender.com",
  methods: ["GET", "POST", "DELETE", "PUT"],
  credentials: true
}));

// 🔒 Body size limits — large payload attacks prevent
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Uploads folder
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (req, res) => res.send("WhatsApp CRM Backend 🚀"));

const server = http.createServer(app);
const io = initSocket(server);
app.use((req, res, next) => { req.io = io; next(); });

mongoose.connect(process.env.MONGO_URI)
  .then(() => { console.log("✅ MongoDB Connected"); startCron(); })
  .catch(err => { console.log("❌ MongoDB Error:", err); process.exit(1); });

// 🔓 Public routes
app.use("/webhook", webhook);
app.use("/auth", auth);

// 🔒 Protected routes
app.use("/api", requireAuth, chat);
app.use("/api/send", requireAuth, send);
app.use("/api/marketing", requireAuth, marketing);

// Global error handler
app.use((err, req, res, next) => {
  console.log("🔥 Server Error:", err.message);
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large" });
  res.status(500).json({ error: "Internal Server Error" });
});

// ⏰ CRON — Reminders
function startCron() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const due = await Reminder.find({ done: false, dueAt: { $lte: now } });
      for (const reminder of due) {
        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
            { messaging_product: "whatsapp", to: reminder.phone, type: "text", text: { body: reminder.message } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
          );
          await Message.create({ phone: reminder.phone, message: reminder.message, direction: "outgoing", status: "sent" });
          io.emit("reminder_sent", { id: reminder._id, phone: reminder.phone });
          reminder.done = true;
          await reminder.save();
          console.log(`⏰ Reminder sent: ${reminder.phone}`);
        } catch (err) {
          console.log(`Reminder failed ${reminder.phone}:`, err.message);
        }
      }
    } catch (err) { console.log("Cron error:", err.message); }
  });
  console.log("⏰ Cron started");
}

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server on port", process.env.PORT || 3000);
});
