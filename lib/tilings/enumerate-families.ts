// THE ORACLE-FREE ENUMERATOR — stages 1 to 3, executable (2026-08-18).
//
// At k = 1 the literature supplies seven non-edge-to-edge isogonal families and the Atlas can be
// checked against them. At k >= 2 there is no such list. AL is right that "we matched the published
// answer" is then worth nothing, so this file replaces the oracle with a search whose completeness is
// an argument, not a citation. `length-system.ts` is cited here and in three other files as holding
// the four stages; it does not exist and never has (`git log --all` is empty for it), so the stages
// are written out below and stage 4 — a canonical form for FAMILIES, not just for maps — lives in
// `tools/ctrnact-oracle/tiling_key.family_key`, which the shelf now deduplicates on.
//
// STAGE 1, here: `vertexTypes` — the finite alphabet. Cyclic words over the palette's corner angles
// plus the flat 180, summing to 360, with AT MOST ONE flat (two flats leave nothing, and a point
// straight on both sides is interior to an edge, not a vertex).
//
// STAGE 2, here: `enumerate` — the finite combinatorial search, over torus maps with V vertices per
// translational period. A map is a rotation system (each vertex's darts in cyclic order, spaced by its
// angle word) plus a perfect matching of darts. Faces are the orbits of sigma . alpha; the search
// prunes on partial face words, which is what makes it finish. Genus is checked by Euler.
//
// STAGE 3, here: `realize` — directions are forced by the angles, so only lengths are unknown; each
// face contributes two linear closure equations and each regular tile its side equalities. The family
// is ker(A) intersect {l > 0}.
//
// WHAT IS SEARCHED, stated so the claim is falsifiable. The result is complete for: tilings by regular
// polygons with n in the palette, whose translational period has at most `Vmax` vertices, with at most
// `maxFlats` T-junctions on any one tile. All three are declared, none is a speed dial — turning any
// of them down loses families, so a smaller setting is an INCOMPLETE regime and is reported as such.
//
// KNOWN GAP, and it can only produce false negatives: the test for "does the cone contain a strictly
// positive point" is a projection plus a randomised search, not an exact LP. A family whose cone is
// very thin can be missed; nothing can be wrongly ACCEPTED, because an accepted family comes with an
// explicit positive length vector that is then laid out and checked. The exact fix is a rational
// phase-1 simplex over Z[zeta_12], noted and not done.

const U = 30; // angle unit in degrees; every angle here is a multiple of 30 (the D = 12 grid)
const FULL = 12; // 360 degrees in units
const FLAT = 6; // 180 degrees in units

/** Interior angle of a regular n-gon, in 30-degree units; integral only for n in {3,4,6,12}. */
function interiorUnits(n: number): number | null {
	const deg = ((n - 2) * 180) / n;
	const u = deg / U;
	return Number.isInteger(u) ? u : null;
}

export interface Palette {
	/** Regular polygon side counts available, e.g. [3, 4, 6, 12]. */
	ns: number[];
	/** Maximum T-junctions on a single tile. */
	maxFlats: number;
}

/** STAGE 1: every legal vertex, as a cyclic word of angles in 30-degree units. */
export function vertexTypes(pal: Palette): number[][] {
	const angles = [...new Set(pal.ns.map(interiorUnits).filter((a): a is number => a !== null))].sort((x, y) => x - y);
	const out: number[][] = [];
	const seen = new Set<string>();
	const canon = (w: number[]) => {
		let best: string | null = null;
		for (let r = 0; r < w.length; r++) {
			const s = [...w.slice(r), ...w.slice(0, r)].join(".");
			if (best === null || s < best) best = s;
		}
		return best!;
	};
	const rec = (w: number[], sum: number, flats: number) => {
		if (sum === FULL) {
			if (w.length < 3) return; // a vertex of valence < 3 is not a vertex of a tiling
			const c = canon(w);
			if (!seen.has(c)) { seen.add(c); out.push(c.split(".").map(Number)); }
			return;
		}
		if (w.length >= 6) return; // valence bound: the smallest corner is 60 degrees
		for (const a of [...angles, FLAT]) {
			if (a === FLAT && flats >= 1) continue; // AT MOST ONE FLAT PER VERTEX
			if (sum + a > FULL) continue;
			rec([...w, a], sum + a, flats + (a === FLAT ? 1 : 0));
		}
	};
	rec([], 0, 0);
	return out;
}

