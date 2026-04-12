import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "@/lib": resolve(__dirname, "./lib"),
      "@/components": resolve(__dirname, "./components"),
      "@/classes": resolve(__dirname, "./lib/classes"),
      "@/stores": resolve(__dirname, "./lib/stores"),
      "@/services": resolve(__dirname, "./lib/services"),
      "@/utils": resolve(__dirname, "./lib/utils"),
    },
  },
});
