import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";

import webhook from "./routes/webhook.js";
import chat from "./routes/chat.js";
import send from "./routes/send.js";
import { initSocket } from "./socket/index.js";

dotenv.config();

const app = express();

// ✅ CORS FIX (🔥 IMPORTANT ADD)
app.use(cors({
  origin: [
    "https://wpsomsai-1.onrender.com"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

// ✅ MIDDLEWARE
app.use(express.json());

// ✅ ENSURE uploads folder exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// ✅ STATIC MEDIA SERVE
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ ROOT ROUTE
app.get("/", (req, res) => {
  res.send("WhatsApp CRM Backend Running 🚀");
});

// ✅ CREATE SERVER + SOCKET
const server = http.createServer(app);
const io = initSocket(server);

// inject socket into routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ DATABASE CONNECT
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// ✅ ROUTES
app.use("/webhook", webhook);
app.use("/api", chat);
app.use("/api/send", send);

// ✅ GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.log("🔥 Server Error:", err);
  res.status(500).send("Internal Server Error");
});

// ✅ START SERVER
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
