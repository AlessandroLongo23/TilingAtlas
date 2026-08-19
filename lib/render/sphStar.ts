// Scene input for a SPHERICAL STAR polyhedron (lib/tilings/sph-star.ts → public/spherical-star/<id>.json).
// Like lib/render/sphPoly.ts and lib/render/sphSchwarz.ts this is an ADAPTER onto buildIcoFreedraw, so
// this shelf reads as the same object as every other spherical shelf. One thing here is genuinely new
// and it is not cosmetic.
//
// A {n/d} FACE CANNOT BE FAN-TRIANGULATED. buildIcoFreedraw fans every ring from its first vertex,
// which is correct for a convex face and wrong for a star: fanning a pentagram's traversal ring
// (v0, v2, v4, v1, v3) from v0 paints three overlapping slivers that are neither the star nor its hull.
// So the adapter decomposes each star face into CONVEX pieces first and hands those over as one tile,
// which is exactly what `tiles: number[][][]` already means — a tile is a LIST of rings.
//
// The decomposition is exact, not a tessellation. The boundary of a regular {n/d} of circumradius R
// crosses itself on d − 1 concentric rings, and ring j (j = 1 innermost … d = the vertices themselves)
// has n points at
//
//     radius R·cos(πd/n) / cos(πj/n),   angle  π(d−j)/n + 2πk/n
//
// because two chords of the star sit at the same distance R·cos(πd/n) from the centre and their normals
// differ by 2πj/n, so they meet at that distance over cos(πj/n).
//
// ONLY THE OUTERMOST CROSSING RING MATTERS. Under the NONZERO winding reading — the same one
// lib/hollow/render.ts uses, since even-odd would punch the core out of every pentagram and give the
// concave |n/d| shape instead — the filled region is exactly the 2n-gon alternating the vertices with
// ring d−1, and every ring inside that one is interior to it. So the decomposition is
//
//     the ring-(d−1) n-gon, plus the n triangles (vertex[k], ring_{d−1}[k−1], ring_{d−1}[k]).
//
// ⚑ CORRECTED 2026-08-19, Marek Čtrnáct: "some of them have holes". This used to start from the
// INNERMOST ring and stack a band per crossing ring, which is the same thing when d = 2 and leaves a
// gap at every notch when d ≥ 3. Measured against the sampled nonzero region: {8/3} short by 8.6%,
// {10/3} by 7.3%, {7/3} by 7.5%, {12/5} by 18.5%. Twenty of the shelf's 54 records carry a d ≥ 3 face
// and every one of them was drawn with holes. The rule above is verified pointwise, not by area alone:
// zero disagreeing samples on a 1200² grid for {5/2} {7/2} {7/3} {8/3} {9/4} {10/3} {12/5}.
//
// ⚑ RETROGRADE FACES, same date. {n/d} with d > n/2 is the same polygon traversed backwards, so it
// fills identically to {n/(n−d)} and is normalised to it on the way in. Without that, cos(πd/n) goes
// negative while cos(πj/n) passes through zero, and the ring radii came out around 1e32. No record on
// this shelf has one today; lib/hollow's Euclidean palette is full of them.

import type { IcoPattern, V3 } from "@/lib/render/icoFreedraw";
import type { SphSchwarzScene } from "@/lib/render/sphSchwarz";
import type { SphStarPattern } from "@/lib/tilings/sph-star";

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
function unit(a: V3): V3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}

/** Rings of one face, expressed as NEW points appended to `verts`. Returns the convex rings that fill
 *  the face. A convex face (d = 1) returns its own ring untouched and appends nothing. */
