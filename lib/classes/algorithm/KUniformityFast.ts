/**
 * Fast exact vertex-orbit count (k-uniformity), point-group variant of KUniformityChecker.
 *
 * Same result as `KUniformityChecker.countVertexOrbits` (validated by tests/kuniformity-fast.test.ts:
 * fast === gate === true k), but detects the symmetry group the cheap way — restricting candidate
 * linear parts to the lattice's point group (only crystallographic orders {2,3,4,6}, Barlow) and
 * verifying each on the cell's vertex set modulo Λ with exact integer arithmetic, instead of the gate's
 * enumerate-every-target-tile-in-a-7×7-block-of-exact-key-strings search. This is the Soto-Sánchez
 * (2021) integer-representation approach and the same one already used by `WallpaperSymmetry.ts`.
 *
 * Soundness rests on the standard crystallographic fact: a symmetry of a periodic tiling must map the
 * translation lattice Λ onto itself, so its linear part is a lattice automorphism (a finite set of
 * ≤12 candidates). Vertex-orbit reps and the union-find are computed identically to the gate; only the
 * symmetry-detection step changes. Returns null on degenerate input (caller keeps the tiling — never
 * drop on uncertainty), matching the gate.
 */
import { Cyclotomic } from '../Cyclotomic';
import type { Polygon } from '../polygons/Polygon';

// --- exact lattice arithmetic (integer Cramer over the ζ-power basis; ported from WallpaperSymmetry) ---
function bgcd(a: bigint, b: bigint): bigint {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b) [a, b] = [b, a % b];
	return a;
}
const blcm = (a: bigint, b: bigint) => (a === 0n || b === 0n ? 0n : (a / bgcd(a, b)) * b);

/** Exact: is w = a·u + b·v for integers a,b? Solves two independent rows by Cramer, verifies all φ. */
function inLattice(u: Cyclotomic, v: Cyclotomic, w: Cyclotomic): boolean {
	const D = blcm(blcm(u.den, v.den), w.den);
	const col = (z: Cyclotomic) => z.num.map((c) => (c * D) / z.den);
	const A = col(u), B = col(v), W = col(w);
	const dim = A.length;
	for (let i = 0; i < dim; i++) {
		for (let j = i + 1; j < dim; j++) {
			const det = A[i] * B[j] - A[j] * B[i];
			if (det === 0n) continue;
			const aNum = W[i] * B[j] - W[j] * B[i];
			const bNum = A[i] * W[j] - A[j] * W[i];
			if (aNum % det !== 0n || bNum % det !== 0n) return false;
			const a = aNum / det, b = bNum / det;
			for (let r = 0; r < dim; r++) if (a * A[r] + b * B[r] !== W[r]) return false;
			return true;
		}
	}
	return false;
}
const sameClass = (a: Cyclotomic, b: Cyclotomic, u: Cyclotomic, v: Cyclotomic) => inLattice(u, v, a.sub(b));

// Only crystallographic rotation orders can occur on a lattice (Barlow).
const CRYSTALLOGRAPHIC = new Set([2, 3, 4, 6]);
function ngcd(x: number, y: number): number { return y ? ngcd(y, x % y) : x; }

