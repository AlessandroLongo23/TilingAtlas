// IS THIS PERIOD CELL PRIMITIVE? One implementation, used by every shelf builder that needs it.
//
//   import { isPrimitiveCell } from './atlas/primitive.mjs';
//   isPrimitiveCell(faces, T1, T2)   // false => the record describes one tiling on a COARSER lattice
//
// WHAT IT DECIDES. A record gives a period lattice L = <T1,T2> and one face per L-orbit. The tiling's
// real translation group Λ contains L, and the record is honest only when Λ = L. When Λ ⊋ L the record
// is the same tiling written two or four or nine times as large, and it is NOT a new tiling — but the
// congruence dedup the shelves run afterwards cannot see that, because that test maps lattice onto
// lattice UNIMODULARLY and a supercell is by definition not unimodularly related to the cell inside it.
// So the supercells have to come off first, and this is the test that does it.
//
// WHY IT IS WRITTEN OUT RATHER THAN INLINED AGAIN. Three copies of this predicate drifted apart across
// build-euhalf-shelf.mjs, build-tri45-shelf.mjs and two analysis scripts, and on 2026-08-18 they gave
// three different answers for the same file (the half-polygon shelf read 12,872 / 12,849 / 12,592 /
// 12,939 depending on which one ran). Every bug below was in at least one of them.
//
// THE ALGORITHM, AND IT IS EXACT. Any t ∈ Λ carries face 0 to some face j, so modulo L every candidate
// is c_j − c_0 for a face centroid c. That makes the candidate set finite and complete: if Λ ⊋ L then
// some t ∈ Λ \ L exists, it carries face 0 to some face j, and it differs from c_j − c_0 by a lattice
// vector, which acts trivially modulo L. So testing c_j − c_0 for every j finds every supercell, and
// nothing else can be one. A candidate passes when translating by it maps the faces BIJECTIVELY onto
// the faces, modulo L.
//
// THE FOUR WAYS THIS HAS BEEN GOT WRONG, all of them live bugs that shipped or nearly shipped:
//
//   1. COMPARING FACES BY A PROFILE — sorted side lengths and sorted angles. Sorting throws away
//      orientation, so a profile cannot tell a tile from its own 180° rotation, and a translation can
//      never rotate a tile. The hexagon-halves tiling is exactly that trap: its two trapezoids are
//      related by a half-turn, never by a translation, and their centroids sit symmetrically about the
//      hexagon's centre, so the profile version declared the tiling a supercell of itself and DELETED
//      it. The half-hexagon board lost its k=1 hexagon tiling that way. Faces are compared here as
//      point sets, which is orientation-aware for free.
//
//   2. KEYING POSITIONS ON A ROUNDED GRID, e.g. `round(x * 1e4)`. The same point reached by two
//      different arithmetic routes lands either side of a rounding boundary, and the test then reports
//      no symmetry where the exact residual is 0. That let 7 genuine supercells through on the
//      half-triangle board, and they surfaced only because a containment check against the plain run
//      could not find them. Everything here is matched by TOLERANCE, never by a rounded key. The grid
//      below is only a bucket index, and it is queried across its 3×3 neighbourhood so a point near a
//      boundary is still found.
//
//   3. LEAVING THE FLAT CORNERS ON. A `-split` palette marks a divisible edge with a flat 180° corner.
//      Where one tile has several atomised variants, two tiles that ARE translates can carry different
//      flat corners, so as labelled polygons they differ and the supercell survives. The tiling is
//      geometric, so this drops collinear vertices itself instead of trusting the caller to.
//
//   4. GATING ON THE WRONG THING. It is not enough that the marker SET maps onto itself; each face must
//      map onto a face of the same shape, and the map must be a bijection. Both are enforced.

const TOL = 1e-6;
// Bucket edge for the centroid index. Far larger than TOL so that two points within TOL always land in
// the same bucket or an adjacent one, and far smaller than any real spacing so buckets stay small.
const CELL = 1e-3;

const centroidOf = (f) => {
	let x = 0, y = 0;
	for (const p of f) { x += p[0]; y += p[1]; }
	return [x / f.length, y / f.length];
};

/** Drop vertices that lie on the segment joining their neighbours: a flat corner is a modelling device
 *  for a divisible edge, not part of the tile. Scaled by the local edge lengths so the test means the
 *  same thing on a tile of side 1 and a tile of side 20. */
export const dropCollinear = (f) => {
	const out = [];
	for (let t = 0; t < f.length; t++) {
		const p = f[(t - 1 + f.length) % f.length], c = f[t], n = f[(t + 1) % f.length];
		const ax = c[0] - p[0], ay = c[1] - p[1], bx = n[0] - p[0], by = n[1] - p[1];
		const scale = Math.hypot(ax, ay) * Math.hypot(bx, by);
		if (scale < 1e-12 || Math.abs(ax * by - ay * bx) / scale > 1e-9) out.push(c);
	}
	return out.length >= 3 ? out : f;
};

