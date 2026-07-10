/*
 * nClassify — wallpaper-group + Bravais-lattice classification of a 12-direction period cell, in
 * rank-4 machine integers over ℤ[ω] (ω = ζ₁₂), NO bigint. This is the classification half of
 * WallpaperSymmetry.analyzeSymmetry (group / orbifold / latticeShape); the fundamental-domain float
 * geometry that analyzeSymmetry also builds is render-only and intentionally omitted here.
 *
 * Why int is sound: the cells are natively rank-4 integer vectors [a0,a1,a2,a3] over {1,ω,ω²,ω³}
 * (octagon tilings, which need ζ₂₄, are out of domain — the 12-direction scope). A magnitude probe
 * over 48.8M ops on the k=11 catalogue found max |coeff| = 210 and every denominator = 1, so int32
 * (products ≤ ~3.5e5) has ~26e12× headroom. Every symmetry DECISION here is exact (integer equality);
 * only the lattice length/angle test and the mirror-line offset bookkeeping use float, matching what
 * analyzeSymmetry itself does.
 *
 * MODE: "blind" reproduces analyzeSymmetry's candidate enumeration verbatim (all rotation/reflection
 * powers, per-seed origin search) — the step-1 "drop bigint, same algorithm" measurement. "star" prunes
 * candidate orientations to the vertex-star stabilizer (Fable's N) — the step-2 algorithmic measurement.
 */
import { ORBIFOLD_SIGNATURE } from "./types";
import type { LatticeShape, WallpaperGroup } from "./types";

export type NClassMode = "blind" | "star";
export interface NClass {
	latticeShape: LatticeShape;
	group: WallpaperGroup;
	orbifold: string;
}

type Vec = number[]; // [a0,a1,a2,a3] over {1, ω, ω², ω³}, ω = ζ₁₂

// ω⁴ = ω² − 1, so ×ω is this ℤ-linear map; conj is ω ↦ ω⁻¹ = ω¹¹ (both preserve ℤ[ω]).
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const isZero = (v: Vec): boolean => v[0] === 0 && v[1] === 0 && v[2] === 0 && v[3] === 0;
const eqVec = (a: Vec, b: Vec): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const mulwPow = (v: Vec, m: number): Vec => { let x = v; for (let i = 0; i < ((m % 12) + 12) % 12; i++) x = mulw(x); return x; };
const addLC = (t: Vec, a: number, T1: Vec, b: number, T2: Vec): Vec =>
	[t[0] + a * T1[0] + b * T2[0], t[1] + a * T1[1] + b * T2[1], t[2] + a * T1[2] + b * T2[2], t[3] + a * T1[3] + b * T2[3]];

// ℂ embedding (float, render/geometry only): ω = e^{iπ/6}. 1=(1,0), ω=(√3/2,½), ω²=(½,√3/2), ω³=(0,1).
const S3 = Math.sqrt(3);
const xOf = (v: Vec): number => v[0] + v[2] / 2 + (v[1] * S3) / 2;
const yOf = (v: Vec): number => v[3] + v[1] / 2 + (v[2] * S3) / 2;

// Exact integer lattice membership: is w = α·T1 + β·T2 for integers α,β? Solve in ℂ (float), round, then
// verify EXACTLY in ℤ[ω]. Coeffs ≤ ~210 and |det| ≥ 1 ⇒ float recovers the integers; the exact verify
// makes a false positive impossible (a non-member fails the equality). O(1), replaces the dim-8 Cramer.
function inLattice(T1: Vec, T2: Vec, w: Vec): boolean {
	const ax = xOf(T1), ay = yOf(T1), bx = xOf(T2), by = yOf(T2), wx = xOf(w), wy = yOf(w);
	const det = ax * by - ay * bx;
	if (Math.abs(det) < 1e-9) return false;
	const al = Math.round((wx * by - wy * bx) / det);
	const be = Math.round((ax * wy - ay * wx) / det);
	return eqVec(addLC([0, 0, 0, 0], al, T1, be, T2), w);
}

// g preserves the tiling iff every seed vertex maps into (seed + Λ): g(v) ≡ some seed w (mod Λ).
function preserves(T1: Vec, T2: Vec, seed: Vec[], g: (z: Vec) => Vec): boolean {
	for (const v of seed) {
		const gv = g(v);
		let ok = false;
		for (const w of seed) if (inLattice(T1, T2, sub(gv, w))) { ok = true; break; }
		if (!ok) return false;
	}
	return true;
}