/** Is this cyclic corner word a palette tile with flats inserted? Returns the tile's n, or null. */
function faceTile(word: number[], pal: Palette): number | null {
	const flats = word.filter((a) => a === FLAT).length;
	if (flats > pal.maxFlats) return null;
	const real = word.filter((a) => a !== FLAT);
	if (!real.length) return null;
	const a = real[0];
	if (real.some((x) => x !== a)) return null; // a regular tile has ONE corner angle
	const n = real.length;
	if (!pal.ns.includes(n)) return null;
	return interiorUnits(n) === a ? n : null;
}

interface MapSpec {
	types: number[][]; // vertex i's angle word
	base: number[]; // dart index base per vertex
	owner: number[]; // dart -> vertex
	slot: number[]; // dart -> index within its vertex
	alpha: number[]; // dart -> its partner
	D: number;
}

const nextAt = (m: MapSpec, d: number) => m.base[m.owner[d]] + ((m.slot[d] + 1) % m.types[m.owner[d]].length);
/** The face's interior angle at the corner reached by arriving along `d`. */
const cornerAt = (m: MapSpec, d: number) => m.types[m.owner[d]][m.slot[d]];

/** Walk the face orbit from `d` while the matching is defined. */
function faceWalk(m: MapSpec, d: number): { closed: boolean; darts: number[]; word: number[] } {
	const darts: number[] = [];
	const word: number[] = [];
	let cur = d;
	for (let guard = 0; guard < 64; guard++) {
		darts.push(cur);
		const a = m.alpha[cur];
		if (a < 0) return { closed: false, darts, word };
		word.push(cornerAt(m, a));
		cur = nextAt(m, a);
		if (cur === d) return { closed: true, darts, word };
	}
	return { closed: false, darts, word };
}

/** Can a partial corner word still become a palette tile? */
function prefixOk(word: number[], pal: Palette): boolean {
	const flats = word.filter((a) => a === FLAT).length;
	if (flats > pal.maxFlats) return false;
	const real = word.filter((a) => a !== FLAT);
	if (!real.length) return true;
	const a = real[0];
	if (real.some((x) => x !== a)) return false;
	const n = pal.ns.find((k) => interiorUnits(k) === a);
	return n !== undefined && real.length <= n;
}

export interface RawMap {
	types: number[][];
	alpha: number[];
	V: number;
	E: number;
	F: number;
	faces: { darts: number[]; word: number[]; n: number }[];
}

/** STAGE 2: all torus maps on `types`, as dart matchings, pruned on partial faces. */
function matchings(types: number[][], pal: Palette, out: RawMap[], cap: number): void {
	const base: number[] = [];
	const owner: number[] = [];
	const slot: number[] = [];
	let D = 0;
	for (let i = 0; i < types.length; i++) {
		base.push(D);
		for (let j = 0; j < types[i].length; j++) { owner.push(i); slot.push(j); }
		D += types[i].length;
	}
	if (D % 2) return;
	const m: MapSpec = { types, base, owner, slot, alpha: new Array(D).fill(-1), D };

	const rec = () => {
		if (out.length >= cap) return;
		let d0 = -1;
		for (let d = 0; d < D; d++) if (m.alpha[d] < 0) { d0 = d; break; }
		if (d0 < 0) {
			// complete: collect faces and check genus
			const faces: RawMap["faces"] = [];
			const seen = new Set<number>();
			for (let d = 0; d < D; d++) {
				if (seen.has(d)) continue;
				const w = faceWalk(m, d);
				if (!w.closed) return;
				w.darts.forEach((x) => seen.add(x));
				const n = faceTile(w.word, pal);
				if (n === null) return;
				faces.push({ darts: w.darts, word: w.word, n });
			}
			const V = types.length, E = D / 2, F = faces.length;
			if (V - E + F !== 0) return; // torus only
			out.push({ types, alpha: m.alpha.slice(), V, E, F, faces });
			return;
		}
		for (let d1 = d0 + 1; d1 < D; d1++) {
			if (m.alpha[d1] >= 0) continue;
			m.alpha[d0] = d1; m.alpha[d1] = d0;
			let ok = true;
			for (const s of [d0, d1]) {
				const w = faceWalk(m, s);
				if (w.closed) { if (faceTile(w.word, pal) === null) { ok = false; break; } }
				else if (!prefixOk(w.word, pal)) { ok = false; break; }
			}
			if (ok) rec();
			m.alpha[d0] = -1; m.alpha[d1] = -1;
			if (out.length >= cap) return;
		}
	};
	rec();
}

