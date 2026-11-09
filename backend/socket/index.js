import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export function initSocket(server) {
  const origins = (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(s => s.trim());
  const io = new Server(server, { cors: { origin: origins, credentials: true }, transports: ["websocket", "polling"], maxHttpBufferSize: 16384 });
  io.use(async (socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token || "", process.env.JWT_SECRET, { algorithms: ["HS256"] });
      const user = await User.findById(decoded.id).select("username tokenVersion").lean();
      if (!user || (decoded.v || 0) !== (user.tokenVersion || 0)) return next(new Error("Authentication required"));
      socket.user = { id: String(user._id), exp: decoded.exp };
      next();
    } catch { next(new Error("Session expired. Please sign in again.")); }
  });
  io.on("connection", socket => {
    socket.join(`user:${socket.user.id}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, socket.user.exp * 1000 - Date.now()));
    expiry.unref();
    socket.on("disconnect", () => clearTimeout(expiry));
  });
  // No invented WhatsApp contact typing, online, or last-seen signals. Cloud API
  // does not expose those personal-account presence events.
  return io;
}
