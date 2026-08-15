import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/**
 * Intrinsic parametric cells: the tiling's OWN parameter space, solved at render time.
 *
 * The Laurent form in `paramCell.ts` is exact and cheap and only describes families that are LINEAR in
 * the corner angles. That covers everything built from a palette, because a period-p tile with n ≥ 2
 * repeats closes for free, so its angles move on a linear subspace. It cannot describe a tiling's own
 * freedom: let a hexagon take a non-period angle word and closure becomes a genuine constraint,
 * Σ exp(i·φⱼ) = 0, and the family is a curved variety. 237 of the 470 period-shelf entries ship with no
 * slider and have between 1 and 19 parameters for exactly that reason.
 *
 * So this ships the QUESTION instead of the answer: the combinatorial map, the anchor's angles, and
 * which corners are the sliders. Everything else is solved here.
 *
 *     variables   one angle per dart
 *     per FACE    its L angles sum to (L−2)·180                      [linear]
 *     per FACE    the unit-edge boundary closes, Σ exp(i·φⱼ) = 0     [2, nonlinear]
 *     per FACE    its angle word keeps its period, a_j = a_{j+q}     [L linear]
 *     per VERTEX  the incident angles sum to 360                     [linear]
 *
 * The d slider values are held FIXED and Newton solves the rest, which is the implicit function theorem
 * used as intended: the same slider position always names the same tiling, with no dependence on how the
 * handle got there. Python side: `tools/ctrnact-oracle/intrinsic_family.py`, and
 * `lib/utils/intrinsicCell.test.ts` holds the two to 1e-9 on real shelf records.
 *
 * Cost at the median entry (40 darts, 8 faces): a Newton solve is three or four iterations of a 40×36
 * normal-equation solve, development is a walk over 8 faces. Microseconds, and it runs on slider change
 * rather than per frame — `euclidean-canvas.tsx` gates the rebuild on a signature.
 */
export interface IntrinsicCellData {
	kind: "intrinsic";
	/** Darts of face f are a consecutive run of this length, so σ needs no encoding of its own. */
	faceSizes: number[];
	/**
	 * The period each face's angle word must keep: a_j = a_{j+q}, one linear condition per corner.
	 *
	 * ⚑ This is what holds the deformation inside the shelf's tile class, and the first version shipped
	 * without it. AL, on `period-k3-066`: "by varying the parameters, the polygons are not period = 3
	 * anymore. They become fully irregular. You overparametrized it." Three of that entry's sliders were
	 * corners of quadrilaterals moving independently, which makes them neither squares nor period-3
	 * anything, on a shelf defined by the angle word's period. A face of L sides carries period p only
	 * when p divides L; otherwise every corner is equal and the tile stays regular.
	 */
	facePeriods: number[];
	/** The edge involution: alpha[d] is the dart facing d across its edge. */
	alpha: number[];
	/** The anchor's corner angles in degrees, in dart order. Also the slider defaults. */
	angles0: number[];
	/** +1 when the cell's tiles are traced counter-clockwise. */
	orient: 1 | -1;
	/** Face placement order as [face, the dart it is glued across]; the first entry is the root, [0, -1]. */
	tree: [number, number][];
	/** The two lattice generators, each an integer combination of loop periods keyed by dart. */
	basisCombo: [number, number][][];
}

const D2R = Math.PI / 180;
/** Residual that counts as being on the variety. Angles are degrees, closure is in edge lengths. */
const SOLVED = 1e-11;
/** Held this far inside a slider's open interval, matching ALPHA_EPS_DEG in paramCell.ts. */
const EPS_DEG = 1e-3;

interface System {
	n: number;
	faces: number[][];
	periods: number[];
	vertices: number[][];
	faceOf: number[];
	posOf: number[];
	free: number[];
	basic: number[];
	anchor: number[];
	allCols?: number[];
}

const SYSTEMS = new WeakMap<IntrinsicCellData, System>();
/** Last solved point per cell, so dragging a slider warm-starts from where it was. */
const LAST = new WeakMap<IntrinsicCellData, { t: number[]; angles: number[] }>();

