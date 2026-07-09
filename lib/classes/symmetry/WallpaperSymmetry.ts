import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { gaussReduceExact, sameLattice } from "@/classes/algorithm/LatticeEnumerator";
import { ORBIFOLD_SIGNATURE } from "./types";
import type { Axis, Center, LatticeShape, SymmetryData, Vec2, WallpaperGroup } from "./types";

const v2 = (z: Cyclotomic): Vec2 => {
	const v = z.toVector();
	return { x: v.x, y: v.y };
};

function bgcd(a: bigint, b: bigint): bigint {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b) [a, b] = [b, a % b];
	return a;
}
const blcm = (a: bigint, b: bigint) => (a === 0n || b === 0n ? 0n : (a / bgcd(a, b)) * b);

// Exact lattice membership: is w = a·T1 + b·T2 for integers a,b? A Cyclotomic is (num: bigint[φ],
// den: bigint) over the ζ_N power basis, so the question is whether the φ×2 integer system [T1|T2]·(a,b)ᵀ
// = w has an integer solution consistent in ALL φ coordinates. Solve two independent rows by Cramer,
// check integrality, then verify every row. Fully exact — no floats, so no boundary tolerance traps.
function inLattice(T1: Cyclotomic, T2: Cyclotomic, w: Cyclotomic): boolean {
	const D = blcm(blcm(T1.den, T2.den), w.den);
	const col = (z: Cyclotomic) => z.num.map((c) => (c * D) / z.den); // length-φ integer vector
	const A = col(T1), B = col(T2), W = col(w);
	const dim = A.length;
	for (let i = 0; i < dim; i++) {
		for (let j = i + 1; j < dim; j++) {
			const det = A[i] * B[j] - A[j] * B[i];
			if (det === 0n) continue;
			const aNum = W[i] * B[j] - W[j] * B[i];
			const bNum = A[i] * W[j] - A[j] * W[i];
			if (aNum % det !== 0n || bNum % det !== 0n) return false; // non-integer ⇒ not in Λ
			const a = aNum / det, b = bNum / det;
			for (let r = 0; r < dim; r++) if (a * A[r] + b * B[r] !== W[r]) return false; // consistency
			return true;
		}
	}
	return false; // T1,T2 dependent over the basis ⇒ degenerate cell (shouldn't happen)
}
export const _inLatticeForTest = inLattice;

// The two isometry families that can preserve a ℤ[ζ_N] tiling: rotation z↦ζ^j·z + t and
// reflection/glide z↦ζ^j·z̄ + t (z̄ = Cyclotomic.conj, the exact ζ↦ζ⁻¹ automorphism).
const applyRot = (j: number, t: Cyclotomic, z: Cyclotomic) => z.mulZeta(j).add(t);
const applyRef = (j: number, t: Cyclotomic, z: Cyclotomic) => z.conj().mulZeta(j).add(t);

// g preserves the tiling iff every seed vertex maps into (seed + Λ): g(v) ≡ some seed w (mod Λ).
// This is THE decisive test — exact, congruence-closed (mod the translation lattice), no tolerance.
function preserves(
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
	g: (z: Cyclotomic) => Cyclotomic,
): boolean {
	for (const v of seed) {
		const gv = g(v);
		if (!seed.some((w) => inLattice(T1, T2, gv.sub(w)))) return false;
	}
	return true;
}

// A candidate isometry is a true symmetry only if its LINEAR part maps the translation lattice Λ onto
// itself — otherwise it may map the finite seed into seed+Λ by coincidence while not preserving the
// tiling globally (this is what let a 30° "mirror" be reported on a plain rectangular lattice). Exact.
const rotationPreservesLattice = (T1: Cyclotomic, T2: Cyclotomic, j: number): boolean =>
	inLattice(T1, T2, T1.mulZeta(j)) && inLattice(T1, T2, T2.mulZeta(j));
const reflectionPreservesLattice = (T1: Cyclotomic, T2: Cyclotomic, j: number): boolean =>
	inLattice(T1, T2, T1.conj().mulZeta(j)) && inLattice(T1, T2, T2.conj().mulZeta(j));

const CRYSTALLOGRAPHIC = new Set([1, 2, 3, 4, 6]);
function ngcd(x: number, y: number): number {
	return y ? ngcd(y, x % y) : x;
}
// Order of the rotation z↦ζ_N^j·z. Only crystallographic orders {2,3,4,6} can occur (Barlow).
const rotOrderOf = (j: number, N = 24) => N / ngcd(j, N);

export interface DetectedRotation {
	j: number;
	t: Cyclotomic;
	order: 2 | 3 | 4 | 6;
}

// One representative rotation per power j that is an actual symmetry. t is found by requiring
// ζ^j·seed[0] + t ≡ some seed vertex (mod Λ); we then verify the whole seed closes. Centers (there are
// several per order, related by Λ/order) are derived from these representatives in a later step.
function rotations(T1: Cyclotomic, T2: Cyclotomic, seed: Cyclotomic[]): DetectedRotation[] {
	const out: DetectedRotation[] = [];
	const v0 = seed[0];
	for (let j = 1; j < 24; j++) {
		const order = rotOrderOf(j);
		if (!CRYSTALLOGRAPHIC.has(order) || order === 1) continue;
		if (!rotationPreservesLattice(T1, T2, j)) continue; // linear part must map Λ→Λ
		for (const w of seed) {
			const t = w.sub(v0.mulZeta(j));
			if (preserves(T1, T2, seed, (z) => applyRot(j, t, z))) {
				out.push({ j, t, order: order as 2 | 3 | 4 | 6 });
				break; // one representative t per power j
			}
		}
	}
	return out;
}
export const _rotationsForTest = (
	_ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
) => rotations(T1, T2, seed);

const CENTER_TOL = 0.02; // frac-coordinate dedup tolerance (spec §8.5)

// Complex division num/den in float (for the rotation fixed point c = t/(1−ω)). Division isn't a
// decision — the rotation was already accepted exactly; this only places the marker for rendering.
function cdiv(num: Vec2, den: Vec2): Vec2 {
	const d = den.x * den.x + den.y * den.y;
	return { x: (num.x * den.x + num.y * den.y) / d, y: (num.y * den.x - num.x * den.y) / d };
}

