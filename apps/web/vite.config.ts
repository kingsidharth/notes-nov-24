import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.API_URL ?? "http://localhost:4310";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Milkdown Crepe renders some UI with Vue; declare its compile-time flags so
  // Vue stops warning and production builds can drop the unused code paths.
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5310,
    strictPort: true,
    host: true,
    proxy: { "/api": { target: API_TARGET, changeOrigin: true } },
  },
  preview: { port: 5310, strictPort: true, host: true },
  build: { outDir: "dist", sourcemap: false },
});
