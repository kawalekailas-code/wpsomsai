import { io } from "socket.io-client";

export const socket = io(process.env.REACT_APP_API, {
  transports: ["websocket"],

  // 🔥 auto reconnect (UNCHANGED)
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,

  // 🔥 ADD (stability)
  withCredentials: true,

  // 🔥 ADD (force connection)
  autoConnect: true,

  // optional
  timeout: 20000
});
