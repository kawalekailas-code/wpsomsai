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
import { initSocket } from "./socket/index.js";
import Reminder from "./models/Reminder.js";
import Message from "./models/Message.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["https://wpsomsai-1.onrender.com"],
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

app.use(express.json());

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (req, res) => res.send("WhatsApp CRM Backend Running 🚀"));

const server = http.createServer(app);
const io = initSocket(server);

app.use((req, res, next) => { req.io = io; next(); });

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Mongo Connected");
    startCron();
  })
  .catch(err => console.log("❌ Mongo Error:", err));

app.use("/webhook", webhook);
app.use("/api", chat);
app.use("/api/send", send);

app.use((err, req, res, next) => {
  console.log("🔥 Server Error:", err);
  res.status(500).send("Internal Server Error");
});

// ⏰ CRON JOB - Check reminders every minute
function startCron() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const due = await Reminder.find({
        done: false,
        dueAt: { $lte: now }
      });

      for (const reminder of due) {
        try {
          // Send WhatsApp message
          await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: reminder.phone,
              type: "text",
              text: { body: reminder.message }
            },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
          );

          await Message.create({
            phone: reminder.phone,
            message: reminder.message,
            direction: "outgoing",
            status: "sent"
          });

          // Emit real-time
          io.emit("reminder_sent", {
            id: reminder._id,
            phone: reminder.phone,
            message: reminder.message
          });

          // Mark done
          reminder.done = true;
          await reminder.save();

          console.log(`⏰ Reminder sent to ${reminder.phone}`);
        } catch (err) {
          console.log(`Reminder send failed for ${reminder.phone}:`, err.response?.data || err.message);
        }
      }
    } catch (err) {
      console.log("Cron error:", err);
    }
  });

  console.log("⏰ Cron job started");
}

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