export function starFaceRings(face: number[], dRaw: number, verts: V3[]): number[][] {
	const n = face.length;
	// A backwards traversal encloses the same region, and the ring formula only holds for d < n/2.
	const d = dRaw > n / 2 ? n - dRaw : dRaw;
	if (d <= 1 || n < 5) return [face];
	// The face is planar in 3D, so work in its own plane. Centre = mean of the vertices, which for a
	// regular star polygon is its centre exactly.
	const pts = face.map((i) => verts[i]);
	let c: V3 = [0, 0, 0];
	for (const p of pts) c = add(c, p);
	c = mul(c, 1 / n);
	const nrm = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
	const ex = unit(sub(pts[0], c));
	const ey = cross(nrm, ex);
	const R = Math.hypot(...sub(pts[0], c));
	if (!Number.isFinite(R) || R < 1e-9) return [face];
	// Geometric (angular) order of the vertices, which is NOT the traversal order the record stores.
	const ang = (p: V3) => Math.atan2(dot(sub(p, c), ey), dot(sub(p, c), ex));
	const geo = face
		.map((idx, k) => ({ idx, a: (ang(pts[k]) + 2 * Math.PI) % (2 * Math.PI) }))
		.sort((p, q) => p.a - q.a);
	const a0 = geo[0].a;
	const at = (radius: number, theta: number): V3 =>
		add(c, add(mul(ex, radius * Math.cos(theta)), mul(ey, radius * Math.sin(theta))));
	// The one ring that bounds the fill: j = d−1, the outermost crossing ring, half a step off the
	// vertices. The inner rings are real crossings and are simply not on the boundary of the region.
	const rad = (R * Math.cos((Math.PI * d) / n)) / Math.cos((Math.PI * (d - 1)) / n);
	const core: number[] = [];
	for (let k = 0; k < n; k++) {
		core.push(verts.length);
		verts.push(at(rad, a0 + Math.PI / n + (2 * Math.PI * k) / n));
	}
	// The vertex ring reuses the record's own indices instead of appending duplicates on top of them.
	const tips = geo.map((g) => g.idx);
	const out: number[][] = [core];
	for (let k = 0; k < n; k++) {
		out.push([tips[k], core[(k - 1 + n) % n], core[k]]);
	}
	return out;
}

/**
 * The lines where two faces cut through each other.
 *
 * ⚑ Marek Čtrnáct, 2026-08-19, on the pentagrammic prism: "one of those concave edges just doesn't
 * show". It is not an edge. Two of the prism's squares pass through one another, and the crease that
 * makes is where their PLANES meet, clipped to where both faces actually are. The record cannot carry
 * it, because `edges` is the polyhedron's own edge list and V, E, F have to keep meaning what they say.
 * So it is computed here and drawn on its own channel, behind its own toggle.
 *
 * Two faces span one line at most, since two distinct planes meet in exactly one. Three things are
 * subtracted from it:
 *
 *   parallel planes      no line at all, including the coplanar case;
 *   outside either face  clipped against both filled regions, using the SAME convex rings the fill
 *                        uses, so a pentagram's crossing line stops at the star and not at its hull;
 *   the shared edge      two faces meeting along a real edge already have that line drawn. Only the
 *                        span of the edge itself is removed, not the whole line: the planes can meet
 *                        again beyond it, and that part is a crossing like any other.
 */
export function faceCrossings(p: SphStarPattern, verts: V3[], rings: number[][][]): [number, number][] {
	const F = p.faces.length;
	const planes = p.faces.map((f) => {
		const a = verts[f[0]];
		const n = unit(cross(sub(verts[f[1]], a), sub(verts[f[2]], a)));
		return { n, d: dot(n, a) };
	});
	const realEdge = new Set(p.edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)));
	const out: [number, number][] = [];
	const seen = new Set<string>();
	const q = (v: V3) => `${v[0].toFixed(5)},${v[1].toFixed(5)},${v[2].toFixed(5)}`;

	for (let i = 0; i < F; i++) {
		for (let j = i + 1; j < F; j++) {
			const A = planes[i];
			const B = planes[j];
			const dir = cross(A.n, B.n);
			if (Math.hypot(dir[0], dir[1], dir[2]) < 1e-9) continue;
			const u = unit(dir);
			// The point on both planes closest to the origin, as the standard two-plane solve.
			const nn = dot(A.n, B.n);
			const denom = 1 - nn * nn;
			if (Math.abs(denom) < 1e-12) continue;
			const c1 = (A.d - B.d * nn) / denom;
			const c2 = (B.d - A.d * nn) / denom;
			const P: V3 = add(mul(A.n, c1), mul(B.n, c2));
			const spans = (rs: number[][]) => clipToRings(rs, verts, P, u);
			const IA = spans(rings[i]);
			if (!IA.length) continue;
			const IB = spans(rings[j]);
			if (!IB.length) continue;
			// The span of a shared real edge, to be cut out of the result.
			let cut: [number, number] | null = null;
			const shared = p.faces[i].filter((v) => p.faces[j].includes(v));
			if (shared.length >= 2) {
				const [a, b] = shared.slice(0, 2).sort((x, y) => x - y);
				if (realEdge.has(`${a},${b}`)) {
					const ta = dot(sub(verts[a], P), u);
					const tb = dot(sub(verts[b], P), u);
					cut = [Math.min(ta, tb), Math.max(ta, tb)];
				}
			}
			for (const a of IA) {
				for (const b of IB) {
					const lo = Math.max(a[0], b[0]);
					const hi = Math.min(a[1], b[1]);
					if (hi - lo <= 1e-7) continue;
					for (const [s0, s1] of cut ? minus([lo, hi], cut) : [[lo, hi] as [number, number]]) {
						if (s1 - s0 <= 1e-7) continue;
						const p0 = add(P, mul(u, s0));
						const p1 = add(P, mul(u, s1));
						const key = q(p0) < q(p1) ? `${q(p0)}|${q(p1)}` : `${q(p1)}|${q(p0)}`;
						if (seen.has(key)) continue;
						seen.add(key);
						out.push([verts.push(p0) - 1, verts.push(p1) - 1]);
					}
				}
			}
		}
	}
	return out;
}

