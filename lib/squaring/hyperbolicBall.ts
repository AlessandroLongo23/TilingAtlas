// A ball in the {3,q} hyperbolic triangulation, wired at its boundary — the third geometry for the
// Brooks–Smith–Stone–Tutte construction.
//
// Sphere and torus both gave a FINITE closed surface. A hyperbolic tiling is infinite, so there is no
// closed surface to quotient by unless you pass to a genus ≥ 2 surface, and that stops being a picture
// in the plane (Gauss–Bonnet forces cone points). The other reading of "square a hyperbolic tiling" is
// the one that stays drawable: take the tiling itself, cut a ball out of it, and short its whole
// boundary to a single vertex. Benjamini and Schramm proved that as the ball grows this converges, for
// any transient bounded-degree planar graph, to a square tiling of a CYLINDER whose bottom edge is the
// boundary at infinity — "Random walks and harmonic functions on infinite planar graphs using square
// tilings", Ann. Probab. 24 (1996) 1219–1238. Georgakopoulos later identified that boundary circle with
// the Poisson boundary of the random walk (Invent. Math. 203, 2016).
//
// Transience is the whole mechanism, and it is what makes the hyperbolic case different from the
// Euclidean one rather than merely bigger. See lib/squaring/cylinderSquaring.ts.

import { regularEdgeLength } from "@/lib/render/hyperbolicDevelop";
import {
	su11Apply,
	su11ApplyInverse,
	su11Mul,
	su11Rotation,
	su11Translation,
	type Complex,
} from "@/lib/render/hyperbolic";

export interface HyperbolicBall {
	q: number;
	radius: number;
	/** Vertices 0…vertexCount-2 are real; the last one is the wired sink standing for the boundary. */
	vertexCount: number;
	sink: number;
	faces: number[][];
	/** The outermost layer, in cyclic order — the vertices the sink is wired to. */
	boundary: number[];
	/** Which layer each real vertex is in; the sink gets radius + 1. */
	layerOf: number[];
}

/**
 * The combinatorial ball of radius r about a vertex of {3,q}, plus a sink wired to its boundary.
 *
 * Layer k+1 is forced by two demands: every face is a triangle, and every interior vertex has degree q.
 * Walking the layer-k cycle, each vertex contributes `q − parents − 4` private children and each EDGE
 * of the cycle contributes one child shared by its two endpoints. Nothing here is geometric — the
 * construction that follows only ever reads the combinatorics.
 */
export function buildBall(q: number, radius: number): HyperbolicBall {
	const faces: number[][] = [];
	const layerOf: number[] = [0];
	let next = 1;
	const parents: number[] = [0];

	let layer: number[] = [];
	for (let i = 0; i < q; i++) {
		layer.push(next);
		parents[next] = 1;
		layerOf[next] = 1;
		next += 1;
	}
	for (let i = 0; i < q; i++) faces.push([0, layer[i], layer[(i + 1) % q]]);

	for (let depth = 1; depth < radius; depth++) {
		const n = layer.length;
		const shared: number[] = new Array<number>(n).fill(-1);
		const kids: number[][] = [];
		const claim = (i: number): number => {
			if (shared[i] === -1) {
				shared[i] = next;
				parents[next] = 2;
				layerOf[next] = depth + 1;
				next += 1;
			}
			return shared[i];
		};
		for (let i = 0; i < n; i++) {
			const v = layer[i];
			const list: number[] = [claim((i - 1 + n) % n)];
			const priv = q - parents[v] - 4;
			for (let k = 0; k < priv; k++) {
				list.push(next);
				parents[next] = 1;
				layerOf[next] = depth + 1;
				next += 1;
			}
			list.push(claim(i));
			kids.push(list);
		}
		for (let i = 0; i < n; i++) {
			const v = layer[i];
			const list = kids[i];
			for (let j = 0; j + 1 < list.length; j++) faces.push([v, list[j], list[j + 1]]);
			faces.push([v, layer[(i + 1) % n], shared[i]]);
		}
		const order: number[] = [];
		for (let i = 0; i < n; i++) order.push(...kids[i].slice(0, -1));
		layer = order;
	}

	const sink = next;
	layerOf[sink] = radius + 1;
	next += 1;
	for (let i = 0; i < layer.length; i++) faces.push([layer[i], sink, layer[(i + 1) % layer.length]]);

	return { q, radius, vertexCount: next, sink, faces, boundary: layer, layerOf };
}

