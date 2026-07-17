/**
 * Canonical form N for period cells — a hashable congruence key for edge-to-edge periodic tilings by
 * regular polygons, in Z[omega] with omega = zeta_12 (the 12-direction path; octagon tilings are out
 * of domain and return null). Method + proofs: docs/canonical-form/canonical-form.tex (soundness and
 * canonicity against the equivalence V' = gV + c, g in D_12, c in Z[omega]); empirically it reproduces
 * the A068599 counts (10/20/61/151/332/673) as a pure hash and matches dedupeByCongruence on the
 * oracle (scripts/canonical-bench.ts).
 *
 * Used by TilingCongruence.congruencePartition as the bucket key: cells with different N-keys are never
 * compared (N is trusted only to SEPARATE — a false split over-counts, never drops), while cells that
 * share an N-key still go through the authoritative pairwise cellsCongruent (so a false merge is split
 * back apart, not silently lost). nKeyOfCell returns null for anything it cannot decode into the
 * 12-direction lattice (octagon-bearing cells, fractional coordinates, unexpected shape); callers fall
 * back to the necessary-invariant bucket for those, so this can never break the pipeline.
 */
import type { Cyclotomic } from '@/classes/Cyclotomic';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

type Vec = number[]; // [a0,a1,a2,a3] over the Z-basis {1, omega, omega^2, omega^3}

const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const fdiv = (a: number, b: number) => Math.floor(a / b);
const key = (v: Vec) => v.join(',');
const cmpVec = (a: Vec, b: Vec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];

const W: Vec[] = [];
{ let w: Vec = [1, 0, 0, 0]; for (let i = 0; i < 12; i++) { W.push(w); w = mulw(w); } }

type Gm = { f: boolean; j: number };
const buildG = (reflect: boolean): Gm[] => {
	const g: Gm[] = [];
	for (const f of reflect ? [false, true] : [false]) for (let j = 0; j < 12; j++) g.push({ f, j });
	return g;
};
const G_FULL = buildG(true); // D₁₂ — reflection-inclusive (existing behaviour)
const G_ROT = buildG(false); // C₁₂ — rotation-only (chirality-sensitive)
const applyG = (g: Gm, v: Vec): Vec => { let x = g.f ? conj(v) : v; for (let i = 0; i < g.j; i++) x = mulw(x); return x; };
const sigma = (g: Gm, k: number) => (g.f ? (((g.j - k) % 12) + 12) % 12 : (g.j + k) % 12);
const word = (ks: number[]) => ks.reduce((acc, k) => acc | (1 << (11 - k)), 0);

function hnf(rows: Vec[]): Vec[] {
	const mat = rows.map((r) => r.slice());
	const basis: Vec[] = [];
	for (let col = 0; col < 4; col++) {
		for (;;) {
			const nz = mat.filter((r) => r[col] !== 0);
			if (nz.length <= 1) break;
			nz.sort((a, b) => Math.abs(a[col]) - Math.abs(b[col]));
			const p = nz[0];
			for (let idx = 1; idx < nz.length; idx++) {
				const r = nz[idx];
				const q = fdiv(r[col], p[col]);
				for (let i = 0; i < 4; i++) r[i] -= q * p[i];
			}
		}
		const pivIdx = mat.findIndex((r) => r[col] !== 0);
		if (pivIdx < 0) continue;
		let piv = mat[pivIdx];
		mat.splice(pivIdx, 1);
		if (piv[col] < 0) piv = piv.map((x) => -x);
		for (const b of basis) { const q = fdiv(b[col], piv[col]); for (let i = 0; i < 4; i++) b[i] -= q * piv[i]; }
		basis.push(piv);
	}
	return basis;
}

function rep(v: Vec, basis: Vec[]): Vec {
	const x = v.slice();
	for (const b of basis) {
		const c = b.findIndex((e) => e !== 0);
		const q = fdiv(x[c], b[c]);
		if (q) for (let i = 0; i < 4; i++) x[i] -= q * b[i];
	}
	return x;
}

function uniqSort(vs: Vec[]): Vec[] {
	const m = new Map<string, Vec>();
	for (const v of vs) m.set(key(v), v);
	return [...m.values()].sort(cmpVec);
}

function maximize(H: Vec[], S0: Vec[]): [Vec[], Vec[]] {
	const S = uniqSort(S0.map((s) => rep(s, H)));
	const Sset = new Set(S.map(key));
	const s0 = S[0];
	const ts: Vec[] = [];
	for (const s of S) {
		const t = sub(s, s0);
		if (S.every((x) => Sset.has(key(rep(add(x, t), H))))) ts.push(rep(t, H));
	}
	const H2 = hnf([...H, ...ts]);
	if (H2.length !== 2) throw new Error('N: lattice maximization raised rank');
	const S2 = uniqSort(S.map((s) => rep(s, H2)));
	if (S.length % S2.length !== 0) throw new Error('N: seed index mismatch');
	return [H2, S2];
}

