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
      output: {
        // Ensure WASM and worker files maintain their names
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".wasm")) {
            return "assets/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  // Configure asset handling for WASM and worker files
  assetsInclude: ["**/*.wasm", "**/*-worker*.js"],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "@briefcase/db/sqlite3"],
  },
  server: {
    fs: {
      // Allow serving files from packages directory
      allow: [".."],
    },
  },
  worker: {
    format: "es",
  },
});