export function countVertexOrbitsFast(
	cellPolygons: Polygon[],
	u: Cyclotomic,
	v: Cyclotomic,
	diag?: { syms: number; reps: number; orbits: number | null },
): number | null {
	if (cellPolygons.length === 0) return null;
	if (!cellPolygons.every((p) => p.hasExact())) return null;
	const ring = cellPolygons[0].exactVertices![0].ring;
	const N = ring.N;
	if (N !== 24) throw new Error(`KUniformityFast: hardcoded to N=24 angle units; N=${N} unsupported`);
	const ZERO = Cyclotomic.ZERO(ring);
	const FULL_TURN_UNITS = N;

	const uV = u.toVector(), vV = v.toVector();
	const det = uV.x * vV.y - uV.y * vV.x;
	if (Math.abs(det) < 1e-9) return null;
	const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
	if (cellDiam < 1e-9) return null;

	// --- exact per-polygon cell data (one polygon per lattice class) ---
	const cells = cellPolygons.map((p) => ({ name: p.getName(), c: p.exactCentroid!, verts: p.exactVertices! }));
	const mapPt = (z: Cyclotomic, reflect: boolean, r: number, T: Cyclotomic): Cyclotomic =>
		(reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T);

	// g is a tiling symmetry iff every cell polygon maps (mod Λ) onto a same-type cell polygon: there is
	// a class q and a lattice shift λ with g(p) = q + λ, matching centroid AND all vertices EXACTLY. This
	// is the gate's polygon-level test (vertex-set preservation alone is UNSOUND — it accepts spurious
	// maps that permute vertices without preserving tiles), evaluated over the n cell classes not a block.
	const polyPreserves = (reflect: boolean, r: number, T: Cyclotomic): boolean =>
		cells.every((p) => {
			const gc = mapPt(p.c, reflect, r, T);
			const gv = p.verts.map((vx) => mapPt(vx, reflect, r, T));
			return cells.some((q) => {
				if (q.name !== p.name) return false;
				const shift = gc.sub(q.c);
				if (!inLattice(u, v, shift)) return false; // g(p) and q in the same lattice class
				const qKeys = new Set(q.verts.map((x) => x.key()));
				return gv.every((w) => qKeys.has(w.sub(shift).key())); // vertices coincide exactly
			});
		});

	// --- symmetry group: identity + one rep per lattice-preserving crystallographic rotation / reflection.
	//     Candidate translations align the reference polygon P0 onto each same-type class (T = c_Q − M(c₀)). ---
	type Sym = { reflect: boolean; r: number; T: Cyclotomic };
	const syms: Sym[] = [{ reflect: false, r: 0, T: ZERO }];
	const P0 = cells[0];
	const targets = cells.filter((q) => q.name === P0.name);
	// rotations z ↦ ζ^r·z + T
	for (let r = 1; r < N; r++) {
		const order = N / ngcd(r, N);
		if (!CRYSTALLOGRAPHIC.has(order)) continue;
		if (!(inLattice(u, v, u.mulZeta(r)) && inLattice(u, v, v.mulZeta(r)))) continue; // linear part ∈ Aut(Λ)
		for (const q of targets) {
			const T = q.c.sub(mapPt(P0.c, false, r, ZERO));
			if (polyPreserves(false, r, T)) { syms.push({ reflect: false, r, T }); break; }
		}
	}
	// reflections / glides z ↦ ζ^r·z̄ + T
	for (let r = 0; r < N; r++) {
		if (!(inLattice(u, v, u.conj().mulZeta(r)) && inLattice(u, v, v.conj().mulZeta(r)))) continue;
		for (const q of targets) {
			const T = q.c.sub(mapPt(P0.c, true, r, ZERO));
			if (polyPreserves(true, r, T)) { syms.push({ reflect: true, r, T }); break; }
		}
	}

	// --- surrounded-vertex reps: IDENTICAL to the gate (angle 2π, ≥3 tile instances, one per Λ-class,
	//     within vertR of the block centre). Reconstruct the same (2R+1)² block (R=3) and centre it on
	//     the mean polygon centroid, so the rep SET matches the gate exactly (a smaller window or a
	//     vertex-mean centre silently drops a boundary class — measured k=3 reps 4 vs 5). ---
	const R = 3;
	const patch: Polygon[] = [];
	const seenBlock = new Set<string>();
	for (let mi = -R; mi <= R; mi++) {
		for (let ni = -R; ni <= R; ni++) {
			const t = u.scaleRational(BigInt(mi), 1n).add(v.scaleRational(BigInt(ni), 1n));
			for (const cp of cellPolygons) {
				const q = cp.clone();
				q.translateExact(t);
				const k = q.exactKey();
				if (seenBlock.has(k)) continue;
				seenBlock.add(k);
				patch.push(q);
			}
		}
	}
	let cx = 0, cy = 0;
	for (const p of patch) { cx += p.centroid.x; cy += p.centroid.y; }
	cx /= patch.length; cy /= patch.length;
	const vertR = 1.6 * cellDiam;

	const incident = new Map<string, { vertex: Cyclotomic; units: number; tiles: Set<string> }>();
	for (const p of patch) {
		const pk = p.exactKey();
		p.exactVertices!.forEach((vx, i) => {
			const k = vx.key();
			const e = incident.get(k);
			if (e) { e.units += p.cornerAngleUnits(i); e.tiles.add(pk); }
			else incident.set(k, { vertex: vx, units: p.cornerAngleUnits(i), tiles: new Set([pk]) });
		});
	}
	const reps: Cyclotomic[] = [];
	for (const { vertex, units, tiles } of incident.values()) {
		if (units !== FULL_TURN_UNITS) continue; // not fully surrounded (partial corona at block edge or non-2π)
		if (tiles.size < 3) continue; // A2: 2-tile 2π point is a forced dent-fill, not an orbit rep
		const vv = vertex.toVector();
		if (Math.hypot(vv.x - cx, vv.y - cy) > vertR) continue;
		if (reps.some((rp) => sameClass(vertex, rp, u, v))) continue;
		reps.push(vertex);
	}
	if (reps.length === 0) return null;

	// --- union-find reps under the symmetry group (mod Λ), identical to the gate ---
	const parent = reps.map((_, i) => i);
	const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
	const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
	for (let i = 0; i < reps.length; i++) {
		for (const g of syms) {
			const gw = (g.reflect ? reps[i].conj().mulZeta(g.r) : reps[i].mulZeta(g.r)).add(g.T);
			for (let j = 0; j < reps.length; j++) {
				if (find(i) === find(j)) continue;
				if (sameClass(gw, reps[j], u, v)) { union(i, j); break; }
			}
		}
	}
	const roots = new Set<number>();
	for (let i = 0; i < reps.length; i++) roots.add(find(i));
	if (diag) { diag.syms = syms.length; diag.reps = reps.length; diag.orbits = roots.size; }
	return roots.size;
}