function stars(H: Vec[], S: Vec[]): Map<string, number[]> {
	const Sset = new Set(S.map(key));
	const out = new Map<string, number[]>();
	for (const s of S) {
		const st: number[] = [];
		for (let k = 0; k < 12; k++) if (Sset.has(key(rep(add(s, W[k]), H)))) st.push(k);
		out.set(key(s), st);
	}
	return out;
}

const cmpArr = (a: number[], b: number[]) => {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
};
const cmpMat = (a: Vec[], b: Vec[]) => { for (let i = 0; i < a.length; i++) { const c = cmpVec(a[i], b[i]); if (c) return c; } return 0; };

/** The canonical matrix (Definition N of the note): rows = HNF lattice basis then sorted seed reps. */
function canonicalMatrix(symbol: Vec[], G: Gm[]): Vec[] {
	let H = hnf([symbol[0].slice(), symbol[1].slice()]);
	if (H.length !== 2) throw new Error('N: degenerate lattice');
	let S = uniqSort(symbol.slice(2).map((s) => rep(s.slice(), H)));
	[H, S] = maximize(H, S);
	const st = stars(H, S);
	const listOf = (g: Gm) => S.map((s) => word(st.get(key(s))!.map((k) => sigma(g, k)))).sort((a, b) => a - b);
	const lists = G.map((g) => ({ g, L: listOf(g) }));
	let bestL = lists[0].L;
	for (const e of lists) if (cmpArr(e.L, bestL) < 0) bestL = e.L;
	const Gmin = lists.filter((e) => cmpArr(e.L, bestL) === 0).map((e) => e.g);
	const minw = bestL[0];
	let best: Vec[] | null = null;
	for (const g of Gmin) {
		const Hg = hnf([applyG(g, H[0]), applyG(g, H[1])]);
		const anchors = S.filter((s) => word(st.get(key(s))!.map((k) => sigma(g, k))) === minw);
		for (const o of anchors) {
			const srows = S.map((s) => rep(applyG(g, sub(s, o)), Hg)).sort(cmpVec);
			const cand = [Hg[0], Hg[1], ...srows];
			if (best === null || cmpMat(cand, best) < 0) best = cand;
		}
	}
	return best!;
}

/** Z[zeta24] encode ({n: 8 ints, d}) -> Z[omega]=Z[zeta12] (even positions); odd positions must vanish. */
function encToVec(enc: { n: string[]; d: string }): Vec {
	if (enc.d !== '1') throw new Error('N: non-unit denominator');
	const c = enc.n.map(Number);
	if (c[1] || c[3] || c[5] || c[7]) throw new Error('N: octagon (odd zeta24 position)');
	return [c[0], c[2], c[4], c[6]];
}

/**
 * Hashable canonical key of a symbol `[t1, t2, ...vertices]` (rows over the ℤ-basis {1,ω,ω²,ω³}),
 * or `null` if out of domain / undecodable — never throws. Vertices need not be reduced or one-per-class;
 * canonicalMatrix reduces mod the (recomputed maximal) lattice and dedups. Feed raw oracle `{T1,T2,Seed}`
 * directly, or the full vertex set of a cell.
 */
export function nKeyOfSymbol(rows: Vec[]): string | null {
	try {
		if (rows.length < 3) return null;
		return JSON.stringify(canonicalMatrix(rows.map((r) => r.slice()), G_FULL));
	} catch {
		return null;
	}
}

/** Chirality-sensitive canonical key: congruence up to direct similarity (C₁₂ rotations, no reflection). */
export function nKeyOfSymbolDirect(rows: Vec[]): string | null {
	try {
		if (rows.length < 3) return null;
		return JSON.stringify(canonicalMatrix(rows.map((r) => r.slice()), G_ROT));
	} catch {
		return null;
	}
}

/**
 * Hashable canonical congruence key of a period cell, or `null` if the cell is out of N's domain
 * (octagon-bearing, fractional, or otherwise undecodable) — never throws.
 */
export function nKeyOfCell(cell: PeriodCell): string | null {
	try {
		const t1 = encToVec(cell.basisExact[0].encode());
		const t2 = encToVec(cell.basisExact[1].encode());
		const verts: Vec[] = [];
		for (const p of cell.cellPolygons) {
			const ev = (p as unknown as { exactVertices?: Cyclotomic[] }).exactVertices;
			if (!ev) return null;
			for (const v of ev) verts.push(encToVec(v.encode()));
		}
		if (verts.length === 0) return null;
		return nKeyOfSymbol([t1, t2, ...verts]);
	} catch {
		return null;
	}
}