// Fractional lattice coordinates of p in basis (r1,r2), reduced into [0,1)².
function fracInCell(p: Vec2, r1: Vec2, r2: Vec2): { fa: number; fb: number } {
	const det = r1.x * r2.y - r1.y * r2.x;
	let fa = (p.x * r2.y - p.y * r2.x) / det;
	let fb = (-p.x * r1.y + p.y * r1.x) / det;
	fa -= Math.floor(fa);
	fb -= Math.floor(fb);
	return { fa, fb };
}

// All rotation centers, deduped into one primitive cell, each tagged with its MAXIMUM order. For a
// detected order-n rotation z↦ωz+t, composing with every lattice translation T_λ yields a rotation of
// the same order about (t+λ)/(1−ω); enumerating λ over a small Λ window and reducing mod Λ recovers all
// center orbits of that order (Λ/(1−ω) has index |1−ω|² over Λ, e.g. 2 four-fold orbits for a square).
function rotationCenters(
	ring: CyclotomicRing,
	r1: Vec2,
	r2: Vec2,
	rots: DetectedRotation[],
): Center[] {
	const K = Math.round(1 / CENTER_TOL);
	const byKey = new Map<string, Center>();
	for (const rot of rots) {
		const w = Cyclotomic.zeta(ring, rot.j).toVector(); // ω
		const oneMinus = { x: 1 - w.x, y: -w.y };
		const tv = rot.t.toVector();
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) {
				const numv = { x: tv.x + a * r1.x + b * r2.x, y: tv.y + a * r1.y + b * r2.y };
				const { fa, fb } = fracInCell(cdiv(numv, oneMinus), r1, r2);
				const world = { x: fa * r1.x + fb * r2.x, y: fa * r1.y + fb * r2.y };
				const ka = ((Math.round(fa * K) % K) + K) % K;
				const kb = ((Math.round(fb * K) % K) + K) % K;
				const key = `${ka},${kb}`;
				const existing = byKey.get(key);
				if (!existing || rot.order > existing.order) byKey.set(key, { z: world, order: rot.order });
			}
		}
	}
	return Array.from(byKey.values());
}

// All mirror and glide axes, exact. For reflection power j (axis angle φ = j·7.5°), a reflection/glide
// is z↦ζ^j·z̄ + t. We collect every distinct coset rep t (mod Λ) that is a symmetry — capturing pmg-type
// cases where a mirror coset and a glide coset share an angle (spec §8.3) — then walk each coset's
// Λ-translates. Each translate is its OWN line: it is a MIRROR iff τ = ω·t̄ + t = 0 exactly, else a
// GLIDE (g² = translation by τ ≠ 0). This exact τ test replaces the prototype's float on-line-period
// trick and cannot mislabel a centered-lattice glide as a mirror (spec §8.1/§8.2).
function reflections(
	ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
): Axis[] {
	type Line = { j: number; offKey: string; kind: "mirror" | "glide"; p: Vec2; d: Vec2 };
	const lines: Line[] = [];
	const seen = new Set<string>();
	const v0 = seed[0];
	for (let j = 0; j < 24; j++) {
		if (!reflectionPreservesLattice(T1, T2, j)) continue; // linear part must map Λ→Λ
		const omega = Cyclotomic.zeta(ring, j);
		const reps: Cyclotomic[] = [];
		for (const w of seed) {
			const t = w.sub(v0.conj().mulZeta(j));
			if (!preserves(T1, T2, seed, (z) => applyRef(j, t, z))) continue;
			if (reps.some((r) => inLattice(T1, T2, t.sub(r)))) continue; // same coset
			reps.push(t);
		}
		if (reps.length === 0) continue;
		const phi = (j * Math.PI) / 24; // axis angle
		const cphi = Math.cos(phi), sphi = Math.sin(phi);
		const dir = { x: cphi, y: sphi };
		const nrm = { x: -sphi, y: cphi };
		for (const t0 of reps) {
			for (let a = -5; a <= 5; a++) {
				for (let b = -5; b <= 5; b++) {
					const t = t0.add(T1.scaleRational(BigInt(a), 1n)).add(T2.scaleRational(BigInt(b), 1n));
					const tau = omega.mul(t.conj()).add(t); // EXACT τ = ω·t̄ + t
					const kind: "mirror" | "glide" = tau.isZero() ? "mirror" : "glide";
					const tv = t.toVector();
					const offset = (-sphi * tv.x + cphi * tv.y) / 2; // Im(e^{-iφ}·t)/2 = perpendicular offset
					const offKey = offset.toFixed(2);
					const key = `${j}|${offKey}|${kind}`;
					if (seen.has(key)) continue;
					seen.add(key);
					lines.push({ j, offKey, kind, p: { x: offset * nrm.x, y: offset * nrm.y }, d: dir });
				}
			}
		}
	}
	// Drop TRIVIAL glides: a glide whose axis coincides with a mirror line is just that mirror composed
	// with an along-axis translation, not an essential glide. Keeping them would make even symmorphic
	// groups (pmm, p4m) report glides and misclassify. Essential glide ⇔ no mirror on the same line.
	const mirrorAt = new Set(lines.filter((l) => l.kind === "mirror").map((l) => `${l.j}|${l.offKey}`));
	return lines
		.filter((l) => l.kind === "mirror" || !mirrorAt.has(`${l.j}|${l.offKey}`))
		.map((l) => ({ p: l.p, d: l.d, kind: l.kind }));
}
export const _reflectionsForTest = reflections;

// Exact 2D Bravais classification, ported verbatim from scripts/oracle-characterize.ts (validated
// against the known oblique census 0,0,2,5 at k=1..4). "Oblique" is decided EXACTLY via lattice
// automorphisms (rotation ζ^r or reflection conj∘ζ^r) — NOT by the primitive-basis angle, which
// mislabels a long-thin centered (cmm/rhombic) cell as oblique (DEVELOPMENT_NOTES §11.1). The
// remaining classes use the gauss-reduced basis. Centered-rectangular = rhombic in the 5-Bravais set.
function isOblique(ring: CyclotomicRing, u: Cyclotomic, v: Cyclotomic): boolean {
	for (let r = 1; r < ring.N; r++) {
		if (r === ring.N / 2) continue; // ζ^12 = −1, the universal 2-fold; not distinguishing
		if (sameLattice(u, v, u.mulZeta(r), v.mulZeta(r))) return false; // a rotational symmetry
	}
	for (let r = 0; r < ring.N; r++) {
		if (sameLattice(u, v, u.conj().mulZeta(r), v.conj().mulZeta(r))) return false; // a reflection
	}
	return true;
}