function buildSystem(ic: IntrinsicCellData, freeDarts: number[]): System {
	const faces: number[][] = [];
	const faceOf: number[] = [];
	const posOf: number[] = [];
	let d = 0;
	for (let f = 0; f < ic.faceSizes.length; f++) {
		const ds: number[] = [];
		for (let j = 0; j < ic.faceSizes[f]; j++, d++) {
			ds.push(d);
			faceOf[d] = f;
			posOf[d] = j;
		}
		faces.push(ds);
	}
	const n = d;
	// Vertices are the orbits of σ∘α: cross the edge, then step to the next corner of the tile you land
	// on, and you have turned around the shared point. NOT α∘σ, which traces something that is not a
	// vertex at all and whose angles do not sum to 360.
	const seen = new Uint8Array(n);
	const vertices: number[][] = [];
	for (let s = 0; s < n; s++) {
		if (seen[s]) continue;
		const cyc: number[] = [];
		let x = s;
		while (!seen[x]) {
			seen[x] = 1;
			cyc.push(x);
			const a = ic.alpha[x];
			const f = faceOf[a];
			x = faces[f][(posOf[a] + 1) % faces[f].length];
		}
		vertices.push(cyc);
	}
	const isFree = new Set(freeDarts);
	const basic: number[] = [];
	for (let i = 0; i < n; i++) if (!isFree.has(i)) basic.push(i);
	const periods = ic.facePeriods ?? faces.map((ds) => ds.length);
	return { n, faces, periods, vertices, faceOf, posOf, free: freeDarts, basic, anchor: ic.angles0 };
}

function systemFor(ic: IntrinsicCellData, freeDarts: number[]): System {
	let s = SYSTEMS.get(ic);
	if (!s || s.free.length !== freeDarts.length || s.free.some((v, i) => v !== freeDarts[i])) {
		s = buildSystem(ic, freeDarts);
		SYSTEMS.set(ic, s);
	}
	return s;
}

function residual(sys: System, a: number[]): number[] {
	const out: number[] = [];
	for (const ds of sys.faces) {
		let s = 0;
		for (const d of ds) s += a[d];
		out.push(s - (ds.length - 2) * 180);
	}
	for (const cyc of sys.vertices) {
		let s = 0;
		for (const d of cyc) s += a[d];
		out.push(s - 360);
	}
	for (const ds of sys.faces) {
		let phi = 0, zr = 0, zi = 0;
		for (const d of ds) {
			zr += Math.cos(phi);
			zi += Math.sin(phi);
			phi += (180 - a[d]) * D2R;
		}
		out.push(zr, zi);
	}
	for (let f = 0; f < sys.faces.length; f++) {
		const ds = sys.faces[f], q = sys.periods[f], L = ds.length;
		if (q >= L) continue;
		for (let j = 0; j < L; j++) out.push(a[ds[j]] - a[ds[(j + q) % L]]);
	}
	return out;
}

/** Rows of the Jacobian, restricted to `cols`. */
function jacobian(sys: System, a: number[], cols: number[]): number[][] {
	const at = new Int32Array(sys.n).fill(-1);
	cols.forEach((c, i) => (at[c] = i));
	const rows: number[][] = [];
	const push = (): number[] => {
		const r = new Array<number>(cols.length).fill(0);
		rows.push(r);
		return r;
	};
	for (const ds of sys.faces) {
		const r = push();
		for (const d of ds) if (at[d] >= 0) r[at[d]] += 1;
	}
	for (const cyc of sys.vertices) {
		const r = push();
		for (const d of cyc) if (at[d] >= 0) r[at[d]] += 1;
	}
	// Walking a face's boundary, edge j points along φ_j = Σ_{m<j}(180 − a_m), so ∂/∂a_m of the closure
	// picks up −i·exp(i φ_j) for every j strictly after m. Accumulated backwards, that is one pass.
	for (const ds of sys.faces) {
		const L = ds.length;
		const er = new Array<number>(L), ei = new Array<number>(L);
		let phi = 0;
		for (let j = 0; j < L; j++) {
			er[j] = Math.cos(phi);
			ei[j] = Math.sin(phi);
			phi += (180 - a[ds[j]]) * D2R;
		}
		const gr = push(), gi = push();
		let tr = 0, ti = 0;
		for (let m = L - 1; m >= 0; m--) {
			// (tr + i·ti)·(−i)·D2R
			if (at[ds[m]] >= 0) {
				gr[at[ds[m]]] += ti * D2R;
				gi[at[ds[m]]] += -tr * D2R;
			}
			tr += er[m];
			ti += ei[m];
		}
	}
	// per FACE: the angle word keeps its period. Linear, one row per corner.
	for (let f = 0; f < sys.faces.length; f++) {
		const ds = sys.faces[f], q = sys.periods[f], L = ds.length;
		if (q >= L) continue;
		for (let j = 0; j < L; j++) {
			const r = push();
			if (at[ds[j]] >= 0) r[at[ds[j]]] += 1;
			if (at[ds[(j + q) % L]] >= 0) r[at[ds[(j + q) % L]]] -= 1;
		}
	}
	return rows;
}

