import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Several suites are CPU-bound exact-arithmetic / enumeration tests (fuzz, hyperbolic develop over
    // all shipped patches, freedraw combined-grid, oracle classification) that legitimately run 10–20s.
    // Under the default 16-way file parallelism they oversubscribe the CPU, so wall-time inflates and
    // the 5s default timeout trips them intermittently. 60s gives finite tests headroom under load
    // without letting a genuinely hung test block for too long.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    // Order matters: most specific aliases first so `@/classes/Foo` resolves to
    // ./lib/classes/Foo before the generic `@/` rule rewrites it to ./classes/Foo.
    alias: [
      { find: /^@\/classes\/(.*)$/, replacement: resolve(__dirname, "./lib/classes") + "/$1" },
      { find: /^@\/classes$/, replacement: resolve(__dirname, "./lib/classes") },
      { find: /^@\/stores\/(.*)$/, replacement: resolve(__dirname, "./lib/stores") + "/$1" },
      { find: /^@\/stores$/, replacement: resolve(__dirname, "./lib/stores") },
      { find: /^@\/services\/(.*)$/, replacement: resolve(__dirname, "./lib/services") + "/$1" },
      { find: /^@\/services$/, replacement: resolve(__dirname, "./lib/services") },
      { find: /^@\/utils\/(.*)$/, replacement: resolve(__dirname, "./lib/utils") + "/$1" },
      { find: /^@\/utils$/, replacement: resolve(__dirname, "./lib/utils") },
      { find: /^@\/components\/(.*)$/, replacement: resolve(__dirname, "./components") + "/$1" },
      { find: /^@\/components$/, replacement: resolve(__dirname, "./components") },
      { find: /^@\/lib\/(.*)$/, replacement: resolve(__dirname, "./lib") + "/$1" },
      { find: /^@\/lib$/, replacement: resolve(__dirname, "./lib") },
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, ".") + "/$1" },
    ],
  },
});
