// Builds the app from source: the window with Vite, the main process and preload with esbuild.
// `pnpm dist` then packages it with electron-builder (config in package.json).
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";

await vite({ configFile: new URL("./vite.config.mts", import.meta.url).pathname, logLevel: "warn" });
for (const entry of ["main", "preload"])
	await esbuild({
		entryPoints: [`electron/${entry}.ts`],
		outfile: `dist/${entry}.cjs`,
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "node22",
		external: ["electron"],
		logLevel: "warning",
	});
console.log("built dist/");
