/**
 * Exact pure-integer reconstruction of an oracle cell — the Soto-Sánchez cloud method (spike B).
 *
 * The oracle stores each tiling as translation basis T1/T2 + per-cell vertex seeds, all as integer
 * `[a,b,c,d]` in the ζ₁₂ power basis. The paper reconstructs geometry with NO floating point: put the
 * seeds ⊕ a lattice window into a hash cloud, then for each interior vertex probe the 24 unit
 * directions ζ^k and look up `(v+ζ^k)` in the cloud — the direction index IS the angular order (no
 * atan2, no distance band), and the face on each wedge follows from the integer gap between
 * consecutive star directions. This replaces the float grid + atan2 face-walk + rim heuristics of
 * `scripts/oracle-match.ts:reconstructOracleCell`.
 *
 * Contract mirrors that function: `{ cell } | { error }`, matched downstream by `cellsCongruent`.
 * Every failure mode is loud (degenerate basis, incomplete tiling by area). Kept separate from the
 * certified script so the working path is untouched while we benchmark this one.
 */
import { Cyclotomic, type CyclotomicRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { detSurd, polygonAreaSurd } from '@/classes/algorithm/exact/Surd';
import { reducedClassKey } from '@/classes/algorithm/TilingCongruence';
import { gaussReduceExact } from '@/classes/algorithm/LatticeEnumerator';
import { getActiveRing } from '@/classes/Cyclotomic';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

/**
 * A fully-surrounded vertex partitions its 2π into wedges; each wedge is one regular tile whose
 * interior angle (in π/12 = 15° units) is the gap `g` between consecutive star directions. Only the
 * five regular tiles that tile the plane are admissible: g→n via n = 24/(12−g), restricted EXPLICITLY
 * to g ∈ {4,6,8,9,10} (⇒ n ∈ {3,4,6,8,12}). The bare divisibility test (12−g)|24 would also admit
 * g=11 → n=24; this guard rejects it. Returns null for any inadmissible gap (a boundary/partial star).
 */
export function faceFromGap(g: number): number | null {
	switch (g) {
		case 4:
			return 3;
		case 6:
			return 4;
		case 8:
			return 6;
		case 9:
			return 8;
		case 10:
			return 12;
		default:
			return null;
	}
}

// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³ ; ζ₁₂ = ζ₂₄². (Decode recipe from oracle-characterize.ts.)
function dec(ring: CyclotomicRing, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

const R = 3; // lattice window radius (seeds ⊕ i·u + j·v, i,j ∈ [−R,R])
const TRUST = 1; // reconstruct stars only for vertices in the central (2·TRUST+1)² cells — their unit
// neighbours are guaranteed inside the R window, so their star is complete (verified by area check).

export function reconstructOracleCellExact(
	tCode: string,
	o: { T1: number[]; T2: number[]; Seed: number[][] },
): { cell: PeriodCell } | { error: string } {
	const ring = getActiveRing();
	const u = dec(ring, o.T1);
	const v = dec(ring, o.T2);
	if (detSurd(u, v).isZero()) return { error: 'degenerate basis (det 0)' };

	// Reduce so lattice depth ≈ Euclidean depth (the oracle bases can be skewed); the lattice Λ is
	// unchanged, so seeds ⊕ Λ and every face class are identical.
	const [ru, rv] = gaussReduceExact(u, v);
	const seeds = o.Seed.map((s) => dec(ring, s));

	// --- cloud: seeds ⊕ lattice window; `trusted` = the central vertices with complete stars ---
	const cloud = new Set<string>();
	const trusted: Cyclotomic[] = [];
	const trustedSeen = new Set<string>();
	for (let i = -R; i <= R; i++) {
		for (let j = -R; j <= R; j++) {
			const t = ru.scaleRational(BigInt(i), 1n).add(rv.scaleRational(BigInt(j), 1n));
			for (const s of seeds) {
				const p = s.add(t);
				const k = p.key();
				cloud.add(k);
				if (Math.abs(i) <= TRUST && Math.abs(j) <= TRUST && !trustedSeen.has(k)) {
					trustedSeen.add(k);
					trusted.push(p);
				}
			}
		}
	}

	// --- exact star probe + faces from integer gaps ---
	const zetas = Array.from({ length: 24 }, (_, k) => Cyclotomic.zeta(ring, k));
	const faces: RegularPolygon[] = [];
	for (const vtx of trusted) {
		const star: number[] = [];
		for (let k = 0; k < 24; k++) if (cloud.has(vtx.add(zetas[k]).key())) star.push(k);
		if (star.length < 3) continue; // not a real surrounded vertex
		// gaps between consecutive star directions (cyclic) must all be admissible and sum to 24.
		let ok = true;
		let sum = 0;
		const wedges: { n: number; dir: number }[] = [];
		for (let a = 0; a < star.length; a++) {
			const k0 = star[a];
			const k1 = star[(a + 1) % star.length];
			const g = (((k1 - k0) % 24) + 24) % 24;
			const n = faceFromGap(g);
			if (n === null) {
				ok = false;
				break;
			}
			sum += g;
			wedges.push({ n, dir: k0 });
		}
		if (!ok || sum !== 24) continue; // boundary/partial star — skip (a genuinely bad cell fails area)
		for (const w of wedges) faces.push(RegularPolygon.fromAnchorAndDirExact(w.n, vtx, w.dir));
	}

	// --- one face per lattice class (exact, class-canonical) ---
	const byClass = new Map<string, RegularPolygon>();
	for (const f of faces) {
		const key = reducedClassKey(f, ru, rv);
		if (!byClass.has(key)) byClass.set(key, f);
	}
	const cellPolygons = [...byClass.values()];
	if (cellPolygons.length === 0) return { error: `no faces reconstructed (${tCode})` };

	// --- exact area certificate: the class faces must tile exactly one cell ---
	const cellArea = detSurd(ru, rv).abs();
	let sum = polygonAreaSurd(cellPolygons[0].exactVertices!);
	for (let i = 1; i < cellPolygons.length; i++) sum = sum.add(polygonAreaSurd(cellPolygons[i].exactVertices!));
	if (!sum.sub(cellArea).isZero()) {
		return { error: `face areas ≠ |det Λ| — incomplete reconstruction (${tCode})` };
	}

	return { cell: { cellPolygons, basisExact: [u, v] } };
}