function classifyLattice(ring: CyclotomicRing, u: Cyclotomic, v: Cyclotomic): LatticeShape {
	if (isOblique(ring, u, v)) return "oblique";
	const [ru, rv] = gaussReduceExact(u, v);
	const a = ru.toVector(), b = rv.toVector();
	const lu = Math.hypot(a.x, a.y), lv = Math.hypot(b.x, b.y);
	const ang = (Math.acos((a.x * b.x + a.y * b.y) / (lu * lv)) * 180) / Math.PI;
	const eqLen = Math.abs(lu - lv) < 1e-6;
	const a90 = Math.abs(ang - 90) < 1e-6;
	const a60 = Math.abs(ang - 60) < 1e-6 || Math.abs(ang - 120) < 1e-6;
	if (eqLen && a60) return "hexagonal";
	if (eqLen && a90) return "square";
	if (eqLen) return "rhombic"; // rhombic(cmm)
	if (a90) return "rectangular";
	return "rhombic"; // centered-rectangular (conventional) = rhombic
}

const POINT_GROUP_ORDER: Record<WallpaperGroup, number> = {
	p1: 1, p2: 2, pm: 2, pg: 2, cm: 2, pmm: 4, pmg: 4, pgg: 4, cmm: 4,
	p4: 4, p4m: 8, p4g: 8, p3: 3, p3m1: 6, p31m: 6, p6: 6, p6m: 12,
};

function mirrorAngleCount(axes: Axis[]): number {
	const s = new Set<number>();
	for (const a of axes) {
		if (a.kind !== "mirror") continue;
		const deg = (((Math.atan2(a.d.y, a.d.x) * 180) / Math.PI) % 180 + 180) % 180;
		s.add(Math.round(deg));
	}
	return s.size;
}

// EXACT p4m/p4g and p3m1/p31m discriminator: does EVERY top-order rotation centre lie on a mirror?
// The float path decides this GROUP LABEL with a `0.03·cellSize` distance on float-placed centres;
// this decides it in ℤ[ζ₂₄]. A rotation z↦ζ^{j*}z + num has centre c = num/D with D = 1−ζ^{j*} (the two
// crystallographic powers of one order are mutual inverses about the SAME centres, so a single power j*
// captures every top-order centre). Distinct centre classes: num₁ ≡ num₂ iff (num₁−num₂) ∈ D·Λ. A mirror
// h(z)=ζ^m·z̄ + s has τ = ζ^m·s̄ + s = 0; c lies on its axis iff h(c)=c, and clearing the D·conj(D)
// denominator gives ζ^m·num̄·D + s·D·conj(D) = num·conj(D) — a pure equality, no division/inversion/
// tolerance. Only consulted for nMax∈{3,4}; returns false otherwise (identifyGroup ignores it there).
function allTopCentersOnMirrorExact(
	ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
): boolean {
	const rots = rotations(T1, T2, seed);
	if (rots.length === 0) return false;
	const nMax = Math.max(...rots.map((r) => r.order));
	const jStar = rots.find((r) => r.order === nMax)!.j; // one top-order power suffices (shared centres)
	const D = Cyclotomic.ONE(ring).sub(Cyclotomic.zeta(ring, jStar)); // 1 − ζ^{j*}
	const Dc = Cyclotomic.ONE(ring).sub(Cyclotomic.zeta(ring, (24 - jStar) % 24)); // conj(D) = 1 − ζ^{−j*}
	const v0 = seed[0];

	// (1) every valid rotation translation t for power j*, deduped mod Λ (each a distinct rotation coset).
	const repsT: Cyclotomic[] = [];
	for (const w of seed) {
		const t = w.sub(v0.mulZeta(jStar));
		if (!preserves(T1, T2, seed, (z) => applyRot(jStar, t, z))) continue;
		if (repsT.some((r) => inLattice(T1, T2, t.sub(r)))) continue;
		repsT.push(t);
	}

	// (2) all distinct top-order centre classes as numerators num = t + λ (λ over a small Λ window),
	//     deduped by the finer sublattice D·Λ (Λ/(D·Λ) has index |D|² — e.g. 2 four-fold centres/cell).
	const DT1 = D.mul(T1), DT2 = D.mul(T2);
	const centerNums: Cyclotomic[] = [];
	for (const t of repsT) {
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) {
				const num = t.add(T1.scaleRational(BigInt(a), 1n)).add(T2.scaleRational(BigInt(b), 1n));
				if (centerNums.some((m) => inLattice(DT1, DT2, num.sub(m)))) continue;
				centerNums.push(num);
			}
		}
	}

	// (3) every reflection/glide COSET rep (j, s0): a reflection symmetry, one per coset mod Λ per angle.
	const refls: { j: number; s0: Cyclotomic }[] = [];
	for (let j = 0; j < 24; j++) {
		for (const w of seed) {
			const s0 = w.sub(v0.conj().mulZeta(j));
			if (!preserves(T1, T2, seed, (z) => applyRef(j, s0, z))) continue;
			if (refls.some((r) => r.j === j && inLattice(T1, T2, s0.sub(r.s0)))) continue;
			refls.push({ j, s0 });
		}
	}
	if (refls.length === 0) return false;

	// (4) exact incidence, Λ-periodic (no window): a centre c = num/D lies on a mirror iff SOME reflection
	// coset (j, s0) has a Λ-translate that FIXES c — and a fixed point of a reflection is exactly a mirror
	// axis (glides have none). c fixed by (j, s0+λ) ⟺ λ = c − ζ^j·c̄ − s0 ∈ Λ; clearing the D·conj(D)
	// denominator, (conj(D)·num − ζ^j·D·num̄ − s0·D·conj(D)) ∈ (D·conj(D))·Λ. Pure ℤ[ζ₂₄], no division.
	const DDc = D.mul(Dc);
	const DDcT1 = DDc.mul(T1), DDcT2 = DDc.mul(T2);
	return centerNums.every((num) => {
		return refls.some(({ j, s0 }) => {
			// conj(D)·num − ζ^j·D·num̄ − s0·D·conj(D)
			const val = Dc.mul(num).sub(Cyclotomic.zeta(ring, j).mul(D).mul(num.conj())).sub(s0.mul(DDc));
			return inLattice(DDcT1, DDcT2, val);
		});
	});
}
export const _allTopOnMirrorExactForTest = allTopCentersOnMirrorExact;