/**
 * Least-squares step for A·x ≈ b through the normal equations with a Tikhonov diagonal.
 *
 * The damping is not a numerical nicety. Every anchor on this shelf is a symmetric configuration and
 * several are SINGULAR points of their own variety, where the basic block of the Jacobian is genuinely
 * rank-deficient and an undamped solve has a whole kernel to pick from. λ scaled off the largest diagonal
 * entry makes the step the smallest one that fits, which is the one that keeps the walk continuous. It
 * changes the ITERATES and not the fixed point, so the Python solver and this one land on the same
 * angles even though they take different routes there.
 */
function solveDamped(A: number[][], b: number[], lambda = 1e-12): number[] | null {
	const m = A.length, n = A[0]?.length ?? 0;
	if (!n) return [];
	const M: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	const rhs = new Array<number>(n).fill(0);
	for (let i = 0; i < m; i++) {
		const row = A[i];
		for (let p = 0; p < n; p++) {
			if (row[p] === 0) continue;
			for (let q = p; q < n; q++) M[p][q] += row[p] * row[q];
			rhs[p] += row[p] * b[i];
		}
	}
	let scale = 0;
	for (let p = 0; p < n; p++) scale = Math.max(scale, M[p][p]);
	for (let p = 0; p < n; p++) {
		M[p][p] += lambda * (scale || 1);
		for (let q = 0; q < p; q++) M[p][q] = M[q][p];
	}
	// Cholesky
	for (let p = 0; p < n; p++) {
		for (let q = 0; q <= p; q++) {
			let s = M[p][q];
			for (let r = 0; r < q; r++) s -= M[p][r] * M[q][r];
			if (p === q) {
				if (s <= 0) return null;
				M[p][p] = Math.sqrt(s);
			} else {
				M[p][q] = s / M[q][q];
			}
		}
	}
	const y = new Array<number>(n).fill(0);
	for (let p = 0; p < n; p++) {
		let s = rhs[p];
		for (let r = 0; r < p; r++) s -= M[p][r] * y[r];
		y[p] = s / M[p][p];
	}
	const x = new Array<number>(n).fill(0);
	for (let p = n - 1; p >= 0; p--) {
		let s = y[p];
		for (let r = p + 1; r < n; r++) s -= M[r][p] * x[r];
		x[p] = s / M[p][p];
	}
	return x.every(Number.isFinite) ? x : null;
}

/**
 * Tangent lift: the smallest move along the variety that changes the free angles by `dt`.
 *
 * Solve [J; E_free]·Δ = [0; dt] in the least-norm sense, then correct. Corrector-only Newton does not
 * merely converge more slowly without this, it can converge somewhere ELSE: the variety is curved and
 * several anchors are singular points of it, so a step taken without a predictor falls into whichever
 * basin it lands in. Five fixture cases disagreed with the Python solver by whole tenths of an edge
 * length for exactly that reason — the same pinned angles, a different sheet. The predictor is what makes
 * the two land on the same one.
 */
function predict(sys: System, a: number[], dt: number[]): number[] {
	const J = jacobian(sys, a, ALL(sys));
	const rows = J.slice();
	const rhs = new Array<number>(J.length).fill(0);
	sys.free.forEach((c, i) => {
		const r = new Array<number>(sys.n).fill(0);
		r[c] = 1;
		rows.push(r);
		rhs.push(dt[i]);
	});
	const d = solveDamped(rows, rhs);
	if (!d) return a;
	const out = a.slice();
	for (let i = 0; i < sys.n; i++) out[i] += d[i];
	return out.every(Number.isFinite) ? out : a;
}

const ALL = (sys: System): number[] => {
	if (!sys.allCols) sys.allCols = Array.from({ length: sys.n }, (_, i) => i);
	return sys.allCols;
};

