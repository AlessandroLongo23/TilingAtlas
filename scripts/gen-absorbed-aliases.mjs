#!/usr/bin/env node
// Absorbed-id redirects, derived from what a built shelf SAYS it absorbed.
//
// Why this exists. The mixed shelf has TWO absorption mechanisms and only one of them used to leave a
// trail a link could follow:
//
//   * `scripts/build-mixed-atlas.ts` merges families as it builds and writes the full geometric redirect
//     into mergedFamilyAliases.json / coupledFamilyAliases.json — id AND the angle carried across.
//   * `scripts/shelf-dedup.py` runs downstream, on the BUILT shelf, and drops any entry contained in
//     another. It records the absorption on the survivor (`absorbs: [...]`, plus a note) but writes no
//     alias, because the containment test it decides on does not produce the parameter map.
//
// So after a dedup pass every id the second mechanism dropped resolved to nothing. That was 5 ids on the
// 2026-08 mixed rebuild (k2-03, -37, -39, -56, -58), each a 1-D slice of a coupled survivor, each a live
// deep link before it. This script closes that by reading `absorbs` off the shipped shelf.
//
// WHAT IT DELIBERATELY DOES NOT DO: carry the angle. A coupled redirect needs the slice's seat in the
// survivor's region (`deltaUnits`, `axisUnits`), which is the builder's geometry and is not recoverable
// from the containment verdict. Guessing it would land the viewer at a WRONG member of the right family
// — silently, which is worse than the honest behaviour here: redirect the id, drop the stale angle, and
// let the survivor open at its own default. resolveMergedFamilyKey() applies the geometric tables first,
// so an id that has a real redirect never reaches this one.
//
// Run after any shelf-dedup pass:
//   node scripts/gen-absorbed-aliases.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "lib", "services", "absorbedFamilyAliases.json");

// Every shelf whose builder can be followed by shelf-dedup.py. A shelf with no `absorbs` anywhere costs
// one read and contributes nothing, so listing a shelf here early is free.
const SHELVES = ["mixed", "period", "isotoxal", "composable"];

const entriesOf = (file) => {
	const d = JSON.parse(fs.readFileSync(file, "utf8"));
	return Array.isArray(d) ? d : (d.tilings || Object.values(d).find(Array.isArray) || []);
};

const map = {};
let shards = 0;
for (const shelf of SHELVES) {
	const re = new RegExp(`^reference-atlas-${shelf}(-k\\d+)?\\.json$`);
	for (const f of fs.readdirSync(path.join(ROOT, "public")).sort()) {
		if (!re.test(f)) continue;
		shards++;
		for (const t of entriesOf(path.join(ROOT, "public", f))) {
			for (const gone of t.absorbs ?? []) {
				if (map[gone] && map[gone] !== t.id) {
					throw new Error(`${gone} is absorbed by both ${map[gone]} and ${t.id} — the shelf is inconsistent`);
				}
				map[gone] = t.id;
			}
		}
	}
}

// An absorbed id must not also be a live entry: that would mean the shelf ships it AND redirects it.
const live = new Set();
for (const shelf of SHELVES) {
	const re = new RegExp(`^reference-atlas-${shelf}(-k\\d+)?\\.json$`);
	for (const f of fs.readdirSync(path.join(ROOT, "public"))) {
		if (re.test(f)) for (const t of entriesOf(path.join(ROOT, "public", f))) live.add(t.id);
	}
}
const contradictions = Object.keys(map).filter((id) => live.has(id));
if (contradictions.length) {
	throw new Error(`absorbed but still shipped: ${contradictions.join(", ")}`);
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${Object.keys(sorted).length} absorbed ids across ${shards} shard(s) -> ${path.relative(ROOT, OUT)}`);
