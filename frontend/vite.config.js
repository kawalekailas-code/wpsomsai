import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "REACT_APP_"],
  build: { outDir: "build", emptyOutDir: true },
  server: {
    host: "0.0.0.0",
    // Allow Arena's per-sandbox preview host; the app still protects API access
    // with JWT and explicit backend CORS origins.
    allowedHosts: [".e2b.app", "localhost"],
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/auth": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true, changeOrigin: true }
    }
  },
  preview: { host: "0.0.0.0", allowedHosts: [".e2b.app", "localhost"] },
  test: { environment: "node", include: ["src/test/**/*.test.js"] }
});
