import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: "src/sidepanel/index.html",
        offscreen: "src/offscreen/offscreen.html",
      },
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  // Configure asset handling for WASM and worker files
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
  },
});
