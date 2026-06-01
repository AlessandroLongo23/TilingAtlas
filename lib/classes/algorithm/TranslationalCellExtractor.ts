/**
 * Translational cell extraction from an expanded seed patch.
 *
 * EXACT (docs/CYCLOTOMIC_SPEC.md §12.2): polygons are grouped into lattice classes by exact
 * lattice-equivalence — P ≡ Q iff same name and (c_P − c_Q) is an exact integer combination
 * m·u + n·v of the basis. The integers m,n are *guessed* from a float solve (broadphase) and
 * then **verified exactly** with `(c_P − c_Q − m·u − n·v).isZero()` — no field inversion, no
 * half-open coordinate ranges, boundary-safe. The fundamental cell is one canonical
 * representative per lattice class.
 */

import { Vector } from '../Vector';
import type { Polygon } from '../polygons/Polygon';
import { Cyclotomic } from '../Cyclotomic';
import { Tiling } from '../Tiling';

const tolerance = 1e-6;

export type TranslationalCellResult = {
	cellPolygons: Polygon[];
	origin: Vector;
	basis: [Vector, Vector];
};

export class TranslationalCellExtractor {
	constructor() {}

	extract(polygons: Polygon[]): TranslationalCellResult | null {
		if (polygons.length === 0) return null;
		if (!polygons.every((p) => p.hasExact())) return this.extractFloat(polygons);

		const originPolygon = this.findOriginExact(polygons);
		const basis = this.findBasisExact(polygons, originPolygon);
		if (!basis) return null;
		const [u, v] = basis;

		// Group into lattice classes; keep one canonical representative per class.
		const reps: Polygon[] = [];
		for (const p of polygons) {
			let foundClass = false;
			for (const rep of reps) {
				if (this.sameLatticeClass(rep, p, u, v)) {
					foundClass = true;
					break;
				}
			}
			if (!foundClass) reps.push(p);
		}

		if (reps.length === 0) return null;
		return {
			cellPolygons: reps,
			origin: originPolygon.exactCentroid!.toVector(),
			basis: [u.toVector(), v.toVector()],
		};
	}

	/**
	 * Canonical key for a whole expanded patch, used to dedup tilings up to the full isometry
	 * group. Takes the interior neighbourhood of the core — polygons within half the patch's
	 * Euclidean extent of the origin (boundary-free, so robust where raw-patch comparison and
	 * representative-cell comparison are not) — and canonicalises it under the 2N grid point-group
	 * operations (rotations ζ^k, reflections conj∘ζ^k) plus translation (anchor = lexicographically
	 * minimal transformed vertex). Mirror-form expansions of one tiling (the two chiral snub
	 * forms) collapse to one key. Exact throughout.
	 */
	canonicalPatchKey(polygons: Polygon[]): string {
		if (polygons.length === 0) return '';
		const N = polygons[0].exactVertices![0].ring.N;
		// interior radius = half the patch extent from the origin (the core sits at the origin)
		let maxMag = 0;
		for (const p of polygons) maxMag = Math.max(maxMag, p.centroid.mag());
		const R = 0.5 * maxMag;
		const near = polygons.filter((p) => p.centroid.mag() <= R + 1e-9);
		const cell = near.length >= 1 ? near : polygons;
		return this.canonicalKey(cell);
	}

	/**
	 * Canonical key for a unit cell, INVARIANT under the grid point group (rotations ζ^k and
	 * reflections conj∘ζ^k, 2N ops) and translation (anchored to the lexicographically minimal
	 * transformed vertex). Mirror-form cells of the same tiling (e.g. the two chiral snub
	 * expansions) collapse to one key. Exact throughout — used to dedup tilings up to symmetry.
	 */
	canonicalKey(cellPolygons: Polygon[]): string {
		if (cellPolygons.length === 0) return '';
		const N = cellPolygons[0].exactVertices![0].ring.N;
		let best: string | null = null;
		for (const reflect of [false, true]) {
			for (let k = 0; k < N; k++) {
				const transformed = cellPolygons.map((p) => ({
					name: p.getName(),
					verts: p.exactVertices!.map((v) => (reflect ? v.conj() : v).mulZeta(k)),
				}));
				let anchor: Cyclotomic | null = null;
				let anchorKey = '';
				for (const t of transformed) {
					for (const v of t.verts) {
						const kk = v.key();
						if (anchor === null || kk < anchorKey) { anchor = v; anchorKey = kk; }
					}
				}
				const fps = transformed
					.map((t) => `${t.name}:${t.verts.map((v) => v.sub(anchor!).key()).sort().join(';')}`)
					.sort()
					.join('|');
				if (best === null || fps < best) best = fps;
			}
		}
		return best!;
	}

