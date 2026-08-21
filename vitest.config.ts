import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Several suites are CPU-bound exact-arithmetic / enumeration tests (fuzz, hyperbolic develop over
    // all shipped patches, freedraw combined-grid, oracle classification, the k=2 star solve) that
    // legitimately run tens of seconds. The default file parallelism oversubscribes this machine —
    // 10 logical cores but only 4 performance ones — so those suites fight for the fast cores, wall
    // time inflates several-fold, and whichever one loses the fight trips its timeout. WHICH one fails
    // then varies run to run, which is the signature of contention and not of a slow test.
    //
    // Two knobs, and the first is the actual fix. Capping the workers at the performance-core count
    // plus a little keeps the heavy suites from starving each other; the timeout is only the backstop
    // for when one still gets unlucky. Raising the timeout ALONE makes contention worse, because a
    // suite that used to die at 60 s and free its worker now holds it for the full run.
    maxWorkers: 6,
    testTimeout: 300_000,
    hookTimeout: 300_000,
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
