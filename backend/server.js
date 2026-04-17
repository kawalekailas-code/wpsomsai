import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";

// 🔥 NEW SECURITY IMPORTS
import rateLimit from "express-rate-limit";

import webhook from "./routes/webhook.js";
import chat from "./routes/chat.js";
import send from "./routes/send.js";
import { initSocket } from "./socket/index.js";

dotenv.config();

const app = express();


// 🔐 1. RATE LIMIT (ANTI SPAM / DDOS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // 100 requests
});
app.use(limiter);


// 🔐 2. CORS (SAFE)
app.use(cors({
  origin: [
    "https://wpsomsai-1.onrender.com"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));


// 🔐 3. AUTH MIDDLEWARE (🔥 IMPORTANT)
const auth = (req, res, next) => {
  const key = req.headers["x-api-key"];

  if (!key || key !== process.env.API_KEY) {
    return res.status(403).send("Unauthorized");
  }

  next();
};


// ✅ MIDDLEWARE
app.use(express.json());


// ✅ ENSURE uploads folder exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}


// 🔐 4. STATIC FILE SECURITY (OPTIONAL)
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


// 🔐 5. PROTECT ROUTES
app.use("/api", auth, chat);
app.use("/api/send", auth, send);


// ❗ webhook public ठेव (WhatsApp साठी)
app.use("/webhook", webhook);


// ✅ GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.log("🔥 Server Error:", err);
  res.status(500).send("Internal Server Error");
});


// ✅ START SERVER
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
