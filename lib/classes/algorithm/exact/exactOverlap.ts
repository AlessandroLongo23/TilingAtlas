/**
 * Exact, certificate-grade proper-overlap test for polygons in ℤ[ζ₂₄] — sound for NON-CONVEX tiles
 * (stars), unlike the float `Polygon.intersects` whose `isWithinConvexHull` point test misclassifies
 * points in a star's reflex dents (DEVELOPMENT_NOTES §9.4).
 *
 * Every decision is the SIGN of a `Surd` derived from `conj(·)·(·)` products of ℤ[ζ₂₄] differences —
 * NO intersection coordinates are ever constructed (they generally leave the ring). Primitives:
 *   orient2D(a,b,c) = sign of the cross product (b−a)×(c−a)        [detSurd]
 *   dotSign(u,v)    = sign of the dot product   u·v                [reSurd]
 *   imSign(p,q)     = sign of (p.y − q.y)                          [imSurd]
 *
 * Proper overlap (interiors intersect in positive area) iff ANY of:
 *   (a) an edge pair properly crosses (interior-interior, strict);
 *   (b) a vertex or edge-midpoint of one polygon is STRICTLY interior to the other;
 *   (c) two collinear edges overlap on a positive sub-segment with both interiors on the SAME side
 *       (parallel directed edges, since CCW polygons keep their interior to the left).
 * Shared vertices / fully-shared antiparallel edges give boundary contact only ⇒ NOT flagged — exactly
 * the edge-to-edge adjacency the tiler relies on (e.g. an octagon corner seated in a star dent).
 */
import { Cyclotomic } from '../../Cyclotomic';
import { Surd, imSurd, reSurd, detSurd } from './Surd';

/** sign of (b−a)×(c−a): +1 left turn, −1 right turn, 0 collinear. */
export function orient2D(a: Cyclotomic, b: Cyclotomic, c: Cyclotomic): number {
	return detSurd(b.sub(a), c.sub(a)).sign();
}

/** sign of the dot product u·v = Re(conj(u)·v). */
function dotSign(u: Cyclotomic, v: Cyclotomic): number {
	return reSurd(u.conj().mul(v)).sign();
}

/** sign of (p.y − q.y) = Im(p − q). */
function imSign(p: Cyclotomic, q: Cyclotomic): number {
	return imSurd(p.sub(q)).sign();
}

/** With (a,b,p) COLLINEAR, is p within the CLOSED segment [a,b]? */
function onSegmentColinear(a: Cyclotomic, b: Cyclotomic, p: Cyclotomic): boolean {
	return dotSign(p.sub(a), b.sub(a)) >= 0 && dotSign(p.sub(b), a.sub(b)) >= 0;
}

/** Do segments (a1,a2) and (b1,b2) cross in their interiors (strict — endpoints touching is NOT a
 *  proper cross)? The classic 4-orientation test with all four signs nonzero and strictly opposite. */
export function segmentsProperlyCross(
	a1: Cyclotomic, a2: Cyclotomic, b1: Cyclotomic, b2: Cyclotomic
): boolean {
	const o1 = orient2D(a1, a2, b1);
	const o2 = orient2D(a1, a2, b2);
	const o3 = orient2D(b1, b2, a1);
	const o4 = orient2D(b1, b2, a2);
	return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** Collinear edges overlapping on a POSITIVE sub-segment with interiors on the SAME side (parallel
 *  directed edges). Antiparallel collinear overlap is the normal shared edge between two CCW tiles ⇒
 *  legal, returns false. The 1-D overlap length is compared exactly via the projection parameter. */
export function collinearSameSideOverlap(
	a1: Cyclotomic, a2: Cyclotomic, b1: Cyclotomic, b2: Cyclotomic
): boolean {
	if (orient2D(a1, a2, b1) !== 0 || orient2D(a1, a2, b2) !== 0) return false; // not collinear
	const d = a2.sub(a1);
	if (dotSign(d, b2.sub(b1)) <= 0) return false; // antiparallel (legal shared edge) or degenerate
	// project onto d: t(x) = Re(conj(d)·(x − a1)). Interval A = [0, L], L = |d|².
	const t = (x: Cyclotomic): Surd => reSurd(d.conj().mul(x.sub(a1)));
	const L = t(a2);
	const tb1 = t(b1);
	const tb2 = t(b2);
	const minB = tb1.cmp(tb2) <= 0 ? tb1 : tb2;
	const maxB = tb1.cmp(tb2) <= 0 ? tb2 : tb1;
	const lo = Surd.ZERO.cmp(minB) >= 0 ? Surd.ZERO : minB; // max(0, minB)
	const hi = L.cmp(maxB) <= 0 ? L : maxB; // min(L, maxB)
	return hi.cmp(lo) > 0; // positive overlap length
}

/** Strict containment of `p` in the polygon `verts`: 'in' (strictly interior), 'on' (boundary), or
 *  'out'. Boundary first (collinear + on-segment), then an exact winding number (Sunday) using only
 *  imSign / orient2D — robust for NON-CONVEX polygons. */
export function pointInPolygon(verts: Cyclotomic[], p: Cyclotomic): 'in' | 'on' | 'out' {
	const L = verts.length;
	for (let i = 0; i < L; i++) {
		const a = verts[i], b = verts[(i + 1) % L];
		if (orient2D(a, b, p) === 0 && onSegmentColinear(a, b, p)) return 'on';
	}
	let wn = 0;
	for (let i = 0; i < L; i++) {
		const a = verts[i], b = verts[(i + 1) % L];
		const sa = imSign(a, p); // sign(a.y − p.y)
		const sb = imSign(b, p);
		if (sa <= 0) {
			if (sb > 0 && orient2D(a, b, p) > 0) wn++; // upward crossing, p left of edge
		} else {
			if (sb <= 0 && orient2D(a, b, p) < 0) wn--; // downward crossing, p right of edge
		}
	}
	return wn !== 0 ? 'in' : 'out';
}

/** Exact proper-overlap test between two polygons given by their ℤ[ζ₂₄] vertices (any winding, simple
 *  or non-convex). True iff their interiors intersect in positive area. */
export function exactPolygonsOverlap(A: Cyclotomic[], B: Cyclotomic[]): boolean {
	const la = A.length, lb = B.length;
	// (a)/(c) edge pairs: proper interior cross, or collinear same-side sub-segment overlap.
	for (let i = 0; i < la; i++) {
		const a1 = A[i], a2 = A[(i + 1) % la];
		for (let j = 0; j < lb; j++) {
			const b1 = B[j], b2 = B[(j + 1) % lb];
			if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
			if (collinearSameSideOverlap(a1, a2, b1, b2)) return true;
		}
	}
	// (b) a vertex or edge-midpoint of one is STRICTLY interior to the other. Midpoints stay in the ring
	// (·½) and catch an edge that passes through the other with both endpoints on/outside its boundary.
	for (const v of A) if (pointInPolygon(B, v) === 'in') return true;
	for (const v of B) if (pointInPolygon(A, v) === 'in') return true;
	for (let i = 0; i < la; i++) {
		const m = A[i].add(A[(i + 1) % la]).scaleRational(1n, 2n);
		if (pointInPolygon(B, m) === 'in') return true;
	}
	for (let j = 0; j < lb; j++) {
		const m = B[j].add(B[(j + 1) % lb]).scaleRational(1n, 2n);
		if (pointInPolygon(A, m) === 'in') return true;
	}
	return false;
}