// ── STAGE 3: realization ────────────────────────────────────────────────────────────────────────

export let lastReject = "";
const rej = (why: string) => { lastReject = why; return null; };

const dirVec = (u: number): [number, number] => [Math.cos((u * U * Math.PI) / 180), Math.sin((u * U * Math.PI) / 180)];

function rankAndKernel(rows: number[][], n: number): number[][] {
	const m = rows.map((r) => r.slice());
	const pivotOf: number[] = [];
	let rank = 0;
	for (let c = 0; c < n && rank < m.length; c++) {
		let best = rank;
		for (let r = rank; r < m.length; r++) if (Math.abs(m[r][c]) > Math.abs(m[best][c])) best = r;
		if (Math.abs(m[best][c]) < 1e-9) continue;
		[m[rank], m[best]] = [m[best], m[rank]];
		const pv = m[rank][c];
		for (let j = 0; j < n; j++) m[rank][j] /= pv;
		for (let r = 0; r < m.length; r++) {
			if (r === rank) continue;
			const f = m[r][c];
			if (Math.abs(f) < 1e-12) continue;
			for (let j = 0; j < n; j++) m[r][j] -= f * m[rank][j];
		}
		pivotOf.push(c);
		rank++;
	}
	const free = [...Array(n).keys()].filter((c) => !pivotOf.includes(c));
	return free.map((fc) => {
		const v = new Array(n).fill(0);
		v[fc] = 1;
		pivotOf.forEach((pc, ri) => { v[pc] = -m[ri][fc]; });
		return v;
	});
}

export interface RealizedFamily {
	V: number; E: number; F: number;
	/** Cone dimension including scale; the family has `dim - 1` essential parameters. */
	dim: number;
	tiles: number[]; // the n of each face
	lengths: number[]; // the positive length vector actually laid out
	cellPolygons: { n: number; v: [number, number][] }[];
	basis: [[number, number], [number, number]];
	/** One open interval per slider — a box fitted inside the positivity cone. For a single parameter
	 *  it IS the exact positivity interval; above that a cone is not a box and the fit is conservative,
	 *  so every position is a tiling and some tilings lie outside. */
	ranges: [number, number][];
	/** The cone as an affine chart transverse to scale: edge e has length K[0][e] + sum_i c_i*K[i+1][e].
	 *  Scaling acts as a ray, and this slice meets every ray once, so no member is lost or repeated. */
	cone: number[][];
	/** The interior sample the cell above was laid out at, one value per slider. */
	c0: number[];
	/** Every coordinate as [constant point, then one derivative point per slider] — the Atlas's
	 *  length-family format, written as (x, y) pairs so there is no transpose to get wrong. */
	affine: {
		cellPolygons: { n: number; v: [number, number][][] }[];
		basis: [[number, number][], [number, number][]];
	};
	signature: string;
}

