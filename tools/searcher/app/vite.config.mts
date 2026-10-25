// The window: src/ plus the site's own components and tokens, imported from the repo root and not
// copied, so the app and the Tiling Atlas cannot drift apart. React, Tailwind and the rest resolve from
// the root's node_modules, the copies the site builds with.
import path from "node:path";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";

const repo = path.resolve(import.meta.dirname, "../../..");

export default defineConfig({
	root: path.join(import.meta.dirname, "src"),
	base: "./", // loaded from file:// inside the app
	build: {
		outDir: path.join(import.meta.dirname, "dist/renderer"),
		emptyOutDir: true,
		chunkSizeWarningLimit: 2000,
		rollupOptions: {
			// the site's "use client" markers mean nothing in a single-page bundle
			onwarn: (w, warn) => void (w.code === "MODULE_LEVEL_DIRECTIVE" || warn(w)),
		},
	},
	resolve: {
		alias: [
			// the button renders a Next <Link> for href props; the app has one page, so a plain <a> serves
			{ find: /^next\/link$/, replacement: path.join(import.meta.dirname, "src/shims/next-link.tsx") },
			{ find: /^@\/classes(\/|$)/, replacement: path.join(repo, "lib/classes") + "$1" },
			{ find: /^@\/stores(\/|$)/, replacement: path.join(repo, "lib/stores") + "$1" },
			{ find: /^@\/utils(\/|$)/, replacement: path.join(repo, "lib/utils") + "$1" },
			{ find: /^@\//, replacement: repo + "/" },
		],
		dedupe: ["react", "react-dom", "motion"],
	},
	// Tailwind's plugin, pinned to the site's version, inlines the stylesheet's @imports as the site's build does
	plugins: [tailwind()],
	server: { fs: { allow: [repo] } },
});