// The 17-group decision procedure, keyed on the exact element inventory. nMax = highest rotation
// order; the mirror/glide/centers-on-mirror discriminators split the ambiguous pairs (pmm/pmg/cmm,
// p3m1/p31m, p4m/p4g). Standard flowchart (e.g. IUCr Tables / Schattschneider 1978).
function identifyGroup(
	nMax: number,
	hasMirror: boolean,
	hasGlide: boolean,
	mAngles: number,
	allTopOnMirror: boolean,
): WallpaperGroup {
	switch (nMax) {
		case 2:
			if (!hasMirror) return hasGlide ? "pgg" : "p2";
			if (!hasGlide) return "pmm";
			return mAngles >= 2 ? "cmm" : "pmg";
		case 3:
			if (!hasMirror) return "p3";
			return allTopOnMirror ? "p3m1" : "p31m";
		case 4:
			if (!hasMirror) return "p4";
			return allTopOnMirror ? "p4m" : "p4g";
		case 6:
			return hasMirror ? "p6m" : "p6";
		default: // nMax === 1
			if (!hasMirror) return hasGlide ? "pg" : "p1";
			return hasGlide ? "cm" : "pm";
	}
}

function polyArea(pts: Vec2[]): number {
	let a = 0;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i], q = pts[(i + 1) % pts.length];
		a += p.x * q.y - q.x * p.y;
	}
	return Math.abs(a) / 2;
}
export const _polyAreaForTest = polyArea;

// Drop consecutive duplicate vertices (and the wrap duplicate). Many mirror lines pass exactly through
// the anchor, so raw clipping produces coincident points that corrupt later clips if not removed.
function dedupPoly(pts: Vec2[]): Vec2[] {
	const out: Vec2[] = [];
	for (const p of pts) {
		const last = out[out.length - 1];
		if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-7) out.push(p);
	}
	while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-7) {
		out.pop();
	}
	return out;
}

// Clip a convex polygon to the half-plane {(p−linePt)·normal ≥ 0} (Sutherland-Hodgman, one edge).
// A vertex ON the line counts as inside; intersections are added only on a strict sign crossing, so a
// line grazing a vertex doesn't emit a duplicate.
function clipHalfPlane(poly: Vec2[], linePt: Vec2, normal: Vec2): Vec2[] {
	const out: Vec2[] = [];
	const n = poly.length;
	for (let i = 0; i < n; i++) {
		const a = poly[i], b = poly[(i + 1) % n];
		const da = (a.x - linePt.x) * normal.x + (a.y - linePt.y) * normal.y;
		const db = (b.x - linePt.x) * normal.x + (b.y - linePt.y) * normal.y;
		if (da >= -1e-9) out.push(a);
		if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
			const t = da / (da - db);
			out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
	}
	return dedupPoly(out);
}

const scaleAdd = (o: Vec2, u: Vec2, s: number, v?: Vec2, s2 = 0): Vec2 => ({
	x: o.x + u.x * s + (v ? v.x * s2 : 0),
	y: o.y + u.y * s + (v ? v.y * s2 : 0),
});

// Correct-area fallback FD: a parallelogram that is 1/|G| of the cell (a valid fundamental domain for
// any group; used when the mirror chamber can't be cut). Factor split a·b = |G|.
const FRAC: Record<number, [number, number]> = {
	1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 12: [4, 3],
};
function fractionParallelogram(c0: Vec2, r1: Vec2, r2: Vec2, order: number): Vec2[] {
	const [a, b] = FRAC[order] ?? [1, 1];
	const u = { x: r1.x / a, y: r1.y / a };
	const v = { x: r2.x / b, y: r2.y / b };
	return [c0, scaleAdd(c0, u, 1), scaleAdd(c0, u, 1, v, 1), scaleAdd(c0, v, 1)];
}

// Perpendicular distance from pt to the line of ax (ax.d unit).
function perpDist(pt: Vec2, ax: Axis): number {
	return Math.abs((pt.x - ax.p.x) * -ax.d.y + (pt.y - ax.p.y) * ax.d.x);
}

