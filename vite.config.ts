import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves the app from /dunnage/.
  base: "/dunnage/",
  plugins: [react()],
  // three.js alone is over the default 500 kB warning.
  build: { outDir: "dist-site", chunkSizeWarningLimit: 1000 },
  test: { include: ["test/**/*.test.ts"] },
});
