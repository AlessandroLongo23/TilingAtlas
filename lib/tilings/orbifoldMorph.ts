// Change a Tegula type's symmetry group and follow it into another geometry, as Tegula's "Symmetries"
// panel does (husonlab/tegula, tilingeditor/GroupEditingControls.java).
//
// A Delaney-Dress symbol keeps its chambers and their gluings; only the rotation order v of one vertex or
// tile class changes, and with it m = r·v. The sign of the curvature Σ(1/m01 + 1/m12 − ½) then says where
// the result lives: *632 with the 6 raised to 7 is *732 in the hyperbolic plane, lowered to 5 it is *532 on
// the sphere. The topology is kept; the shapes are not, since a regular tile has no reason to stay regular.
//
// The metric is tools/ctrnact-oracle/develop_dsym.py `circle_pattern` (Koebe, Andreev, Thurston), solved
// here in the browser: one circle per vertex class and per tile class, so the unknowns are few. When two
// tiles share more than one edge that pattern does not exist, and the same solve is run on the barycentric
// subdivision, which is a triangulation and always has one; the edges then bend at their midpoints.
//
// Whatever the geometry, the result is one structure: DARTS (oriented half-edges of the orientation cover)
// with a turn angle and an edge length each. The Poincaré disk develops those directly
// (lib/render/hyperbolicDevelopClient.ts); the sphere and the plane are developed here with 3x3 frames.

import { DSymbol, components, cycleLengthIJ } from "@/lib/classes/algorithm/delaney/DSymbol";
import type { TranslationalCellData } from "@/lib/classes/algorithm/types";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import type { HypDiskTiling } from "@/lib/render/hypDisk";
import type { ShelfSurface } from "@/lib/services/shelfRegistry";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";
import { tegulaHue } from "@/lib/tilings/tegula";
import { polygonHue, starHue } from "@/lib/utils/renderTiling";

type Geom = 1 | 0 | -1;

/** '<4.0:2:1 2,1 2,2:3 3,6>' → the symbol. Delgado-Friedrichs' compressed form, as develop_dsym.py reads it. */
export function parseTegulaSymbol(text: string): DSymbol | null {
	const body = /<([^>]+)>/.exec(text)?.[1];
	if (!body) return null;
	const [, size, ops, ms] = body.split(":");
	const n = Number(size.trim().split(/\s+/)[0]);
	const s = ops.split(",").map((part) => {
		const vals = part
			.trim()
			.split(/\s+/)
			.map((x) => Number(x) - 1);
		const img = new Array<number>(n).fill(-1);
		let k = 0;
		for (let c = 0; c < n; c++) {
			if (img[c] >= 0) continue;
			const d = vals[k++];
			img[c] = d;
			img[d] = c;
		}
		return img;
	});
	const m = (
		[
			[0, 1],
			[1, 2],
		] as const
	).map(([i, j], t) => {
		const vals = ms.split(",")[t].trim().split(/\s+/).map(Number);
		const lab = new Array<number>(n).fill(0);
		let k = 0;
		for (let c = 0; c < n; c++) {
			if (lab[c]) continue;
			const v = vals[k++];
			for (const todo = [c]; todo.length; ) {
				const d = todo.pop()!;
				if (lab[d]) continue;
				lab[d] = v;
				todo.push(s[i][d], s[j][d]);
			}
		}
		return lab;
	});
	return new DSymbol(s[0], s[1], s[2], m[0], m[1]);
}

/** A vertex class or a tile class: the orbifold point at its centre has rotation order v = m / r. */
/**
 * A vertex class, tile class or edge class, and the point of the orbifold at its centre. Its order v is
 * how many times the symmetry turns about it: v > 1 makes it a corner of the orbifold when it lies on a
 * mirror and a cone point when it does not; at v = 1 it is an ordinary point of a mirror or of the
 * interior. Edges are listed only at v = 2 (a half-turn or a mirror corner at the midpoint), and only to
 * be shown: m02 = 2 is fixed, so an edge's order cannot move (Tegula greys it out too).
 */
export interface ConePoint {
	kind: "vertex" | "tile" | "edge";
	chambers: number[];
	r: number;
	v: number;
	/** The point lies on a mirror. */
	mirror: boolean;
}

const PAIRS = { vertex: [1, 2], tile: [0, 1], edge: [0, 2] } as const;

/** The orbifold's points, its genuine ones first (v > 1, highest order first: *632 lists 6, 3, 2), then
 *  every class of order 1, each of which a raised order would turn into a new one. */
export function conePoints(sym: DSymbol): ConePoint[] {
	const out: ConePoint[] = [];
	for (const kind of ["vertex", "tile", "edge"] as const) {
		const [i, j] = PAIRS[kind];
		for (const chambers of components(sym, i, j)) {
			const c = chambers[0];
			const r = cycleLengthIJ(sym, i, j, c);
			const v = sym.m(i, j, c) / r;
			if (kind === "edge" && v < 2) continue;
			out.push({ kind, chambers, r, v, mirror: chambers.some((d) => sym.s[i][d] === d || sym.s[j][d] === d) });
		}
	}
	const rank = (p: ConePoint) => (p.v > 1 ? -p.v : 0);
	return out
		.map((p, i) => [p, i] as const)
		.sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
		.map(([p]) => p);
}

/** The symbol with each cone point's rotation order replaced, in conePoints order. */
export function withOrders(sym: DSymbol, vs: readonly number[]): DSymbol {
	const m01 = sym.m01.slice();
	const m12 = sym.m12.slice();
	conePoints(sym).forEach((p, k) => {
		if (p.kind !== "edge") for (const c of p.chambers) (p.kind === "tile" ? m01 : m12)[c] = p.r * vs[k];
	});
	return new DSymbol(sym.s[0].slice(), sym.s[1].slice(), sym.s[2].slice(), m01, m12);
}

/** +1 sphere, 0 plane, −1 hyperbolic plane. Exact: the m are small integers. */
export function geometryOf(sym: DSymbol): Geom {
	let num = 0n;
	let den = 1n;
	for (let c = 0; c < sym.n; c++) {
		const a = BigInt(sym.m01[c]);
		const b = BigInt(sym.m12[c]);
		// add 1/a + 1/b − 1/2 = (2b + 2a − ab) / 2ab
		const tn = 2n * b + 2n * a - a * b;
		const td = 2n * a * b;
		num = num * td + tn * den;
		den *= td;
	}
	return num > 0n ? 1 : num < 0n ? -1 : 0;
}

// ---------------------------------------------------------------------------------------------------
// The group's name, Conway's orbifold notation: a port of Tegula's OrbifoldGroupName.java.
// ---------------------------------------------------------------------------------------------------

