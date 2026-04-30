import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();
const SECRET = process.env.JWT_SECRET;

// Rate limiting - simple in-memory (production साठी redis वापरा)
const loginAttempts = new Map();

const checkRateLimit = (ip) => {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < 15 * 60 * 1000); // 15 min window
  if (recent.length >= 5) {
    return false; // 5 पेक्षा जास्त attempts blocked
  }
  loginAttempts.set(ip, [...recent, now]);
  return true;
};

// ✅ LOGIN
router.post("/login", async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;

    // Rate limit check
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Too many login attempts. Try after 15 minutes." });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" }); // Generic message - don't reveal which field is wrong
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Clear rate limit on success
    loginAttempts.delete(ip);

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        displayName: user.displayName
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        username: user.username,
        role: user.role,
        displayName: user.displayName
      }
    });

  } catch (err) {
    console.log("Login error:", err);
    res.status(500).json({ error: "Login error" });
  }
});

// ✅ REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Username validation
    if (!/^[a-z0-9_]{3,20}$/.test(username.toLowerCase())) {
      return res.status(400).json({ error: "Username: 3-20 chars, only letters/numbers/underscore" });
    }

    // Password strength
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: "Username already taken" });

    // First user = admin, rest = agent (unless admin registers them)
    const count = await User.countDocuments();
    const userRole = count === 0 ? "admin" : (role || "agent");

    const hashed = await bcrypt.hash(password, 12); // 12 rounds - more secure than 10

    const user = await User.create({
      username: username.toLowerCase().trim(),
      password: hashed,
      displayName: displayName?.trim() || username,
      role: userRole
    });

    res.json({ success: true, role: user.role });

  } catch (err) {
    console.log("Register error:", err);
    res.status(500).json({ error: "Register error" });
  }
});

// ✅ VERIFY TOKEN - me endpoint
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// ✅ GET ALL USERS (admin only)
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

// ✅ DELETE USER (admin only)
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    // Admin स्वतःला delete करू शकत नाही
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: "User not found" });
    if (userToDelete.username === req.user.username) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    await User.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error deleting user" });
  }
});

// ✅ CHANGE PASSWORD (logged in user)
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be 6+ characters" });
    }

    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Old password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true });

  } catch (err) {
    console.log("Change password error:", err);
    res.status(500).json({ error: "Error changing password" });
  }
});

export default router;
