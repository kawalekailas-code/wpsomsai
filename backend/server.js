import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";

import webhook from "./routes/webhook.js";
import chat from "./routes/chat.js";
import send from "./routes/send.js";
import { initSocket } from "./socket/index.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ ROOT ROUTE (important)
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

// ✅ CREATE SERVER
const server = http.createServer(app);
const io = initSocket(server);

// inject socket
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ Mongo connect (safe)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo Connected"))
  .catch(err => console.log("Mongo Error:", err));

// ✅ Routes safe load
try {
  app.use("/webhook", webhook);
  app.use("/api", chat);
  app.use("/api/send", send);
} catch (err) {
  console.log("Route error:", err);
}

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.log("Error:", err);
  res.status(500).send("Server Error");
});

// ✅ START SERVER
server.listen(process.env.PORT || 3000, () => {
  console.log("Server running 🚀");
});
