#!/usr/bin/env node
/**
 * Phase 1.6 follow-up: rewrite the 4 class files that read from Svelte writable
 * stores via `get(...)`. Rewrites line-by-line for robustness.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const CONFIG_KEYS = new Set([
	"lineWidth",
	"showDualConnections",
	"controls",
	"liveChartMode",
	"islamicAngle",
	"isIslamic",
	"colorParams",
]);

const FILES = [
	"lib/classes/Tiling.ts",
	"lib/classes/polygons/Polygon.ts",
	"lib/classes/polygons/StarPolygon.ts",
	"lib/classes/polygons/DualPolygon.ts",
];

function splitStoreImport(line) {
	// Matches e.g. import { a, b, c } from '@/stores';
	const m = line.match(/^(\s*)import\s*\{([^}]+)\}\s*from\s*['"]@\/stores['"]\s*;?\s*$/);
	if (!m) return null;
	const indent = m[1];
	const names = m[2].split(",").map((s) => s.trim()).filter(Boolean);
	const lines = [];
	if (names.includes("tolerance")) {
		lines.push(`${indent}import { tolerance } from "@/utils/tolerance";`);
	}
	const remaining = names.filter((n) => n !== "tolerance" && !CONFIG_KEYS.has(n));
	if (remaining.length) {
		lines.push(`${indent}import { ${remaining.join(", ")} } from "@/stores";`);
	}
	if (names.some((n) => CONFIG_KEYS.has(n))) {
		lines.push(`${indent}import { useConfiguration } from "@/stores/configuration";`);
	}
	return lines.join("\n");
}

function transform(src) {
	const bannerStripped = src.replace(
		/^\/\/ TODO\(phase-1\.6\):[\s\S]*?(?:\r?\n){2,}/m,
		"",
	);
	const outLines = [];
	for (const line of bannerStripped.split(/\r?\n/)) {
		// Drop `import { get } from 'svelte/store'`
		if (/^\s*import\s*\{\s*get\s*\}\s*from\s*['"]svelte\/store['"]\s*;?\s*$/.test(line)) {
			continue;
		}
		// Split @/stores imports
		const split = splitStoreImport(line);
		if (split !== null) {
			outLines.push(split);
			continue;
		}
		outLines.push(line);
	}
	let out = outLines.join("\n");
	// Rewrite get(NAME) for config keys
	for (const key of CONFIG_KEYS) {
		const re = new RegExp(`\\bget\\(${key}\\)`, "g");
		out = out.replace(re, `useConfiguration.getState().${key}`);
	}
	// get(tolerance) → tolerance
	out = out.replace(/\bget\(tolerance\)/g, "tolerance");
	return out;
}

async function main() {
	for (const rel of FILES) {
		const full = path.resolve(rel);
		const src = await fs.readFile(full, "utf8");
		const out = transform(src);
		if (src !== out) {
			await fs.writeFile(full, out);
			console.log(`patched: ${rel}`);
		} else {
			console.log(`(no change): ${rel}`);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
