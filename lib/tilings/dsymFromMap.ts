// A tiling's Delaney-Dress symbol, read off the geometry the atlas already ships: a period cell, a solid,
// or a hyperbolic record's quotient darts. Whatever the source, it is first written as a MAP (faces as
// rings of sides, each side naming the vertex it leaves and the edge it runs along) and the symbol is the
// map's flags. The minimal image then folds in every combinatorial symmetry the tiling has, so the result
// is the type's symbol under its full group, the same object Tegula ships for its own types.
//
// On a tiling by regular polygons the combinatorial and the geometric symmetry agree (such a tiling is
// fixed up to isometry by which tiles meet), so the symbol's vertex classes are the record's k. Elsewhere
// the symbol can be MORE symmetric than the picture: it is the topological type, not the shape.

import { DSymbol, minimalBlocks, minimalImage } from "@/lib/classes/algorithm/delaney/DSymbol";
import type { CellPolygonData, CellVertex, TranslationalCellData } from "@/lib/classes/algorithm/types";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import { interiorAngle } from "@/lib/render/hyperbolicDevelopClient";

/** One side of a face: the vertex it starts at, the edge it runs along, and where it starts (when drawn). */
export interface Side {
	v: number;
	e: number;
	at?: number[];
	/** Points drawn along the side that are not vertices of the tiling (two tiles meet there): a star's
	 *  dent against a 12-gon's corner. Filled in when such points are dissolved. */
	path?: number[][];
}

/** A map's raw symbol (not yet folded by its symmetry) and, when its sides carry positions, where each
 *  chamber's vertex, edge midpoint and tile centre are drawn. */
export interface DrawnMap {
	sym: DSymbol;
	/** Per chamber: its vertex, edge midpoint and tile centre; the dissolved points from its vertex to the
	 *  edge's far end; whether its tile lies left of that direction; and which face of the input it is in. */
	at: { v: number[]; e: number[]; f: number[]; path: number[][]; left: boolean; face: number }[] | null;
	/** Period cells only: the cell polygon each face came from, parallel to the faces. */
	sources?: CellPolygonData[];
}

/**
 * The symbol of a map whose faces are all oriented the same way, so that the two sides on an edge run
 * along it in opposite directions. Chamber 2s + t is side s's flag at its start (t = 0) or end (t = 1).
 * A face of a quotient may be a fraction of its tile (a rotation about the tile's centre), so its true
 * corner count can be given, and likewise each vertex's degree; by default they are counted off the map.
 * Null when the input is not a closed map (an edge with other than two sides, or one in a quotient).
 */
export function mapDSymbol(faces: Side[][], opts: MapOptions = {}): DSymbol | null {
	const m = mapSymbol(faces, opts);
	return m && minimalImage(m.sym);
}

interface MapOptions {
	faceSize?: number[];
	degree?: (v: number) => number;
	halfTurns?: boolean;
}

