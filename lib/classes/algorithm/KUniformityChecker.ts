/**
 * Exact k-uniformity gate (docs/CYCLOTOMIC_SPEC.md; plan §5 Step 1).
 *
 * Computes the true number of vertex-transitivity classes (vertex orbits) of a periodic,
 * edge-to-edge tiling under its FULL symmetry group, exactly. This is the defining property of
 * k-uniformity — the pipeline previously never checked it (the count was a canonical-key dedup that
 * only *coincided* with the known value at k=1). Used as the final correctness gate (orbit count
 * must equal k) and as the machinery for orbit-based pruning.
 *
 * Method (all exact, no float decisions; float only as a broadphase guess that is exact-verified):
 *  1. Enumerate candidate symmetries of the form  g(z) = M(z) + T,  M(z) = ζ^r·z  (rotation) or
 *     M(z) = ζ^r·conj(z)  (reflection/glide). r ∈ [0,N), and the translation part T is carried, so
 *     glide reflections are covered (unlike the old float TilingChecker, which found only pure
 *     rotations + reflections). A candidate is built for every way of mapping a fixed reference
 *     polygon P0 onto a same-type polygon Q in the patch interior, and kept only if it maps P0
 *     exactly onto Q (exact-key match).
 *  2. Verify each candidate is a global symmetry: it must preserve the translation lattice (M(u),
 *     M(v) ∈ ℤu+ℤv, exact) and map every interior polygon onto an existing patch polygon (exact
 *     key ∈ patch key set). Interior is restricted so a symmetry's bounded displacement cannot
 *     leave the finite patch (no false negatives at the boundary).
 *  3. Count vertex orbits: take one lattice-class representative per *surrounded* interior vertex
 *     (interior-angle sum = 2π, exact), then union-find: rep i ~ rep j iff some verified symmetry
 *     maps i onto j (mod lattice). The number of classes is the true k.
 */

import type { Polygon } from '../polygons/Polygon';
import { Cyclotomic } from '../Cyclotomic';

const FLOAT_TOL = 1e-6;

/** Interior-angle of a regular n-gon in units of (π/12): 12·(n−2)/n. Integer for the regular core
 *  {3,4,6,8,12} (4,6,8,9,10); a full vertex is 2π = 24 of these units. */
function angleUnits(n: number): number {
	const u = (12 * (n - 2)) / n;
	return u;
}

