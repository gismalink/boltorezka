import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_ASSET_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: process.env.VITE_API_BASE || "http://localhost:8080",
        changeOrigin: true
      },
      "/health": {
        target: process.env.VITE_API_BASE || "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