/** mapDSymbol before the fold, keeping where every chamber is drawn. */
export function mapSymbol(faces: Side[][], opts: MapOptions = {}): DrawnMap | null {
	if (!opts.degree) faces = dissolveDegreeTwo(faces);
	const start: number[] = [];
	let n = 0;
	for (const f of faces) {
		start.push(n);
		n += f.length;
	}
	const N = 2 * n;
	const s0 = new Array<number>(N);
	const s1 = new Array<number>(N);
	const s2 = new Array<number>(N).fill(-1);
	const m01 = new Array<number>(N);
	const m12 = new Array<number>(N);
	const corners = new Map<number, number>();
	const onEdge = new Map<number, number[]>();
	faces.forEach((f, fi) => {
		f.forEach(({ v, e }, i) => {
			const side = start[fi] + i;
			const prev = start[fi] + ((i + f.length - 1) % f.length);
			s0[2 * side] = 2 * side + 1;
			s0[2 * side + 1] = 2 * side;
			s1[2 * side] = 2 * prev + 1;
			s1[2 * prev + 1] = 2 * side;
			m01[2 * side] = m01[2 * side + 1] = opts.faceSize?.[fi] ?? f.length;
			corners.set(v, (corners.get(v) ?? 0) + 1);
			const list = onEdge.get(e) ?? [];
			list.push(side);
			onEdge.set(e, list);
		});
	});
	for (const sides of onEdge.values()) {
		// A quotient's edge with a half-turn at its midpoint is one side, its own partner.
		if (sides.length === 1 && opts.halfTurns) sides.push(sides[0]);
		if (sides.length !== 2) return null;
		const [a, b] = sides;
		// Opposite directions: a's start is b's end and the other way round. One side twice is an edge
		// with a half-turn at its midpoint, in a quotient: its start and end are swapped by it.
		s2[2 * a] = 2 * b + 1;
		s2[2 * b + 1] = 2 * a;
		s2[2 * a + 1] = 2 * b;
		s2[2 * b] = 2 * a + 1;
	}
	faces.forEach((f, fi) =>
		f.forEach(({ v }, i) => {
			const side = start[fi] + i;
			const next = f[(i + 1) % f.length].v;
			m12[2 * side] = opts.degree?.(v) ?? corners.get(v)!;
			m12[2 * side + 1] = opts.degree?.(next) ?? corners.get(next)!;
		}),
	);
	if (s2.includes(-1)) return null;
	let at: DrawnMap["at"] = null;
	if (faces.every((f) => f.every((x) => x.at))) {
		at = new Array(N);
		const mid = (p: number[], q: number[]) => p.map((x, t) => (x + q[t]) / 2);
		faces.forEach((f, fi) => {
			const all = f.flatMap((x) => [x.at!, ...(x.path ?? [])]);
			const centre = all[0].map((_, t) => all.reduce((sum, q) => sum + q[t], 0) / all.length);
			f.forEach((x, i) => {
				const side = start[fi] + i;
				const end = f[(i + 1) % f.length].at!;
				const path = x.path ?? [];
				// A bent edge's midpoint is its middle drawn point when it has one.
				const e = path.length % 2 === 1 ? path[(path.length - 1) / 2] : mid(x.at!, end);
				at![2 * side] = { v: x.at!, e, f: centre, path, left: true, face: fi };
				at![2 * side + 1] = { v: end, e, f: centre, path: path.slice().reverse(), left: false, face: fi };
			});
		});
	}
	return { sym: new DSymbol(s0, s1, s2, m01, m12), at };
}

/**
 * A covering of `src` onto `dst`: chamber images commuting with every σ and keeping both m. The drawn
 * tiling's chambers (on a torus, on a solid) cover the type's symbol this way, which is what says which
 * drawn vertices, edges and tiles belong to one of the type's classes. Null when there is none.
 */
export function coverOnto(
	src: DSymbol,
	dst: DSymbol,
	srcLabel?: readonly number[],
	dstLabel?: readonly number[],
): number[] | null {
	const label = srcLabel && dstLabel ? (x: number, y: number) => srcLabel[x] === dstLabel[y] : () => true;
	for (let y0 = 0; y0 < dst.n; y0++) {
		const f = new Array<number>(src.n).fill(-1);
		f[0] = y0;
		const todo = [0];
		let ok = true;
		while (ok && todo.length) {
			const x = todo.pop()!;
			const y = f[x];
			if (src.m01[x] !== dst.m01[y] || src.m12[x] !== dst.m12[y] || !label(x, y)) ok = false;
			for (let i = 0; ok && i < 3; i++) {
				const xs = src.s[i][x];
				const ys = dst.s[i][y];
				if (f[xs] < 0) {
					f[xs] = ys;
					todo.push(xs);
				} else if (f[xs] !== ys) ok = false;
			}
		}
		if (ok && !f.includes(-1)) return f;
	}
	return null;
}

/** Where a class of the type is drawn: the vertices, edge midpoints or tile centres of `map` whose chambers
 *  cover `chambers` of `dst`, each once. */
export function drawnPoints(
	map: DrawnMap,
	dst: DSymbol,
	chambers: readonly number[],
	kind: "vertex" | "edge" | "tile",
	dstLabel?: readonly number[],
): number[][] {
	const f = map.at ? coverOnto(map.sym, dst, drawnLabels(map), dstLabel) : null;
	if (!f || !map.at) return [];
	const want = new Set(chambers);
	const key = kind === "vertex" ? "v" : kind === "edge" ? "e" : "f";
	const out = new Map<string, number[]>();
	f.forEach((y, x) => {
		if (!want.has(y)) return;
		const p = map.at![x][key];
		out.set(p.map((t) => Math.round(t * 1e5)).join(","), p);
	});
	return [...out.values()];
}

/** A vertex met by two sides only is a point drawn on an edge (a bent edge's midpoint), not a vertex of
 *  the tiling: drop it, and join the two edges it sat between. */