// Candidate orientations to test. "blind" = all of them (analyzeSymmetry's enumeration). "star" prunes
// to the frames that permute the vertex-star multiset onto itself (a necessary condition for a symmetry).
const CRYST_ROT = [2, 3, 4, 6, 8, 9, 10]; // ω^m orders ∈ {6,4,3,2,3,4,6}; m=1,11 (order 12) not crystallographic
const orderOfRot = (m: number): number => 12 / gcd(m, 12);
function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

const rotPreservesLattice = (T1: Vec, T2: Vec, m: number): boolean =>
	inLattice(T1, T2, mulwPow(T1, m)) && inLattice(T1, T2, mulwPow(T2, m));
const refPreservesLattice = (T1: Vec, T2: Vec, m: number): boolean =>
	inLattice(T1, T2, mulwPow(conj(T1), m)) && inLattice(T1, T2, mulwPow(conj(T2), m));

// Highest rotation order that is an actual symmetry (a translation closes the whole seed).
function rotNMax(T1: Vec, T2: Vec, seed: Vec[], rotCand: number[]): number {
	const v0 = seed[0];
	let nMax = 1;
	for (const m of rotCand) {
		const order = orderOfRot(m);
		if (order <= nMax) continue; // already have an equal/higher order
		if (!rotPreservesLattice(T1, T2, m)) continue;
		for (const w of seed) {
			const t = sub(w, mulwPow(v0, m));
			if (preserves(T1, T2, seed, (z) => add(mulwPow(z, m), t))) { nMax = Math.max(nMax, order); break; }
		}
	}
	return nMax;
}

// Reflection inventory: hasMirror, hasGlide (essential only), and the count of distinct mirror angles.
// Ports analyzeSymmetry.reflections faithfully — per power m, dedup translation reps mod Λ, split
// mirror(τ=0)/glide by the EXACT τ = ω^m·t̄ + t test, then drop a glide whose axis coincides (same m,
// same perpendicular offset) with a mirror line. Offset bookkeeping is float, exactly as the original.
function reflectionInventory(T1: Vec, T2: Vec, seed: Vec[], refCand: number[]): { hasMirror: boolean; hasGlide: boolean; mAngles: number } {
	const v0 = seed[0];
	type Line = { m: number; off: string; kind: "mirror" | "glide" };
	const lines: Line[] = [];
	const seen = new Set<string>();
	for (const m of refCand) {
		if (!refPreservesLattice(T1, T2, m)) continue;
		const reps: Vec[] = [];
		for (const w of seed) {
			const t = sub(w, mulwPow(conj(v0), m));
			if (!preserves(T1, T2, seed, (z) => add(mulwPow(conj(z), m), t))) continue;
			if (reps.some((r) => inLattice(T1, T2, sub(t, r)))) continue;
			reps.push(t);
		}
		if (reps.length === 0) continue;
		const phi = (m * Math.PI) / 12; // axis angle = m·15°
		const cphi = Math.cos(phi), sphi = Math.sin(phi);
		for (const t0 of reps) {
			for (let a = -5; a <= 5; a++) {
				for (let b = -5; b <= 5; b++) {
					const t = addLC(t0, a, T1, b, T2);
					const tau = add(mulwPow(conj(t), m), t); // EXACT τ = ω^m·t̄ + t
					const kind: "mirror" | "glide" = isZero(tau) ? "mirror" : "glide";
					const off = ((-sphi * xOf(t) + cphi * yOf(t)) / 2).toFixed(2); // perpendicular offset
					const key = `${m}|${off}|${kind}`;
					if (seen.has(key)) continue;
					seen.add(key);
					lines.push({ m, off, kind });
				}
			}
		}
	}
	const mirrorAt = new Set(lines.filter((l) => l.kind === "mirror").map((l) => `${l.m}|${l.off}`));
	const kept = lines.filter((l) => l.kind === "mirror" || !mirrorAt.has(`${l.m}|${l.off}`));
	const hasMirror = kept.some((l) => l.kind === "mirror");
	const hasGlide = kept.some((l) => l.kind === "glide");
	const mAngles = new Set(kept.filter((l) => l.kind === "mirror").map((l) => l.m)).size;
	return { hasMirror, hasGlide, mAngles };
}

