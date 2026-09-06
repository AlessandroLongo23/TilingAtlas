// Write the sph-tor-* and sph-gen<g>-* records into public/reference-atlas-spherical.json from the
// rows tools/ctrnact-oracle/gen_genus_shelf.py --emit measures. One shelf per genus, genus 1 upward.
//
// SURGICAL, like build-nonconvex-shelf.mjs: the genus rows are replaced in place and every other
// record is left byte-identical. Re-runnable while the search is still going, which is the point — the
// develop runs for hours and the shelf fills as its groups land.
//
//   python3 tools/ctrnact-oracle/genus_harvest.py
//   python3 tools/ctrnact-oracle/gen_genus_shelf.py --emit
//   node scripts/build-genus-shelf.mjs --write
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROWS = path.join(ROOT, "tools", "ctrnact-oracle", "genus-atlas-rows.json");
const HEMI = path.join(ROOT, "tools", "ctrnact-oracle", "hemi-atlas-rows.json");
const ATLAS = path.join(ROOT, "public", "reference-atlas-spherical.json");
const DISCOVERER = "Čtrnáct engine + develop_euclid, mixed closure, 2026-08-25";
// The hemipolyhedra are the one shelf here the engine did not find; gen_hemi_shelf.py constructs them
// from their parent vertex sets and verifies. The attribution says so instead of borrowing the engine's.
const HEMI_DISCOVERER = "Coxeter, Longuet-Higgins & Miller (1954); constructed and verified 2026-08-30";
const isGenus = (id) => id.startsWith("sph-tor-") || /^sph-gen\d+-/.test(id) || id.startsWith("sph-hemi-");

const write = process.argv.includes("--write");
const rows = JSON.parse(fs.readFileSync(ROWS, "utf8"));
const atlas = JSON.parse(fs.readFileSync(ATLAS, "utf8"));

// The note says what the record IS and what the shelf is NOT. A toroid has no circumsphere, necessarily,
// so that sentence is a theorem here and not the measurement it is on the non-convex shelf.
//
// ⚑ EMBEDDED vs SELF-INTERSECTING IS DELIBERATELY NOT ON THE CARD (AL, 2026-08-25), and this is the one
// place to record that it was a decision. It IS measured — toroid_harvest.py runs the shelf's own
// winding test on every record and toroid-rows.json carries the count — it is simply not surfaced while
// the shelf is still filling and every record found so far crosses itself. Restoring the sentence is a
// one-line change; do not do it without asking.
const note = (r) =>
	`${r.genus === 1 ? "Toroidal" : `Genus-${r.genus}`} regular-faced polyhedron: ${r.census}, ` +
	`${r.V} vertices, ${r.E} edges, ${r.F} faces, ${r.k} vertex orbits. Its surface has GENUS ${r.genus} ` +
	`— V − E + F = ${2 - 2 * r.genus}, where every other solid in this atlas closes at 2 — so some of ` +
	`its vertices are SADDLES, with face angles summing past 360°. ` +
	`That is why no earlier search could produce one: total angular defect is 2π·χ, so genus 1 is total ` +
	`defect zero and needs both signs, while the spherical closure admits only positive defect and the ` +
	`hyperbolic only negative. It has no circumsphere, which a surface of genus ≥ 1 cannot have. ⚑ This ` +
	`shelf is a FIND and not a ` +
	`census: the spherical search is finite because total defect 4π and a smallest positive defect of 6° ` +
	`cap V at 120, and at defect zero no such bound exists, so a deeper run can only add to it.`;

// A hemipolyhedron is a map on a ONE-SIDED surface in eight cases out of nine, so its note says which
// surface and not "genus g", and it says why no search here produced it.
const hemiNote = (r) =>
	`${r.name}: ${r.census}, ${r.V} vertices, ${r.E} edges, ${r.F} faces, one vertex orbit — a ` +
	`UNIFORM polyhedron, one of the 57 non-convex ones. Its ${r.hemi} faces are "hemi" faces: each ` +
	`passes through the CENTRE of the solid. That is what keeps it off the star shelf, which orders ` +
	`its records by density — how many times the solid covers its circumsphere — and a face through ` +
	`the centre makes that number undefined — which is why the six with all-convex faces file under ` +
	`"Regular polygons" at k = 1 and the three with a {n/d} face under "Star polyhedra" at k = 1, ` +
	`by face type. V − E + F = ${r.chi}, and the surface is ` +
	`${r.orientable ? "a TORUS — the only orientable hemipolyhedron" : `ONE-SIDED (non-orientable, ${2 - r.chi} crosscaps)`}. ` +
	`Its vertices are its parent quasiregular solid's and so do lie on a common sphere, but a hemi ` +
	`face projects radially to a great circle, so there is no spherical view. ⚑ No search in this repo ` +
	`produced it: every closure mode keys on the SIGN of a vertex's angular defect and all three ` +
	`exclude the flat vertex, which is exactly the octahemioctahedron's 3.6.3.6 (60+120+60+120 = 360°), ` +
	`and the genus harvest refuses a non-orientable record outright. The class is closed at nine, so ` +
	`it is constructed and verified rather than searched.`;

const hemiMade = JSON.parse(fs.readFileSync(HEMI, "utf8")).map((r) => ({
	id: `sph-${r.id}`,
	source: "spherical",
	k: r.k,
	family: r.vertexConfig,
	spherical: { solid: r.id, name: r.name },
	geometry: "spherical",
	discoverer: HEMI_DISCOVERER,
	note: hemiNote(r),
	renderCell: { b: [[1, 0], [0, 1]], i: [0, 0] },
	derivation: "tabulated",
}));

const made = hemiMade.concat(rows.map((r) => ({
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
})));

const byId = new Map(made.map((r) => [r.id, r]));
const kept = [];
let changed = 0, removed = 0;
for (const rec of atlas.records) {
	if (!isGenus(rec.id)) { kept.push(rec); continue; }
	const next = byId.get(rec.id);
	if (!next) { removed++; console.log(`  ⚠ REMOVED ${rec.id}`); continue; }
	// Merge, so a field this script does not own survives a rebuild.
	const merged = { ...rec, ...next };
	if (JSON.stringify(merged) !== JSON.stringify(rec)) changed++;
	kept.push(merged);
	byId.delete(rec.id);
}
const added = [...byId.values()];
const out = [...kept, ...added];
console.log(`genus rows: ${atlas.records.filter((r) => isGenus(r.id)).length} shipped -> ${made.length} built`);
console.log(`  added ${added.length}, changed ${changed}, removed ${removed}`);
if (!write) { console.log("(dry run — pass --write)"); process.exit(0); }
atlas.records = out;
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
console.log(`wrote public/reference-atlas-spherical.json — ${out.length} records`);
