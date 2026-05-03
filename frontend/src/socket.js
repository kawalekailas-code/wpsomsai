import { io } from "socket.io-client";

// 🔒 JWT token socket connection सोबत पाठवा
const getToken = () => localStorage.getItem("crm_token") || "";

export const socket = io(process.env.REACT_APP_API, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  withCredentials: true,
  autoConnect: true,
  timeout: 20000,
  // 🔒 Auth token
  auth: {
    token: getToken()
  }
});

// Token refresh — नवीन login नंतर token update करा
export const updateSocketToken = () => {
  socket.auth = { token: getToken() };
  socket.disconnect().connect();
};
