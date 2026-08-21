// Rewrite the sph-ncx-* records in public/reference-atlas-spherical.json from the measured rows that
// tools/ctrnact-oracle/gen_nonconvex_shelf.py emits.
//
// The shelf's TS geometry (lib/render/nonconvexSolids.ts) and its ATLAS ROWS are two different artefacts
// and only the first was regenerable: the rows went in by hand the first time, which is why adding the
// k=3 search meant reconstructing what the note text had said. Both come from nonconvex-rows.json now.
//
// Every record here routes on `spherical.solid`, so it carries no geometry of its own — the id is the
// join to NONCONVEX_SOLIDS and the renderCell is the identity board every spherical record uses.
//
// SURGICAL, not a rewrite of the file: the ncx rows are replaced in place and every other record —
// Platonic, Archimedean, prism, Johnson — is left exactly as it was, byte for byte where unchanged.
//
//   node scripts/build-nonconvex-shelf.mjs            # report only
//   node scripts/build-nonconvex-shelf.mjs --write
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ROWS = path.join(ROOT, "tools", "ctrnact-oracle", "nonconvex-rows.json");
const ATLAS = path.join(ROOT, "public", "reference-atlas-spherical.json");
const DISCOVERER = "Čtrnáct engine + develop_euclid, 2026-08-21";

// The identity board. Spherical records are placed by their solid, not by a translation cell, so this is
// the same two basis vectors for all of them; it exists because the reader expects the field.
const RENDER_CELL = { b: [[1, 0], [0, 1]], i: [0, 0] };

/** The card text. One sentence of measurement, then why the solid has no name, because a reader landing
 *  on "20{3} + 2{5}" deserves to know that the blank is deliberate and not an omission. */
function note(r) {
	const crossing = r.xings
		? "It SELF-INTERSECTS — a face edge passes through the interior of a face it shares no vertex with"
		: "It is EMBEDDED — no face passes through another";
	const sphere = r.inscribed
		? ", and unusually for this shelf it HAS a circumsphere, so it can also be drawn as a tiling of the sphere"
		: ", and it has no circumsphere — which is why the spherical developer could never see it, and why it took solving for dihedral angles in R3 to find";
	return (
		`Non-convex regular-faced polyhedron: ${r.census}, ${r.V} vertices, ${r.E} edges, ${r.F} faces, ` +
		`${r.k} vertex orbits. ${crossing}${sphere}. It ships unnamed: Johnson's 92 and Zalgaller's ` +
		`completeness proof are for CONVEX regular-faced polyhedra, past convexity only the 57 non-convex ` +
		`UNIFORM polyhedra are enumerated, and there is no catalogue a name could be checked against.`
	);
}

const rows = JSON.parse(fs.readFileSync(ROWS, "utf8"));
const atlas = JSON.parse(fs.readFileSync(ATLAS, "utf8"));
if (!Array.isArray(atlas.records)) throw new Error("atlas is not {atlas, geom, records}");

const built = rows.map((r) => ({
	id: `sph-${r.id}`,
	source: "spherical",
	k: r.k,
	family: r.vertexConfig,
	spherical: { solid: r.id },
	geometry: "spherical",
	discoverer: DISCOVERER,
	note: note(r),
	renderCell: RENDER_CELL,
}));

const before = atlas.records.filter((x) => x.id.startsWith("sph-ncx-"));
const others = atlas.records.filter((x) => !x.id.startsWith("sph-ncx-"));
const seen = new Map(before.map((x) => [x.id, x]));
const added = built.filter((x) => !seen.has(x.id));
const gone = before.filter((x) => !built.some((y) => y.id === x.id));
const changed = built.filter((x) => {
	const old = seen.get(x.id);
	return old && JSON.stringify(old) !== JSON.stringify(x);
});

console.log(`ncx rows: ${before.length} shipped -> ${built.length} built`);
console.log(`  added ${added.length}, changed ${changed.length}, removed ${gone.length}`);
for (const x of gone) console.log(`  ⚠ REMOVED ${x.id} — a shipped id disappeared, which breaks a permalink`);
for (const x of changed.slice(0, 5)) console.log(`  changed ${x.id}`);

if (!process.argv.includes("--write")) {
	console.log("(dry run — pass --write)");
	process.exit(0);
}
// Keep the ncx block where it was: after everything else, in the generator's order.
atlas.records = [...others, ...built];
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
console.log(`wrote ${path.relative(ROOT, ATLAS)} — ${atlas.records.length} records`);