/** One pinned solve: the free angles held exactly at `t`, Newton on the rest. */
function newtonPinned(sys: System, t: number[], warm: number[], iters = 40): number[] | null {
	const a = warm.slice();
	sys.free.forEach((d, i) => (a[d] = t[i]));
	for (let it = 0; it < iters; it++) {
		const F = residual(sys, a);
		let worst = 0;
		for (const v of F) worst = Math.max(worst, Math.abs(v));
		if (worst < SOLVED) return a;
		const step = solveDamped(jacobian(sys, a, sys.basic), F);
		if (!step) return null;
		for (let i = 0; i < sys.basic.length; i++) a[sys.basic[i]] -= step[i];
		if (!a.every(Number.isFinite)) return null;
	}
	const F = residual(sys, a);
	let worst = 0;
	for (const v of F) worst = Math.max(worst, Math.abs(v));
	return worst < 1e-9 ? a : null;
}

/**
 * Angles at slider position `t`, walked from `warm` by halving whatever the direct solve refuses.
 *
 * A slider can be clicked anywhere on its track, so the requested jump is not always small; halving
 * turns one hard problem into a few easy ones. Returns the furthest point it reached, which for a
 * position outside the family is the boundary rather than nothing at all.
 */
export function chartAt(sys: System, t: number[], warm: number[], budget = 48): { angles: number[]; t: number[] } {
	let a = warm;
	let cur = sys.free.map((d) => warm[d]);
	const pending: number[][] = [t];
	let spent = 0;
	while (pending.length && spent < budget) {
		const tt = pending[pending.length - 1];
		spent++;
		const got = newtonPinned(sys, tt, predict(sys, a, tt.map((v, i) => v - cur[i])));
		if (got) {
			a = got;
			cur = tt;
			pending.pop();
			continue;
		}
		const mid = tt.map((v, i) => (v + cur[i]) / 2);
		let far = 0;
		for (let i = 0; i < mid.length; i++) far = Math.max(far, Math.abs(mid[i] - cur[i]));
		if (far < 1e-6) break;
		pending.push(mid);
	}
	return { angles: a, t: cur };
}

/** One face in its own frame: unit edges, vertex 0 at the origin, edge 0 along the positive real axis. */
function localFace(angles: number[], ds: number[], orient: number): number[][] {
	const L = ds.length;
	const v: number[][] = [[0, 0]];
	let th = 0;
	for (let j = 0; j < L; j++) {
		v.push([v[j][0] + Math.cos(th), v[j][1] + Math.sin(th)]);
		th += orient * (180 - angles[ds[(j + 1) % L]]) * D2R;
	}
	v.pop();
	return v;
}

const mul = (a: number[], b: number[]): number[] => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: number[], b: number[]): number[] => {
	const q = b[0] * b[0] + b[1] * b[1];
	return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q];
};
const sub = (a: number[], b: number[]): number[] => [a[0] - b[0], a[1] - b[1]];
const add = (a: number[], b: number[]): number[] => [a[0] + b[0], a[1] + b[1]];

/**
 * Lagrange–Gauss reduction of the lattice basis: same lattice, shortest pair.
 *
 * `basisCombo` names the two generators as a fixed integer combination, so as the tiling deforms they
 * can skew arbitrarily while still spanning the right lattice. Anything that builds a patch sizes its
 * grid by the fundamental domain's height, which a skewed basis drives to nothing, and the renderer is
 * no different. Reduction changes neither the lattice nor the tiling, only which two vectors name it —
 * and both solvers do it identically, which is what keeps them comparable.
 */
function reduceBasis(u0: number[], v0: number[]): [number[], number[]] | null {
	let u = u0, v = v0;
	const len2 = (z: number[]): number => z[0] * z[0] + z[1] * z[1];
	// Terminate on |v| ≥ |u| AFTER the subtraction, not on q = 0: in a lattice with hexagonal symmetry
	// several vectors share a length and a q = 0 test cycles forever between them. Rounding is
	// floor(x + ½) to match Python, which rounds halves to even where JavaScript rounds them up — one
	// lattice step of disagreement is enough to fail the parity test.
	for (let i = 0; i < 200; i++) {
		const n2 = len2(u);
		if (n2 < 1e-24) return null;
		const q = Math.floor((v[0] * u[0] + v[1] * u[1]) / n2 + 0.5);
		v = [v[0] - q * u[0], v[1] - q * u[1]];
		if (len2(v) >= n2 - 1e-12) {
			return Math.abs(u[0] * v[1] - v[0] * u[1]) > 1e-12 ? [u, v] : null;
		}
		const t = u; u = v; v = t;
	}
	return null;
}

