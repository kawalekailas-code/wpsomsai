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

const server = http.createServer(app);
const io = initSocket(server);

app.use((req, res, next) => {
  req.io = io;
  next();
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB Connected"));

app.use("/webhook", webhook);
app.use("/api", chat);
app.use("/api/send", send);

server.listen(process.env.PORT || 3000);