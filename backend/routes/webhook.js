import express from "express";
import crypto from "node:crypto";
import { asyncRoute } from "../lib/utils.js";
import { acceptWebhook } from "../services/inbox.js";

const router = express.Router();
export function verifyWebhookSignature(req, res, next) {
  const secret = process.env.APP_SECRET;
  if (!secret) return res.status(503).json({ error: "Webhook signing is not configured." });
  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !Buffer.isBuffer(req.rawBody)) return res.sendStatus(403);
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex")}`;
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(403);
  next();
}
router.get("/", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) return res.status(200).send(String(req.query["hub.challenge"] || ""));
  res.sendStatus(403);
});
router.post("/", verifyWebhookSignature, asyncRoute(async (req, res) => {
  await acceptWebhook(req.body, req.io);
  res.sendStatus(200);
}));
export default router;
