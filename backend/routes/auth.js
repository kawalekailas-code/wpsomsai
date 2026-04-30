import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "whatsapp_crm_secret_2024";

// ✅ LOGIN
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send("Username and password required");

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(401).send("Invalid credentials");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send("Invalid credentials");

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, displayName: user.displayName },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { username: user.username, role: user.role, displayName: user.displayName } });
  } catch (err) {
    console.log("Login error:", err);
    res.status(500).send("Login error");
  }
});

// ✅ REGISTER (Admin only - first user auto admin)
router.post("/register", async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password) return res.status(400).send("Username and password required");
    if (password.length < 6) return res.status(400).send("Password must be 6+ characters");

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).send("Username already taken");

    // First user is always admin
    const count = await User.countDocuments();
    const userRole = count === 0 ? "admin" : (role || "agent");

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase().trim(),
      password: hashed,
      displayName: displayName || username,
      role: userRole
    });

    res.json({ success: true, role: user.role });
  } catch (err) {
    console.log("Register error:", err);
    res.status(500).send("Register error");
  }
});

// ✅ VERIFY TOKEN
router.get("/me", (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).send("No token");
    const data = jwt.verify(token, SECRET);
    res.json(data);
  } catch {
    res.status(401).send("Invalid token");
  }
});

// ✅ GET ALL USERS (admin only)
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).send("Error fetching users");
  }
});

// ✅ DELETE USER
router.delete("/users/:id", async (req, res) => {
  try {
    await User.deleteOne({ _id: req.params.id });
    res.send("Deleted");
  } catch (err) {
    res.status(500).send("Error deleting user");
  }
});

// ✅ CHANGE PASSWORD
router.post("/change-password", async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(401).send("Old password incorrect");
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.send("Password changed");
  } catch (err) {
    res.status(500).send("Error changing password");
  }
});

export default router;
