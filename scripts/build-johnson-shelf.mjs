// Give every Johnson solid in lib/render/johnsonSolids.ts an atlas record, if it does not have one.
//
// The TS table and the atlas rows are two artefacts and the rows kept going in by hand, once per search:
// k=2, then k=3, then k=4. This is the same fix scripts/build-nonconvex-shelf.mjs made for the
// non-convex shelf, and for the same reason — a shelf you cannot rebuild is a shelf you cannot check.
//
// ⚑ ADDITIVE ONLY. It writes records for solids that have none and NEVER touches an existing one. The
// records already shipped carry provenance sentences that differ by how the solid was found — some by
// develop_spherical on S², some by develop_euclid, some by gyrating a rhombicosidodecahedron — and
// regenerating them from one template would flatten that into a plausible-sounding uniform lie.
//
//   node scripts/build-johnson-shelf.mjs            # report only
//   node scripts/build-johnson-shelf.mjs --write [--k 4]
//
// Run annotate_derivation.py afterwards: this does not write the `derivation` field.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TS = path.join(ROOT, "lib", "render", "johnsonSolids.ts");
const ATLAS = path.join(ROOT, "public", "reference-atlas-spherical.json");
const RENDER_CELL = { b: [[1, 0], [0, 1]], i: [0, 0] };

const kArg = process.argv.indexOf("--k");
const K = kArg > -1 ? Number(process.argv[kArg + 1]) : 4;

/** id, name, vertexConfig and the face census out of each `export const` block in the TS table. */
function solidsFromTs() {
	const src = fs.readFileSync(TS, "utf8");
	const out = [];
	for (const block of src.split("\nexport const ").slice(1)) {
		const id = block.match(/id:\s*"([\w-]+)"/)?.[1];
		const name = block.match(/name:\s*"([^"]+)"/)?.[1];
		const vc = block.match(/vertexConfig:\s*"([^"]+)"/)?.[1];
		const vBlock = block.match(/vertices:\s*\[([\s\S]*?)\n\t\]/)?.[1];
		const fBlock = block.match(/faces:\s*\[([\s\S]*?)\n\t\]/)?.[1];
		if (!id || !name || !vc || !vBlock || !fBlock) continue;
		const V = (vBlock.match(/\[/g) ?? []).length;
		const faces = [...fBlock.matchAll(/\[([\d,\s]+)\]/g)].map((m) => m[1].split(",").length);
		const census = new Map();
		for (const n of faces) census.set(n, (census.get(n) ?? 0) + 1);
		out.push({
			id,
			name,
			vc,
			V,
			F: faces.length,
			E: faces.reduce((a, b) => a + b, 0) / 2,
			census: [...census.keys()].sort((a, b) => a - b).map((n) => `${census.get(n)}{${n}}`).join(", "),
			// The vertex configuration lists one word per ORBIT, so counting them counts k. It is the
			// same number develop_euclid searched at, carried in the only field that already holds it.
			k: vc.split(" + ").length,
		});
	}
	return out;
}

function note(s) {
	const j = s.name.match(/\(J(\d+)\)/)?.[1];
	return (
		`${s.name.replace(/\s*\(J\d+\)/, "")} (Johnson solid J${j}): ${s.census}, ${s.V} vertices, ` +
		`${s.E} edges, ${s.F} faces. Found by develop_euclid at k = ${s.k} — ${s.k} vertex orbits — the ` +
		`same exhaustive search that gave the 2-orbit Johnson solids, run deeper. That it is one of the ` +
		`92 is Zalgaller's theorem, not an inference from the census: a convex polyhedron with regular ` +
		`faces is Platonic, Archimedean, a prism, an antiprism or a Johnson solid, and none of those is ` +
		`uniform.`
	);
}

const atlas = JSON.parse(fs.readFileSync(ATLAS, "utf8"));
if (!Array.isArray(atlas.records)) throw new Error("atlas is not {atlas, geom, records}");
const have = new Set(atlas.records.map((r) => r.id));

const missing = solidsFromTs().filter((s) => !have.has(`sph-${s.id}`));
console.log(`johnson solids in the TS table with no atlas record: ${missing.length}`);
for (const s of missing) {
	console.log(`  ${s.name.padEnd(44)} k=${s.k}  V=${s.V} E=${s.E} F=${s.F}  ${s.census}`);
}
const wrongK = missing.filter((s) => s.k !== K);
for (const s of wrongK) console.log(`  ⚠ ${s.id}: vertexConfig says k=${s.k}, run was k=${K}`);

if (!missing.length) {
	console.log("nothing to add");
	process.exit(0);
}
if (!process.argv.includes("--write")) {
	console.log("(dry run — pass --write)");
	process.exit(0);
}
// Before the ncx block, so the non-convex rows stay last where build-nonconvex-shelf.mjs puts them.
const ncx = atlas.records.filter((r) => r.id.startsWith("sph-ncx-"));
const rest = atlas.records.filter((r) => !r.id.startsWith("sph-ncx-"));
atlas.records = [
	...rest,
	...missing.map((s) => ({
		id: `sph-${s.id}`,
		source: "spherical",
		k: s.k,
		family: s.vc,
		spherical: { solid: s.id },
		geometry: "spherical",
		discoverer: "Norman Johnson (1966)",
		note: note(s),
		renderCell: RENDER_CELL,
	})),
	...ncx,
];
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
console.log(`wrote ${path.relative(ROOT, ATLAS)} — ${atlas.records.length} records (+${missing.length})`);
