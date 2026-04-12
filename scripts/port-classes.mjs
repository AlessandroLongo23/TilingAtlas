#!/usr/bin/env node
/**
 * One-off port script: copies src/lib/classes from the sibling TilingAtlas (SvelteKit)
 * repo into lib/classes here, rewriting imports to match the Next.js project layout.
 *
 * Transformations per file:
 *   - Rename *.svelte.ts → *.ts
 *   - Rewrite bare `from '$classes'` / `$stores` / `$utils` / `$lib` → `@/...`
 *   - Strip trailing `.svelte` from relative import paths
 *   - Flag files using `svelte/store.get` with a TODO banner (Phase 1.6 follow-up)
 *   - Rewrite `from '$classes/TilingChecker.svelte'` and friends → drop `.svelte`
 *
 * Run once via: `node scripts/port-classes.mjs`
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve("../TilingAtlas/src/lib/classes");
const DST_ROOT = path.resolve("./lib/classes");

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) files.push(...(await walk(full)));
		else files.push(full);
	}
	return files;
}

function rewriteContent(src, relPath) {
	let out = src;

	// Rewrite path aliases
	out = out.replace(/from\s+(['"])\$classes(['"])/g, "from $1@/classes$2");
	out = out.replace(/from\s+(['"])\$classes\//g, "from $1@/classes/");
	out = out.replace(/from\s+(['"])\$stores(['"])/g, "from $1@/stores$2");
	out = out.replace(/from\s+(['"])\$stores\//g, "from $1@/stores/");
	out = out.replace(/from\s+(['"])\$utils(['"])/g, "from $1@/utils$2");
	out = out.replace(/from\s+(['"])\$utils\//g, "from $1@/utils/");
	out = out.replace(/from\s+(['"])\$lib\//g, "from $1@/lib/");
	out = out.replace(/from\s+(['"])\$lib(['"])/g, "from $1@/lib$2");
	out = out.replace(/from\s+(['"])\$services\//g, "from $1@/services/");
	out = out.replace(/from\s+(['"])\$services(['"])/g, "from $1@/services$2");
	out = out.replace(/from\s+(['"])\$components\//g, "from $1@/components/");

	// Strip `.svelte` from import paths, e.g. `./Foo.svelte` → `./Foo`
	out = out.replace(/from\s+(['"])([^'"]+?)\.svelte(['"])/g, "from $1$2$3");

	// Fix tolerance imports
	out = out.replace(
		/from\s+(['"])@\/lib\/stores\/constants(['"])/g,
		"from $1@/utils/tolerance$2",
	);
	out = out.replace(
		/from\s+(['"])@\/utils\/geoTolerance(['"])/g,
		"from $1@/utils/tolerance$2",
	);

	// Flag svelte/store usage
	const usesSvelteStore = /from\s+['"]svelte\/store['"]/.test(out);
	if (usesSvelteStore) {
		const banner = [
			"// TODO(phase-1.6): this file reads from Svelte writable stores via `get()`.",
			"// Rewrite these calls to use Zustand store selectors after stores are ported.",
			"// The imports below are intentionally broken until then.",
			"",
		].join("\n");
		out = banner + out;
	}

	return { out, usesSvelteStore };
}

function dstPathFor(srcPath) {
	const rel = path.relative(SRC_ROOT, srcPath);
	const renamed = rel.replace(/\.svelte\.ts$/, ".ts");
	return path.join(DST_ROOT, renamed);
}

async function main() {
	const files = await walk(SRC_ROOT);
	const flagged = [];
	let copied = 0;

	for (const src of files) {
		const dst = dstPathFor(src);
		const content = await fs.readFile(src, "utf8");
		const { out, usesSvelteStore } = rewriteContent(content, src);
		await fs.mkdir(path.dirname(dst), { recursive: true });
		await fs.writeFile(dst, out);
		copied++;
		if (usesSvelteStore) flagged.push(path.relative(DST_ROOT, dst));
	}

	console.log(`Copied ${copied} files to ${DST_ROOT}`);
	if (flagged.length) {
		console.log("\nFiles flagged for Phase 1.6 (use svelte/store.get):");
		for (const f of flagged) console.log(`  - ${f}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
