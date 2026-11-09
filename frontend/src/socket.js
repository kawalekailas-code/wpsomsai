import { io } from "socket.io-client";
import { API_URL, getToken } from "./lib/api.js";

export function connectSocket() {
  return io(API_URL || window.location.origin, {
    autoConnect: true,
    auth: { token: getToken() },
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10000,
    timeout: 65000
  });
}