function dissolveDegreeTwo(faces: Side[][]): Side[][] {
	const count = new Map<number, number>();
	for (const f of faces) for (const { v } of f) count.set(v, (count.get(v) ?? 0) + 1);
	if (![...count.values()].includes(2)) return faces;
	const parent = new Map<number, number>();
	const find = (e: number): number => {
		const p = parent.get(e) ?? e;
		if (p === e) return e;
		const r = find(p);
		parent.set(e, r);
		return r;
	};
	for (const f of faces)
		f.forEach(({ v, e }, i) => {
			if (count.get(v) !== 2) return;
			const before = find(f[(i + f.length - 1) % f.length].e);
			const after = find(e);
			if (before !== after) parent.set(Math.max(before, after), Math.min(before, after));
		});
	// Each kept side carries the dropped points that followed it, in order: the edge's drawn shape.
	return faces.map((f) => {
		const first = f.findIndex(({ v }) => count.get(v) !== 2);
		const out: Side[] = [];
		for (let k = 0; first >= 0 && k < f.length; k++) {
			const x = f[(first + k) % f.length];
			if (count.get(x.v) !== 2) out.push({ v: x.v, e: find(x.e), at: x.at, path: [] });
			else if (x.at) out[out.length - 1].path!.push(x.at);
		}
		return out;
	});
}

// ---------------------------------------------------------------------------------------------------
// Period cells. Vertices and edges are identified across the lattice by their fractional position, and a
// corner of one tile lying on another's side splits that side (a tiling need not be edge-to-edge).
// ---------------------------------------------------------------------------------------------------

/**
 * Points of the torus [0,1)², merged when closer than `tol` (wrapping round): shipped cells are rounded,
 * so a grid key alone would split a point that straddles a grid line. Each point is binned on a grid of
 * pitch `tol` and looked up in its bin and the eight around it.
 */
class TorusSnap {
	private bins = new Map<string, { u: number; v: number; id: number }[]>();
	size = 0;
	/** Find without adding: −1 for a point not in the set. */
	lookupOnly = false;
	constructor(private tol: number) {}
	id(u: number, v: number): number {
		u -= Math.floor(u);
		v -= Math.floor(v);
		const G = Math.round(1 / this.tol);
		// −1e-17 wraps to exactly 1, which would land in a bin no neighbour lookup reaches.
		const iu = Math.floor(u * G) % G;
		const iv = Math.floor(v * G) % G;
		const near = (x: number) => Math.min(Math.abs(x), 1 - Math.abs(x));
		for (let du = -1; du <= 1; du++)
			for (let dv = -1; dv <= 1; dv++)
				for (const p of this.bins.get(`${(iu + du + G) % G},${(iv + dv + G) % G}`) ?? [])
					if (near(p.u - u) < this.tol && near(p.v - v) < this.tol) return p.id;
		if (this.lookupOnly) return -1;
		const key = `${iu},${iv}`;
		const bin = this.bins.get(key) ?? [];
		bin.push({ u, v, id: this.size });
		this.bins.set(key, bin);
		return this.size++;
	}
}

export function cellDSymbol(cell: TranslationalCellData): DSymbol | null {
	const m = cellMap(cell);
	return m && minimalBlocks(m.sym, drawnLabels(m)).sym;
}

/** Per chamber, how many drawn points sit on its edge: the decoration a star's dents add to the topology,
 *  kept apart by the minimal image so a star is never folded onto a plain triangle. */
export const drawnLabels = (m: DrawnMap): number[] | undefined => m.at?.map((a) => a.path.length);

/** Every point congruent to one of `points` under the cell's lattice: the test the flat canvas's orbit
 *  dots ask of each corner. */
export function latticeMembers(basis: number[][], points: number[][]): (x: number, y: number) => boolean {
	const [[a, b], [c, d]] = basis;
	const det = a * d - b * c;
	const set = new TorusSnap(1e-4);
	for (const [x, y] of points) set.id((x * d - y * c) / det, (a * y - b * x) / det);
	set.lookupOnly = true;
	return (x, y) => set.id((x * d - y * c) / det, (a * y - b * x) / det) >= 0;
}