export function orbifoldName(sym: DSymbol): string {
	const n = sym.n;
	const s = sym.s;
	const kOf = (i: number, j: number) => 3 - (i + j);
	const v = (i: number, j: number, c: number) => sym.m(i, j, c) / cycleLengthIJ(sym, i as 0 | 1 | 2, j as 0 | 1 | 2, c);
	const mark = [new Set<number>(), new Set<number>(), new Set<number>()];
	const markOrbit = (i: number, j: number, c: number) => {
		for (const todo = [c]; todo.length; ) {
			const d = todo.pop()!;
			if (mark[kOf(i, j)].has(d)) continue;
			mark[kOf(i, j)].add(d);
			todo.push(s[i][d], s[j][d]);
		}
	};
	const isCycle = (i: number, j: number, c: number) =>
		components(sym, i as 0 | 1 | 2, j as 0 | 1 | 2)
			.find((o) => o.includes(c))!
			.every((d) => s[i][d] !== d && s[j][d] !== d);

	let euler = n;
	for (const [i, j] of [
		[0, 1],
		[0, 2],
		[1, 2],
	] as const)
		euler += components(sym, i, j).length;
	for (let i = 0; i < 3; i++) euler -= components(sym, i as 0, i as 0).length;

	// Orientation: a 2-colouring of the chamber graph, mirrors (fixed points) allowed.
	const ori = new Array<number>(n).fill(0);
	let orientable = true;
	ori[0] = 1;
	for (const todo = [0]; todo.length; ) {
		const a = todo.pop()!;
		for (let i = 0; i < 3; i++) {
			const b = s[i][a];
			if (b === a) continue;
			if (!ori[b]) {
				ori[b] = -ori[a];
				todo.push(b);
			} else if (ori[b] === ori[a]) orientable = false;
		}
	}

	const rotations: number[] = [];
	for (const [i, j] of [
		[1, 2],
		[0, 2],
		[0, 1],
	] as const) {
		for (const orbit of components(sym, i, j)) {
			if (!isCycle(i, j, orbit[0])) continue;
			const vv = v(i, j, orbit[0]);
			if (vv > 1) rotations.push(vv);
			markOrbit(i, j, orbit[0]);
		}
	}

	const otherChainEnd = (i: number, j: number, a: number): [number, number] => {
		let i0 = j;
		let a0 = a;
		while (a0 !== s[i0][a0]) {
			a0 = s[i0][a0];
			i0 = i0 === i ? j : i;
		}
		return [i0, a0];
	};
	const boundary: number[][] = [];
	const revBoundary: number[][] = [];
	for (let a = 0; a < n; a++) {
		for (let i0 = 0; i0 < 3; i0++) {
			if (s[i0][a] !== a) continue;
			const j0 = ori[a] === 1 ? (i0 + 1) % 3 : (i0 + 2) % 3;
			if (mark[kOf(i0, j0)].has(a)) continue;
			const bound: number[] = [];
			let [i, j, b] = [i0, j0, a];
			let k = kOf(i, j);
			const k0 = k;
			do {
				const vv = v(i, j, b);
				if (vv > 1) bound.push(vv);
				markOrbit(i, j, b);
				[i, b] = otherChainEnd(i, j, b);
				j = k;
				k = kOf(i, j);
			} while (b !== a || k !== k0);
			boundary.push(largestCyclic(bound));
			revBoundary.push(largestCyclic(bound.slice().reverse()));
		}
	}

	const digits = (xs: number[]) => xs.map((x) => (x < 10 ? String(x) : `(${x})`)).join("");
	const desc = (a: number[], b: number[]) => {
		for (let t = 0; t < Math.min(a.length, b.length); t++) if (a[t] !== b[t]) return b[t] - a[t];
		return b.length - a.length;
	};
	let out = "";
	if (orientable) out += "o".repeat(Math.max(0, (2 - euler - boundary.length) / 2));
	out += digits(rotations.sort((a, b) => b - a));
	boundary.sort(desc);
	revBoundary.sort(desc);
	const cmp = boundary.reduce((acc, x, t) => acc || desc(x, revBoundary[t]), 0);
	for (const comp of cmp > 0 ? revBoundary : boundary) out += "*" + digits(comp);
	if (!orientable) out += "x".repeat(Math.max(0, 2 - euler - boundary.length));
	return out || "1";
}

function largestCyclic(xs: number[]): number[] {
	let best = xs;
	for (let t = 1; t < xs.length; t++) {
		const rot = [...xs.slice(t), ...xs.slice(0, t)];
		for (let u = 0; u < xs.length; u++) {
			if (rot[u] === best[u]) continue;
			if (rot[u] > best[u]) best = rot;
			break;
		}
	}
	return best;
}

// ---------------------------------------------------------------------------------------------------
// Tegula's guardrails on a change of rotation order.
// ---------------------------------------------------------------------------------------------------

/** Every orbifold point with a nontrivial order, edge midpoints included: Tegula's spherical NN test. */
const orderedPoints = (sym: DSymbol): number => conePoints(sym).filter((p) => p.v > 1).length;

/** Most sides a tile or a vertex may reach here: the disk walks a face ring of at most 64 darts, and a
 *  subdivided tile has two per side. */
const MAX_M = 30;

/**
 * The orders after moving cone point `k` to `next`, or null when Tegula would refuse: a tile left with
 * one side or a vertex with two, an order under 2, or a sphere with exactly two ordered points of
 * different orders (the teardrop and the spindle, which no geometry realizes). In that last case Tegula
 * moves the partner too, and so does this, when the partner is a vertex or tile class.
 */
