import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import User from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncRoute, cleanText, HttpError, objectId, safeUser } from "../lib/utils.js";

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please try again in 15 minutes." } });
const setupAllowed = () => process.env.ALLOW_FIRST_USER_SETUP === "true" && Boolean(process.env.SETUP_KEY);

router.get("/check-setup", asyncRoute(async (req, res) => {
  res.json({ adminExists: Boolean(await User.exists({})), setupAllowed: setupAllowed() });
}));
router.post("/login", loginLimit, asyncRoute(async (req, res) => {
  const username = cleanText(req.body.username, 20).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!username || !password || password.length > 200) throw new HttpError(400, "Username and password are required.");
  const user = await User.findOne({ username });
  if (!user || !await bcrypt.compare(password, user.password)) throw new HttpError(401, "Incorrect username or password.", "BAD_LOGIN");
  const token = jwt.sign({ id: String(user._id), username: user.username, role: user.role, v: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
  res.json({ token, user: safeUser(user) });
}));
router.post("/register", loginLimit, asyncRoute(async (req, res) => {
  const username = cleanText(req.body.username, 20).toLowerCase();
  const password = req.body.password;
  const displayName = cleanText(req.body.displayName, 80) || username;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new HttpError(400, "Username must be 3–20 letters, numbers or underscores.");
  if (typeof password !== "string" || password.length < 10 || password.length > 200) throw new HttpError(400, "Use a password between 10 and 200 characters.");
  const count = await User.countDocuments();
  let role = "admin";
  let lock = false;
  if (count) {
    let admin;
    try {
      const decoded = jwt.verify((req.headers.authorization || "").replace(/^Bearer /, ""), process.env.JWT_SECRET, { algorithms: ["HS256"] });
      admin = await User.findById(decoded.id);
      if ((decoded.v || 0) !== (admin?.tokenVersion || 0)) admin = null;
    } catch { /* unauthorized below */ }
    if (admin?.role !== "admin") throw new HttpError(403, "Only an administrator can create another account.");
    role = req.body.role === "admin" ? "admin" : "agent";
  } else {
    const supplied = Buffer.from(String(req.headers["x-setup-key"] || ""));
    const expected = Buffer.from(process.env.SETUP_KEY || "");
    if (!setupAllowed() || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new HttpError(403, "First-account setup is locked. Enable it and supply the setup key on the server.");
    try { await mongoose.connection.collection("setuplocks").insertOne({ _id: "first-admin", createdAt: new Date() }); lock = true; }
    catch (err) { if (err.code === 11000) throw new HttpError(409, "Initial setup is already in progress or complete."); throw err; }
  }
  try {
    const user = await User.create({ username, displayName, password: await bcrypt.hash(password, 12), role });
    res.status(201).json({ success: true, role: user.role });
  } catch (err) {
    if (lock) await mongoose.connection.collection("setuplocks").deleteOne({ _id: "first-admin" });
    if (err.code === 11000) throw new HttpError(409, "That username is already in use.");
    throw err;
  }
}));
router.get("/me", requireAuth, (req, res) => res.json(safeUser(req.user)));
router.get("/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => res.json(await User.find().select("-password").lean())));
router.delete("/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const id = objectId(req.params.id);
  if (String(id) === String(req.user._id)) throw new HttpError(400, "You cannot delete your own account.");
  await User.deleteOne({ _id: id });
  req.io?.in?.(`user:${id}`)?.disconnectSockets(true);
  res.json({ success: true });
}));
router.post("/change-password", requireAuth, loginLimit, asyncRoute(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 200) throw new HttpError(400, "Use a new password between 10 and 200 characters.");
  const user = await User.findById(req.user._id);
  if (!await bcrypt.compare(oldPassword, user.password)) throw new HttpError(400, "Current password is incorrect.");
  user.password = await bcrypt.hash(newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  req.io?.in?.(`user:${user._id}`)?.disconnectSockets(true);
  res.json({ success: true });
}));
export default router;
