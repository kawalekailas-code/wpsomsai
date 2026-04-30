import jwt from "jsonwebtoken";
const SECRET = process.env.JWT_SECRET || "whatsapp_crm_secret_2024";

export const requireAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).send("Unauthorized");
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};

export const requireAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).send("Unauthorized");
    const user = jwt.verify(token, SECRET);
    if (user.role !== "admin") return res.status(403).send("Admin only");
    req.user = user;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};