function triArea(a: Vec2, b: Vec2, c: Vec2): number {
	return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

// Shortest lattice vector PARALLEL to `dir` — the on-mirror lattice period (Conway's kaleidoscope
// spacing). Legs of a mirror-bounded FD run half this far to the next corner reflector.
function onLinePeriod(dir: Vec2, r1: Vec2, r2: Vec2): number {
	let best = Infinity;
	for (let a = -12; a <= 12; a++) {
		for (let b = -12; b <= 12; b++) {
			if (a === 0 && b === 0) continue;
			const lv = { x: a * r1.x + b * r2.x, y: a * r1.y + b * r2.y };
			const perp = lv.x * -dir.y + lv.y * dir.x;
			if (Math.abs(perp) < 1e-6) best = Math.min(best, Math.abs(lv.x * dir.x + lv.y * dir.y));
		}
	}
	return best;
}

// Distinct mirror directions (angle mod 180°), each with a representative axis.
function uniqueMirrorDirs(mirrors: Axis[]): { d: Vec2; rep: Axis }[] {
	const byAng = new Map<number, Axis>();
	for (const m of mirrors) {
		const ang = Math.round(((((Math.atan2(m.d.y, m.d.x) * 180) / Math.PI) % 180) + 180) % 180);
		if (!byAng.has(ang)) byAng.set(ang, m);
	}
	return Array.from(byAng.values()).map((rep) => ({ d: rep.d, rep }));
}

// Intersection point of two axis lines (returns null if parallel).
function lineIntersect(a: Axis, b: Axis): Vec2 | null {
	const den = a.d.x * b.d.y - a.d.y * b.d.x;
	if (Math.abs(den) < 1e-9) return null;
	const s = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den;
	return { x: a.p.x + s * a.d.x, y: a.p.y + s * a.d.y };
}

// Direct FD for the two-perpendicular-mirror-family groups (Conway 2*22 cmm and *2222 pmm). Anchor at a
// mirror∩mirror corner reflector; the two legs run half the on-mirror period along each mirror. The
// rectangle spanned by both legs is pmm's FD; when that rectangle is twice the target (a centered/rhombic
// cell), the true FD is its half-triangle — cmm — with the interior 2-fold cone point on the hypotenuse.
function perpMirrorFD(mirrors: Axis[], r1: Vec2, r2: Vec2, target: number): { fd: Vec2[]; anchor: Vec2 } | null {
	const dirs = uniqueMirrorDirs(mirrors);
	let best: { p0: Vec2; A: Vec2; B: Vec2; C: Vec2; rectArea: number } | null = null;
	for (let i = 0; i < dirs.length; i++) {
		for (let j = i + 1; j < dirs.length; j++) {
			const cos = dirs[i].d.x * dirs[j].d.x + dirs[i].d.y * dirs[j].d.y;
			if (Math.abs(cos) > 1e-6) continue; // want perpendicular directions
			// choose the dir-i and dir-j mirrors whose intersection is nearest the origin
			let p0: Vec2 | null = null;
			for (const mi of mirrors.filter((m) => Math.abs(m.d.x * dirs[i].d.y - m.d.y * dirs[i].d.x) < 1e-6)) {
				for (const mj of mirrors.filter((m) => Math.abs(m.d.x * dirs[j].d.y - m.d.y * dirs[j].d.x) < 1e-6)) {
					const p = lineIntersect(mi, mj);
					if (p && (!p0 || Math.hypot(p.x, p.y) < Math.hypot(p0.x, p0.y))) p0 = p;
				}
			}
			if (!p0) continue;
			const P1 = onLinePeriod(dirs[i].d, r1, r2), P2 = onLinePeriod(dirs[j].d, r1, r2);
			if (!Number.isFinite(P1) || !Number.isFinite(P2)) continue;
			const A = { x: p0.x + 0.5 * P1 * dirs[i].d.x, y: p0.y + 0.5 * P1 * dirs[i].d.y };
			const B = { x: p0.x + 0.5 * P2 * dirs[j].d.x, y: p0.y + 0.5 * P2 * dirs[j].d.y };
			const C = { x: A.x + B.x - p0.x, y: A.y + B.y - p0.y };
			const rectArea = 0.5 * P1 * 0.5 * P2;
			if (!best || Math.hypot(p0.x, p0.y) < Math.hypot(best.p0.x, best.p0.y)) best = { p0, A, B, C, rectArea };
		}
	}
	if (!best) return null;
	if (Math.abs(best.rectArea - target) < 0.02 * target) return { fd: [best.p0, best.A, best.C, best.B], anchor: best.p0 }; // pmm rectangle
	if (Math.abs(best.rectArea - 2 * target) < 0.04 * target) return { fd: [best.p0, best.A, best.B], anchor: best.p0 }; // cmm triangle
	return null;
}

// Reconstruct a COMPLETE set of mirror lines around the origin from the windowed detection. The detected
// lines of one direction are equally spaced by a perpendicular period; replicating each direction at
// that spacing across a disk of radius ~2.6·(|r1|+|r2|) gives every mirror the FD builder needs, so
// segOnMirror / chamber checks stop failing near far-from-origin anchors (the cmm straggler cause).
function completeMirrors(mirrors: Axis[], r1: Vec2, r2: Vec2): Axis[] {
	const R = 2.6 * (Math.hypot(r1.x, r1.y) + Math.hypot(r2.x, r2.y));
	const groups = new Map<number, { d: Vec2; offs: number[] }>();
	for (const m of mirrors) {
		const jIdx = Math.round(((((Math.atan2(m.d.y, m.d.x) * 180) / Math.PI) % 180 + 180) % 180) / 7.5) % 24;
		const off = m.p.x * -m.d.y + m.p.y * m.d.x; // signed perpendicular offset from origin
		const g = groups.get(jIdx) ?? { d: m.d, offs: [] };
		g.offs.push(off);
		groups.set(jIdx, g);
	}
	const out: Axis[] = [];
	for (const { d, offs } of groups.values()) {
		const nrm = { x: -d.y, y: d.x };
		const uniq = [...new Set(offs.map((o) => Math.round(o * 1000) / 1000))].sort((a, b) => a - b);
		let spacing = Infinity;
		for (let i = 1; i < uniq.length; i++) spacing = Math.min(spacing, uniq[i] - uniq[i - 1]);
		if (!Number.isFinite(spacing) || spacing < 1e-6) {
			for (const o of uniq) out.push({ p: { x: o * nrm.x, y: o * nrm.y }, d, kind: "mirror" });
			continue;
		}
		const base = uniq[0];
		for (let k = Math.floor((-R - base) / spacing); k <= Math.ceil((R - base) / spacing); k++) {
			const o = base + k * spacing;
			out.push({ p: { x: o * nrm.x, y: o * nrm.y }, d, kind: "mirror" });
		}
	}
	return out;
}
const segOnMirror = (p: Vec2, q: Vec2, mirrors: Axis[], eps: number): boolean =>
	mirrors.some((m) => perpDist(p, m) < eps && perpDist(q, m) < eps);

// A valid orbifold chamber has NO mirror crossing its interior (a mirror may bound an edge but not run
// through the middle). This is what separates cmm's genuine right-triangle (free hypotenuse, no interior
// mirror) from the spurious cell/4 triangle a *2222 pmm would otherwise admit (its long leg straddles an
// interior mirror). Signed perpendicular distance of the 3 vertices: reject if a mirror has vertices
// strictly on both sides.
function noMirrorThroughInterior(tri: Vec2[], mirrors: Axis[], eps: number): boolean {
	for (const m of mirrors) {
		let pos = 0, neg = 0;
		for (const v of tri) {
			const s = (v.x - m.p.x) * -m.d.y + (v.y - m.p.y) * m.d.x;
			if (s > eps) pos++;
			else if (s < -eps) neg++;
		}
		if (pos > 0 && neg > 0) return false;
	}
	return true;
}

// A MIRROR edge of a genuine chamber runs vertex-to-adjacent-vertex with no rotation center in between;
// a center strictly inside a mirror edge means the edge overshoots a chamber boundary (the *2222 pmm
// case, whose long mirror leg has a 2-fold at its midpoint). A center inside a FREE (non-mirror) edge is
// fine — that is exactly cmm's interior 2-fold cone point sitting on the hypotenuse. So gate mirror
// edges only. Uses the reliably-complete center set, not the windowed mirror set.
function noCenterInsideMirrorEdge(
	tri: Vec2[],
	centers: Center[],
	mirrors: Axis[],
	r1: Vec2,
	r2: Vec2,
	eps: number,
): boolean {
	const pts: Vec2[] = [];
	for (const c of centers) {
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) pts.push({ x: c.z.x + a * r1.x + b * r2.x, y: c.z.y + a * r1.y + b * r2.y });
		}
	}
	for (let i = 0; i < 3; i++) {
		const P = tri[i], Q = tri[(i + 1) % 3];
		if (!segOnMirror(P, Q, mirrors, eps)) continue; // only mirror edges must be bare
		const ex = Q.x - P.x, ey = Q.y - P.y;
		const len2 = ex * ex + ey * ey;
		if (len2 < 1e-12) continue;
		for (const z of pts) {
			const tt = ((z.x - P.x) * ex + (z.y - P.y) * ey) / len2;
			if (tt <= 0.02 || tt >= 0.98) continue; // strictly interior to the edge
			const perp = Math.abs((z.x - P.x) * ey - (z.y - P.y) * ex) / Math.sqrt(len2);
			if (perp < eps) return false;
		}
	}
	return true;
}