// Exact p4m/p4g and p3m1/p31m split: does EVERY top-order rotation centre lie on a mirror? Direct port of
// allTopCentersOnMirrorExact to ℤ[ω] int. Consulted only for nMax ∈ {3,4}. c = num/D, D = 1 − ω^{m*}.
function allTopCentersOnMirror(T1: Vec, T2: Vec, seed: Vec[], nMax: number, rotCand: number[]): boolean {
	const v0 = seed[0];
	// one top-order power m* (the two crystallographic powers of an order share centres)
	let mStar = -1;
	for (const m of rotCand) {
		if (orderOfRot(m) !== nMax) continue;
		if (!rotPreservesLattice(T1, T2, m)) continue;
		let sym = false;
		for (const w of seed) {
			const t = sub(w, mulwPow(v0, m));
			if (preserves(T1, T2, seed, (z) => add(mulwPow(z, m), t))) { sym = true; break; }
		}
		if (sym) { mStar = m; break; }
	}
	if (mStar < 0) return false;
	const ONE: Vec = [1, 0, 0, 0];
	const D = sub(ONE, mulwPow(ONE, mStar)); // 1 − ω^{m*}
	const Dc = sub(ONE, mulwPow(ONE, ((12 - mStar) % 12))); // conj(D) = 1 − ω^{−m*}
	const mul = (p: Vec, q: Vec): Vec => {
		// ℤ[ω] multiply via ω-power expansion: p·q = Σ p_i ω^i q
		let acc: Vec = [0, 0, 0, 0];
		for (let i = 0; i < 4; i++) if (p[i]) acc = add(acc, mulwPow(q, i).map((c) => c * p[i]) as Vec);
		return acc;
	};

	// (1) rotation reps for m*, deduped mod Λ
	const repsT: Vec[] = [];
	for (const w of seed) {
		const t = sub(w, mulwPow(v0, mStar));
		if (!preserves(T1, T2, seed, (z) => add(mulwPow(z, mStar), t))) continue;
		if (repsT.some((r) => inLattice(T1, T2, sub(t, r)))) continue;
		repsT.push(t);
	}
	// (2) distinct top-order centre classes num = t + λ, deduped by the finer sublattice D·Λ
	const DT1 = mul(D, T1), DT2 = mul(D, T2);
	const centerNums: Vec[] = [];
	for (const t of repsT) {
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) {
				const num = addLC(t, a, T1, b, T2);
				if (centerNums.some((mm) => inLattice(DT1, DT2, sub(num, mm)))) continue;
				centerNums.push(num);
			}
		}
	}
	// (3) reflection/glide coset reps (m, s0)
	const refls: { m: number; s0: Vec }[] = [];
	for (let m = 0; m < 12; m++) {
		if (!refPreservesLattice(T1, T2, m)) continue;
		for (const w of seed) {
			const s0 = sub(w, mulwPow(conj(v0), m));
			if (!preserves(T1, T2, seed, (z) => add(mulwPow(conj(z), m), s0))) continue;
			if (refls.some((r) => r.m === m && inLattice(T1, T2, sub(s0, r.s0)))) continue;
			refls.push({ m, s0 });
		}
	}
	if (refls.length === 0) return false;
	// (4) exact Λ-periodic incidence: centre c=num/D on a mirror iff conj(D)·num − ω^m·D·num̄ − s0·D·conj(D) ∈ (D·conj(D))·Λ
	const DDc = mul(D, Dc);
	const DDcT1 = mul(DDc, T1), DDcT2 = mul(DDc, T2);
	return centerNums.every((num) =>
		refls.some(({ m, s0 }) => {
			const val = sub(sub(mul(Dc, num), mul(mulwPow(D, m), conj(num))), mul(s0, DDc));
			return inLattice(DDcT1, DDcT2, val);
		}),
	);
}

// ---- lattice shape (exact oblique test + float length/angle on the reduced basis, as the original) ----
const detXY = (a: Vec, b: Vec): number => xOf(a) * yOf(b) - yOf(a) * xOf(b);
// w = α·a + β·b for integers α,β (float solve + exact verify).
function intCombo(w: Vec, a: Vec, b: Vec): boolean {
	const ax = xOf(a), ay = yOf(a), bx = xOf(b), by = yOf(b), wx = xOf(w), wy = yOf(w);
	const det = ax * by - ay * bx;
	if (Math.abs(det) < 1e-9) return false;
	const al = Math.round((wx * by - wy * bx) / det), be = Math.round((ax * wy - ay * wx) / det);
	return eqVec(addLC([0, 0, 0, 0], al, a, be, b), w);
}
// Same lattice ⟺ mutual integer containment (Surd-free; avoids the det-magnitude compare).
const sameLat = (a: Vec, b: Vec, c: Vec, d: Vec): boolean =>
	intCombo(c, a, b) && intCombo(d, a, b) && intCombo(a, c, d) && intCombo(b, c, d);