/** A period cell as a map on the torus, with where each chamber is drawn in the cell. */
export function cellMap(cell: TranslationalCellData): DrawnMap | null {
	const basis = cell.basis ?? cell.b;
	const polys = cell.cellPolygons ?? cell.p;
	if (!basis || !polys?.length) return null;
	const [[a, b], [c, d]] = basis;
	const det = a * d - b * c;
	if (Math.abs(det) < 1e-12) return null;
	const frac = ([x, y]: number[]) => [(x * d - y * c) / det, (a * y - b * x) / det];
	// Shipped coordinates carry five decimals: a tolerance well above that and well below any real gap.
	const scale = Math.sqrt(Math.abs(det));
	const tol = Math.max(1e-6, (2e-4 * Math.max(1, Math.hypot(a, b), Math.hypot(c, d))) / scale ** 2);
	const snap = (pts: TorusSnap) => (p: number[]) => {
		const [u, v] = frac(p);
		return pts.id(u, v);
	};

	// Tiles: true corners only, counter-clockwise, one per translation class.
	const rings: number[][][] = [];
	const ringSrc: CellPolygonData[] = [];
	for (const p of polys) {
		if (p.mark || p.open) continue;
		const all = p.vertices ?? p.v;
		if (!all || all.length < 2) continue;
		const pt = (q: CellVertex) => (Array.isArray(q) ? q : [q.x, q.y]);
		const ring = (p.corners ? p.corners.map((i) => all[i]) : all).map(pt);
		const area = ring.reduce(
			(s, q, i) => s + q[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * q[1],
			0,
		);
		if (Math.abs(area) < 1e-12) return null;
		rings.push(area < 0 ? ring.reverse() : ring);
		ringSrc.push(p);
	}

	// Vertex classes, each with one representative in fractional coordinates.
	const vertexAt = snap(new TorusSnap(tol));
	const reps: number[][] = [];
	for (const ring of rings) for (const q of ring) if (vertexAt(q) === reps.length) reps.push(frac(q));

	// A cell may list a tile and a translate of it. A translate keeps every corner's class AND the vector
	// to the next corner; a half-turned copy about a 2-fold point keeps the classes and the centre but
	// negates the vectors, so the vectors are in the key.
	const unit = Math.sqrt(Math.abs(det) / rings.length);
	const seen = new Set<string>();
	const sources: CellPolygonData[] = [];
	const tiles = rings.filter((ring, ri) => {
		const k = ring
			.map((q, i) => {
				const r = ring[(i + 1) % ring.length];
				return `${vertexAt(q)}:${Math.round(((r[0] - q[0]) / unit) * 100)},${Math.round(((r[1] - q[1]) / unit) * 100)}`;
			})
			.sort()
			.join(" ");
		if (seen.has(k)) return false;
		seen.add(k);
		sources.push(ringSrc[ri]);
		return true;
	});

	// Split each side at every vertex class lying strictly inside it, `eps` (a thousandth of a typical
	// tile, far above the shipped rounding) from either end and from the line.
	const eps = 1e-3 * unit;
	let bad = tiles.length > 5000;
	const faces: { v: number; at: number[] }[][] = bad
		? []
		: tiles.map((ring) => {
				const out: { v: number; at: number[] }[] = [];
				ring.forEach((p, i) => {
					const q = ring[(i + 1) % ring.length];
					out.push({ v: vertexAt(p), at: p });
					const [pu, pv] = frac(p);
					const [qu, qv] = frac(q);
					if (Math.abs(pu - qu) > 2 || Math.abs(pv - qv) > 2) bad = true; // not a period cell
					const len2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
					const inner: { t: number; v: number; at: number[] }[] = [];
					reps.forEach(([ru, rv], v) => {
						for (let iu = Math.floor(Math.min(pu, qu) - ru) - 1; iu <= Math.ceil(Math.max(pu, qu) - ru) + 1; iu++)
							for (let iv = Math.floor(Math.min(pv, qv) - rv) - 1; iv <= Math.ceil(Math.max(pv, qv) - rv) + 1; iv++) {
								const x = (ru + iu) * a + (rv + iv) * c;
								const y = (ru + iu) * b + (rv + iv) * d;
								const t = ((x - p[0]) * (q[0] - p[0]) + (y - p[1]) * (q[1] - p[1])) / len2;
								const len = Math.sqrt(len2);
								if (t * len < eps || (1 - t) * len < eps) continue; // an end of the side, rounded
								const off = (x - p[0]) * (q[1] - p[1]) - (y - p[1]) * (q[0] - p[0]);
								if (Math.abs(off) / len < eps) inner.push({ t, v, at: [x, y] });
							}
					});
					inner.sort((u, w) => u.t - w.t).forEach(({ v, at }) => out.push({ v, at }));
				});
				return out;
			});

	if (bad) return null;

	// Edges: a side from vertex class u along vector d is the same edge as one from the class at its
	// far end along −d. A midpoint alone is not enough: with 2-fold centres at half-lattice points, two
	// different edges can have the same midpoint modulo the lattice.
	const at = new Map<number, { d: number[]; id: number }[]>();
	let edges = 0;
	const near = (x: number[], y: number[]) => Math.abs(x[0] - y[0]) < eps && Math.abs(x[1] - y[1]) < eps;
	const edgeOf = (u: number, w: number, d: number[]) => {
		const back = [-d[0], -d[1]];
		const hit = at.get(u)?.find((x) => near(x.d, d)) ?? at.get(w)?.find((x) => near(x.d, back));
		if (hit) return hit.id;
		const list = at.get(u) ?? [];
		list.push({ d, id: edges });
		at.set(u, list);
		return edges++;
	};
	const sides: Side[][] = faces.map((f) =>
		f.map(({ v, at: p }, i) => {
			const { v: w, at: q } = f[(i + 1) % f.length];
			return { v, e: edgeOf(v, w, [q[0] - p[0], q[1] - p[1]]), at: p };
		}),
	);
	const m = mapSymbol(sides);
	return m && { ...m, sources };
}

// ---------------------------------------------------------------------------------------------------
// Solids and quotient darts.
// ---------------------------------------------------------------------------------------------------

/** A solid given by unit vertices and face rings: each face turned counter-clockwise seen from outside. */
export function solidDSymbol(vertices: readonly number[][], faces: readonly number[][]): DSymbol | null {
	const m = solidMap(vertices, faces);
	return m && minimalImage(m.sym);
}

/** The solid as a map, with where each chamber is drawn. */
export function solidMap(vertices: readonly number[][], faces: readonly number[][]): DrawnMap | null {
	const eid = new Map<string, number>();
	const sides = faces.map((ring) => {
		// Newell's normal, robust on a face that is not planar.
		const nrm = [0, 0, 0];
		const ctr = [0, 0, 0];
		ring.forEach((iv, i) => {
			const p = vertices[iv];
			const q = vertices[ring[(i + 1) % ring.length]];
			nrm[0] += (p[1] - q[1]) * (p[2] + q[2]);
			nrm[1] += (p[2] - q[2]) * (p[0] + q[0]);
			nrm[2] += (p[0] - q[0]) * (p[1] + q[1]);
			for (let t = 0; t < 3; t++) ctr[t] += p[t];
		});
		const r = nrm[0] * ctr[0] + nrm[1] * ctr[1] + nrm[2] * ctr[2] < 0 ? ring.slice().reverse() : ring;
		return r.map((v, i) => {
			const w = r[(i + 1) % r.length];
			const k = v < w ? `${v},${w}` : `${w},${v}`;
			if (!eid.has(k)) eid.set(k, eid.size);
			return { v, e: eid.get(k)!, at: vertices[v] as number[] };
		});
	});
	return mapSymbol(sides);
}

/**
 * A hyperbolic record's darts, a quotient by orientation-preserving symmetries: faces are the cycles of
 * glue∘rneig, a face's side is the edge of rneig[h], and true sizes come from lvert and the turn sums
 * (a quotient ring or vertex cycle may be a fraction of the real one).
 */
export function dartsDSymbol(darts: Darts, edge: number): DSymbol | null {
	const { rneig, glue, lvert } = darts;
	const D = rneig.length;
	const alpha = (h: number) => (darts.alpha ? darts.alpha[h] : interiorAngle(lvert[rneig[h]], edge));
	const vertexOf = new Array<number>(D).fill(-1);
	const degree: number[] = [];
	for (let h = 0; h < D; h++) {
		if (vertexOf[h] >= 0) continue;
		let sum = 0;
		let len = 0;
		let x = h;
		do {
			vertexOf[x] = degree.length;
			sum += alpha(x);
			len++;
			x = rneig[x];
		} while (x !== h);
		degree.push(Math.round((2 * Math.PI) / sum) * len);
	}
	const edgeOf = new Map<number, number>();
	const edgeId = (h: number) => {
		const k = Math.min(h, glue[h]);
		if (!edgeOf.has(k)) edgeOf.set(k, edgeOf.size);
		return edgeOf.get(k)!;
	};
	const done = new Array<boolean>(D).fill(false);
	const faces: Side[][] = [];
	const faceSize: number[] = [];
	for (let h = 0; h < D; h++) {
		if (done[h]) continue;
		const ring: Side[] = [];
		let x = h;
		do {
			done[x] = true;
			ring.push({ v: vertexOf[x], e: edgeId(rneig[x]) });
			x = glue[rneig[x]];
		} while (x !== h);
		faces.push(ring);
		faceSize.push(lvert[rneig[h]]);
	}
	return mapDSymbol(faces, { faceSize, degree: (v) => degree[v], halfTurns: true });
}