// The orbifold chamber: the smallest triangle [c0, A, B] whose corners are rotation centers (A,B taken
// from the centers and their lattice translates) with both legs c0-A and c0-B lying on mirror lines and
// area = |cell|/|G|. This is the canonical FD for the *-reflection groups: 6·3·2 for p6m (30-60-90),
// 4·2·4 for p4m (45-45-90), 3·3·3 for p3m1, etc. Returns null if no such triangle is found.
function reflectionTriangle(
	c0: Vec2,
	centers: Center[],
	mirrors: Axis[],
	r1: Vec2,
	r2: Vec2,
	target: number,
	cellSize: number,
): Vec2[] | null {
	const eps = 0.02 * cellSize;
	const cand: Vec2[] = [];
	for (const c of centers) {
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) {
				const z = { x: c.z.x + a * r1.x + b * r2.x, y: c.z.y + a * r1.y + b * r2.y };
				const d = Math.hypot(z.x - c0.x, z.y - c0.y);
				if (d > eps && d < 2.4 * cellSize) cand.push(z);
			}
		}
	}
	cand.sort((p, q) => Math.hypot(p.x - c0.x, p.y - c0.y) - Math.hypot(q.x - c0.x, q.y - c0.y));
	for (let i = 0; i < cand.length; i++) {
		for (let j = i + 1; j < cand.length; j++) {
			const A = cand[i], B = cand[j];
			if (Math.abs(triArea(c0, A, B) - target) > 0.02 * Math.max(1e-9, target)) continue;
			if (!segOnMirror(c0, A, mirrors, eps) || !segOnMirror(c0, B, mirrors, eps)) continue; // legs on mirrors
			if (!noMirrorThroughInterior([c0, A, B], mirrors, eps)) continue;
			if (noCenterInsideMirrorEdge([c0, A, B], centers, mirrors, r1, r2, eps)) return [c0, A, B]; // genuine chamber
		}
	}
	return null;
}

// The fundamental domain, group-determined (NOT a Voronoi cell). Anchored at the highest-order rotation
// center nearest the origin. A mirror group's point group is exactly TWICE its rotation part, so its FD
// is HALF the rotation fraction-parallelogram, cut by the mirror through the anchor — one robust clip
// that yields the canonical chamber (45-45-90 for p4m, 30-60-90 for p6m). If that half doesn't hit the
// target area (e.g. p4g/pmg, bounded by glides not mirrors), fall back to the correct-area
// fraction-parallelogram. Area is guaranteed = |cell|/|G| either way.
function buildFD(
	group: WallpaperGroup,
	order: number,
	centers: Center[],
	axes: Axis[],
	r1: Vec2,
	r2: Vec2,
): { fd: Vec2[]; anchor: Vec2 } {
	const nMax = centers.length ? Math.max(...centers.map((c) => c.order)) : 1;
	const top = centers.filter((c) => c.order === nMax);
	const c0 = top.length
		? top.reduce((m, c) => (Math.hypot(c.z.x, c.z.y) < Math.hypot(m.z.x, m.z.y) ? c : m)).z
		: { x: 0, y: 0 };
	const cellArea = polyArea([{ x: 0, y: 0 }, r1, { x: r1.x + r2.x, y: r1.y + r2.y }, r2]);
	const targetArea = cellArea / order;
	const mirrors = axes.filter((a) => a.kind === "mirror");

	const cellSize = Math.min(Math.hypot(r1.x, r1.y), Math.hypot(r2.x, r2.y));

	// Reflection group (|G| = 2·rotationOrder). First try the canonical orbifold triangle. Its apex must
	// sit on a mirror INTERSECTION (≥2 mirrors) so both legs can lie on mirrors — for p4m/p6m that's the
	// top-order center, but for cmm the nearest 2-fold may be the one BETWEEN mirrors, so try every
	// on-intersection center (highest order / nearest origin first). Triangle-less groups (pmm rectangle,
	// pmg/pm/cm strips) find no area-matching triangle and correctly fall through to the parallelogram.
	if (mirrors.length > 0 && order === 2 * Math.max(1, nMax)) {
		const fullMirrors = completeMirrors(mirrors, r1, r2);

		// cmm (2*22) and pmm (*2222) are built directly from the two perpendicular mirror families — a
		// robust, deterministic construction (Conway) that doesn't depend on the windowed center search.
		if (group === "cmm" || group === "pmm") {
			const pm = perpMirrorFD(fullMirrors, r1, r2, targetArea);
			if (pm) return pm;
		}
		// Try every nearby center (and its translates) as the triangle apex — the leg-on-mirror and
		// genuine-chamber checks inside reflectionTriangle do the filtering, so we don't rely on the
		// windowed mirror set to pre-identify apex intersections (which misses some cmm anchors).
		const apexSeen = new Set<string>();
		const apexes: { z: Vec2; order: number }[] = [];
		for (const c of centers) {
			for (let a = -1; a <= 1; a++) {
				for (let b = -1; b <= 1; b++) {
					const z = { x: c.z.x + a * r1.x + b * r2.x, y: c.z.y + a * r1.y + b * r2.y };
					if (Math.hypot(z.x, z.y) > 1.8 * cellSize) continue;
					const key = `${z.x.toFixed(3)},${z.y.toFixed(3)}`;
					if (apexSeen.has(key)) continue;
					apexSeen.add(key);
					apexes.push({ z, order: c.order });
				}
			}
		}
		apexes.sort((p, q) => q.order - p.order || Math.hypot(p.z.x, p.z.y) - Math.hypot(q.z.x, q.z.y));
		for (const ap of apexes) {
			const tri = reflectionTriangle(ap.z, centers, fullMirrors, r1, r2, targetArea, cellSize);
			if (tri) return { fd: tri, anchor: ap.z };
		}
		const rotFrac = fractionParallelogram(c0, r1, r2, Math.max(1, nMax));
		const u = { x: rotFrac[1].x - c0.x, y: rotFrac[1].y - c0.y };
		const v = { x: rotFrac[3].x - c0.x, y: rotFrac[3].y - c0.y };
		const seed = { x: c0.x + 0.3 * u.x + 0.15 * v.x, y: c0.y + 0.3 * u.y + 0.15 * v.y }; // off any diagonal
		const through = mirrors.filter((m) => perpDist(c0, m) < 0.01 * cellSize);
		for (const m of through.length ? through : mirrors) {
			const nrm = { x: -m.d.y, y: m.d.x };
			const side = (seed.x - m.p.x) * nrm.x + (seed.y - m.p.y) * nrm.y;
			const normal = side >= 0 ? nrm : { x: -nrm.x, y: -nrm.y };
			const half = clipHalfPlane(rotFrac, m.p, normal);
			if (half.length >= 3 && Math.abs(polyArea(half) - targetArea) < 0.02 * Math.max(1e-9, targetArea)) {
				return { fd: half, anchor: c0 };
			}
		}
	}
	return { fd: fractionParallelogram(c0, r1, r2, order), anchor: c0 };
}

