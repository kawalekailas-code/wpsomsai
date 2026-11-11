import "dotenv/config";
import mongoose from "mongoose";
import { startWorker } from "./services/worker.js";
import { createHttpServer } from "./http.js";

const required = ["MONGO_URI", "TOKEN", "PHONE_ID", "JWT_SECRET", "VERIFY_TOKEN", "APP_SECRET", "FRONTEND_URL"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}. See backend/.env.example.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters. Use a strong random secret.");
  process.exit(1);
}
if (!/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION || "v25.0")) {
  console.error("WHATSAPP_API_VERSION must be a Graph API version such as v25.0.");
  process.exit(1);
}
await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10, minPoolSize: 0, serverSelectionTimeoutMS: 15000 });
await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
const { server, io } = createHttpServer();
const stopWorker = startWorker(io);
const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () => console.log(`OmSai Chat API listening on ${port}`));
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await stopWorker();
  io.close();
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