export class KUniformityChecker {
	/**
	 * True number of vertex-transitivity classes of the periodic tiling DEFINED by a fundamental
	 * cell (`cellPolygons`, one polygon per lattice class) and its exact translation basis (u, v).
	 *
	 * The cell + basis define the infinite tiling unambiguously, so we reconstruct a clean, large,
	 * well-centred periodic block by replicating the cell over the lattice. This removes any
	 * dependence on the messy size/shape of the original expansion patch (which made an
	 * interior-restricted symmetry search over- or under-count). Returns null only if the input is
	 * degenerate (caller treats null as "cannot gate" → keep the tiling, never drop on uncertainty).
	 */
	countVertexOrbits(
		cellPolygons: Polygon[],
		u: Cyclotomic,
		v: Cyclotomic,
		diag?: { syms: number; reps: number; blockSize: number; orbits: number | null }
	): number | null {
		if (cellPolygons.length === 0) return null;
		if (!cellPolygons.every((p) => p.hasExact())) return null;
		const ring = cellPolygons[0].exactVertices![0].ring;
		const N = ring.N;
		const ZERO = Cyclotomic.ZERO(ring);

		// --- Reconstruct a periodic block: replicate the cell over a (2R+1)² lattice window. ---
		const R = 3;
		const block: Polygon[] = [];
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
					block.push(q);
				}
			}
		}
		const patch = block;

		// Block centre (float, broadphase only): the average polygon centroid.
		let cx = 0, cy = 0;
		for (const p of patch) { cx += p.centroid.x; cy += p.centroid.y; }
		cx /= patch.length; cy /= patch.length;
		const distC = (p: Polygon) => Math.hypot(p.centroid.x - cx, p.centroid.y - cy);

		// Region sizes in CELL units (not block-extent fractions): the cell can be large/anisotropic,
		// so fixed fractions of the block radius mis-size the interior.
		const uV = u.toVector();
		const vV = v.toVector();
		const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
		if (cellDiam < FLOAT_TOL) return null;
		const candR = 1.6 * cellDiam; // candidate target polygons (covers all point-group cosets ≤ 1 cell)
		const verifyR = 1.1 * cellDiam; // core a candidate must map onto the tiling (≥ one full cell)
		const vertR = 1.6 * cellDiam; // region we draw vertex representatives from (≥ one full cell)

		// blockKeySet membership is tested on images REDUCED modulo the lattice toward the centre, so
		// a symmetry is verified independently of how far its (un-reduced) image lands — the finite
		// block extent can no longer cause a false negative.
		const blockKeySet = new Set<string>(patch.map((p) => p.exactKey()));
		const det = uV.x * vV.y - uV.y * vV.x;
		if (Math.abs(det) < FLOAT_TOL) return null;
		const interior = patch.filter((p) => distC(p) <= verifyR);
		if (interior.length === 0) return null;

		// Reference polygon: closest to the block centre (deterministic, deep-interior).
		const P0 = patch.reduce((min, p) => (distC(p) < distC(min) ? p : min));
		const c0 = P0.exactCentroid!;
		const p0Name = P0.getName();

		// --- 1+2. Find the symmetry group (as {reflect, r, T} maps), including identity. ---
		const mapPoint = (z: Cyclotomic, reflect: boolean, r: number, T: Cyclotomic): Cyclotomic =>
			(reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T);

		const transformedKey = (p: Polygon, reflect: boolean, r: number, T: Cyclotomic): string => {
			const c = mapPoint(p.exactCentroid!, reflect, r, T);
			const vks = p.exactVertices!.map((vx) => mapPoint(vx, reflect, r, T).key()).sort().join(';');
			return `${p.getName()}:${c.key()}:${vks}`;
		};

		// Reduce a mapped polygon modulo the lattice (translate by the integer combo bringing its
		// centroid nearest the block centre), then return its exact key — for block membership.
		const reducedMappedKey = (p: Polygon, reflect: boolean, r: number, T: Cyclotomic): string => {
			const gc = mapPoint(p.exactCentroid!, reflect, r, T);
			const g = gc.toVector();
			const dx = g.x - cx, dy = g.y - cy;
			const a = Math.round((dx * vV.y - dy * vV.x) / det);
			const b = Math.round((uV.x * dy - uV.y * dx) / det);
			const Tred = u.scaleRational(BigInt(-a), 1n).add(v.scaleRational(BigInt(-b), 1n));
			const c = gc.add(Tred);
			const vks = p.exactVertices!
				.map((vx) => mapPoint(vx, reflect, r, T).add(Tred).key())
				.sort()
				.join(';');
			return `${p.getName()}:${c.key()}:${vks}`;
		};

		type Sym = { reflect: boolean; r: number; T: Cyclotomic };
		const syms: Sym[] = [];
		const symSig = new Set<string>();
		const targets = patch.filter((p) => p.getName() === p0Name && distC(p) <= candR);

		for (const Q of targets) {
			const cQ = Q.exactCentroid!;
			const qKey = Q.exactKey();
			for (const reflect of [false, true]) {
				for (let r = 0; r < N; r++) {
					// T chosen so g(c0) = cQ:  T = cQ − M(c0)
					const Mc0 = reflect ? c0.conj().mulZeta(r) : c0.mulZeta(r);
					const T = cQ.sub(Mc0);
					// candidate maps P0 → Q exactly?
					if (transformedKey(P0, reflect, r, T) !== qKey) continue;
					const sig = `${reflect ? 1 : 0}:${r}:${T.key()}`;
					if (symSig.has(sig)) continue;
					// lattice preservation: M(u), M(v) ∈ ℤu+ℤv
					const Mu = reflect ? u.conj().mulZeta(r) : u.mulZeta(r);
					const Mv = reflect ? v.conj().mulZeta(r) : v.mulZeta(r);
					if (!this.isLatticeCombo(Mu, u, v, ZERO) || !this.isLatticeCombo(Mv, u, v, ZERO)) continue;
					// global verify: every interior polygon maps (mod lattice) onto an existing block tile
					let ok = true;
					for (const p of interior) {
						if (!blockKeySet.has(reducedMappedKey(p, reflect, r, T))) { ok = false; break; }
					}
					if (!ok) continue;
					symSig.add(sig);
					syms.push({ reflect, r, T });
				}
			}
		}
		if (syms.length === 0) return null; // not even identity verified ⇒ patch unreliable

		// --- 3. Vertex orbit representatives (one per lattice class of surrounded interior vertices). ---
		// incidence: vertex key → { vertex, n's of incident polygons }
		const incident = new Map<string, { vertex: Cyclotomic; units: number }>();
		for (const p of patch) {
			const uUnit = angleUnits(p.n);
			for (const vx of p.exactVertices!) {
				const k = vx.key();
				const e = incident.get(k);
				if (e) e.units += uUnit;
				else incident.set(k, { vertex: vx, units: uUnit });
			}
		}
		const reps: Cyclotomic[] = [];
		for (const { vertex, units } of incident.values()) {
			if (units !== 24) continue; // not a fully-surrounded (interior) tiling vertex (2π = 24 units)
			const vv = vertex.toVector();
			if (Math.hypot(vv.x - cx, vv.y - cy) > vertR) continue;
			if (reps.some((rp) => this.latticeEquiv(vertex, rp, u, v, ZERO))) continue;
			reps.push(vertex);
		}
		if (reps.length === 0) return null;

		// Union-find over reps; rep i ~ rep j iff some symmetry maps i onto j (mod lattice).
		const parent = reps.map((_, i) => i);
		const find = (x: number): number => {
			while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
			return x;
		};
		const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

		for (let i = 0; i < reps.length; i++) {
			for (const g of syms) {
				const gw = mapPoint(reps[i], g.reflect, g.r, g.T);
				for (let j = 0; j < reps.length; j++) {
					if (find(i) === find(j)) continue;
					if (this.latticeEquiv(gw, reps[j], u, v, ZERO)) { union(i, j); break; }
				}
			}
		}

		const roots = new Set<number>();
		for (let i = 0; i < reps.length; i++) roots.add(find(i));
		const orbits = roots.size;
		if (diag) { diag.syms = syms.length; diag.reps = reps.length; diag.blockSize = patch.length; diag.orbits = orbits; }
		return orbits;
	}

	/** Exact test: a − b = m·u + n·v for integers m,n (m,n guessed from a float solve, verified exactly). */
	private latticeEquiv(a: Cyclotomic, b: Cyclotomic, u: Cyclotomic, v: Cyclotomic, ZERO: Cyclotomic): boolean {
		const diff = a.sub(b);
		if (diff.isZero()) return true;
		return this.isLatticeCombo(diff, u, v, ZERO);
	}

	/** Exact test: w = m·u + n·v for integers m,n. */
	private isLatticeCombo(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic, ZERO: Cyclotomic): boolean {
		if (w.isZero()) return true;
		const d = w.toVector();
		const a = u.toVector();
		const b = v.toVector();
		const det = a.x * b.y - a.y * b.x;
		if (Math.abs(det) < FLOAT_TOL) return false;
		const m = (d.x * b.y - d.y * b.x) / det;
		const n = (a.x * d.y - a.y * d.x) / det;
		const mi = Math.round(m);
		const ni = Math.round(n);
		if (Math.abs(m - mi) > 1e-3 || Math.abs(n - ni) > 1e-3) return false;
		const recon = u.scaleRational(BigInt(mi), 1n).add(v.scaleRational(BigInt(ni), 1n));
		return w.sub(recon).isZero();
	}
}