/** Rotate `z` about `p` by `theta`, in the Poincaré disk. */
function rotateAbout(p: Complex, theta: number, z: Complex): Complex {
	const T = su11Translation(p);
	return su11Apply(su11Mul(T, su11Rotation(theta)), su11ApplyInverse(T, z));
}

/** The same rotation in the flat plane, for {3,6} — the Euclidean member of the family. */
function rotateFlat(p: Complex, theta: number, z: Complex): Complex {
	const c = Math.cos(theta);
	const s = Math.sin(theta);
	const dx = z.x - p.x;
	const dy = z.y - p.y;
	return { x: p.x + dx * c - dy * s, y: p.y + dx * s + dy * c };
}

/**
 * Exact Poincaré-disk positions for every real vertex of the ball.
 *
 * Each triangle of {3,q} is equilateral with all three angles 2π/q, so given a directed edge a→b of an
 * anticlockwise triangle the third corner is b rotated about a by that angle. The whole ball unfolds
 * from one seed edge with no optimisation and no drift — the same isometry group the tiling is made of.
 *
 * The sink has no position: it stands for the entire boundary circle, which is where the accumulation
 * happens, so callers draw it as the rim.
 */
export function diskLayout(ball: HyperbolicBall, faces: number[][]): (Complex | null)[] {
	// {3,6} is the Euclidean member of the family and has no hyperbolic edge length. It is kept in the
	// corpus precisely because it is the one that FAILS to be transient, and the contrast is the point,
	// so it gets a flat layout instead of being dropped.
	const flat = ball.q === 6;
	const len = flat ? 1 : regularEdgeLength(3, ball.q);
	if (len === null) return new Array<Complex | null>(ball.vertexCount).fill(null);
	const turn = flat ? rotateFlat : rotateAbout;
	const theta = (2 * Math.PI) / ball.q;
	const pos: (Complex | null)[] = new Array<Complex | null>(ball.vertexCount).fill(null);
	const r0 = flat ? 1 : Math.tanh(len / 2);
	pos[0] = { x: 0, y: 0 };

	// Seed: vertex 0 and one neighbour. Everything else follows from the triangles.
	const first = faces.find((f) => f.includes(0) && !f.includes(ball.sink));
	if (!first) return pos;
	const seed = first[(first.indexOf(0) + 1) % first.length];
	pos[seed] = { x: r0, y: 0 };

	// Repeatedly place the third corner of any triangle with two corners already down. A handful of
	// sweeps is enough at these radii; the loop stops as soon as a sweep places nothing.
	for (let pass = 0; pass < ball.radius + 3; pass++) {
		let placed = 0;
		for (const f of faces) {
			if (f.includes(ball.sink)) continue;
			for (let i = 0; i < 3; i++) {
				const a = f[i];
				const b = f[(i + 1) % 3];
				const c = f[(i + 2) % 3];
				const pa = pos[a];
				const pb = pos[b];
				if (!pa || !pb || pos[c]) continue;
				pos[c] = turn(pa, theta, pb);
				placed += 1;
			}
		}
		if (placed === 0) break;
	}
	return pos;
}

/**
 * Largest radius whose exact solve is affordable at build time. The reduced Laplacian is dense and
 * Bareiss is cubic in the free-vertex count with entries that grow to the spanning-tree count, so the
 * cost climbs far faster than the picture improves.
 */
export function affordableRadius(q: number, budget = 260): number {
	let r = 1;
    for (;;) {
		const probe = buildBall(q, r + 1);
		if (probe.vertexCount > budget) return r;
		r += 1;
		if (r > 12) return r;
	}
}
