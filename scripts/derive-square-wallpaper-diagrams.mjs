#!/usr/bin/env node
// Derive the square-lattice cell diagram of a wallpaper group from its rectangular one.
//
// Why this exists. Commons draws square-lattice variants for pmm, pmg, pgg and cmm but not for pm
// and pg, even though both are realizable on a square lattice (LATTICE_REALIZABLE_GROUPS in
// lib/classes/symmetry/types.ts). A group's symmetry elements do not change when the cell
// specializes; only the cell proportions do. So the square diagram IS the rectangular diagram with
// the 540-wide cell narrowed to its 312 height.
//
// That this is the transform the original author used is not an assumption: `--check` regenerates
// pmm-square.svg from pmm.svg and diffs it against the file downloaded from Commons. Keep that
// passing before trusting any output here.
//
// The transform scales ABSOLUTE x coordinates by 312/540 and leaves everything else alone:
//   - marker glyphs (`points="0,-20 10,0 …"` under their own transform) are local shapes, so they
//     would deform under a plain scale() — only the translate() that places them moves;
//   - relative path segments (the lowercase `m`/`l` of the fundamental-domain corner mark) likewise
//     carry glyph shape, so only the leading absolute `M` moves.
//
// Usage: node scripts/derive-square-wallpaper-diagrams.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "wallpaper-groups");

const WIDE = 540;
const TALL = 312;
const K = TALL / WIDE;

/** Round the way the source files are written: integers stay integers. */
const sx = (x) => {
	const v = Number(x) * K;
	return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
};

function derive(src) {
	let s = src;

	// viewBox: "-25 -25 590 362" -> "-25 -25 362 362" (the 50px margin is not part of the cell).
	s = s.replace(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/, (_m, x, y, w, h) => {
		const width = Number(w) - WIDE + TALL;
		return `viewBox="${x} ${y} ${width} ${h}"`;
	});

	// `transform="… translate(X,Y) …"`: the placement of a group or a marker glyph. Scale x only.
	s = s.replace(/translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, (_m, x, y) => `translate(${sx(x)},${y})`);

	// Absolute path start of the fundamental-domain corner mark; the relative tail is glyph shape.
	s = s.replace(/d="M (-?[\d.]+) (-?[\d.]+)/g, (_m, x, y) => `d="M ${sx(x)} ${y}`);

	// <line> endpoints.
	s = s.replace(/\bx([12])="(-?[\d.]+)"/g, (_m, n, x) => `x${n}="${sx(x)}"`);

	// polygon points: cell outlines and fundamental-domain shapes. A polygon that carries its own
	// transform is a marker glyph drawn about its own origin — its points are shape, not position.
	s = s.replace(/<polygon\b[^>]*\/>/g, (tag) => {
		if (/\btransform=/.test(tag)) return tag;
		return tag.replace(
			/points="([^"]*)"/,
			(_m, pts) =>
				`points="${pts.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_p, x, y) => `${sx(x)},${y}`)}"`,
		);
	});

	return s;
}

const read = (name) => readFileSync(join(DIR, name), "utf8");

if (process.argv.includes("--check")) {
	// The Commons pmm-square.svg keeps the width/height attributes that fetch-wallpaper-diagrams.sh
	// strips from the wide originals, so normalise those away before comparing.
	const strip = (s) => s.replace(/\s+width="\d+cm"\s+height="\d+cm"/, "").trim();
	const got = strip(derive(read("pmm.svg")));
	const want = strip(read("pmm-square.svg"));
	if (got === want) {
		console.log("check: pmm.svg -> pmm-square.svg reproduced exactly");
		process.exit(0);
	}
	const g = got.split("\n");
	const w = want.split("\n");
	console.error("check FAILED — first differing lines:");
	for (let i = 0; i < Math.max(g.length, w.length); i++) {
		if (g[i] !== w[i]) {
			console.error(`  line ${i + 1}\n    derived: ${g[i]}\n    commons: ${w[i]}`);
			break;
		}
	}
	process.exit(1);
}

for (const group of ["pm", "pg"]) {
	const out = `${group}-square.svg`;
	writeFileSync(join(DIR, out), derive(read(`${group}.svg`)));
	console.log(`  ${out}  <-  ${group}.svg  (x scaled ${WIDE} -> ${TALL})`);
}
