import http from "node:http";
import { createApp } from "./app.js";
import { initSocket } from "./socket/index.js";

export function createHttpServer() {
  // Attach Express BEFORE Socket.IO. Engine.IO wraps the existing request
  // listener; adding Express afterwards would double-handle polling requests.
  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);
  app.locals.io = io;
  return { app, server, io };
}
