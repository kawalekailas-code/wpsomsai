import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import auth from "./routes/auth.js";
import chat from "./routes/chat.js";
import send from "./routes/send.js";
import webhook from "./routes/webhook.js";
import { requireAuth } from "./middleware/auth.js";

export function allowedOrigins() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(s => s.trim()).filter(Boolean);
}
export function createApp(io) {
  const app = express();
  // Render terminates TLS at its reverse proxy. Trust that hop, not arbitrary XFF chains.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins().includes(origin)), credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
  app.use(express.json({ limit: "256kb", verify: (req, res, buffer) => { if (req.originalUrl.startsWith("/webhook")) req.rawBody = buffer; } }));
  app.locals.io = io;
  app.use((req, res, next) => { req.io = app.locals.io; next(); });
  app.get("/", (req, res) => res.json({ app: "OmSai Chat", version: "2.0.0" }));
  app.get("/health", (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? "ok" : "unavailable" }));
  app.use("/webhook", webhook);
  app.use("/auth", auth);
  app.use("/api", requireAuth, rateLimit({ windowMs: 60000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Please slow down and try again shortly." } }));
  app.use("/api/send", send);
  app.use("/api", chat);
  app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500;
    let error = err.message || "Something went wrong.";
    if (err.code === "LIMIT_FILE_SIZE") { status = 413; error = "File is too large. The app limit is 16 MB."; }
    if (err.name === "ValidationError" || err.name === "CastError") { status = 400; error = "Invalid data. Please check your input."; }
    if (err.code === 11000) { status = 409; error = "That item already exists."; }
    if (status >= 500) console.error(`${req.method} ${req.path}: ${err.code || err.name}`);
    const known = err.status || ["ValidationError", "CastError"].includes(err.name) || err.code === "LIMIT_FILE_SIZE" || err.code === 11000;
    res.status(status).json({ error: known ? error : "The server could not complete this request.", code: typeof err.code === "string" ? err.code : "SERVER_ERROR", ...(err.messageId ? { messageId: err.messageId } : {}) });
  });
  return app;
}
