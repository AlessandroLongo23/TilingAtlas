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
// differ by 2πj/n, so they meet at that distance over cos(πj/n). Consecutive rings are offset by half a
// step, which is why the band between them is n triangles and not n quads. The filled region — the
// NONZERO winding reading, the same one lib/hollow/render.ts uses, since even-odd would punch the core
// out of every pentagram and give the concave |n/d| shape instead — is then
//
//     the ring-1 n-gon, plus, for j = 1 … d−1, the n triangles (ring_{j+1}[k], ring_j[k−1], ring_j[k]).
//
// For a pentagram that is the inner pentagon plus five point triangles, which is the decomposition
// anyone would draw by hand; for {8/3} and {10/3} it is two bands instead of one.

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
export function starFaceRings(face: number[], d: number, verts: V3[]): number[][] {
	const n = face.length;
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
	const h = R * Math.cos((Math.PI * d) / n);
	// ring[j] for j = 1..d; ring[d] is the vertex ring itself, so reuse the record's own indices there
	// instead of appending duplicate points on top of them.
	const ring: number[][] = [];
	for (let j = 1; j <= d; j++) {
		if (j === d) {
			ring.push(geo.map((g) => g.idx));
			break;
		}
		const rad = h / Math.cos((Math.PI * j) / n);
		const row: number[] = [];
		for (let k = 0; k < n; k++) {
			row.push(verts.length);
			verts.push(at(rad, a0 + (Math.PI * (d - j)) / n + (2 * Math.PI * k) / n));
		}
		ring.push(row);
	}
	const out: number[][] = [ring[0]]; // the innermost n-gon, the core
	for (let j = 0; j < d - 1; j++) {
		const inner = ring[j];
		const outer = ring[j + 1];
		for (let k = 0; k < n; k++) {
			out.push([outer[k], inner[(k - 1 + n) % n], inner[k]]);
		}
	}
	return out;
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
	p.faces.forEach((face, fi) => {
		const [n, d] = p.faceType[fi];
		const t = key.get(`${n}/${d}`) ?? 0;
		for (const ring of starFaceRings(face, d, verts)) tiles[t].push(ring);
	});
	const pattern: IcoPattern = {
		id: p.id,
		k: 1,
		achiral: true,
		drawn: p.edges,
		tiles,
		nDrawn: p.edges.length,
		nTiles: tiles.length,
	};
	return { pattern, vertices: verts, allEdges: p.edges };
}
