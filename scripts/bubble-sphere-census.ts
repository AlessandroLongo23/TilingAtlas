// HOW MANY SPHERICAL BUBBLE TILINGS ARE THERE? Counted, not searched.
//
// A bubble tiling decorates every edge with a BUMP on one side and a BITE on the other, and the
// matching rule — a bump must meet a bite — is then satisfied by construction. On the plane the hard
// part is finding the substrate, which is why the Euclidean boards are a DFS over vertex types. On the
// sphere the substrate is one of a fixed, finite list: the 28 k=1 boards the spherical shelf already
// ships. So there is nothing to search. A decoration IS a choice, per edge, of which of its two faces
// owns the bump, and the question is how many of the 2^E choices are distinct up to the solid's own
// symmetry — which is a Burnside sum over that group, exact and instant even where 2^E is 2^180.
//
// THE GROUP. A convex polyhedron's symmetry group is the automorphism group of its MAP (Whitney: a
// 3-connected planar graph has one embedding, so combinatorial automorphisms are the geometric ones).
// Computed here from the face rings alone, with no coordinates and no floating point: a map
// automorphism is a permutation of DARTS commuting with `twin` and with either `next` or its inverse,
// and it is pinned by the image of a single dart, so the whole group falls out of 2·(2E) candidates.
//
// THE BURNSIDE TERM is not 2^(edge cycles). A symmetry can carry an edge to itself while SWAPPING its
// two sides, and such an edge can hold no fixed decoration at all. Working on darts instead of edges
// makes that automatic: a decoration is a set of darts holding exactly one per edge, so a fixed one
// must be a union of dart cycles, no cycle may contain both darts of an edge (else 0), and otherwise
// the cycles pair up under `twin` with a free binary choice per pair — 2^(cycles/2).
//
//   pnpm tsx scripts/bubble-sphere-census.ts [solidId ...]
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import {
	byK, fixedDecorations, kDistribution, lowK, sphereAutomorphisms, sphereMapOf,
} from "@/lib/bubble/sphere";

/** The 28 boards the spherical shelf ships at k=1: 5 Platonic, 13 Archimedean, 5 prisms, 5 antiprisms. */
const BOARDS = [
	"tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron",
	"truncated-tetrahedron", "cuboctahedron", "truncated-cube", "truncated-octahedron",
	"rhombicuboctahedron", "truncated-cuboctahedron", "snub-cube", "icosidodecahedron",
	"truncated-dodecahedron", "truncated-icosahedron", "rhombicosidodecahedron",
	"truncated-icosidodecahedron", "snub-dodecahedron",
	"triangular-prism", "pentagonal-prism", "hexagonal-prism", "octagonal-prism", "decagonal-prism",
	"square-antiprism", "pentagonal-antiprism", "hexagonal-antiprism", "octagonal-antiprism",
	"decagonal-antiprism",
];

const CUTOFF = Number(process.env.KMAX ?? 3);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : BOARDS;
const rows: string[][] = [];
let total = 0n;
for (const id of wanted) {
	const p = polyhedronForId(id);
	if (!p) { console.error(`unknown solid: ${id}`); continue; }
	const m = sphereMapOf(p);
	if (m.vertices - m.edges + m.faces !== 2) throw new Error(`${id}: V-E+F = ${m.vertices - m.edges + m.faces}`);
	const aut = sphereAutomorphisms(m);
	// vertexMap asserts the induced vertex permutation exists, for every automorphism it is asked for.
	const rot = aut.filter((phi) => {
		for (let d = 0; d < m.darts; d++) if (phi[m.next[d]] !== m.next[phi[d]]) return false;
		return true;
	});
	const burnside = (g: Int32Array[]) =>
		g.reduce((s, phi) => s + fixedDecorations(m, phi), 0n) / BigInt(g.length);
	const all = burnside(aut);
	total += all;
	const lowReps = lowK(m, aut, CUTOFF);
	const low = lowReps && byK(lowReps);
	process.stderr.write(`  ${id}: E=${m.edges} |Aut|=${aut.length} all=${all} low=${low ? [...low].map(([k, r]) => `k${k}:${r.length}`).join(" ") : "CAP"}\n`);
	// Cross-check where full enumeration is affordable: the subgroup route and the brute-force route
	// must agree on every k they both see, or one of them is wrong.
	const bruteReps = kDistribution(m, aut);
	const brute = bruteReps && byK(bruteReps);
	if (brute && low) {
		const sum = bruteReps!.length;
		if (BigInt(sum) !== all) throw new Error(`${id}: enumeration ${sum} != Burnside ${all}`);
		for (let k = 1; k <= CUTOFF; k++)
			if ((brute.get(k)?.length ?? 0) !== (low.get(k)?.length ?? 0))
				throw new Error(`${id}: k=${k} brute ${brute.get(k)?.length ?? 0} != subgroup route ${low.get(k)?.length ?? 0}`);
	}
	rows.push([p.name ?? id, String(p.vertexConfig), String(m.edges), String(aut.length),
		all.toString(),
		...Array.from({ length: CUTOFF }, (_, i) => (low ? String(low.get(i + 1)?.length ?? 0) : "?")),
		brute ? "yes" : low ? "" : "CAP"]);
}
const head = ["solid", "vertex config", "E", "|Aut|", "all decorations",
	...Array.from({ length: CUTOFF }, (_, i) => `k=${i + 1}`), "brute-checked"];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r: string[]) => r.map((c, i) => (i < 2 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ");
console.log(line(head));
console.log(w.map((n) => "-".repeat(n)).join("  "));
for (const r of rows) console.log(line(r));
console.log(`\ntotal over ${rows.length} boards, up to symmetry: ${total.toString()}`);
