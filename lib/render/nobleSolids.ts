// THE NOBLE POLYHEDRA: vertex-transitive and face-transitive at once, faces of any planar shape.
//
// Connor Hill, "The complete set of noble polyhedra", arXiv:2607.28711 (2026): two infinite families,
// the disphenoids and the stephanoids, and exactly 146 others. This is the first shelf in the atlas whose
// faces are NOT regular polygons; docs/POLYHEDRON_COVERAGE.md records why that line moved.
//
// NOTHING HERE IS A COORDINATE LIST. A noble polyhedron is one orbit of a point group, so a record is
// three things: the group, the orbit's position, and ONE face. The vertices are the group applied to a
// seed point and the faces are the group applied to that face, both regenerated here on first use.
//
//   position   Hill's parametrisation of each orbit type (his Table 1): the seed is a fixed formula in
//              one or two parameters a, b, and a noble polyhedron exists only where a and b are roots of
//              the minimal polynomials his Appendix B lists. lib/render/nobleData.ts carries each root to
//              double precision BESIDE its polynomial, and tests/noble-solids.test.ts evaluates one at
//              the other, so the exactness is checkable from this repo alone.
//   one face   vertex indices into the orbit in the order `orbit` below produces it. This is the one
//              thing taken from Hill's enumeration and not derivable from the paper's tables: which
//              cycle of the orbit is a face. scripts/build-noble-shelf.ts reads it off his models and
//              checks the regenerated solid against them, vertex for vertex and face for face.
//
// The two infinite families are functions of their parameters, further down, and /play drives them live.

import type { Polyhedron, Vec3 } from "./platonicSolids";
import { NOBLE_ORBITS, NOBLE_SOLIDS, type NobleGroup } from "./nobleData";
import { faceOutline, isConvexRing, isRegularRing } from "./planarFill";

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;

/** Seed point of each orbit type that carries a noble polyhedron, in Hill's coordinates. */
export const NOBLE_SEED: Record<string, (a: number, b: number) => Vec3> = {
	T: () => [-R2 / 2, R2 / 2, R2 / 2],
	O: () => [0, 0, R2],
	C: () => [1, 1, 1],
	I: () => [0, 1, PHI],
	ID: () => [0, 0, 2 * PHI],
	D: () => [1, 0, PHI * PHI],
	tO: (a) => [0, R2 * a, R2 * a + R2],
	tC: (a) => [a, a + R2, a + R2],
	rC: (a) => [a, a, a + R2],
	tI: (a) => [0, a, PHI * a + 2 * PHI],
	tD: (a) => [a, 0, PHI * PHI * a + 2 * PHI],
	rD: (a) => [a, 1, PHI * PHI * a + PHI],
	sC: (a, b) => [a, a + R2 * b, a + R2 * b + R2],
	gC: (a, b) => [a, a + R2 * b, a + R2 * b + R2],
	sD: (a, b) => [a, b, PHI * PHI * a + PHI * b + 2 * PHI],
	gD: (a, b) => [a, b, PHI * PHI * a + PHI * b + 2 * PHI],
};

// ---- point groups, as 3x3 matrices in row-major order ---------------------------------------------