	/** Same lattice class iff same polygon name and centroid difference is an exact integer
	 *  combination of the basis (integers guessed from float solve, verified exactly). */
	private sameLatticeClass(a: Polygon, b: Polygon, u: Cyclotomic, v: Cyclotomic): boolean {
		if (a.getName() !== b.getName()) return false;
		const diff = a.exactCentroid!.sub(b.exactCentroid!);
		if (diff.isZero()) return true;
		const mn = this.solveIntegerCombo(diff, u, v);
		if (!mn) return false;
		const [m, n] = mn;
		// exact verify: diff − (m·u + n·v) == 0
		const recon = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n), 1n));
		return diff.sub(recon).isZero();
	}

	/** Float broadphase: guess integers m,n with diff ≈ m·u + n·v via Cramer's rule on the
	 *  float embedding. Returns rounded integers (verified exactly by the caller) or null. */
	private solveIntegerCombo(
		diff: Cyclotomic,
		u: Cyclotomic,
		v: Cyclotomic
	): [number, number] | null {
		const d = diff.toVector();
		const a = u.toVector();
		const b = v.toVector();
		const det = a.x * b.y - a.y * b.x;
		if (Math.abs(det) < tolerance) return null;
		const m = (d.x * b.y - d.y * b.x) / det;
		const n = (a.x * d.y - a.y * d.x) / det;
		const mi = Math.round(m);
		const ni = Math.round(n);
		// guard: only trust the guess if it is genuinely near-integer (else exact verify fails anyway)
		if (Math.abs(m - mi) > 1e-3 || Math.abs(n - ni) > 1e-3) return null;
		return [mi, ni];
	}

	private findOriginExact(polygons: Polygon[]): Polygon {
		return polygons.reduce((min, p) =>
			p.exactCentroid!.toVector().mag() < min.exactCentroid!.toVector().mag() ? p : min
		);
	}

	/**
	 * Find two independent exact basis translations. Candidates are exact centroid differences
	 * between same-name polygons; a candidate is accepted as a lattice vector iff translating
	 * the patch by it maps every interior polygon onto an exact match in the patch.
	 */
	private findBasisExact(polygons: Polygon[], origin: Polygon): [Cyclotomic, Cyclotomic] | null {
		const oc = origin.exactCentroid!;

		const candidates: Cyclotomic[] = polygons
			.filter((p) => p.getName() === origin.getName())
			.map((p) => p.exactCentroid!.sub(oc))
			.filter((t) => !t.isZero());

		// shortest first (broadphase) so we prefer primitive lattice vectors
		candidates.sort((a, b) => a.toVector().mag() - b.toVector().mag());

		const latticeVectors: Cyclotomic[] = [];
		for (const t of candidates) {
			if (latticeVectors.length > 12) break;
			if (this.isLatticeVector(polygons, t)) latticeVectors.push(t);
		}
		if (latticeVectors.length === 0) return null;

		// primitive basis: shortest u, then shortest independent v, then Gauss-reduce
		const u0 = latticeVectors[0];
		let v0: Cyclotomic | null = null;
		const uv = u0.toVector();
		for (let i = 1; i < latticeVectors.length; i++) {
			const w = latticeVectors[i].toVector();
			if (Math.abs(uv.x * w.y - uv.y * w.x) > 1e-6) {
				v0 = latticeVectors[i];
				break;
			}
		}
		if (!v0) return null;
		return this.gaussReduce(u0, v0);
	}

	/** Gaussian lattice reduction: returns the (near-)shortest basis, so the primitive cell is
	 *  canonical regardless of which generating vectors were found first. Uses exact subtraction;
	 *  the rounding `m = round(⟨u,v⟩/⟨u,u⟩)` is a float broadphase, the result stays exact. */
	private gaussReduce(a: Cyclotomic, b: Cyclotomic): [Cyclotomic, Cyclotomic] {
		let u = a;
		let v = b;
		for (let iter = 0; iter < 64; iter++) {
			const uv = u.toVector();
			const vv = v.toVector();
			if (uv.mag() > vv.mag()) {
				[u, v] = [v, u];
				continue;
			}
			const uu = uv.x * uv.x + uv.y * uv.y;
			if (uu < 1e-12) break;
			const dot = uv.x * vv.x + uv.y * vv.y;
			const m = Math.round(dot / uu);
			if (m === 0) break;
			v = v.sub(u.scaleRational(BigInt(m), 1n));
		}
		return [u, v];
	}

	/**
	 * A translation t is a lattice vector iff merging the patch with its translate produces NO
	 * proper overlap: polygons that coincide are deduped by EXACT equality, and the rest extend
	 * into empty space (edge-adjacency is not overlap). A non-period t makes copies partially
	 * overlap → rejected. Coincidence is exact; the overlap test is a float broadphase
	 * (`intersects`, which ignores boundary touching). Ported from the original `Tiling.isEquivalent`.
	 */
	private isLatticeVector(polygons: Polygon[], t: Cyclotomic): boolean {
		const translated = polygons.map((p) => {
			const c = p.clone();
			c.translateExact(t);
			return c;
		});
		// exact-dedup the union (coincident originals/copies collapse)
		const seen = new Set<string>();
		const union: Polygon[] = [];
		for (const p of [...polygons, ...translated]) {
			const k = p.exactKey();
			if (!seen.has(k)) {
				seen.add(k);
				union.push(p);
			}
		}
		// no proper overlap among the union (bbox broadphase + float intersects)
		const bboxes = union.map((p) => this.bbox(p));
		for (let i = 0; i < union.length; i++) {
			for (let j = i + 1; j < union.length; j++) {
				if (!this.bboxOverlap(bboxes[i], bboxes[j])) continue;
				if (union[i].intersects(union[j])) return false;
			}
		}
		return true;
	}

	private bbox(p: Polygon): { minX: number; maxX: number; minY: number; maxY: number } {
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const v of p.vertices) {
			minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
			minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
		}
		return { minX, maxX, minY, maxY };
	}

	private bboxOverlap(
		a: { minX: number; maxX: number; minY: number; maxY: number },
		b: { minX: number; maxX: number; minY: number; maxY: number }
	): boolean {
		const m = 1e-9;
		return !(a.maxX < b.minX - m || b.maxX < a.minX - m || a.maxY < b.minY - m || b.maxY < a.minY - m);
	}

	/** Legacy float path (kept for non-exact polygons; not used on the regular-core gate). */
	private extractFloat(polygons: Polygon[]): TranslationalCellResult | null {
		const tiling = new Tiling();
		tiling.nodes = polygons;
		const originPolygon = tiling.nodes.reduce((min, node) =>
			node.centroid.mag() < min.centroid.mag() ? node : min
		);
		const basis = this.findBasisFloat(tiling, originPolygon);
		if (!basis) return null;
		const [v1, v2] = basis;
		const cross = Vector.cross(v1, v2);
		if (Math.abs(cross) < tolerance) return null;
		const cellPolygons: Polygon[] = [];
		for (const node of tiling.nodes) {
			const rel = Vector.sub(node.centroid, originPolygon.centroid);
			const a = Vector.cross(rel, v2) / cross;
			const b = Vector.cross(v1, rel) / cross;
			if (a >= -tolerance && a < 1 && b >= -tolerance && b < 1) cellPolygons.push(node);
		}
		if (cellPolygons.length === 0) return null;
		return { cellPolygons, origin: originPolygon.centroid, basis };
	}

	private findBasisFloat(tiling: Tiling, originPolygon: Polygon): [Vector, Vector] | null {
		const tol = 1e-3;
		const tvs: Vector[] = tiling.nodes
			.filter((p) => p.n === originPolygon.n)
			.filter((p) => p.isTranslated(originPolygon, tol))
			.map((p) => Vector.sub(p.centroid, originPolygon.centroid))
			.filter((v) => v.mag() > tol)
			.sort((a, b) => a.mag() - b.mag());
		const translationVectors: Vector[] = [];
		for (const tv of tvs) {
			if (translationVectors.length > 8) break;
			const translated = Tiling.translate(tiling, tv);
			if (translated.isEquivalent(tiling, tol)) translationVectors.push(tv);
		}
		if (translationVectors.length === 0) return null;
		translationVectors.sort((a, b) => a.mag() - b.mag());
		const v1 = translationVectors[0];
		let v2: Vector | null = null;
		for (let i = 1; i < translationVectors.length; i++) {
			if (Math.abs(Vector.cross(v1, translationVectors[i])) > tol) {
				v2 = translationVectors[i];
				break;
			}
		}
		if (!v2) v2 = v1.copy();
		return [v1, v2];
	}
}