// Exact wallpaper-symmetry analysis of a periodic tiling. T1,T2 = exact lattice basis; seed = the
// deduped exact vertex set of one primitive cell (all Cyclotomic). The returned SymmetryData carries
// FLOAT geometry for rendering, but every symmetry decision behind it is made in exact ℤ[ζ_N].
//
// This is the Phase-0 skeleton: it returns only the primitive cell parallelogram. Rotations, mirrors,
// glides, group identification, and the fundamental domain are layered in by later phases.
// --- drawn cell + fundamental-domain subdivision (render-only float geometry) ---
// The cell is subdivided into its `pointGroupOrder` fundamental-domain copies by CUTTING a symmetry-centred
// cell with the kaleidoscope lines through the anchor. The copies are pieces of the cell, so the FD is
// always inside it. The cell is the Wigner–Seitz (Dirichlet) cell of the lattice around the anchor — which
// equals the conventional rectangle / square / 120° hexagon — except cm/cmm, drawn as the mirror-aligned
// rhombus (Wikipedia). Validated area-exact on all 92 certified k≤3 tilings (scripts/validate-fd-subdivision.ts).

// Wigner–Seitz cell of the lattice (c1,c2) around `anchor`: a big box clipped by the perpendicular
// bisectors of nearby lattice vectors (keep the half nearer the anchor).
function wignerSeitzCell(c1: Vec2, c2: Vec2, anchor: Vec2): Vec2[] {
	const R = 4 * (Math.hypot(c1.x, c1.y) + Math.hypot(c2.x, c2.y));
	let poly: Vec2[] = [
		{ x: anchor.x - R, y: anchor.y - R }, { x: anchor.x + R, y: anchor.y - R },
		{ x: anchor.x + R, y: anchor.y + R }, { x: anchor.x - R, y: anchor.y + R },
	];
	for (let i = -2; i <= 2; i++)
		for (let j = -2; j <= 2; j++) {
			if (!i && !j) continue;
			const v = { x: i * c1.x + j * c2.x, y: i * c1.y + j * c2.y };
			poly = clipHalfPlane(poly, { x: anchor.x + v.x / 2, y: anchor.y + v.y / 2 }, { x: -v.x, y: -v.y });
		}
	return poly;
}

// cm/cmm: the mirror-aligned primitive rhombus, centred on `anchor`. A = shortest lattice vector along a
// mirror, B along the perpendicular; the centred-rectangular primitive rhombus edges are (A±B)/2 (both
// lattice vectors, equal length, same covolume). Null if degenerate (→ caller uses the Wigner–Seitz cell).
function rhombusCellCentered(axes: Axis[], c1: Vec2, c2: Vec2, anchor: Vec2): Vec2[] | null {
	const mirror = axes.find((a) => a.kind === "mirror");
	if (!mirror) return null;
	const dA = mirror.d, dB = { x: -mirror.d.y, y: mirror.d.x };
	const PA = onLinePeriod(dA, c1, c2), PB = onLinePeriod(dB, c1, c2);
	if (!Number.isFinite(PA) || !Number.isFinite(PB)) return null;
	const r1 = { x: (dA.x * PA + dB.x * PB) / 2, y: (dA.y * PA + dB.y * PB) / 2 };
	const r2 = { x: (dA.x * PA - dB.x * PB) / 2, y: (dA.y * PA - dB.y * PB) / 2 };
	const det0 = Math.abs(c1.x * c2.y - c1.y * c2.x), det1 = Math.abs(r1.x * r2.y - r1.y * r2.x);
	if (det1 < 1e-9 || Math.abs(det0 - det1) > 1e-6 * det0) return null;
	const o = { x: anchor.x - (r1.x + r2.x) / 2, y: anchor.y - (r1.y + r2.y) / 2 };
	return [o, { x: o.x + r1.x, y: o.y + r1.y }, { x: o.x + r1.x + r2.x, y: o.y + r1.y + r2.y }, { x: o.x + r2.x, y: o.y + r2.y }];
}

