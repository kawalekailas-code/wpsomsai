import { Server } from "socket.io";

export const initSocket = (server) => {
  const io = new Server(server, {

    // 🔥 CORS FIX (IMPORTANT)
    cors: {
      origin: [
        "https://wpsomsai-1.onrender.com"
      ],
      methods: ["GET", "POST"],
      credentials: true
    },

    // 🔥 ADD (stability)
    transports: ["websocket"]
  });

  io.on("connection", (socket) => {

    // 🟢 JOIN ROOM
    socket.on("join", (phone) => {
      socket.join(phone);
    });

    // 💬 TYPING START
    socket.on("typing", (phone) => {
      socket.to(phone).emit("typing", phone);
    });

    // 💬 TYPING STOP
    socket.on("stop_typing", (phone) => {
      socket.to(phone).emit("stop_typing", phone);
    });

    // 👀 SEEN EVENT
    socket.on("seen", (phone) => {
      socket.to(phone).emit("seen", phone);
    });

  });

  return io;
};