/** Place the faces and read the lattice off the loops that close. Mirrors `develop_map.develop`. */
export function developIntrinsic(ic: IntrinsicCellData, sys: System, angles: number[]): TranslationalCellData | null {
	const local = sys.faces.map((ds) => localFace(angles, ds, ic.orient));
	const rot: number[][] = new Array(sys.faces.length);
	const tr: number[][] = new Array(sys.faces.length);
	rot[0] = [1, 0];
	tr[0] = [0, 0];
	// The shared edge is traversed the other way round the neighbour, so its two ends swap.
	const glue = (d: number): { r: number[]; t: number[]; g: number } => {
		const f = sys.faceOf[d], j = sys.posOf[d];
		const a2 = ic.alpha[d], g = sys.faceOf[a2], j2 = sys.posOf[a2];
		const p0 = add(mul(rot[f], local[f][j]), tr[f]);
		const p1 = add(mul(rot[f], local[f][(j + 1) % local[f].length]), tr[f]);
		const q0 = local[g][j2];
		const q1 = local[g][(j2 + 1) % local[g].length];
		const r = div(sub(p0, p1), sub(q1, q0));
		return { r, t: sub(p1, mul(r, q0)), g };
	};
	for (let i = 1; i < ic.tree.length; i++) {
		const d = ic.tree[i][1];
		if (!rot[sys.faceOf[d]]) return null;
		const { r, t, g } = glue(d);
		rot[g] = r;
		tr[g] = t;
	}
	for (let f = 0; f < sys.faces.length; f++) if (!rot[f]) return null;
	const basis: number[][] = [];
	for (const combo of ic.basisCombo) {
		let z = [0, 0];
		for (const [d, c] of combo) {
			const { t, g } = glue(d);
			z = add(z, [c * (t[0] - tr[g][0]), c * (t[1] - tr[g][1])]);
		}
		basis.push(z);
	}
	const red = reduceBasis(basis[0], basis[1]);
	if (!red) return null;
	basis[0] = red[0];
	basis[1] = red[1];
	return {
		cellPolygons: sys.faces.map((ds, f) => ({
			n: ds.length,
			vertices: local[f].map((z) => add(mul(rot[f], z), tr[f])),
		})),
		basis: [basis[0], basis[1]],
	} as TranslationalCellData;
}

/** Σ|signed area| over the tiles, and |det| of the basis — equal exactly when the cell tiles. */
function areaCertificate(cell: TranslationalCellData): number {
	const polys = (cell.cellPolygons ?? []) as { vertices: number[][] }[];
	let sum = 0;
	for (const p of polys) {
		let s = 0;
		const v = p.vertices;
		for (let i = 0; i < v.length; i++) {
			const a = v[i], b = v[(i + 1) % v.length];
			s += a[0] * b[1] - b[0] * a[1];
		}
		sum += Math.abs(s / 2);
	}
	const [[ux, uy], [vx, vy]] = (cell.basis ?? [[1, 0], [0, 1]]) as number[][];
	return Math.abs(sum - Math.abs(ux * vy - uy * vx));
}

/**
 * The cell at a slider tuple, certified at the point being drawn.
 *
 * Per-axis ranges are scanned offline with the other axes at the anchor, so the box they describe is not
 * a proof for its interior, and at d = 19 no offline scan could be. Checking here instead is the stronger
 * claim: the area certificate holds for the cell actually handed to the renderer, or the tuple is walked
 * back toward the anchor until it does. Never returns a cell that fails it.
 */
export function evaluateIntrinsic(
	ic: IntrinsicCellData,
	freeDarts: number[],
	alphasDeg: number[],
): TranslationalCellData | null {
	const sys = systemFor(ic, freeDarts);
	const last = LAST.get(ic);
	const warm = last?.angles ?? ic.angles0;
	let t = alphasDeg.slice(0, sys.free.length);
	while (t.length < sys.free.length) t.push(ic.angles0[sys.free[t.length]]);
	const home = sys.free.map((d) => ic.angles0[d]);
	for (let back = 0; back < 24; back++) {
		const got = chartAt(sys, t, warm);
		const cell = developIntrinsic(ic, sys, got.angles);
		if (cell && areaCertificate(cell) < 1e-7) {
			LAST.set(ic, { t: got.t, angles: got.angles });
			return cell;
		}
		let far = 0;
		for (let i = 0; i < t.length; i++) far = Math.max(far, Math.abs(t[i] - home[i]));
		if (far < EPS_DEG) break;
		t = t.map((v, i) => (v + home[i]) / 2);
	}
	return developIntrinsic(ic, sys, ic.angles0);
}
