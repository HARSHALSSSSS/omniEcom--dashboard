import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

// The MSW service worker is only needed when mocks are switched on; keep it out of a normal production build.
function dropMockServiceWorker(useMocks: boolean) {
  let outDir = path.resolve(__dirname, "dist");
  return {
    name: "drop-mock-service-worker",
    apply: "build" as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (useMocks) return;
      fs.rmSync(path.join(outDir, "mockServiceWorker.js"), { force: true });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    dropMockServiceWorker(loadEnv(mode, __dirname, "VITE_").VITE_USE_MOCKS === "true"),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true,
    // the browser talks to /api/v1 on this origin; Vite forwards it to the API (no CORS, no cookies involved)
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