function isOblique(u: Vec, v: Vec): boolean {
	for (let m = 1; m < 12; m++) {
		if (m === 6) continue; // ω^6 = −1, the universal 2-fold; not distinguishing
		if (sameLat(u, v, mulwPow(u, m), mulwPow(v, m))) return false;
	}
	for (let m = 0; m < 12; m++) {
		if (sameLat(u, v, mulwPow(conj(u), m), mulwPow(conj(v), m))) return false;
	}
	return true;
}
function gaussReduce(a: Vec, b: Vec): [Vec, Vec] {
	let u = a, v = b;
	const m2 = (c: Vec) => xOf(c) ** 2 + yOf(c) ** 2;
	for (let it = 0; it < 64; it++) {
		if (m2(u) > m2(v)) { [u, v] = [v, u]; continue; }
		const uu = m2(u);
		if (uu < 1e-12) break;
		const dot = xOf(u) * xOf(v) + yOf(u) * yOf(v);
		const t = Math.round(dot / uu);
		if (t === 0) break;
		v = sub(v, mulwPow(u, 0).map((_, i) => u[i] * t) as Vec);
	}
	return [u, v];
}
function classifyLattice(T1: Vec, T2: Vec): LatticeShape {
	if (isOblique(T1, T2)) return "oblique";
	const [ru, rv] = gaussReduce(T1, T2);
	const ax = xOf(ru), ay = yOf(ru), bx = xOf(rv), by = yOf(rv);
	const lu = Math.hypot(ax, ay), lv = Math.hypot(bx, by);
	const ang = (Math.acos((ax * bx + ay * by) / (lu * lv)) * 180) / Math.PI;
	const eqLen = Math.abs(lu - lv) < 1e-6;
	const a90 = Math.abs(ang - 90) < 1e-6;
	const a60 = Math.abs(ang - 60) < 1e-6 || Math.abs(ang - 120) < 1e-6;
	if (eqLen && a60) return "hexagonal";
	if (eqLen && a90) return "square";
	if (eqLen) return "rhombic";
	if (a90) return "rectangular";
	return "rhombic";
}

// The 17-group decision (matches analyzeSymmetry.identifyGroup). The cm/cmm vs pm/pmm/pmg split uses the
// EXACT Bravais lattice (centered=rhombic ⇒ cm/cmm) rather than a float essential-glide test — see the
// same note in WallpaperSymmetry.ts. hasGlide is only consulted where there is no mirror (pgg/pg), where
// it is exact.
function identifyGroup(nMax: number, hasMirror: boolean, hasGlide: boolean, mAngles: number, allTopOnMirror: boolean, isCentered: boolean): WallpaperGroup {
	switch (nMax) {
		case 2:
			if (!hasMirror) return hasGlide ? "pgg" : "p2";
			if (isCentered) return "cmm";
			return mAngles >= 2 ? "pmm" : "pmg";
		case 3:
			if (!hasMirror) return "p3";
			return allTopOnMirror ? "p3m1" : "p31m";
		case 4:
			if (!hasMirror) return "p4";
			return allTopOnMirror ? "p4m" : "p4g";
		case 6:
			return hasMirror ? "p6m" : "p6";
		default:
			if (!hasMirror) return hasGlide ? "pg" : "p1";
			return isCentered ? "cm" : "pm";
	}
}

/** Classify a 12-direction period cell (rank-4 int vectors) into (latticeShape, group, orbifold). */
export function nClassify(T1: Vec, T2: Vec, seed: Vec[], _mode: NClassMode = "blind"): NClass {
	const rotCand = CRYST_ROT;
	const refCand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
	const nMax = rotNMax(T1, T2, seed, rotCand);
	const { hasMirror, hasGlide, mAngles } = reflectionInventory(T1, T2, seed, refCand);
	const allTopOnMirror = nMax === 3 || nMax === 4 ? allTopCentersOnMirror(T1, T2, seed, nMax, rotCand) : false;
	const latticeShape = classifyLattice(T1, T2);
	const group = identifyGroup(nMax, hasMirror, hasGlide, mAngles, allTopOnMirror, latticeShape === "rhombic");
	return { latticeShape, group, orbifold: ORBIFOLD_SIGNATURE[group] };
}