type M3 = number[];
const mul = (A: M3, B: M3): M3 => {
	const C = new Array<number>(9);
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
	return C;
};
const apply = (m: M3, v: Vec3): Vec3 => [
	m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
	m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
	m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** Every product of the generators, breadth-first, so the order is the same on every machine. */
function closure(gens: M3[]): M3[] {
	const key = (m: M3) => m.map((x) => Math.round(x * 1e6)).join(",");
	const out: M3[] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
	const seen = new Set([key(out[0])]);
	for (let i = 0; i < out.length; i++) {
		for (const g of gens) {
			const m = mul(g, out[i]);
			const k = key(m);
			if (!seen.has(k)) {
				seen.add(k);
				out.push(m);
			}
		}
	}
	return out;
}

const C3: M3 = [0, 1, 0, 0, 0, 1, 1, 0, 0]; // about (1,1,1)
const C2: M3 = [-1, 0, 0, 0, -1, 0, 0, 0, 1]; // about z
const C4: M3 = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // about z
const SWAP: M3 = [0, 1, 0, 1, 0, 0, 0, 0, 1]; // the mirror x = y
const INV: M3 = [-1, 0, 0, 0, -1, 0, 0, 0, -1];
// A fifth of a turn about (0, 1, phi), a vertex of the icosahedron in the frame the seeds are written in.
const C5: M3 = (() => {
	const l = Math.hypot(1, PHI);
	const [x, y, z] = [0, 1 / l, PHI / l];
	const c = Math.cos((2 * Math.PI) / 5);
	const s = Math.sin((2 * Math.PI) / 5);
	const t = 1 - c;
	return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
})();

const GENERATORS: Record<NobleGroup, M3[]> = {
	Td: [C3, C2, SWAP],
	O: [C3, C4],
	Oh: [C3, C4, INV],
	I: [C3, C2, C5],
	Ih: [C3, C2, C5, INV],
};
const GROUPS = new Map<NobleGroup, M3[]>();
export function nobleGroup(id: NobleGroup): M3[] {
	let g = GROUPS.get(id);
	if (!g) GROUPS.set(id, (g = closure(GENERATORS[id])));
	return g;
}

/**
 * A face as a CYCLE, whichever vertex it starts at and whichever way round it is read.
 *
 * ⚑ Not its vertex set. A mirror can carry a face onto the same vertices joined in a different order,
 * which is a different polygon, and keying on the set calls the two one face. That is how tI-5.6 and
 * rD-5.7, which are chiral, were briefly regenerated under the full icosahedral group with half their
 * faces replaced by their mirror images: every vertex set matched and the solid was not a polyhedron.
 */
export function cycleKey(f: readonly number[]): string {
	const n = f.length;
	const s = f.indexOf(Math.min(...f));
	const fwd = f.map((_, k) => f[(s + k) % n]);
	const back = f.map((_, k) => f[(s - k + n) % n]);
	return (fwd[1] < back[1] ? fwd : back).join(",");
}

/**
 * The orbit of `seed`, each point once, in group order; and the orbit of `face` under the same group,
 * each face once. `face` indexes the vertex list this returns.
 */
export function nobleOrbit(group: NobleGroup, seed: Vec3, face: readonly number[]): { vertices: Vec3[]; faces: number[][] } {
	const G = nobleGroup(group);
	const scale = 1e6 / Math.hypot(seed[0], seed[1], seed[2]);
	const key = (v: Vec3) => `${Math.round(v[0] * scale)},${Math.round(v[1] * scale)},${Math.round(v[2] * scale)}`;
	const index = new Map<string, number>();
	const vertices: Vec3[] = [];
	for (const g of G) {
		const p = apply(g, seed);
		const k = key(p);
		if (!index.has(k)) {
			index.set(k, vertices.length);
			vertices.push(p);
		}
	}
	const seen = new Set<string>();
	const faces: number[][] = [];
	for (const g of G) {
		const img = face.map((i) => index.get(key(apply(g, vertices[i]))) ?? -1);
		const k = cycleKey(img);
		if (!seen.has(k)) {
			seen.add(k);
			faces.push(img);
		}
	}
	return { vertices, faces };
}

/** "tI-5.1" -> "noble-ti-5-1". Lower-casing is injective on Hill's sixteen orbit-type names. */
export const nobleId = (symbol: string) => `noble-${symbol.toLowerCase().replace(".", "-")}`;

/** The seed of a symbol's orbit: "gD-19.1" sits on orbit "gD-19" of type "gD". */
export function nobleSeed(symbol: string): Vec3 {
	const type = symbol.split("-")[0];
	const [a, , b] = NOBLE_ORBITS[symbol.replace(/\.\d+$/, "")] ?? [0, "", 0];
	return NOBLE_SEED[type](a, b ?? 0);
}

function solid(id: string, name: string, vertices: Vec3[], faces: number[][]): Polyhedron {
	let far = 0;
	for (const v of vertices) far = Math.max(far, Math.hypot(v[0], v[1], v[2]));
	const p = faces[0].length;
	const q = faces.reduce((n, f) => n + (f.includes(0) ? 1 : 0), 0);
	return {
		id,
		schlafli: [p, q],
		vertexConfig: Array(q).fill(p).join("."),
		name,
		vertices: vertices.map((v) => [v[0] / far, v[1] / far, v[2] / far] as Vec3),
		faces,
	};
}

const BY_ID = new Map(NOBLE_SOLIDS.map((r) => [nobleId(r[0]), r]));
const BUILT = new Map<string, Polyhedron>();

/** Every listed noble polyhedron's id, in Hill's order. The parametric families are not in this list. */
export const NOBLE_IDS: string[] = NOBLE_SOLIDS.map((r) => nobleId(r[0]));

/** A listed noble polyhedron, or a family at its default parameters; null for any other id. */
export function nobleSolid(id: string): Polyhedron | null {
	const had = BUILT.get(id);
	if (had) return had;
	const rec = BY_ID.get(id);
	if (!rec) return nobleFamilySolid(id, NOBLE_FAMILY_DEFAULTS);
	const { vertices, faces } = nobleOrbit(rec[1], nobleSeed(rec[0]), rec[2]);
	const built = solid(id, rec[0], vertices, faces);
	BUILT.set(id, built);
	return built;
}

// ---- the two infinite families -------------------------------------------------------------------
//
// Hill's Corollary 4.15: a noble polyhedron with prismatic symmetry is a disphenoid or a stephanoid, and
// there is nothing else. Neither can be listed. The disphenoids are a CONTINUUM, one for every acute
// triangle; the stephanoids are countable in (n, p, q) and each of those is itself a continuum in its
// height. So they ship as functions, and the sliders in the Options tab are their parameters.

export type NobleFamily = "noble-disphenoid" | "noble-stephanoid-prismatic" | "noble-stephanoid-antiprismatic";
export const NOBLE_FAMILIES: NobleFamily[] = ["noble-disphenoid", "noble-stephanoid-prismatic", "noble-stephanoid-antiprismatic"];
export const isNobleFamily = (id: string | null | undefined): id is NobleFamily => NOBLE_FAMILIES.includes(id as NobleFamily);

export interface NobleFamilyParams {
	/** Disphenoid: the box it is cut from is 1 x boxB x boxC. Both 1 is the regular tetrahedron. */
	boxB: number;
	boxC: number;
	/** Stephanoid: the n of PC(n,p,q) or AC(n,p,q). */
	n: number;
	/** Stephanoid: which admissible (p,q) for this n, as an index into `stephanoidChoices`. */
	member: number;
	/** Stephanoid: distance between its two base planes, in units of the base polygon's circumradius. */
	height: number;
}
export const NOBLE_FAMILY_DEFAULTS: NobleFamilyParams = { boxB: 1.4, boxC: 0.7, n: 7, member: 0, height: 1 };
/** The n slider's top. A bound on the control, not on the family: every n above it exists too. */
export const STEPHANOID_MAX_N = 30;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Every (p, q) for which PC(n,p,q) or AC(n,p,q) is a polyhedron, in Hill's Definitions 4.1 and 4.2:
 * prismatic needs 2p - n < 2q < p < n, antiprismatic needs q odd and 2p - n < q < p < n. A common factor
 * of n, p and q gives a compound of smaller stephanoids, so those are left out.
 */
export function stephanoidChoices(antiprismatic: boolean, n: number): [number, number][] {
	const out: [number, number][] = [];
	for (let p = 2; p < n; p++) {
		for (let q = 1; q < p; q++) {
			const ok = antiprismatic ? q % 2 === 1 && 2 * p - n < q : 2 * p - n < 2 * q && 2 * q < p;
			if (ok && gcd(gcd(n, p), q) === 1) out.push([p, q]);
		}
	}
	return out;
}

/** The stephanoid's own name for these parameters, "PC(7,3,1)", or null where n admits none. */
export function stephanoidSymbol(id: NobleFamily, params: NobleFamilyParams): string | null {
	const anti = id === "noble-stephanoid-antiprismatic";
	const choices = stephanoidChoices(anti, params.n);
	if (!choices.length) return null;
	const [p, q] = choices[Math.min(Math.max(params.member, 0), choices.length - 1)];
	return `${anti ? "AC" : "PC"}(${params.n},${p},${q})`;
}

export function nobleFamilySolid(id: string, params: NobleFamilyParams): Polyhedron | null {
	if (id === "noble-disphenoid") {
		// Alternate corners of a box: four congruent triangles, acute for every box.
		const { boxB: b, boxC: c } = params;
		return solid(id, "Disphenoid", [[1, b, c], [1, -b, -c], [-1, b, -c], [-1, -b, c]], [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
	}
	if (!isNobleFamily(id)) return null;
	const anti = id === "noble-stephanoid-antiprismatic";
	const { n, height } = params;
	const choices = stephanoidChoices(anti, n);
	if (!choices.length) return null;
	const [p, q] = choices[Math.min(Math.max(params.member, 0), choices.length - 1)];
	const m = 2 * n;
	// One ring of 2n indices for both. Antiprismatic: a_k at angle k·pi/n, alternating base planes.
	// Prismatic: a_k = k and b_k = n + k, each pair at angle 2k·pi/n.
	const vertices: Vec3[] = Array.from({ length: m }, (_, k) => {
		const t = anti ? (Math.PI * k) / n : (2 * Math.PI * (k % n)) / n;
		const top = anti ? k % 2 === 0 : k < n;
		return [Math.cos(t), Math.sin(t), top ? height / 2 : -height / 2];
	});
	const faces: number[][] = [];
	for (let k = 0; k < m; k++) {
		if (anti) {
			faces.push([k, k + q, k + 2 * p, k + 2 * p - q].map((i) => ((i % m) + m) % m));
		} else {
			const j = k % n;
			// The quadrilateral a, b, a, b for k < n and its reflection in the equator, b, a, b, a, after.
			const [lo, hi] = k < n ? [0, n] : [n, 0];
			const at = (i: number, base: number) => base + (((i % n) + n) % n);
			faces.push([at(j, lo), at(j + q, hi), at(j + p, lo), at(j + p - q, hi)]);
		}
	}
	return solid(id, `${anti ? "AC" : "PC"}(${n},${p},${q})`, vertices, faces);
}

// ---- reading one: its symmetry, a part of it, and the shape of its face ---------------------------

const ORBIFOLD: Record<NobleGroup, string> = { Td: "*332", O: "432", Oh: "*432", I: "532", Ih: "*532" };
/** Point group and orbifold symbol of a listed noble polyhedron; null for a family or any other id. */
export function nobleSymmetry(id: string): { group: NobleGroup; orbifold: string } | null {
	const rec = BY_ID.get(id);
	return rec ? { group: rec[1], orbifold: ORBIFOLD[rec[1]] } : null;
}

const GON: Record<number, string> = { 3: "triangle", 4: "quadrilateral", 5: "pentagon", 6: "hexagon", 8: "octagon", 9: "enneagon", 12: "dodecagon" };
/** The one face shape of a noble polyhedron, flat, with the words for it and the solid's census. */
export function nobleFaceShape(p: Polyhedron) {
	const face = p.faces[0];
	const flat = faceOutline(face, p.vertices);
	if (!flat) return null;
	const gon = GON[face.length] ?? `${face.length}-gon`;
	const regular = isRegularRing(p.vertices, face);
	const kind = flat.crossed
		? `${regular ? "regular star" : "self-intersecting"} ${gon}`
		: isConvexRing(p.vertices, face)
			? `${regular ? "regular " : face.length === 3 ? "" : "convex "}${gon}`
			: `concave ${gon}`;
	const edges = new Set(p.faces.flatMap((f) => f.map((a, k) => cycleKey([a, f[(k + 1) % f.length]]))));
	return { points: flat.xs.map((x, k) => [x, flat.ys[k]] as [number, number]), kind, V: p.vertices.length, E: edges.size, F: p.faces.length, perVertex: p.schlafli[1] };
}
