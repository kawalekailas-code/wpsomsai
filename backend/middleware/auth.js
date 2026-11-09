import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Please sign in.", code: "UNAUTHORIZED" });
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id).select("-password");
    if (!user || (decoded.v || 0) !== (user.tokenVersion || 0)) return res.status(401).json({ error: "Session expired. Please sign in again.", code: "UNAUTHORIZED" });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError" || err.name === "NotBeforeError") {
      return res.status(401).json({ error: "Session expired. Please sign in again.", code: "UNAUTHORIZED" });
    }
    next(err);
  }
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
