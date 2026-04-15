import { Server } from "socket.io";

export const initSocket = (server) => {
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    socket.on("join", (phone) => {
      socket.join(phone);
    });
  });

  return io;
};