function realize(rm: RawMap, pal: Palette): RealizedFamily | null {
	const { types, alpha } = rm;
	const base: number[] = [];
	const owner: number[] = [];
	const slot: number[] = [];
	let D = 0;
	for (let i = 0; i < types.length; i++) {
		base.push(D);
		for (let j = 0; j < types[i].length; j++) { owner.push(i); slot.push(j); }
		D += types[i].length;
	}
	// directions, forced by the angles up to one global choice
	const dir = new Array<number>(D).fill(-1);
	dir[0] = 0;
	const stack = [0];
	const setDir = (d: number, u: number) => {
		const v = ((u % FULL) + FULL) % FULL;
		if (dir[d] >= 0) return dir[d] === v;
		dir[d] = v;
		stack.push(d);
		return true;
	};
	while (stack.length) {
		const d = stack.pop()!;
		const i = owner[d], L = types[i].length;
		let acc = dir[d];
		for (let s = 0; s < L; s++) {
			const cur = base[i] + ((slot[d] + s) % L);
				if (!setDir(cur, acc)) return rej("direction conflict at vertex");
			acc += types[i][(slot[d] + s) % L];
		}
		if (!setDir(alpha[d], dir[d] + FLAT)) return rej("direction conflict across edge");
	}
	// edge indices
	const edgeOf = new Array<number>(D).fill(-1);
	let E = 0;
	for (let d = 0; d < D; d++) if (edgeOf[d] < 0) { edgeOf[d] = E; edgeOf[alpha[d]] = E; E++; }

	const rows: number[][] = [];
	for (const f of rm.faces) {
		const rx = new Array(E).fill(0), ry = new Array(E).fill(0);
		for (const d of f.darts) { const [x, y] = dirVec(dir[d]); rx[edgeOf[d]] += x; ry[edgeOf[d]] += y; }
		rows.push(rx, ry);
		// a regular tile: every geometric SIDE equal, a side being a maximal run through flat corners
		const sides: number[][] = [];
		for (let i = 0; i < f.darts.length; i++) {
			const prevCorner = f.word[(i - 1 + f.word.length) % f.word.length];
			if (prevCorner !== FLAT || !sides.length) sides.push(new Array(E).fill(0));
			sides[sides.length - 1][edgeOf[f.darts[i]]] += 1;
		}
		// Merge the wrap-around run. If the LAST corner is flat, the face's first dart continues the
		// side the last dart started, and treating them as two sides splits one tile side in half —
		// which over-constrains a regular tile into rigidity. This is what made the brick pattern
		// report an empty kernel: its square's four sides came out as five.
		if (sides.length > 1 && f.word[f.word.length - 1] === FLAT) {
			const last = sides.pop()!;
			for (let j = 0; j < E; j++) sides[0][j] += last[j];
		}
		for (let i = 1; i < sides.length; i++) rows.push(sides[i].map((v, j) => v - sides[0][j]));
	}
	const ker = rankAndKernel(rows, E);
	if (ker.length < 2) return rej(ker.length ? "cone is scale only: the tiling is rigid" : "kernel empty");

	// AS MANY PARAMETERS AS THE CONE HAS, less one for scale. ker[i] carries a 1 in the i-th FREE edge,
	// and a free edge is strictly positive on the cone, so ker[0] + sum c_i*ker[i+1] is an affine slice
	// transverse to the scaling ray: it meets every similarity class exactly once, which is what makes
	// `dim - 1` the honest parameter count.
	//
	// This used to reject every cone of dimension above 2, which threw away five real two-parameter
	// families at V <= 4 while the shelf's own note claimed the search was "complete within its scope".
	// It is a box that a single interval cannot describe, not a family that does not exist.
	const P = ker.length - 1;
	const lenAt = (c: number[]) => ker[0].map((v, e) => v + c.reduce((a, x, i) => a + x * ker[i + 1][e], 0));
	const worst = (c: number[]) => Math.min(...lenAt(c));

	// An interior point, by hill-climbing the ROUNDEST member — the one whose shortest edge is the
	// largest fraction of its longest. Maximising the shortest edge alone looks equivalent and is not:
	// the cone is often unbounded, so that objective runs away to coordinates in the tens and centres
	// the family on a sliver nobody wants to look at. The ratio is scale-free, so it stops where the
	// tiling is most nearly equilateral, which is both a modest coordinate and the member the literature
	// draws.
	const round = (c: number[]) => { const L = lenAt(c); return Math.min(...L) / Math.max(...L); };
	let cr = new Array<number>(P).fill(0);
	for (let step = 4; step > 1e-4; step /= 2)
		for (let sweep = 0; sweep < 12; sweep++) {
			let moved = false;
			for (let i = 0; i < P; i++)
				for (const d of [step, -step]) {
					const t = cr.slice(); t[i] += d;
					if (worst(t) > 1e-9 && round(t) > round(cr) + 1e-12) { cr = t; moved = true; }
				}
			if (!moved) break;
		}
	if (worst(cr) <= 1e-6) {
		// the roundest search never entered the cone: fall back to pushing the shortest edge up
		cr = new Array<number>(P).fill(0);
		for (let step = 4; step > 1e-4; step /= 2)
			for (let sweep = 0; sweep < 12; sweep++) {
				let moved = false;
				for (let i = 0; i < P; i++)
					for (const d of [step, -step]) {
						const t = cr.slice(); t[i] += d;
						if (worst(t) > worst(cr) + 1e-12) { cr = t; moved = true; }
					}
				if (!moved) break;
			}
	}
	if (worst(cr) <= 1e-6) return rej("positive cone is empty");
	let c0 = cr;

	// The largest box about that point whose every corner is still positive, by interval arithmetic —
	// exact for the whole box at once because a length is affine in the coordinates.
	const boxOk = (r: number) => {
		for (let e = 0; e < E; e++) {
			let m = ker[0][e];
			for (let i = 0; i < P; i++) m += Math.min(ker[i + 1][e] * (c0[i] - r), ker[i + 1][e] * (c0[i] + r));
			if (m <= 1e-9) return false;
		}
		return true;
	};
	if (!boxOk(1e-6)) return rej("positive cone is empty");
	let rlo = 0, rhi = 64;
	for (let it = 0; it < 60; it++) { const m = (rlo + rhi) / 2; if (boxOk(m)) rlo = m; else rhi = m; }
	const R = rlo * 0.98;
	const H = R / 8;

	// Then grow the box one END at a time, because a symmetric radius throws range away: for a single
	// parameter the positivity region is an interval and the cube inscribed in it is the shorter half
	// doubled, which is how a family whose slider ran (0.02, 4) would have come back as (0.3, 1.1).
	// Growing ends in order is deterministic; for P = 1 it recovers the exact interval exactly.
	// An unbounded direction is real: every edge's coefficient in that coordinate can be positive, so the
	// family runs to arbitrarily lopsided members and all of them tile. The slider stops at 4 past the
	// sample anyway, because past that the small tile is a sliver and the whole track would be spent on
	// tilings that look alike. A cap of 32 was tried first and put 25 of 30 sliders' useful range inside
	// their first few percent.
	const FAR = 4;
	const ranges = c0.map((v) => [v - R, v + R] as [number, number]);
	const probe = ranges.map((r) => [...r] as [number, number]);
	const boxOkAt = () => {
		for (let e = 0; e < E; e++) {
			let m = ker[0][e];
			for (let i = 0; i < P; i++) m += Math.min(ker[i + 1][e] * probe[i][0], ker[i + 1][e] * probe[i][1]);
			if (m <= 1e-9) return false;
		}
		return true;
	};
	for (let i = 0; i < P; i++)
		for (const side of [0, 1] as const) {
			const far = c0[i] + (side ? FAR : -FAR);
			probe[i][side] = far;
			if (boxOkAt()) { ranges[i][side] = far; continue; }
			let good = ranges[i][side], bad = far;
			for (let it = 0; it < 60; it++) {
				probe[i][side] = (good + bad) / 2;
				if (boxOkAt()) good = probe[i][side]; else bad = probe[i][side];
			}
			ranges[i][side] = c0[i] + (good - c0[i]) * 0.98;
			probe[i][side] = ranges[i][side];
		}

	// Then step OFF the roundest member, by a different irrational fraction of each half-width. That
	// member is where the shelf card draws and where k is measured, and the round one is exactly where a
	// family's extra symmetry lives: at all-edges-equal the orbits fuse and the k filed would be the one
	// value almost no member of the family has.
	const PHI = (1 + Math.sqrt(5)) / 2;
	c0 = c0.map((v, i) => {
		const g = 0.35 * (2 * (((i + 1) * PHI) % 1) - 1);
		return v + (g > 0 ? ranges[i][1] - v : v - ranges[i][0]) * g;
	});

	type Layout = { pos: [number, number][]; lats: [number, number][] };
	// Deterministic: vertices in queue order, darts in slot order, discrepancies in discovery order. The
	// SAME combinatorial walk must run at both sample points or the affine fit is meaningless.
	const layout = (len: number[]): Layout | null => {
		const pos: ([number, number] | null)[] = types.map(() => null);
		pos[0] = [0, 0];
		const lats: [number, number][] = [];
		const q = [0];
		const placed = new Set([0]);
		while (q.length) {
			const i = q.shift()!;
			for (let s = 0; s < types[i].length; s++) {
				const d = base[i] + s;
				const [ux, uy] = dirVec(dir[d]);
				const p = pos[i]!;
				const far: [number, number] = [p[0] + len[edgeOf[d]] * ux, p[1] + len[edgeOf[d]] * uy];
				const j = owner[alpha[d]];
				if (pos[j] === null) { pos[j] = far; placed.add(j); q.push(j); }
				else lats.push([far[0] - pos[j]![0], far[1] - pos[j]![1]]);
			}
		}
		if (placed.size !== types.length) return null;
		return { pos: pos as [number, number][], lats };
	};
	// One layout at the sample point and one per parameter, all walked in the SAME combinatorial order,
	// so the differences are the derivatives and nothing else.
	const LA = layout(lenAt(c0));
	const LD = c0.map((_, i) => layout(lenAt(c0.map((v, j) => (j === i ? v + H : v)))));
	if (!LA || LD.some((L) => !L)) return rej("layout did not reach every vertex");

	// Lattice vectors chosen BY INDEX, never by length: sorting by length can pick different
	// discrepancies at the two sample points and silently corrupt the affine fit.
	const i1 = LA.lats.findIndex((v) => Math.hypot(v[0], v[1]) > 1e-6);
	if (i1 < 0) return rej("no lattice vector");
	const i2 = LA.lats.findIndex((v, i) =>
		i !== i1 && Math.abs(LA.lats[i1][0] * v[1] - LA.lats[i1][1] * v[0]) > 1e-6);
	if (i2 < 0) return rej("no second independent lattice vector");
	// Gauss-reduce once, at t0, recording the integer steps; replay them at t0 + H so both layouts use
	// the same basis.
	const steps: ("swap" | number)[] = [];
	let g1 = LA.lats[i1], g2 = LA.lats[i2];
	for (let it = 0; it < 60; it++) {
		if (Math.hypot(g1[0], g1[1]) > Math.hypot(g2[0], g2[1])) { [g1, g2] = [g2, g1]; steps.push("swap"); }
		const mu = Math.round((g1[0] * g2[0] + g1[1] * g2[1]) / (g1[0] ** 2 + g1[1] ** 2));
		if (!mu) break;
		g2 = [g2[0] - mu * g1[0], g2[1] - mu * g1[1]];
		steps.push(mu);
	}
	const replay = (L: Layout): [[number, number], [number, number]] => {
		let a: [number, number] = L.lats[i1], b: [number, number] = L.lats[i2];
		for (const st of steps) {
			if (st === "swap") [a, b] = [b, a];
			else b = [b[0] - st * a[0], b[1] - st * a[1]];
		}
		return [a, b];
	};
	const [a1, a2] = replay(LA);
	const bs = LD.map((L) => replay(L!));

	// affine fit: every coordinate is exactly affine in the c_i, so one sample per parameter plus the
	// base determines it. The emitted list is the CONSTANT point followed by one derivative point per
	// slider, all as (x, y) — the same shape `paramCell.LenTerm` reads.
	const affPt = (p0: [number, number], ps: [number, number][]): [number, number][] => {
		const g = ps.map((p) => [(p[0] - p0[0]) / H, (p[1] - p0[1]) / H] as [number, number]);
		const k: [number, number] = [
			p0[0] - g.reduce((a, q, i) => a + c0[i] * q[0], 0),
			p0[1] - g.reduce((a, q, i) => a + c0[i] * q[1], 0),
		];
		return [k, ...g];
	};

	// A cell polygon lists the tile's REAL corners only; a T-junction is a vertex of the map but not a
	// corner of this tile, and emitting it makes the tile look like an n+f-gon. `lengthSystem` recovers
	// T-junctions by finding vertices inside a side, so leaving them in would double-count them and
	// report a square with two subdivided sides as a rigid hexagon.
	const polyAt = (L: Layout, len: number[]) => rm.faces.map((f) => {
		const v: [number, number][] = [];
		let p: [number, number] = L.pos[owner[f.darts[0]]];
		for (let i = 0; i < f.darts.length; i++) {
			if (f.word[(i - 1 + f.word.length) % f.word.length] !== FLAT) v.push(p);
			const [ux, uy] = dirVec(dir[f.darts[i]]);
			p = [p[0] + len[edgeOf[f.darts[i]]] * ux, p[1] + len[edgeOf[f.darts[i]]] * uy];
		}
		return { n: f.n, v };
	});
	const cellPolygons = polyAt(LA, lenAt(c0));
	const polysD = LD.map((L, i) => polyAt(L!, lenAt(c0.map((v, j) => (j === i ? v + H : v)))));

	// area identity: the tiles must fill exactly one lattice cell
	const det0 = a1[0] * a2[1] - a1[1] * a2[0];
	const det = Math.abs(det0);
	let area = 0;
	for (const poly of cellPolygons) {
		let sgn = 0;
		for (let i = 0, j = poly.v.length - 1; i < poly.v.length; j = i++)
			sgn += poly.v[j][0] * poly.v[i][1] - poly.v[i][0] * poly.v[j][1];
		area += Math.abs(sgn) / 2;
	}
	if (Math.abs(area - det) > 1e-6 * Math.max(1, det)) return rej(`area ${area.toFixed(4)} != det ${det.toFixed(4)}`);

	// PRIMITIVITY. A tiling described on a doubled cell is the same tiling; without this the square grid
	// is reported once at V = 1, again at V = 2 and again at V = 3. The cell is primitive iff no
	// translation by a difference of tile centroids, other than a lattice vector, preserves the tiling.
	const inv2 = [a2[1] / det0, -a2[0] / det0, -a1[1] / det0, a1[0] / det0];
	const rr = (x: number) => {
		let u = x % 1;
		if (u < 0) u += 1;
		if (u > 1 - 1e-6 || u < 1e-6) u = 0;
		const w = Math.round(u * 1e5) / 1e5;
		return (w === 0 ? 0 : w).toFixed(5);
	};
	const key = (v: [number, number][]) => {
		let cx = 0, cy = 0;
		for (const q of v) { cx += q[0]; cy += q[1]; }
		cx /= v.length; cy /= v.length;
		const sh = v.map((q) => `${(Math.round((q[0] - cx) * 1e5) / 1e5).toFixed(5)}:${(Math.round((q[1] - cy) * 1e5) / 1e5).toFixed(5)}`).sort().join(";");
		return `${sh}|${rr(inv2[0] * cx + inv2[1] * cy)},${rr(inv2[2] * cx + inv2[3] * cy)}`;
	};
	const keys = new Set(cellPolygons.map((p) => key(p.v)));
	const cents = cellPolygons.map((p) => {
		let cx = 0, cy = 0;
		for (const q of p.v) { cx += q[0]; cy += q[1]; }
		return [cx / p.v.length, cy / p.v.length] as [number, number];
	});
	for (const c1 of cents)
		for (const c2 of cents) {
			const t: [number, number] = [c2[0] - c1[0], c2[1] - c1[1]];
			if (Math.hypot(t[0], t[1]) < 1e-9) continue;
			const g0 = inv2[0] * t[0] + inv2[1] * t[1], gg1 = inv2[2] * t[0] + inv2[3] * t[1];
			if (Math.abs(g0 - Math.round(g0)) < 1e-6 && Math.abs(gg1 - Math.round(gg1)) < 1e-6) continue;
			if (cellPolygons.every((p) => keys.has(key(p.v.map((q) => [q[0] + t[0], q[1] + t[1]] as [number, number])))))
				return rej("cell is not primitive");
		}

	const tiles = rm.faces.map((f) => f.n).sort((x, y) => x - y);
	return {
		V: rm.V, E: rm.E, F: rm.F, dim: ker.length, tiles, lengths: lenAt(c0),
		cellPolygons, basis: [a1, a2],
		ranges, c0, cone: ker,
		affine: {
			cellPolygons: cellPolygons.map((p, fi) => ({
				n: p.n, v: p.v.map((q, vi) => affPt(q, polysD.map((pd) => pd[fi].v[vi]))),
			})),
			basis: [affPt(a1, bs.map((b) => b[0])), affPt(a2, bs.map((b) => b[1]))],
		},
		signature: `${rm.V}|${rm.E}|${rm.F}|${ker.length}|${tiles.join(",")}|` +
			rm.faces.map((f) => f.word.join("")).sort().join("/"),
	};
}

