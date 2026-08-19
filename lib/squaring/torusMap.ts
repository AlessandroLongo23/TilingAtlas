// The genus-1 analogue of planarMap.ts: a periodic tiling, quotiented by its own translation lattice.
//
// A polyhedron's skeleton is a graph on a sphere. A periodic plane tiling's skeleton, divided by the
// lattice that repeats it, is a graph on a TORUS — the fundamental cell with its opposite sides glued.
// Everything downstream (lib/squaring/torusSquaring.ts) needs the same three things planarMap.ts
// provides, faces, darts and twins, plus one the sphere never needed: how far each dart travels in
// lattice steps. Two vertices of the quotient can be joined by several different edges of the plane
// tiling, distinguished only by which cell the far end lands in, so the lattice shift is part of an
// edge's identity and not decoration.
//
// Verified against the shipped atlas cells: the quotient of a valid periodic tiling always has
// V - E + F = 0, which is the check `chi` exists for. A non-zero value means the cell was read wrong,
// never that the tiling is exotic.

/** One primitive translation cell: the tiles it contains, and the two vectors that repeat it. */
export interface TorusCell {
	/** Tile outlines in the plane, absolute coordinates. Winding is normalised on the way in. */
	polygons: [number, number][][];
	basis: [[number, number], [number, number]];
}

export interface TorusDart {
	face: number;
	tail: number;
	head: number;
	/** Lattice steps from the tail's cell to the head's cell. Non-zero exactly when the edge wraps. */
	vshift: [number, number];
	/** Which cell the tail itself sits in, for the drawn instance of this dart. */
	tshift: [number, number];
	/** Reduced midpoint, the key that pairs a dart with the one running the other way. */
	mid: [number, number];
	/** Which cell that midpoint came from. The difference across a twin pair is the dual shift. */
	ms: [number, number];
	/** Unit direction, rounded. Distinguishes the two darts of an edge from each other. */
	dir: [number, number];
}

export interface TorusEdge {
	tail: number;
	head: number;
	vshift: [number, number];
	tshift: [number, number];
	face: number;
	/** The dart that runs along this edge's positive direction. */
	dart: number;
}

export interface TorusMap {
	basis: [[number, number], [number, number]];
	/** Vertex positions inside the cell, for drawing. */
	vertices: [number, number][];
	/** Tile outlines after T-junction splitting — what the drawing should use, not the input. */
	polygons: [number, number][][];
	faces: number[][];
	darts: TorusDart[];
	twin: number[];
	edgeOf: number[];
	signOf: number[];
	edges: TorusEdge[];
	V: number;
	E: number;
	F: number;
	/** V - E + F. Zero for every genuine periodic tiling. */
	chi: number;
	/** How many extra vertices the T-junction pass had to insert. */
	tjunctions: number;
}

export interface TorusMapFailure {
	reason: "degenerate-basis" | "unmatched-dart" | "euler";
	detail: string;
}

const TOL = 1e-6;
const CLUSTER = 1e-5;

const signedArea = (v: readonly [number, number][]): number => {
	let a = 0;
	for (let i = 0; i < v.length; i++) {
		const j = (i + 1) % v.length;
		a += v[i][0] * v[j][1] - v[j][0] * v[i][1];
	}
	return a / 2;
};

/**
 * Build the quotient map, or explain why the cell could not be read.
 *
 * Returns a failure instead of throwing because the atlas ships tens of thousands of cells and a build
 * script wants to count the ones it could not use, not stop at the first.
 */
