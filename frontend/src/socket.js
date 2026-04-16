import { io } from "socket.io-client";

export const socket = io(process.env.REACT_APP_API, {
  transports: ["websocket"],

  // 🔥 auto reconnect
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,

  // optional
  timeout: 20000
});