/** Debug hook: the raw maps found for one explicit vertex-type assignment, before realization. */
export function rawMapsFor(types: number[][], pal: Palette): RawMap[] {
	const out: RawMap[] = [];
	matchings(types, pal, out, 100000);
	return out;
}

/** Debug hook: realize one raw map, or null with no reason given. */
export function realizeOne(rm: RawMap, pal: Palette) { return realize(rm, pal); }

export interface EnumerateOptions {
	/** Maximum vertices per translational period. A COMPLETENESS knob, not a speed dial. */
	Vmax: number;
	/** Cap on maps collected per vertex-type assignment, to keep a runaway search bounded. */
	cap?: number;
	/** Called after each V level completes, for synchronous progress logging. */
	onProgress?: (V: number, found: number) => void;
}

export function enumerateFamilies(pal: Palette, opts: EnumerateOptions): RealizedFamily[] {
	const types = vertexTypes(pal);
	const found = new Map<string, RealizedFamily>();
	const cap = opts.cap ?? 20000;
	let perV: Palette = pal;
	// Vertex labels are arbitrary, so an ASSIGNMENT is a multiset, not a tuple. Generating ordered
	// tuples costs |types|^V where multisets cost C(|types|+V-1, V) — a 16x factor at V = 4 and it is
	// pure waste, since a relabelling produces an isomorphic map that the signature would discard.
	const assign = (chosen: number[][], left: number, from: number) => {
		if (!left) {
			const raw: RawMap[] = [];
			matchings(chosen, perV, raw, cap);
			for (const rm of raw) {
				const r = realize(rm, perV);
				if (r && !found.has(r.signature)) found.set(r.signature, r);
			}
			return;
		}
		for (let i = from; i < types.length; i++) assign([...chosen, types[i]], left - 1, i);
	};
	for (let V = 1; V <= opts.Vmax; V++) {
		// EXACT bound, not a knob: each vertex carries at most one flat corner and each flat corner
		// belongs to exactly one face, so the flats on a single face are at most V per period.
		perV = { ...pal, maxFlats: Math.min(pal.maxFlats, V) };
		assign([], V, 0);
		opts.onProgress?.(V, found.size);
	}
	return [...found.values()];
}