export function buildTorusMap(cell: TorusCell): { ok: true; map: TorusMap } | { ok: false; error: TorusMapFailure } {
	const [a1, a2] = cell.basis;
	const det = a1[0] * a2[1] - a1[1] * a2[0];
	if (Math.abs(det) < 1e-12) {
		return { ok: false, error: { reason: "degenerate-basis", detail: `|det| = ${Math.abs(det)}` } };
	}
	const inv = [a2[1] / det, -a2[0] / det, -a1[1] / det, a1[0] / det] as const;

	// Every face must wind the same way. If one is reversed, both darts of a shared edge point the same
	// direction and the pair never matches — which reads as "not edge-to-edge" and is really a winding
	// bug. Cheaper to enforce here than to require of every caller.
	const polygons = cell.polygons.map((p) => (signedArea(p) > 0 ? [...p] : [...p].reverse()));

	/** Lattice coordinates of a point, split into a fractional part and the cell it came from. */
	const reduce = (p: readonly [number, number]): { f: [number, number]; s: [number, number] } => {
		const u = inv[0] * p[0] + inv[1] * p[1];
		const v = inv[2] * p[0] + inv[3] * p[1];
		let iu = Math.floor(u + TOL);
		let iv = Math.floor(v + TOL);
		let fu = u - iu;
		let fv = v - iv;
		if (fu > 1 - TOL) {
			fu = 0;
			iu += 1;
		}
		if (fv > 1 - TOL) {
			fv = 0;
			iv += 1;
		}
		return { f: [fu, fv], s: [iu, iv] };
	};

	// Vertices, clustered with a tolerance. A corner landing exactly on the cell boundary can come out
	// as 0.9999999 from one tile and 0.0000001 from the next; rounding to a fixed number of places
	// would file those as two different vertices and the map would never close.
	const cellCoord: [number, number][] = [];
	const vertices: [number, number][] = [];
	const near = (a: number, b: number): boolean => {
		const d = Math.abs(a - b);
		return Math.min(d, 1 - d) < CLUSTER;
	};
	const vertexAt = (p: readonly [number, number]): { id: number; s: [number, number] } => {
		const { f, s } = reduce(p);
		for (let i = 0; i < cellCoord.length; i++) {
			if (near(cellCoord[i][0], f[0]) && near(cellCoord[i][1], f[1])) return { id: i, s };
		}
		cellCoord.push([f[0], f[1]]);
		vertices.push([f[0] * a1[0] + f[1] * a2[0], f[0] * a1[1] + f[1] * a2[1]]);
		return { id: cellCoord.length - 1, s };
	};
	for (const poly of polygons) for (const p of poly) vertexAt(p);

	// T-JUNCTIONS. A cell polygon lists only its own corners. Where a neighbour's vertex sits partway
	// along this tile's side, that side is one dart here and two darts there, and nothing pairs. Split
	// every side at any vertex lying strictly inside it. Without this pass most of the atlas fails to
	// close up at all, and the ones that do close come out with the wrong Euler characteristic.
	//
	// The translates to test are chosen PER SIDE, from that side's own extent in lattice coordinates.
	// They used to come from a fixed 3×3 block around the origin cell, which silently assumed the cell's
	// tiles were drawn near the origin. They are not: an atlas `renderCell` places its tiles wherever the
	// builder put them, and spans reaching u ∈ [−1.44, 0.78] are ordinary. A T-junction two cells out was
	// then never a candidate, its side went unsplit, and the map failed to close — which is why the
	// scaled shelves reported three records in four as "not a consistent quotient" when the cells were
	// exact (measured 2026-08-19: tile area equalled the basis covolume to the last digit in every one
	// of the failures sampled). Deriving the range from the segment costs less than the old block, too,
	// since a side spans about one cell and the ranges below collapse to one or two values each.
	let tjunctions = 0;
	const split = (P: readonly [number, number], Q: readonly [number, number]): [number, number][] => {
		const dx = Q[0] - P[0];
		const dy = Q[1] - P[1];
		const len2 = dx * dx + dy * dy;
		const len = Math.sqrt(len2);
		const uP = inv[0] * P[0] + inv[1] * P[1];
		const vP = inv[2] * P[0] + inv[3] * P[1];
		const uQ = inv[0] * Q[0] + inv[1] * Q[1];
		const vQ = inv[2] * Q[0] + inv[3] * Q[1];
		const uLo = Math.min(uP, uQ) - TOL;
		const uHi = Math.max(uP, uQ) + TOL;
		const vLo = Math.min(vP, vQ) - TOL;
		const vHi = Math.max(vP, vQ) + TOL;
		// "Strictly inside" has to be measured in WORLD units, not in the parameter t. A candidate sitting
		// exactly on an endpoint comes back as t = 1e-7-ish once the coordinates are a few units from the
		// origin, and a fixed threshold on t then lets it through: the side gets split at its own corner,
		// both faces do it symmetrically so every dart still pairs, and the map comes out with one edge too
		// many and χ = −1. Tying the threshold to the same 1e-6 world tolerance the collinearity test uses
		// keeps the two agreeing wherever the tiles happen to have been drawn.
		const tEps = Math.max(1e-9, 1e-6 / len);
		const hits: { t: number; p: [number, number] }[] = [];
		for (const [fu, fv] of cellCoord) {
			for (let i = Math.ceil(uLo - fu); i <= Math.floor(uHi - fu); i++) {
				for (let j = Math.ceil(vLo - fv); j <= Math.floor(vHi - fv); j++) {
					const u = fu + i;
					const v = fv + j;
					const R: [number, number] = [u * a1[0] + v * a2[0], u * a1[1] + v * a2[1]];
					const t = ((R[0] - P[0]) * dx + (R[1] - P[1]) * dy) / len2;
					if (!(t > tEps && t < 1 - tEps)) continue;
					if (Math.abs((R[0] - P[0]) * dy - (R[1] - P[1]) * dx) / len > 1e-6) continue;
					hits.push({ t, p: R });
				}
			}
		}
		hits.sort((x, y) => x.t - y.t);
		const out: [number, number][] = [[P[0], P[1]]];
		let last = -Infinity;
		for (const h of hits) {
			if (h.t - last < tEps) continue;
			last = h.t;
			out.push(h.p);
			tjunctions += 1;
		}
		return out;
	};
	const expanded = polygons.map((poly) => {
		const ring: [number, number][] = [];
		for (let i = 0; i < poly.length; i++) ring.push(...split(poly[i], poly[(i + 1) % poly.length]));
		return ring;
	});

	// Darts, keyed on the reduced MIDPOINT. Keying on the endpoint pair instead would merge the parallel
	// edges that a small cell routinely has (two vertices joined both ways round the torus), and would
	// lose loops entirely.
	const faces: number[][] = [];
	const darts: TorusDart[] = [];
	for (let fi = 0; fi < expanded.length; fi++) {
		const poly = expanded[fi];
		const ring: number[] = [];
		for (let i = 0; i < poly.length; i++) {
			const P = poly[i];
			const Q = poly[(i + 1) % poly.length];
			const tail = vertexAt(P);
			const head = vertexAt(Q);
			const m = reduce([(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2]);
			const dx = Q[0] - P[0];
			const dy = Q[1] - P[1];
			const n = Math.hypot(dx, dy);
			ring.push(darts.length);
			darts.push({
				face: fi,
				tail: tail.id,
				head: head.id,
				vshift: [head.s[0] - tail.s[0], head.s[1] - tail.s[1]],
				tshift: tail.s,
				mid: [Math.round(m.f[0] * 1e4) / 1e4, Math.round(m.f[1] * 1e4) / 1e4],
				ms: m.s,
				dir: [Math.round((dx / n) * 1e4) / 1e4, Math.round((dy / n) * 1e4) / 1e4],
			});
		}
		faces.push(ring);
	}

	const byMid = new Map<string, number[]>();
	for (let i = 0; i < darts.length; i++) {
		const k = `${darts[i].mid[0]},${darts[i].mid[1]}`;
		const list = byMid.get(k);
		if (list) list.push(i);
		else byMid.set(k, [i]);
	}
	const twin = new Array<number>(darts.length).fill(-1);
	for (const group of byMid.values()) {
		for (const i of group) {
			if (twin[i] !== -1) continue;
			const d = darts[i].dir;
			const j = group.find(
				(k) => k !== i && twin[k] === -1 && darts[k].dir[0] === -d[0] && darts[k].dir[1] === -d[1],
			);
			if (j === undefined) {
				return {
					ok: false,
					error: {
						reason: "unmatched-dart",
						detail: `no opposite dart at midpoint (${darts[i].mid[0]}, ${darts[i].mid[1]})`,
					},
				};
			}
			twin[i] = j;
			twin[j] = i;
		}
	}

	const edgeOf = new Array<number>(darts.length).fill(-1);
	const signOf = new Array<number>(darts.length).fill(0);
	const edges: TorusEdge[] = [];
	for (let i = 0; i < darts.length; i++) {
		if (edgeOf[i] !== -1) continue;
		const j = twin[i];
		edgeOf[i] = edges.length;
		edgeOf[j] = edges.length;
		signOf[i] = 1;
		signOf[j] = -1;
		const d = darts[i];
		edges.push({ tail: d.tail, head: d.head, vshift: d.vshift, tshift: d.tshift, face: d.face, dart: i });
	}

	const V = vertices.length;
	const E = edges.length;
	const F = faces.length;
	const chi = V - E + F;
	if (chi !== 0) {
		return { ok: false, error: { reason: "euler", detail: `V-E+F = ${chi}, expected 0 (V=${V} E=${E} F=${F})` } };
	}
	return {
		ok: true,
		map: { basis: cell.basis, vertices, polygons: expanded, faces, darts, twin, edgeOf, signOf, edges, V, E, F, chi, tjunctions },
	};
}

/**
 * Does the tiling's symmetry group contain a half-turn, and does it move any edge?
 *
 * This is not decoration. A symmetry g acts on H¹(T;ℝ), and the harmonic form of class σ pulls back to
 * the one of class g*σ, so g can only force two edges to carry the same current INSIDE one squaring
 * when g*σ = ±σ. A half-turn acts as −1 on H¹ for every class at once, giving ω∘g = −ω, so the sides
 * are forced equal along every edge orbit it moves — at every class, with no exceptions. A 3-, 4- or
 * 6-fold rotation acts as a genuine rotation of ℝ² and fixes no non-zero class, so it costs nothing.
 *
 * Measured on this corpus: a half-turn that moves an edge means no perfect squared torus at any class,
 * 58 records out of 58, and the mechanism itself (|ω(g·e)| = |ω(e)|) held exactly across 216
 * (record, class) pairs. The converse is false — 6 of 63 half-turn-free records gave perfect
 * squarings and 57 did not — so this predicts failure only, never success.
 */
export function halfTurn(map: TorusMap): { present: boolean; moves: number } {
	const TOLR = 3e-4;
	const key = map.edges.map((e) => {
		const d = map.darts[e.dart];
		const dir: [number, number] =
			d.dir[0] < -d.dir[0] || (d.dir[0] === -d.dir[0] && d.dir[1] < -d.dir[1])
				? [-d.dir[0], -d.dir[1]]
				: [d.dir[0], d.dir[1]];
		return { mid: d.mid, dir };
	});
	if (key.length === 0) return { present: false, moves: 0 };
	const wrap = (x: number): number => {
		const u = x - Math.floor(x);
		return u;
	};
	const close = (a: number, b: number): boolean => {
		const d = Math.abs(a - b);
		return Math.min(d, 1 - d) < TOLR;
	};
	const inSet = (u: number, v: number, dir: [number, number]): boolean =>
		key.some((k) => k.dir[0] === dir[0] && k.dir[1] === dir[1] && close(k.mid[0], u) && close(k.mid[1], v));

	const first = key[0];
	for (const cand of key) {
		if (cand.dir[0] !== first.dir[0] || cand.dir[1] !== first.dir[1]) continue;
		for (const hu of [0, 0.5]) {
			for (const hv of [0, 0.5]) {
				const cx = (first.mid[0] + cand.mid[0]) / 2 + hu;
				const cy = (first.mid[1] + cand.mid[1]) / 2 + hv;
				let ok = true;
				let moves = 0;
				for (const k of key) {
					const u = wrap(2 * cx - k.mid[0]);
					const v = wrap(2 * cy - k.mid[1]);
					if (!inSet(u, v, k.dir)) {
						ok = false;
						break;
					}
					if (!close(u, k.mid[0]) || !close(v, k.mid[1])) moves += 1;
				}
				if (ok) return { present: true, moves };
			}
		}
	}
	return { present: false, moves: 0 };
}