/** `a` with `b` removed: 0, 1 or 2 intervals. */
function minus(a: [number, number], b: [number, number]): [number, number][] {
	if (b[1] <= a[0] || b[0] >= a[1]) return [a];
	const out: [number, number][] = [];
	if (b[0] > a[0]) out.push([a[0], b[0]]);
	if (b[1] < a[1]) out.push([b[1], a[1]]);
	return out;
}

/** Where the line P + t·u lies inside the filled region, as parameter intervals. One per convex ring;
 *  they are not merged, since overlapping tubes on the same line draw the same ink twice and nothing
 *  downstream cares. */
function clipToRings(rs: number[][], verts: V3[], P: V3, u: V3): [number, number][] {
	const iv: [number, number][] = [];
	for (const r of rs) {
		if (r.length < 3) continue;
		const nrm = unit(cross(sub(verts[r[1]], verts[r[0]]), sub(verts[r[2]], verts[r[0]])));
		let lo = -Infinity;
		let hi = Infinity;
		let ok = true;
		for (let k = 0; k < r.length; k++) {
			const a = verts[r[k]];
			const b = verts[r[(k + 1) % r.length]];
			// Inward normal of this side, within the face's own plane.
			const inward = cross(nrm, sub(b, a));
			const num = dot(inward, sub(a, P));
			const den = dot(inward, u);
			if (Math.abs(den) < 1e-12) {
				if (num > 1e-9) {
					ok = false;
					break;
				}
				continue;
			}
			const t = num / den;
			if (den > 0) lo = Math.max(lo, t);
			else hi = Math.min(hi, t);
		}
		if (ok && lo < hi - 1e-9) iv.push([lo, hi]);
	}
	return iv;
}

/**
 * Group the faces by TYPE and decompose every star face into convex pieces.
 *
 * One colour per {n/d} is the same rule sphPoly uses for polygon size, and it is the reading the
 * classical plates use: on a great stellated dodecahedron every pentagram is one tile. The vertex array
 * GROWS here — the crossing points are real geometry the record does not carry, because they are not
 * vertices of the polyhedron and shipping them would misstate V. They are appended past the record's
 * own vertices so the edge list, which indexes only the real ones, stays valid.
 */
export function sphStarScene(p: SphStarPattern): SphSchwarzScene {
	const key = new Map<string, number>();
	for (const [n, d] of p.stats.types) key.set(`${n}/${d}`, key.size);
	const verts: V3[] = p.vertices.map((v) => [...v] as V3);
	const tiles: number[][][] = Array.from({ length: key.size }, () => []);
	// Kept per face, because the crossing lines clip against exactly these: the filled region, not the
	// boundary ring and not the hull.
	const rings: number[][][] = [];
	p.faces.forEach((face, fi) => {
		const [n, d] = p.faceType[fi];
		const t = key.get(`${n}/${d}`) ?? 0;
		const fr = starFaceRings(face, d, verts);
		rings.push(fr);
		for (const ring of fr) tiles[t].push(ring);
	});
	const crossings = faceCrossings(p, verts, rings);
	const pattern: IcoPattern = {
		id: p.id,
		k: 1,
		achiral: true,
		drawn: p.edges,
		tiles,
		nDrawn: p.edges.length,
		nTiles: tiles.length,
	};
	return { pattern, vertices: verts, allEdges: p.edges, crossings };
}
