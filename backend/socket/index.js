import { Server } from "socket.io";
import jwt from "jsonwebtoken";

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "https://wpsomsai-1.onrender.com",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket"]
  });

  // 🔒 Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const secret = process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      socket.user = decoded; // user info attach करा
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.user?.username}`);

    // JOIN ROOM — फक्त authenticated users
    socket.on("join", (phone) => {
      if (!phone || typeof phone !== "string") return;
      socket.join(phone);
    });

    // TYPING
    socket.on("typing", (phone) => {
      if (!phone) return;
      socket.to(phone).emit("typing", phone);
    });

    socket.on("stop_typing", (phone) => {
      if (!phone) return;
      socket.to(phone).emit("stop_typing", phone);
    });

    // SEEN
    socket.on("seen", (phone) => {
      if (!phone) return;
      socket.to(phone).emit("seen", phone);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.user?.username}`);
    });
  });

  return io;
};
