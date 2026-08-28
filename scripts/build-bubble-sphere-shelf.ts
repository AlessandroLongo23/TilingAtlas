// Build public/bubble-sphere/*.json — the spherical bubble boards.
//
// COVERAGE, and why it differs per board (AL, 2026-08-27). The 28 solids carry 1.277e52 decorations
// between them, so "all of them" is not a shelf. But the small boards ARE finite and small — the
// tetrahedron has four — and truncating those to low k would throw away a complete catalogue for
// nothing. So the rule is uniform even though the cutoff is not: a board ships COMPLETE where its
// total fits under COMPLETE_UNDER, and its k <= KMAX slice otherwise. That is already the convention
// this shelf's Euclidean sibling follows — triangle stops at k=4, square and hexagon at k=5, the mixed
// boards at k=3 — so per-board coverage is the existing practice and not an exception invented here.
//
// A record is a solid id and one bit per half-edge. Nothing geometric ships: the face rings come from
// the solid catalogue through sphereMapOf, so the whole shelf is a few MB where the coordinates would
// have been hundreds.
//
//   pnpm tsx scripts/build-bubble-sphere-shelf.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { biteWords, byK, kDistribution, lowK, sphereAutomorphisms, sphereMapOf } from "@/lib/bubble/sphere";

const COMPLETE_UNDER = 20_000;
const KMAX = 3;
const OUT = `${process.cwd()}/public/bubble-sphere`;

/** id prefix per board — short, stable, and unique across the atlas. */
const BOARDS: [string, string][] = [
	["tetrahedron", "sbtet"], ["cube", "sbcub"], ["octahedron", "sboct"],
	["dodecahedron", "sbdod"], ["icosahedron", "sbico"],
	["truncated-tetrahedron", "sbttet"], ["cuboctahedron", "sbco"], ["truncated-cube", "sbtcub"],
	["truncated-octahedron", "sbtoct"], ["rhombicuboctahedron", "sbrco"],
	["truncated-cuboctahedron", "sbtco"], ["snub-cube", "sbscub"], ["icosidodecahedron", "sbid"],
	["truncated-dodecahedron", "sbtdod"], ["truncated-icosahedron", "sbtico"],
	["rhombicosidodecahedron", "sbrid"], ["truncated-icosidodecahedron", "sbtid"],
	["snub-dodecahedron", "sbsdod"],
	["triangular-prism", "sbp3"], ["pentagonal-prism", "sbp5"], ["hexagonal-prism", "sbp6"],
	["octagonal-prism", "sbp8"], ["decagonal-prism", "sbp10"],
	["square-antiprism", "sba4"], ["pentagonal-antiprism", "sba5"], ["hexagonal-antiprism", "sba6"],
	["octagonal-antiprism", "sba8"], ["decagonal-antiprism", "sba10"],
];

mkdirSync(OUT, { recursive: true });
const manifest: { solid: string; coverage: "complete" | string; total: string; shards: string[] }[] = [];
let rows = 0;
for (const [solid, prefix] of BOARDS) {
	const poly = polyhedronForId(solid);
	if (!poly) throw new Error(`unknown solid ${solid}`);
	const m = sphereMapOf(poly);
	const aut = sphereAutomorphisms(m);
	// Burnside for the total — the number that decides whether this board can ship complete at all.
	const total = aut.reduce((s, phi) => {
		const seen = new Uint8Array(m.darts);
		let cycles = 0;
		for (let a = 0; a < m.darts; a++) {
			if (seen[a]) continue;
			cycles++;
			const members = new Set<number>();
			for (let d = a; !seen[d]; d = phi[d]) { seen[d] = 1; members.add(d); }
			for (const d of members) if (members.has(m.twin[d])) return s;
		}
		return s + (1n << BigInt(cycles / 2));
	}, 0n) / BigInt(aut.length);

	const complete = total <= BigInt(COMPLETE_UNDER);
	const reps = complete ? kDistribution(m, aut) : lowK(m, aut, KMAX);
	if (!reps) throw new Error(`${solid}: neither route returned representatives`);
	if (complete && BigInt(reps.length) !== total) throw new Error(`${solid}: ${reps.length} != Burnside ${total}`);

	const shards: string[] = [];
	for (const [k, group] of [...byK(reps)].sort((a, b) => a[0] - b[0])) {
		const recs = group
			.map((r, i) => ({ id: `${prefix}-${k}-${String(i + 1).padStart(5, "0")}`, k, solid, bites: biteWords(m, r.mask) }))
			.sort((a, b) => a.id.localeCompare(b.id));
		const name = `${prefix}-k${k}.json`;
		writeFileSync(`${OUT}/${name}`, JSON.stringify(recs));
		shards.push(name);
		rows += recs.length;
	}
	manifest.push({ solid, coverage: complete ? "complete" : `k<=${KMAX}`, total: total.toString(), shards });
	console.log(`${solid.padEnd(28)} ${complete ? "complete" : `k<=${KMAX}`.padEnd(8)}  total ${total.toString().padStart(12)}  shipped ${String(reps.length).padStart(6)}  ${shards.length} shard(s)`);
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`\n${rows} records across ${manifest.length} boards -> ${OUT}`);