// Distinct mirror-line directions (deg mod 180) whose line passes through `z`.
function mirrorAnglesThrough(axes: Axis[], z: Vec2): number[] {
	const s = new Set<number>();
	for (const a of axes) {
		if (a.kind !== "mirror") continue;
		if (Math.abs((z.x - a.p.x) * -a.d.y + (z.y - a.p.y) * a.d.x) > 1e-3) continue;
		s.add(Math.round(((((Math.atan2(a.d.y, a.d.x) * 180) / Math.PI) % 180) + 180) % 180));
	}
	return [...s];
}

// Split `cell` by each full line through `anchor` in `dirs` (a kaleidoscope cut → `order` sectors).
function cutIntoSectors(cell: Vec2[], anchor: Vec2, dirs: Vec2[]): Vec2[][] {
	let faces = [cell];
	for (const d of dirs) {
		const n = { x: -d.y, y: d.x };
		const next: Vec2[][] = [];
		for (const f of faces) {
			const pos = clipHalfPlane(f, anchor, n), neg = clipHalfPlane(f, anchor, { x: -n.x, y: -n.y });
			if (polyArea(pos) > 1e-7 && polyArea(neg) > 1e-7) { next.push(pos); next.push(neg); }
			else next.push(f);
		}
		faces = next;
	}
	return faces;
}

// The drawn cell polygon + its `order` fundamental-domain copies. `faces[0]` is the emphasized FD. `ok`
// is the area-exact self-check (exactly `order` copies tiling the cell); on failure the caller keeps the
// buildFD fallback FD so a wrong subdivision is never drawn.
function buildSubdivision(
	group: WallpaperGroup,
	order: number,
	centers: Center[],
	axes: Axis[],
	c1: Vec2,
	c2: Vec2,
): { anchor: Vec2; cellPolygon: Vec2[]; faces: Vec2[][]; ok: boolean } {
	// anchor = the centre of maximal site symmetry: highest rotation order, then most mirrors through it.
	let anchor: Vec2 = centers.length ? centers[0].z : { x: 0, y: 0 };
	let bestKey = -1;
	for (const c of centers) {
		const k = c.order * 100 + mirrorAnglesThrough(axes, c.z).length;
		if (k > bestKey) { bestKey = k; anchor = c.z; }
	}
	// Cell shape per Wikipedia: oblique p1/p2 → parallelogram, cm/cmm → mirror-aligned rhombus, everything
	// else → the Wigner–Seitz cell (= rectangle for rectangular, square for square, 120° hexagon for
	// hexagonal). All centred on the anchor.
	const parallelogram = (): Vec2[] => {
		const o = { x: anchor.x - (c1.x + c2.x) / 2, y: anchor.y - (c1.y + c2.y) / 2 };
		return [o, { x: o.x + c1.x, y: o.y + c1.y }, { x: o.x + c1.x + c2.x, y: o.y + c1.y + c2.y }, { x: o.x + c2.x, y: o.y + c2.y }];
	};
	const cellPolygon =
		group === "p1" || group === "p2"
			? parallelogram()
			: ((group === "cm" || group === "cmm" ? rhombusCellCentered(axes, c1, c2, anchor) : null) ??
				wignerSeitzCell(c1, c2, anchor));
	if (order <= 1) return { anchor, cellPolygon, faces: [cellPolygon], ok: true };

	const md = mirrorAnglesThrough(axes, anchor);
	let dirs: Vec2[];
	if (2 * md.length === order) {
		// symmorphic reflection group: cut by the anchor's mirror kaleidoscope.
		dirs = md.map((deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) }));
	} else {
		// rotation-only / non-symmorphic: order/2 equally-spaced lines (aligned to a mirror if any).
		const base = md.length ? (md[0] * Math.PI) / 180 : Math.atan2(c1.y, c1.x);
		dirs = Array.from({ length: order / 2 }, (_, k) => {
			const a = base + (k * Math.PI) / (order / 2);
			return { x: Math.cos(a), y: Math.sin(a) };
		});
	}
	const faces = cutIntoSectors(cellPolygon, anchor, dirs);
	const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);
	const totArea = faces.reduce((s, f) => s + polyArea(f), 0);
	const ok = faces.length === order && Math.abs(totArea - cellArea) < 1e-3 * cellArea;
	return { anchor, cellPolygon, faces, ok };
}

export function analyzeSymmetry(
	ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
): SymmetryData {
	// Gauss-reduce so the drawn cell is the compact parallelogram (matches oracle-characterize.ts).
	const [gr1, gr2] = gaussReduceExact(T1, T2);
	const c1 = v2(gr1);
	const c2 = v2(gr2);

	const rots = rotations(T1, T2, seed);
	const centers = rotationCenters(ring, c1, c2, rots);
	const axes = reflections(ring, T1, T2, seed);
	const latticeShape = classifyLattice(ring, T1, T2);

	const nMax = centers.length ? Math.max(...centers.map((c) => c.order)) : 1;
	const hasMirror = axes.some((a) => a.kind === "mirror");
	const hasGlide = axes.some((a) => a.kind === "glide");
	// The p4m/p4g and p3m1/p31m split is decided EXACTLY in ℤ[ζ₂₄] (no float centre, no distance
	// tolerance) — the group label is a stored characterization attribute, held to the same exactness
	// standard as k and lattice shape. The float centres/axes above remain, for RENDERING only.
	const allTopOnMirror = allTopCentersOnMirrorExact(ring, T1, T2, seed);
	const group = identifyGroup(nMax, hasMirror, hasGlide, mirrorAngleCount(axes), allTopOnMirror);
	const pointGroupOrder = POINT_GROUP_ORDER[group];
	const sub = buildSubdivision(group, pointGroupOrder, centers, axes, c1, c2);
	// The cell (cut into `order` FD copies) tiles exactly for every certified group; on the rare self-check
	// failure keep the buildFD fallback FD (area-correct) and draw no subdivision, never a wrong one.
	const fallback = sub.ok ? null : buildFD(group, pointGroupOrder, centers, axes, c1, c2).fd;
	const subdivision = sub.ok ? sub.faces : [fallback!];
	const fd = subdivision[0];

	return {
		group,
		orbifold: ORBIFOLD_SIGNATURE[group],
		latticeShape,
		pointGroupOrder,
		axes,
		centers,
		fd,
		subdivision,
		cell: [c1, c2], // lattice basis (drives axis line-length + area); the DRAWN cell is cellPolygon
		cellPolygon: sub.cellPolygon,
		cellOrigin: sub.anchor,
	};
}