/** Are these two centred vertex lists the same point set, within tolerance? Unordered on purpose: the
 *  developer may start a face at any vertex and wind either way, and neither changes the polygon. A
 *  point-set comparison is orientation-AWARE, which is the whole point — a rotated copy of a tile has
 *  a different centred point set, and that is what a profile could not see. */
const samePointSet = (a, b, tol) => {
	if (a.length !== b.length) return false;
	const used = new Array(b.length).fill(false);
	for (const p of a) {
		let hit = -1;
		for (let i = 0; i < b.length && hit < 0; i++) {
			if (!used[i] && Math.abs(p[0] - b[i][0]) < tol && Math.abs(p[1] - b[i][1]) < tol) hit = i;
		}
		if (hit < 0) return false;
		used[hit] = true;
	}
	return true;
};

/**
 * @param faces  one polygon per lattice orbit, as arrays of [x, y]. Flat corners are removed here.
 * @param T1,T2  the record's period vectors.
 * @param tol    absolute position tolerance; the default suits coordinates of order 1 to 1e3.
 * @returns      true when <T1,T2> is the tiling's full translation group.
 */
export function isPrimitiveCell(faces, T1, T2, tol = TOL) {
	const F = faces.map(dropCollinear);
	const n = F.length;
	if (n < 2) return true;                       // one face per cell cannot hide a finer lattice

	const det = T1[0] * T2[1] - T1[1] * T2[0];
	if (Math.abs(det) < tol) return true;         // degenerate basis: not ours to judge
	// Distance from a vector to the NEAREST lattice point. This is the tolerance-safe replacement for
	// "is the rounded residue equal to the rounded origin".
	const latticeDist = (v) => {
		const a = (v[0] * T2[1] - v[1] * T2[0]) / det;
		const b = (T1[0] * v[1] - T1[1] * v[0]) / det;
		const fa = a - Math.round(a), fb = b - Math.round(b);
		let best = Infinity;
		for (let i = -1; i <= 1; i++) {
			for (let j = -1; j <= 1; j++) {
				const x = (fa + i) * T1[0] + (fb + j) * T2[0];
				const y = (fa + i) * T1[1] + (fb + j) * T2[1];
				const d = Math.hypot(x, y);
				if (d < best) best = d;
			}
		}
		return best;
	};

	const cent = F.map(centroidOf);
	const centred = F.map((f, i) => f.map(([x, y]) => [x - cent[i][0], y - cent[i][1]]));

	// SHAPE CLASSES, by tolerance against a short list of representatives. A translation preserves shape
	// AND orientation, so only faces of the same class can correspond, and the number of classes is at
	// most the number of tile orientations the palette can produce — small.
	const reps = [];
	const shape = centred.map((s) => {
		for (let i = 0; i < reps.length; i++) if (samePointSet(reps[i], s, tol)) return i;
		reps.push(s);
		return reps.length - 1;
	});

	// Centroids indexed by bucket, reduced modulo the lattice so a match can wrap the cell.
	const fold = (p) => {
		const a = (p[0] * T2[1] - p[1] * T2[0]) / det;
		const b = (T1[0] * p[1] - T1[1] * p[0]) / det;
		const fa = a - Math.floor(a), fb = b - Math.floor(b);
		return [fa * T1[0] + fb * T2[0], fa * T1[1] + fb * T2[1]];
	};
	const folded = cent.map(fold);
	const index = new Map();
	for (let i = 0; i < n; i++) {
		const key = `${Math.floor(folded[i][0] / CELL)},${Math.floor(folded[i][1] / CELL)}`;
		if (!index.has(key)) index.set(key, []);
		index.get(key).push(i);
	}
	const near = (p) => {
		const q = fold(p);
		const bx = Math.floor(q[0] / CELL), by = Math.floor(q[1] / CELL);
		const out = [];
		for (let i = -1; i <= 1; i++) {
			for (let j = -1; j <= 1; j++) {
				const hit = index.get(`${bx + i},${by + j}`);
				if (hit) out.push(...hit);
			}
		}
		return out;
	};

	for (let j = 1; j < n; j++) {
		if (shape[j] !== shape[0]) continue;                       // a translation cannot change shape
		const t = [cent[j][0] - cent[0][0], cent[j][1] - cent[0][1]];
		if (latticeDist(t) < tol) continue;                        // t ∈ L: not a new symmetry
		const used = new Array(n).fill(false);
		let all = true;
		for (let i = 0; i < n && all; i++) {
			const img = [cent[i][0] + t[0], cent[i][1] + t[1]];
			let hit = -1;
			for (const g of near(img)) {
				if (used[g] || shape[g] !== shape[i]) continue;
				if (latticeDist([img[0] - cent[g][0], img[1] - cent[g][1]]) < tol) { hit = g; break; }
			}
			if (hit < 0) all = false; else used[hit] = true;       // bijection, enforced
		}
		if (all) return false;
	}
	return true;
}