export function stepOrder(sym: DSymbol, vs: readonly number[], k: number, next: number): number[] | null {
	const pts = conePoints(sym);
	const p = pts[k];
	const cur = vs[k];
	if (p.kind === "edge" || next < 1 || p.r * next > MAX_M) return null;
	if (next < cur) {
		if (p.r * cur < 3) return null;
		if (p.r * next < (p.kind === "tile" ? 2 : 3)) return null;
		const before = withOrders(sym, vs);
		if (geometryOf(before) > 0 && orderedPoints(before) === 2 && cur <= 3) return null;
	}
	const out = vs.slice();
	out[k] = next;
	const after = withOrders(sym, out);
	if (geometryOf(after) > 0 && orderedPoints(after) === 2) {
		const partner = out.findIndex((x, t) => t !== k && x > 1);
		if (partner >= 0 && out[partner] !== next) {
			// An edge's 2-fold point cannot move, so the pair can only be equal at 2.
			if (pts[partner].kind === "edge" || pts[partner].r * next > MAX_M) return null;
			out[partner] = next;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------------
// The metric: develop_dsym.py `circle_pattern`, ported.
// ---------------------------------------------------------------------------------------------------

interface Pattern {
	/** Per chamber: vertex circle radius, tile circle radius, angle at the vertex, angle at the tile centre. */
	rv: number[];
	rf: number[];
	av: number[];
	af: number[];
}

function circlePattern(sym: DSymbol, g: Geom, tol = 1e-11): Pattern | null {
	const n = sym.n;
	const vOrb = new Array<number>(n);
	const fOrb = new Array<number>(n);
	const vComps = components(sym, 1, 2);
	const fComps = components(sym, 0, 1);
	vComps.forEach((o, k) => o.forEach((c) => (vOrb[c] = k)));
	fComps.forEach((o, k) => o.forEach((c) => (fOrb[c] = vComps.length + k)));
	const N = vComps.length + fComps.length;
	const want = new Array<number>(N).fill(0);
	for (let c = 0; c < n; c++) {
		want[vOrb[c]] += Math.PI / sym.m12[c];
		want[fOrb[c]] += Math.PI / sym.m01[c];
	}
	const radius = (u: number) => (g > 0 ? 2 * Math.atan(Math.exp(u)) : Math.exp(u));
	const corner = (leg: number, opp: number) =>
		g > 0
			? Math.atan2(Math.sin(opp), Math.cos(opp) * Math.sin(leg))
			: g < 0
				? Math.atan2(Math.tanh(opp), Math.sinh(leg))
				: Math.atan2(opp, leg);
	const angles = (u: number[]): Pattern => {
		const rv = vOrb.map((k) => radius(u[k]));
		const rf = fOrb.map((k) => radius(u[k]));
		return { rv, rf, av: rv.map((a, c) => corner(a, rf[c])), af: rf.map((b, c) => corner(b, rv[c])) };
	};
	const miss = (u: number[]) => {
		const { av, af } = angles(u);
		const got = want.map((w) => -w);
		for (let c = 0; c < n; c++) {
			got[vOrb[c]] += av[c];
			got[fOrb[c]] += af[c];
		}
		return got;
	};
	const worst = (f: number[]) => Math.max(...f.map(Math.abs));
	// The sphere's equations are not convex, so Newton there starts from several sizes of circle.
	for (const r0 of g > 0 ? [0.5, 0.2, 1.0, 0.08, 1.4] : [1]) {
		let u = new Array<number>(N).fill(g > 0 ? Math.log(Math.tan(r0 / 2)) : 0);
		for (let it = 0; it < 200; it++) {
			const f = miss(u);
			if (worst(f) < tol) return angles(u);
			const J = Array.from({ length: N }, () => new Array<number>(N).fill(0));
			for (let k = 0; k < N; k++) {
				const up = u.slice();
				const dn = u.slice();
				up[k] += 1e-6;
				dn[k] -= 1e-6;
				const a = miss(up);
				const b = miss(dn);
				for (let e = 0; e < N; e++) J[e][k] = (a[e] - b[e]) / 2e-6;
			}
			// The plane has a free scale, so J is singular there: a damped normal equation drops it.
			const step = dampedSolve(
				J,
				f.map((x) => -x),
			);
			let t = 1;
			while (t > 1e-4 && !(worst(miss(u.map((x, k) => x + t * step[k]))) < worst(f))) t /= 2;
			u = u.map((x, k) => x + t * step[k]);
			if (Math.max(...u.map(Math.abs)) > 30) break;
		}
	}
	return null;
}

/** min |Jx − b|² + μ|x|², μ tiny: Gaussian elimination on (JᵀJ + μI) x = Jᵀb. */
function dampedSolve(J: number[][], b: number[]): number[] {
	const N = b.length;
	const A = Array.from({ length: N }, (_, i) =>
		Array.from({ length: N + 1 }, (_, j) => {
			let s = 0;
			for (let e = 0; e < N; e++) s += J[e][i] * (j < N ? J[e][j] : b[e]);
			return s;
		}),
	);
	const mu = 1e-12 * Math.max(1e-300, ...A.map((row, i) => row[i]));
	for (let i = 0; i < N; i++) A[i][i] += mu;
	for (let i = 0; i < N; i++) {
		let p = i;
		for (let r = i + 1; r < N; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
		[A[i], A[p]] = [A[p], A[i]];
		for (let r = 0; r < N; r++) {
			if (r === i || A[i][i] === 0) continue;
			const q = A[r][i] / A[i][i];
			for (let c = i; c <= N; c++) A[r][c] -= q * A[i][c];
		}
	}
	return A.map((row, i) => (row[i] === 0 ? 0 : row[N] / row[i]));
}

/** The barycentric subdivision: chamber (c, p, q) is old chamber c's corner p (0 vertex, 1 edge midpoint,
 *  2 tile centre) on its side towards q. Every tile is a triangle, so a circle pattern exists. */
function subdivide(sym: DSymbol): DSymbol {
	const PQ = [
		[0, 1],
		[0, 2],
		[1, 0],
		[1, 2],
		[2, 0],
		[2, 1],
	];
	const id = (c: number, p: number, q: number) => 6 * c + PQ.findIndex(([a, b]) => a === p && b === q);
	const s: number[][] = [[], [], []];
	const m01: number[] = [];
	const m12: number[] = [];
	for (let c = 0; c < sym.n; c++) {
		for (const [p, q] of PQ) {
			const x = id(c, p, q);
			s[0][x] = id(c, q, p);
			s[1][x] = id(c, p, 3 - p - q);
			s[2][x] = id(sym.s[3 - p - q][c], p, q);
			m01[x] = 3;
			m12[x] = p === 0 ? 2 * sym.m12[c] : p === 2 ? 2 * sym.m01[c] : 4;
		}
	}
	return new DSymbol(s[0], s[1], s[2], m01, m12);
}

/** Per old chamber, its triangle (vertex V, edge midpoint E, tile centre F): the angles at V and E and the
 *  length V–E. From the direct pattern E is a right angle; from the subdivision's, anything. */
function chamberTriangles(
	sym: DSymbol,
	g: Geom,
	chords = false,
): { aV: number[]; aE: number[]; lVE: number[]; bent: boolean } | null {
	const direct = sym.m01.every((m) => m >= 3) ? circlePattern(sym, g) : null;
	if (direct) return { aV: direct.av, aE: direct.av.map(() => Math.PI / 2), lVE: direct.rv, bent: false };
	const b = circlePattern(subdivide(sym), g);
	if (!b) return null;
	const at = (c: number, p: number, q: number) => 6 * c + 2 * p + (q > p ? q - 1 : q);
	const aV: number[] = [];
	const aE: number[] = [];
	const lVE: number[] = [];
	for (let c = 0; c < sym.n; c++) {
		aV.push(b.av[at(c, 0, 1)] + b.av[at(c, 0, 2)]);
		aE.push(b.av[at(c, 1, 0)] + b.av[at(c, 1, 2)]);
		lVE.push(b.rv[at(c, 0, 1)] + b.rv[at(c, 1, 0)]);
	}
	return chords ? straighten(sym, g, aV, aE, lVE) : { aV, aE, lVE, bent: true };
}

/**
 * The subdivision draws each edge as two pieces V–E–W. Its geodesic chord V–W is a straight drawing of
 * the same map: where the chord turns toward one tile it turns away from the tile across the edge by the
 * same angle, so every vertex still closes. A digon becomes two coincident chords, which a record's drawn
 * points (bendDarts) then pull apart: this is how a drawing with bends gets a straight map to bend.
 */
function straighten(sym: DSymbol, g: Geom, aV: number[], aE: number[], lVE: number[]) {
	const [C, S] = g > 0 ? [Math.cos, Math.sin] : [Math.cosh, Math.sinh];
	const half: number[] = [];
	const corner: number[] = [];
	for (let c = 0; c < sym.n; c++) {
		const a = lVE[c];
		const b = lVE[sym.s[0][c]];
		const theta = aE[c] + aE[sym.s[0][c]]; // at E, on the side of c's tile
		const inner = Math.min(theta, 2 * Math.PI - theta);
		let chord: number;
		let beta: number; // the angle at V between V–E and the chord
		if (g === 0) {
			chord = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(inner)));
			beta = Math.acos(Math.max(-1, Math.min(1, (a * a + chord * chord - b * b) / (2 * a * chord || 1))));
		} else {
			const cc = g > 0 ? C(a) * C(b) + S(a) * S(b) * Math.cos(inner) : C(a) * C(b) - S(a) * S(b) * Math.cos(inner);
			chord = g > 0 ? Math.acos(Math.max(-1, Math.min(1, cc))) : Math.acosh(Math.max(1, cc));
			const num = g > 0 ? C(b) - C(a) * C(chord) : C(a) * C(chord) - C(b);
			beta = Math.acos(Math.max(-1, Math.min(1, num / (S(a) * S(chord) || 1))));
		}
		// E juts out of the tile (theta < π): the chord cuts across the tile, narrowing its corner.
		corner.push(aV[c] - (theta < Math.PI ? beta : -beta));
		half.push(chord / 2);
	}
	return { aV: corner, aE: corner.map(() => Math.PI / 2), lVE: half, bent: false };
}

// ---------------------------------------------------------------------------------------------------
// Darts: the map's oriented half-edges, one per chamber of the orientation cover with sign +.
// ---------------------------------------------------------------------------------------------------

interface MorphDarts extends Darts {
	alpha: number[];
	elen: number[];
	faceColor: number[];
	/** Vertex class per dart, for the sphere's vertex orbits; −1 at an edge midpoint. */
	vclass: number[];
	/** Sides of the tile (not of the ring, which counts midpoints when the edges bend). */
	tileSize: number[];
	/** The type's chamber each dart was cut from, and whether its vertex is an edge's midpoint. */
	chamber: number[];
	atMid: boolean[];
	/** Corners round the dart's vertex in the tiling (the quotient's rneig cycle may be a fraction). */
	degree: number[];
	/** Drawn corners of the dart's tile (a star's dents included), and whether its vertex is a drawn bend
	 *  point, not a vertex of the tiling. */
	drawn: number[];
	bend: boolean[];
	/** Which piece of its edge the dart runs along, counted from the straight dart's own vertex (0 when the
	 *  edge is drawn in one piece): with `chamber`, what fitShape reads the record's targets by. */
	seg: number[];
	/** Chambers of the map the darts were cut from, and whether its edges bend at their midpoints. */
	chambers: number;
	bent: boolean;
}

function buildDarts(sym: DSymbol, g: Geom, chords = false): MorphDarts | null {
	const tri = chamberTriangles(sym, g, chords);
	if (!tri || ![...tri.aV, ...tri.lVE].every(Number.isFinite)) return null;
	const n = sym.n;
	const s = sym.s;
	const tileOrb = new Array<number>(n);
	const vertOrb = new Array<number>(n);
	components(sym, 0, 1).forEach((o, k) => o.forEach((c) => (tileOrb[c] = k)));
	components(sym, 1, 2).forEach((o, k) => o.forEach((c) => (vertOrb[c] = k)));
	// The map to draw: the tiling itself when its edges are straight, else every edge split at its
	// midpoint (chambers (c, 0) at the vertex end, (c, 1) at the midpoint end).
	const M = tri.bent ? 2 * n : n;
	const old = (x: number) => (tri.bent ? x >> 1 : x);
	const atMid = (x: number) => tri.bent && (x & 1) === 1;
	const sig = tri.bent
		? [
				(x: number) => x ^ 1,
				(x: number) => (atMid(x) ? 2 * s[0][old(x)] + 1 : 2 * s[1][old(x)]),
				(x: number) => 2 * s[2][old(x)] + (x & 1),
			]
		: [0, 1, 2].map((i) => (x: number) => s[i][x]);
	const corner = (x: number) => {
		const c = old(x);
		return atMid(x) ? tri.aE[c] + tri.aE[s[0][c]] : tri.aV[c] + tri.aV[s[1][c]];
	};
	const length = (x: number) => {
		const c = old(x);
		return tri.bent ? tri.lVE[c] : tri.lVE[c] + tri.lVE[s[0][c]];
	};

	// Orientation cover: (x, ±), every σ flips the sign. The darts are the + chambers of (0, +)'s
	// component: half the chambers when the symbol is orientable, all of them when it is not.
	const seen = new Array<boolean>(2 * M).fill(false);
	seen[0] = true;
	for (const todo = [0]; todo.length; ) {
		const xe = todo.pop()!;
		for (let i = 0; i < 3; i++) {
			const ye = 2 * sig[i](xe >> 1) + (1 - (xe & 1));
			if (!seen[ye]) {
				seen[ye] = true;
				todo.push(ye);
			}
		}
	}
	const pos = Array.from({ length: M }, (_, x) => x).filter((x) => seen[2 * x]);
	const dartOf = new Map(pos.map((x, d) => [x, d]));
	const D = pos.length;
	const rneig = pos.map((x) => dartOf.get(sig[2](sig[1](x)))!);
	const glue = pos.map((x) => dartOf.get(sig[2](sig[0](x)))!);
	if (rneig.some((d) => d === undefined) || glue.some((d) => d === undefined)) return null;
	const alpha = pos.map(corner);
	const elen = pos.map(length);
	const faceColor = pos.map((x) => tileOrb[old(x)]);
	const vclass = pos.map((x) => (atMid(x) ? -1 : vertOrb[old(x)]));
	const tileSize = pos.map((x) => sym.m01[old(x)]);
	// Corners round the vertex: 2 at an edge midpoint.
	const degree = pos.map((x) => (atMid(x) ? 2 : sym.m12[old(x)]));
	// lvert[d] is the corner count of the face ENTERED at d, the one d's predecessor in rneig sits in. The
	// quotient ring can be shorter (a rotation about the tile's centre); the walk repeats it up to this.
	const lvert = new Array<number>(D).fill(0);
	for (let h = 0; h < D; h++) lvert[rneig[h]] = tileSize[h] * (tri.bent ? 2 : 1);
	const chamber = pos.map(old);
	const mids = pos.map(atMid);
	const drawn = tileSize.slice();
	const bend = pos.map(() => false);
	const seg = pos.map(() => 0);
	return {
		rneig,
		glue,
		lvert,
		seed: 0,
		alpha,
		elen,
		faceColor,
		vclass,
		tileSize,
		degree,
		drawn,
		bend,
		seg,
		chamber,
		atMid: mids,
		chambers: M,
		bent: tri.bent,
	};
}

// ---------------------------------------------------------------------------------------------------
// Frames: points are columns (x, y, w) on the plane w = 1, the unit sphere or the hyperboloid.
// ---------------------------------------------------------------------------------------------------

type M3 = number[]; // row-major 3x3

const mul = (a: M3, b: M3): M3 => [
	a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
	a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
	a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
	a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
	a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
	a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
	a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
	a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
	a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const rot = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
function tx(g: Geom, d: number): M3 {
	if (g === 0) return [1, 0, d, 0, 1, 0, 0, 0, 1];
	const [c, s] = g > 0 ? [Math.cos(d), Math.sin(d)] : [Math.cosh(d), Math.sinh(d)];
	return [c, 0, s, 0, 1, 0, -g * s, 0, c];
}
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Slide across the frame's heading, to its left: with tx, Fermi coordinates about the heading's geodesic. */
function ty(g: Geom, d: number): M3 {
	if (g === 0) return [1, 0, 0, 0, 1, d, 0, 0, 1];
	const [c, s] = g > 0 ? [Math.cos(d), Math.sin(d)] : [Math.cosh(d), Math.sinh(d)];
	return [1, 0, 0, 0, c, s, 0, -g * s, c];
}
const apply = (M: M3, p: number[]) => [0, 3, 6].map((r) => M[r] * p[0] + M[r + 1] * p[1] + M[r + 2] * p[2]);
const ORIGIN = [0, 0, 1];
function dist(g: Geom, p: number[], q: number[]): number {
	if (g === 0) return Math.hypot(p[0] - q[0], p[1] - q[1]);
	if (g > 0) return Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
	return Math.acosh(Math.max(1, p[2] * q[2] - p[0] * q[0] - p[1] * q[1]));
}
/** An isometry taking q to the origin (its heading there is of no account: only angle differences are read). */
function toOrigin(g: Geom, q: number[]): M3 {
	return mul(tx(g, -dist(g, ORIGIN, q)), rot(-Math.atan2(q[1], q[0])));
}
const turn = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/**
 * Put a record's drawn shape back on the straight map: every edge gets the points its class carried
 * (RecordShape.bends) at the same place relative to the edge, in edge lengths, in whatever geometry the
 * morph is in. Each such point becomes a vertex of degree 2 with its drawn angles, so a star keeps its
 * dents and the 12-gon round it its corners. The edge is the geodesic the circle pattern drew; the points
 * sit off it in Fermi coordinates about that geodesic.
 */
function bendDarts(d: MorphDarts, bends: number[][][], g: Geom): MorphDarts {
	const D = d.rneig.length;
	// Each straight dart's polyline, from its vertex to the far end, in its own frame: both darts of an
	// edge read one polyline, so the two sides of a bent edge agree exactly.
	const own: number[][][] = new Array(D);
	for (let h = 0; h < D; h++) {
		const k = d.glue[h];
		if (k < h) continue;
		const L = d.elen[h];
		const pts = [
			ORIGIN,
			...bends[d.chamber[h]].map(([t, b]) => apply(mul(tx(g, t * L), ty(g, b * L)), ORIGIN)),
			apply(tx(g, L), ORIGIN),
		];
		own[h] = pts;
		if (k !== h) {
			const back = mul(rot(-Math.PI), tx(g, -L)); // the partner's frame: the far end, facing back
			own[k] = pts.map((p) => apply(back, p)).reverse();
		}
	}
	const start: number[] = [];
	let D2 = 0;
	for (let h = 0; h < D; h++) {
		start.push(D2);
		D2 += own[h].length - 1;
	}
	const sub = (h: number, j: number) => start[h] + j;
	const heading = (h: number) => Math.atan2(own[h][1][1], own[h][1][0]);
	const rneig = new Array<number>(D2);
	const glue = new Array<number>(D2);
	const alpha = new Array<number>(D2);
	const elen = new Array<number>(D2);
	const parent = new Array<number>(D2);
	const isBend = new Array<boolean>(D2);
	const seg = new Array<number>(D2);
	for (let h = 0; h < D; h++) {
		const pts = own[h];
		const m = pts.length - 2;
		for (let j = 0; j <= m; j++) {
			const x = sub(h, j);
			parent[x] = h;
			isBend[x] = j > 0;
			seg[x] = j;
			glue[x] = sub(d.glue[h], m - j);
			elen[x] = dist(g, pts[j], pts[j + 1]);
			if (j === 0) {
				rneig[x] = sub(d.rneig[h], 0);
				alpha[x] = d.alpha[h] + heading(d.rneig[h]) - heading(h);
			} else {
				// At a drawn point: the tile's angle there, from the way on round to the way back.
				rneig[x] = sub(d.glue[h], m + 1 - j);
				const M = toOrigin(g, pts[j]);
				const next = apply(M, pts[j + 1]);
				const prev = apply(M, pts[j - 1]);
				alpha[x] = turn(Math.atan2(prev[1], prev[0]) - Math.atan2(next[1], next[0]));
			}
		}
	}
	// Corner counts: a quotient ring is 1/k of its tile, and k does not change with the drawn points.
	const ring = (next: (x: number) => number, n: number) => {
		const len = new Array<number>(n).fill(0);
		for (let x = 0; x < n; x++) {
			if (len[x]) continue;
			const cyc: number[] = [];
			for (let y = x; !cyc.includes(y); y = next(y)) cyc.push(y);
			for (const y of cyc) len[y] = cyc.length;
		}
		return len;
	};
	const straight = ring((h) => d.glue[d.rneig[h]], D);
	const bent = ring((x) => glue[rneig[x]], D2);
	const drawn = parent.map((h, x) => (bent[x] * d.tileSize[h]) / straight[h]);
	const lvert = new Array<number>(D2).fill(0);
	for (let x = 0; x < D2; x++) lvert[rneig[x]] = drawn[x];
	const pick = <T>(a: T[]) => parent.map((h) => a[h]);
	return {
		...d,
		rneig,
		glue,
		lvert,
		alpha,
		elen,
		faceColor: pick(d.faceColor),
		vclass: parent.map((h, x) => (isBend[x] ? -1 : d.vclass[h])),
		tileSize: pick(d.tileSize),
		degree: parent.map((h, x) => (isBend[x] ? 2 : d.degree[h])),
		drawn,
		bend: isBend,
		seg,
		chamber: pick(d.chamber),
		atMid: pick(d.atMid),
		chambers: (d.chambers * D2) / D,
	};
}

/**
 * Poincaré's conditions on the quotient. A rneig cycle is 1/k of a vertex, k = degree / cycle length, and
 * its turns must sum to 2π/k; a face ring is 1/k of a tile and its holonomy must have order k. Both are
 * exactly 1 when nothing rotates about that point.
 */
function closes(d: MorphDarts, g: Geom): boolean {
	const D = d.rneig.length;
	const close = (G: M3) => G.every((v, k) => Math.abs(v - I3[k]) < 1e-6);
	const seen = new Array<boolean>(D).fill(false);
	for (let h = 0; h < D; h++) {
		if (seen[h]) continue;
		let G = I3;
		let len = 0;
		let x = h;
		do {
			seen[x] = true;
			len++;
			G = mul(mul(mul(G, rot(d.alpha[x])), tx(g, d.elen[d.rneig[x]])), rot(Math.PI));
			x = d.glue[d.rneig[x]];
		} while (x !== h);
		const k = d.lvert[d.rneig[h]] / len;
		if (!Number.isInteger(k)) return false;
		let P = I3;
		for (let t = 0; t < k; t++) P = mul(P, G);
		if (!close(P) || (k > 1 && close(G))) return false;
	}
	const turned = new Array<boolean>(D).fill(false);
	for (let h = 0; h < D; h++) {
		if (turned[h]) continue;
		let sum = 0;
		let len = 0;
		let x = h;
		do {
			turned[x] = true;
			sum += d.alpha[x];
			len++;
			x = d.rneig[x];
		} while (x !== h);
		if (Math.abs((sum * d.degree[h]) / len - 2 * Math.PI) > 1e-6) return false;
	}
	return true;
}

interface Developed {
	/** Vertex positions (x, y, w). */
	verts: number[][];
	/** Face rings: vertex ids, and the dart each ring was started from. */
	faces: { ring: number[]; dart: number; center: number[] }[];
	/** Developed (dart, frame) pairs. */
	instances: number;
}

/** Breadth-first over (dart, frame), merged by position and heading. `keep` bounds a plane develop; past
 *  `cap` instances the develop fails, or with `partial` stops where it is (a disk, being breadth-first). */
function develop(
	d: MorphDarts,
	g: Geom,
	keep: (p: number[]) => boolean,
	cap: number,
	partial = false,
): Developed | null {
	const q = (v: number) => Math.round(v * 1e5) + 0;
	// Position and heading, each in full: on the sphere's equator a heading's x and y alone are ambiguous.
	const key = (h: number, G: M3) => `${h},${q(G[2])},${q(G[5])},${q(G[8])},${q(G[0])},${q(G[3])},${q(G[6])}`;
	const H: number[] = [];
	const F: M3[] = [];
	const index = new Map<string, number>();
	const add = (h: number, G: M3) => {
		const k = key(h, G);
		let i = index.get(k);
		if (i === undefined) {
			i = H.length;
			index.set(k, i);
			H.push(h);
			F.push(G);
		}
		return i;
	};
	add(d.seed, I3);
	for (let i = 0; i < H.length; i++) {
		if (H.length > cap) {
			if (!partial) return null;
			break;
		}
		const G = F[i];
		if (!keep([G[2], G[5], G[8]])) continue;
		const h = H[i];
		add(d.rneig[h], mul(G, rot(d.alpha[h])));
		add(d.glue[h], mul(mul(G, tx(g, d.elen[h])), rot(Math.PI)));
	}
	const vid = new Map<string, number>();
	const verts: number[][] = [];
	const vertOf = (G: M3) => {
		const p = [G[2], G[5], G[8]];
		const k = p.map((v) => Math.round(v * 1e5) + 0).join(",");
		let v = vid.get(k);
		if (v === undefined) {
			v = verts.length;
			vid.set(k, v);
			verts.push(p);
		}
		return v;
	};
	const faces: Developed["faces"] = [];
	const used = new Set<number>();
	for (let i = 0; i < H.length; i++) {
		if (used.has(i)) continue;
		const ring: number[] = [];
		const members: number[] = [];
		let x = i;
		let ok = false;
		for (let step = 0; step < 128; step++) {
			members.push(x);
			ring.push(vertOf(F[x]));
			const h = H[x];
			const G = mul(mul(mul(F[x], rot(d.alpha[h])), tx(g, d.elen[d.rneig[h]])), rot(Math.PI));
			const nx = index.get(key(d.glue[d.rneig[h]], G));
			if (nx === undefined) break;
			x = nx;
			if (x === i) {
				ok = true;
				break;
			}
		}
		if (!ok) continue;
		for (const m of members) used.add(m);
		const center = [0, 1, 2].map((t) => ring.reduce((a, v) => a + verts[v][t], 0) / ring.length);
		faces.push({ ring, dart: H[i], center });
	}
	return { verts, faces, instances: H.length };
}

/** The canvas a morphed type draws on, the one its catalogue neighbours in that geometry use; null when
 *  nothing is morphed. Cheap, so the Options tab and /play can both ask before anything is developed. */
export function morphSurface(sym: DSymbol | null, orders: readonly number[] | undefined): ShelfSurface | null {
	if (!sym || !orders) return null;
	const g = geometryOf(withOrders(sym, orders));
	return g < 0 ? "disk" : g > 0 ? "sphereEdges" : "flat";
}

// ---------------------------------------------------------------------------------------------------
// The three outputs.
// ---------------------------------------------------------------------------------------------------

/**
 * Fit the drawing to the record's own: every turn and every edge length is free, the record's angles and
 * lengths are the targets, and the constraints are that every vertex closes to a full turn and every tile
 * closes in the geometry. The circle pattern draws every tile convex; this keeps a star's reflex corners,
 * and keeps a regular polygon regular wherever the geometry allows one edge length. At a vertex whose
 * rotation order changed, its corners are scaled so their targets can still close.
 *
 * Damped Gauss-Newton (Levenberg-Marquardt) on the stacked residual, the Jacobian sparse (a turn touches
 * one vertex and one tile, a length two tiles) and solved by conjugate gradients; then the targets are
 * let go almost entirely and the closure driven to rounding. At the record's own orders the record's
 * drawing is an exact solution, so it comes back unchanged. Null when it does not converge.
 */
function fitShape(d: MorphDarts, shape: RecordShape, base: DSymbol, sym: DSymbol, g: Geom): MorphDarts | null {
	const D = d.rneig.length;
	const edgeOf = new Array<number>(D).fill(-1);
	let E = 0;
	for (let h = 0; h < D; h++) if (edgeOf[h] < 0) edgeOf[h] = edgeOf[d.glue[h]] = E++;
	// Targets, the length of an edge averaged over its two darts' readings of it.
	const tA = new Array<number>(D);
	const tL = new Array<number>(E).fill(0);
	const nL = new Array<number>(E).fill(0);
	for (let h = 0; h < D; h++) {
		const c = d.chamber[h];
		const j = d.seg[h];
		const a = j === 0 ? (shape.corner[c] * base.m12[c]) / sym.m12[c] : shape.turns[c]?.[j - 1];
		const l = shape.segs[c]?.[j];
		if (!(a > 0) || !(l > 0)) return null;
		tA[h] = a;
		tL[edgeOf[h]] += l;
		nL[edgeOf[h]]++;
	}
	const logT = tL.map((l, e) => Math.log(l / nL[e]));
	// Unknowns: turns, log lengths, and one log scale (H² and S² have no similarity).
	const U = D + E + 1;
	const u = new Array<number>(U);
	for (let h = 0; h < D; h++) u[h] = tA[h];
	let s0 = 0;
	for (let h = 0; h < D; h++) s0 += Math.log(d.elen[h]) - logT[edgeOf[h]];
	s0 /= D;
	for (let e = 0; e < E; e++) u[D + e] = logT[e] + s0;
	u[U - 1] = s0;

	// Vertex cycles and tile rings, with how many times each repeats round its point.
	const cycles: { darts: number[]; f: number }[] = [];
	const cycOf = new Array<number>(D).fill(-1);
	const rings: { darts: number[]; k: number }[] = [];
	const ringOf = new Array<number>(D).fill(-1);
	for (let h = 0; h < D; h++) {
		if (cycOf[h] < 0) {
			const c: number[] = [];
			for (let x = h; cycOf[x] < 0; x = d.rneig[x]) {
				cycOf[x] = cycles.length;
				c.push(x);
			}
			cycles.push({ darts: c, f: d.degree[h] / c.length });
		}
		if (ringOf[h] < 0) {
			const r: number[] = [];
			for (let x = h; ringOf[x] < 0; x = d.glue[d.rneig[x]]) {
				ringOf[x] = rings.length;
				r.push(x);
			}
			rings.push({ darts: r, k: Math.round(d.lvert[d.rneig[h]] / r.length) });
		}
	}
	const ringsOfEdge: number[][] = Array.from({ length: E }, () => []);
	for (let x = 0; x < D; x++) {
		const e = edgeOf[d.rneig[x]];
		if (!ringsOfEdge[e].includes(ringOf[x])) ringsOfEdge[e].push(ringOf[x]);
	}
	const C = cycles.length;
	const F = rings.length;
	const rowFace = C;
	const rowA = C + 9 * F;
	const rowL = rowA + D;
	const R = rowL + E;

	const faceRes = (f: number, v: number[]) => {
		let G = I3;
		for (const x of rings[f].darts)
			G = mul(mul(mul(G, rot(v[x])), tx(g, Math.exp(v[D + edgeOf[d.rneig[x]]]))), rot(Math.PI));
		let P = I3;
		for (let t = 0; t < rings[f].k; t++) P = mul(P, G);
		return P.map((x, i) => x - I3[i]);
	};
	const residual = (v: number[], W: number, w: number) => {
		const r = new Array<number>(R);
		cycles.forEach(({ darts, f }, i) => {
			r[i] = W * (darts.reduce((a, x) => a + v[x], 0) * f - 2 * Math.PI);
		});
		for (let f = 0; f < F; f++)
			faceRes(f, v).forEach((x, t) => {
				r[rowFace + 9 * f + t] = W * x;
			});
		for (let h = 0; h < D; h++) r[rowA + h] = w * (v[h] - tA[h]);
		for (let e = 0; e < E; e++) r[rowL + e] = w * (v[D + e] - v[U - 1] - logT[e]);
		return r;
	};
	// Sparse columns of the Jacobian: [row, value] pairs.
	const jacobian = (v: number[], W: number, w: number) => {
		const cols: [number, number][][] = [];
		const eps = 1e-7;
		const faceCols = (f: number, k: number, out: [number, number][]) => {
			const up = v.slice();
			up[k] += eps;
			const a = faceRes(f, up);
			const b = faceRes(f, v);
			a.forEach((x, t) => out.push([rowFace + 9 * f + t, (W * (x - b[t])) / eps]));
		};
		for (let h = 0; h < D; h++) {
			const col: [number, number][] = [
				[cycOf[h], W * cycles[cycOf[h]].f],
				[rowA + h, w],
			];
			faceCols(ringOf[h], h, col);
			cols.push(col);
		}
		for (let e = 0; e < E; e++) {
			const col: [number, number][] = [[rowL + e, w]];
			for (const f of ringsOfEdge[e]) faceCols(f, D + e, col);
			cols.push(col);
		}
		cols.push(Array.from({ length: E }, (_, e) => [rowL + e, -w] as [number, number]));
		return cols;
	};
	const norm2 = (r: number[]) => r.reduce((a, x) => a + x * x, 0);
	// One damped step: (JᵀJ + λ diag) δ = −Jᵀr by conjugate gradients.
	const step = (cols: [number, number][][], r: number[], lambda: number) => {
		const diag = cols.map((c) => c.reduce((a, [, x]) => a + x * x, 0) * (1 + lambda) + 1e-12);
		const Jv = (x: number[]) => {
			const y = new Array<number>(R).fill(0);
			cols.forEach((c, k) => {
				if (x[k]) for (const [row, val] of c) y[row] += val * x[k];
			});
			return y;
		};
		const JT = (y: number[]) => cols.map((c) => c.reduce((a, [row, val]) => a + val * y[row], 0));
		const A = (x: number[]) => {
			const out = JT(Jv(x));
			return out.map((o, k) => o + (diag[k] - cols[k].reduce((a, [, val]) => a + val * val, 0)) * x[k]);
		};
		const b = JT(r).map((x) => -x);
		const x = new Array<number>(U).fill(0);
		const res = b.slice();
		let z = res.map((q, k) => q / diag[k]);
		let p = z.slice();
		let rz = res.reduce((a, q, k) => a + q * z[k], 0);
		for (let it = 0; it < 400 && rz > 1e-30; it++) {
			const Ap = A(p);
			const alpha = rz / p.reduce((a, q, k) => a + q * Ap[k], 0);
			for (let k = 0; k < U; k++) {
				x[k] += alpha * p[k];
				res[k] -= alpha * Ap[k];
			}
			z = res.map((q, k) => q / diag[k]);
			const rz2 = res.reduce((a, q, k) => a + q * z[k], 0);
			p = z.map((q, k) => q + (rz2 / rz) * p[k]);
			rz = rz2;
		}
		return x;
	};
	const solve = (W: number, w: number, iters: number) => {
		let lambda = 1e-3;
		let r = residual(u, W, w);
		let cost = norm2(r);
		for (let it = 0; it < iters && cost > 1e-24; it++) {
			const dx = step(jacobian(u, W, w), r, lambda);
			const v = u.map((x, k) => x + dx[k]);
			const r2 = residual(v, W, w);
			const cost2 = norm2(r2);
			if (cost2 < cost) {
				for (let k = 0; k < U; k++) u[k] = v[k];
				r = r2;
				cost = cost2;
				lambda = Math.max(1e-9, lambda / 3);
			} else lambda *= 5;
			if (lambda > 1e8) break;
		}
	};
	if (D + E > 3000) return null;
	solve(100, 1, 40); // close up while keeping to the drawing
	solve(1, 1e-6, 30); // then close up exactly
	const closure = residual(u, 1, 0).slice(0, rowA);
	if (!(Math.max(...closure.map(Math.abs)) < 1e-8)) return null;
	const alpha = u.slice(0, D);
	if (alpha.some((a) => !(a > 0 && a < 2 * Math.PI))) return null;
	return { ...d, alpha, elen: edgeOf.map((e) => Math.exp(u[D + e])) };
}

/** What a record's drawing adds to its topology (recordSymbol.ts `recordShape`), per chamber of its symbol. */
export interface RecordShape {
	/** Points along the chamber's edge where only two tiles meet, as (t, h): t along the edge from the
	 *  chamber's vertex, h off it toward the chamber's tile, both in edge lengths. */
	bends: number[][][];
	/** The tile's colour as the record draws it, and its star (points, apex angle) when it is one. */
	tiles: { hue: number; star?: { points: number; apex: number } }[];
	/** The drawing's angles and lengths, for fitShape: the tile's corner at the chamber's vertex, its
	 *  angle at each drawn point along the edge, and the length of each piece from the vertex on. */
	corner: number[];
	turns: number[][];
	segs: number[][];
}

export interface Morph {
	id: string;
	geometry: Geom;
	/** The new group in orbifold notation. */
	name: string;
	disk?: HypDiskTiling;
	sphere?: SphPolyPattern;
	cell?: TranslationalCellData;
	/** True when the edges bend at their midpoints (the subdivision's pattern). */
	bent: boolean;
}

/** Draw the type with its cone points at the given orders; null when no picture could be made. */
/**
 * Draw the type with its cone points at the given orders. `hues` is the colour rule of the shelf the type
 * came from, kept through the morph: "class" (Tegula: one hue per symmetry class of tile) or "sides" (the
 * rest of the atlas: one hue per side count, so a heptagon is the heptagon's colour wherever it lands).
 */
export function morphTiling(
	base: DSymbol,
	vs: readonly number[],
	id: string,
	hues: "class" | "sides" = "class",
	shape?: RecordShape | null,
): Morph | { error: string; name: string } {
	const sym = withOrders(base, vs);
	const g = geometryOf(sym);
	const name = orbifoldName(sym);
	const shaped = !!shape?.bends.some((b) => b.length);
	let darts = buildDarts(sym, g, shaped);
	if (!darts || !closes(darts, g)) return { error: "no circle pattern converged for this symbol", name };
	// The record's drawn points go back on the straight edges (the subdivided fallback has its own bends).
	if (shape && shaped && !darts.bent) {
		darts = bendDarts(darts, shape.bends!, g);
		if (!closes(darts, g)) return { error: "the drawn shape does not close", name };
	}
	// Then toward the record's own angles and lengths, where the fit converges.
	if (shape && !darts.bent) {
		const fitted = fitShape(darts, shape, base, sym, g);
		if (fitted && closes(fitted, g)) darts = fitted;
	}
	const d = darts;
	const mid = `${id}#orb:${vs.join(",")}`;
	const common = { id: mid, geometry: g, name, bent: d.bent };
	// A tile whose order is unchanged keeps the record's own colour; a changed one takes its new shape's.
	const hueOf = (h: number) => {
		if (hues === "class") return tegulaHue(d.faceColor[h]);
		const c = d.chamber[h];
		const tile = shape?.tiles[c];
		const ratio = sym.m01[c] / base.m01[c];
		if (tile && ratio === 1) return tile.hue;
		if (tile?.star) return starHue(Math.round(tile.star.points * ratio), tile.star.apex);
		return polygonHue(d.drawn[h]);
	};
	// The disk reads each face's hue from its colour slot (HypDiskTiling.faceHue).
	if (g < 0) {
		const cone = {
			vertex: new Map<number, number>(),
			tile: new Map<number, number>(),
			edge: new Map<number, number>(),
		};
		conePoints(base).forEach((p, k) => p.chambers.forEach((c) => cone[p.kind].set(c, k)));
		const at = (kind: keyof typeof cone, c: number) => cone[kind].get(c) ?? -1;
		// An edge drawn in pieces has no one midpoint dart, so only straight edges mark their class.
		const pieces = new Set(d.chamber.filter((_, h) => d.bend[h]));
		const disk = {
			...d,
			faceColor: d.faceColor.map((_, h) => hueOf(h)),
			// A bent edge's midpoint is a vertex of the drawn map, so its class shows there, not on a half-edge.
			vCone: d.chamber.map((c, h) => (d.bend[h] ? -1 : d.atMid[h] ? at("edge", c) : at("vertex", c))),
			eCone: d.chamber.map((c) => (d.bent || pieces.has(c) ? -1 : at("edge", c))),
			fCone: d.chamber.map((c) => at("tile", c)),
		};
		return { ...common, disk: { id: mid, edge: d.elen[0], darts: disk, faceHue: true } };
	}
	if (g > 0) {
		const dev = develop(d, g, () => true, 400000);
		if (!dev) return { error: "the sphere did not close", name };
		return { ...common, sphere: spherePattern(mid, name, dev, d, hueOf) };
	}
	const cell = planeCell(d, hueOf);
	return cell ? { ...common, cell } : { error: "no period lattice found", name };
}

function spherePattern(
	id: string,
	name: string,
	dev: Developed,
	d: MorphDarts,
	hueOf: (h: number) => number,
): SphPolyPattern {
	const vclass = new Array<number>(dev.verts.length).fill(-1);
	const edges = new Map<string, [number, number]>();
	// Faces wind one way in the frame and the solid wants them counter-clockwise from outside.
	const faces = dev.faces.map(({ ring, center }) => {
		const [a, b, c] = [ring[0], ring[1], ring[2]].map((v) => dev.verts[v]);
		const n = cross(sub(b, a), sub(c, a));
		return n[0] * center[0] + n[1] * center[1] + n[2] * center[2] < 0 ? ring.slice().reverse() : ring;
	});
	faces.forEach((ring) =>
		ring.forEach((v, t) => {
			const w = ring[(t + 1) % ring.length];
			edges.set(v < w ? `${v},${w}` : `${w},${v}`, [Math.min(v, w), Math.max(v, w)]);
		}),
	);
	dev.faces.forEach(({ ring, dart }) => {
		let h = dart;
		for (const v of ring) {
			if (vclass[v] < 0) vclass[v] = d.vclass[h] < 0 ? Math.max(...d.vclass) + 1 : d.vclass[h];
			h = d.glue[d.rneig[h]];
		}
	});
	const faceSize = dev.faces.map(({ dart }) => d.drawn[dart]);
	const sizes = [...new Set(faceSize)].sort((a, b) => a - b);
	// One fill group per hue, the hue given outright: the morph colours as the plane and the disk do.
	const fillHue = [...new Set(dev.faces.map(({ dart }) => hueOf(dart)))];
	const fillGroup = dev.faces.map(({ dart }) => fillHue.indexOf(hueOf(dart)));
	return {
		id,
		k: Math.max(...d.vclass) + 1,
		certK: Math.max(...d.vclass) + 1,
		// The shelf's own base, so the solid takes the shelf's colours (lib/render/sphPoly.ts).
		// Tegula's base colours the solid by class (lib/render/sphPoly.ts); without fill groups it goes by size.
		base: "morph",
		family: name,
		config: name,
		edge: d.elen[0],
		vertices: dev.verts.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
		faces,
		faceSize,
		fillGroup,
		fillHue,
		edges: [...edges.values()],
		vorbit: vclass,
		symOrbit: vclass,
		stats: {
			verts: dev.verts.length,
			edges: edges.size,
			faces: faces.length,
			// Flags on the sphere over flags in the quotient; a dart is two flags.
			symmetryOrder: Math.round((2 * dev.instances) / d.chambers),
			symmetryOrbits: Math.max(...vclass) + 1,
			sizes,
			sizeCensus: sizes.map((s) => faceSize.filter((x) => x === s).length),
			figures: [],
			greatCircleFaces: 0,
			certOrbits: Math.max(...vclass) + 1,
		},
	} as SphPolyPattern;
}

const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const cross = (a: number[], b: number[]) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

/** A flat result: the translations read off a develop, then one tile per translation class. */
function planeCell(d: MorphDarts, hueOf: (h: number) => number): TranslationalCellData | null {
	const scale = Math.max(...d.elen);
	// Every cell holds at most 6 instances of a dart, so a hundred per dart cross a dozen cells.
	const probe = develop(d, 0, () => true, 100 * d.rneig.length, true);
	if (!probe) return null;
	// Two faces from the same dart with the same orientation differ by a translation.
	const first = new Map<string, number[]>();
	const gens: number[][] = [];
	for (const f of probe.faces) {
		const [a, b] = [probe.verts[f.ring[0]], probe.verts[f.ring[1]]];
		const k = `${f.dart}|${Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) * 1e4)}`;
		const p = first.get(k);
		if (p) gens.push([a[0] - p[0], a[1] - p[1]]);
		else first.set(k, a);
	}
	const basis = latticeBasis(gens, 1e-6 * scale);
	if (!basis) return null;
	// Far enough that every tile with its centre in the cell [0,1)² is complete: a tile's radius past it.
	const tile = (Math.max(...d.drawn) * scale) / 3;
	const reach = Math.hypot(basis[0][0] + basis[1][0], basis[0][1] + basis[1][1]) + 2 * tile;
	const dev = develop(d, 0, (p) => Math.hypot(p[0], p[1]) < reach, 400000);
	if (!dev) return null;
	const [[a, b], [c, e]] = basis;
	const det = a * e - b * c;
	const cellPolygons = [];
	let area = 0;
	for (const f of dev.faces) {
		// Fractional coordinates of the centre, from a generic origin so no centre sits on a cell wall.
		const x = f.center[0] - 0.0137 * scale;
		const y = f.center[1] - 0.0291 * scale;
		const u = (x * e - y * c) / det;
		const v = (a * y - b * x) / det;
		if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
		let vertices = f.ring.map((id) => [dev.verts[id][0], dev.verts[id][1]]);
		const signed = vertices.reduce((s, p, i) => {
			const q = vertices[(i + 1) % vertices.length];
			return s + p[0] * q[1] - q[0] * p[1];
		}, 0);
		if (signed < 0) vertices = vertices.reverse();
		area += Math.abs(signed) / 2;
		cellPolygons.push({ n: d.drawn[f.dart], vertices, hue: hueOf(f.dart) });
	}
	// The picked tiles must fill exactly one cell, or the lattice was too fine or the develop too small.
	if (Math.abs(area - Math.abs(det)) > 1e-6 * Math.abs(det)) return null;
	return { cellPolygons, basis };
}

/** develop_dsym.py `lattice_basis`: Euclid's algorithm in the plane, then Lagrange-Gauss reduction. */
function latticeBasis(gens: number[][], tol: number): number[][] | null {
	let B: number[][] = [];
	const pending = gens.filter((g) => Math.hypot(g[0], g[1]) > tol);
	const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1];
	// Noisy generators (a drawing that is not quite periodic) would shrink the basis for ever.
	for (let guard = 0; pending.length; guard++) {
		if (guard > 20000) return null;
		let g = pending.pop()!;
		if (B.length === 2) {
			const [[a, b], [c, e]] = B;
			const det = a * e - b * c;
			const u = Math.round((g[0] * e - g[1] * c) / det);
			const v = Math.round((a * g[1] - b * g[0]) / det);
			g = [g[0] - u * a - v * c, g[1] - u * b - v * e];
		} else if (B.length === 1) {
			const t = Math.round(dot(g, B[0]) / dot(B[0], B[0]));
			g = [g[0] - t * B[0][0], g[1] - t * B[0][1]];
		}
		if (Math.hypot(g[0], g[1]) <= tol) continue;
		if (B.length < 2 && (!B.length || Math.abs(B[0][0] * g[1] - B[0][1] * g[0]) > tol)) {
			B.push(g);
			continue;
		}
		pending.push(...B);
		B = [g];
	}
	if (B.length < 2) return null;
	let [a, c] = B;
	if (![...a, ...c].every(Number.isFinite)) return null;
	for (let guard = 0; guard < 200; guard++) {
		if (dot(a, a) > dot(c, c)) [a, c] = [c, a];
		const t = Math.round(dot(a, c) / dot(a, a));
		const shorter = [c[0] - t * a[0], c[1] - t * a[1]];
		if (dot(shorter, shorter) > dot(c, c) - tol) break;
		c = shorter;
	}
	if (a[0] * c[1] - a[1] * c[0] < 0) c = [-c[0], -c[1]];
	return [a, c];
}
