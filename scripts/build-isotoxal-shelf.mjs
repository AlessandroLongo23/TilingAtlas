// The ISOTOXAL-STAR shelf's atlas records, from tools/ctrnact-oracle/isotoxal-atlas-rows.json.
//
// Same shape as build-genus-shelf.mjs, which is the template: read the generator's rows, build one
// record per solid, MERGE over what is already shipped so a field this script does not own survives a
// rebuild, and refuse to write without --write.
//
// Run: node scripts/build-isotoxal-shelf.mjs [--write]   (after gen_isotoxal_shelf.py --emit)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROWS = path.join(ROOT, "tools", "ctrnact-oracle", "isotoxal-atlas-rows.json");
const ATLAS = path.join(ROOT, "public", "reference-atlas-spherical.json");
const DISCOVERER = "Čtrnáct engine + develop_euclid, isotoxal palettes over the eleven D=120 outlines, 2026-08-31";
const isIso = (id) => id.startsWith("sph-iso-");
const write = process.argv.includes("--write");

const rows = JSON.parse(fs.readFileSync(ROWS, "utf8"));
const atlas = JSON.parse(fs.readFileSync(ATLAS, "utf8"));

const note = (r) =>
	`Polyhedron with ISOTOXAL STAR faces: ${r.census}, ${r.V} vertices, ${r.E} edges, ${r.F} faces, ` +
	`${r.k} vertex orbits. Its star faces are written "n*" and are NOT the {n/d} of the star shelf: ` +
	`a {5/2} is five sides that cross, drawn in one stroke, with one corner angle; a 5* is the simple ` +
	`TEN-gon that traces its outline, alternating a 36° point with a 252° reflex dent. Same drawing on ` +
	`the page, different polygon — and the Euclidean shelves of this atlas have tiled with the second ` +
	`kind all along. Every edge here is one length, as on every regular-faced shelf. ` +
	`V − E + F = ${r.chi}${r.chi === 2 ? "" : `, so this one is a surface of genus ${(2 - r.chi) / 2} and some of its vertices are SADDLES`}. ` +
	`${r.xings ? "It self-intersects." : "It is embedded."} ` +
	`⚑ A FIND AND NOT A CENSUS. The searches behind this shelf carry ONE star family each (plus one ` +
	`three-family run), so a solid whose faces mix two different star outlines could not appear in ` +
	`them at all; k is capped at 2, vertex valence at 6, and the developer declares two caps whose ` +
	`blocks are UNRESOLVED rather than empty. Every one of those is a direction a deeper run can only ` +
	`ADD along.`;

const made = rows.map((r) => ({
	id: `sph-${r.id}`,
	source: "spherical",
	k: r.k,
	family: r.vertexConfig,
	spherical: { solid: r.id, name: r.census },
	geometry: "spherical",
	discoverer: DISCOVERER,
	note: note(r),
	renderCell: { b: [[1, 0], [0, 1]], i: [0, 0] },
	derivation: "searched",
}));

const byId = new Map(made.map((r) => [r.id, r]));
const kept = [];
let changed = 0;
let removed = 0;
for (const rec of atlas.records) {
	if (!isIso(rec.id)) {
		kept.push(rec);
		continue;
	}
	const next = byId.get(rec.id);
	if (!next) {
		removed++;
		console.log(`  ⚠ REMOVED ${rec.id}`);
		continue;
	}
	const merged = { ...rec, ...next };
	if (JSON.stringify(merged) !== JSON.stringify(rec)) changed++;
	kept.push(merged);
	byId.delete(rec.id);
}
const added = [...byId.values()];
const out = [...kept, ...added];
console.log(`isotoxal rows: ${atlas.records.filter((r) => isIso(r.id)).length} shipped -> ${made.length} built`);
console.log(`  added ${added.length}, changed ${changed}, removed ${removed}`);
if (!write) {
	console.log("(dry run — pass --write)");
	process.exit(0);
}
atlas.records = out;
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
console.log(`wrote public/reference-atlas-spherical.json — ${out.length} records`);
