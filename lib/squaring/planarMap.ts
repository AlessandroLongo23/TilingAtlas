// The combinatorial layer: a polyhedron's face rings turned into an oriented planar map.
//
// Nothing in lib/ held this before. The base Polyhedron (lib/render/platonicSolids.ts) stores vertices
// and `faces: number[][]` and no edge list at all — edges are implicit in the rings — and the spherical
// shelves (lib/tilings/sph-poly.ts, sph-half.ts) carry an `edges` array but no orientation. The Smith
// construction needs strictly more than either: it needs to know, for a directed edge u→v, which face
// lies to its LEFT and which to its RIGHT, because that pair is what the squared rectangle's two
// horizontal coordinates come from.
//
// An oriented planar map is exactly that data, and it has a clean certificate: every directed half-edge
// must be traversed by exactly one face ring. If (u,v) appears in two rings the orientations disagree;
// if it appears in none the surface has a boundary.
//
// The repair matters in practice. All 20 records in public/spherical-poly/ ship face rings in traversal
// order but NOT consistently oriented, and fail that certificate as written; all 20 pass after
// orientFaces flips them. The public/spherical-half/ records and the hand-written solids in
// lib/render/*Solids.ts are already consistent, so the repair is a no-op there — which is the reason it
// is written as a repair rather than a requirement.

export interface PlanarMap {
	/** Vertex count. Vertices are 0..vertexCount-1. */
	vertexCount: number;
	/** Face rings, consistently oriented. */
	faces: number[][];
	/** "u,v" → index of the face whose ring traverses u→v, i.e. the face LEFT of u→v. */
	faceLeftOf: Map<string, number>;
	/** Undirected edges as sorted pairs, deduplicated, in ascending order. */
	edges: [number, number][];
	/** Adjacency, as a set per vertex. */
	adjacency: Set<number>[];
}

export const halfEdgeKey = (u: number, v: number): string => `${u},${v}`;

/**
 * Flip face rings until every directed half-edge is used exactly once.
 *
 * Breadth-first over the dual: once one face's orientation is chosen, each neighbour's is forced — it
 * must traverse the shared edge in the opposite direction. A contradiction means the surface is
 * non-orientable or the rings are not a valid closed surface, and returns null rather than guessing.
 *
 * @returns the reoriented rings, or null if no consistent orientation exists
 */
export function orientFaces(faces: number[][]): number[][] | null {
	if (faces.length === 0) return null;

	// Undirected edge → the (face, directed pair) incidences that use it. A closed surface has 2.
	const incident = new Map<string, { face: number; from: number; to: number }[]>();
	for (let f = 0; f < faces.length; f++) {
		const ring = faces[f];
		if (ring.length < 3) return null;
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			if (a === b) return null;
			const key = a < b ? halfEdgeKey(a, b) : halfEdgeKey(b, a);
			const list = incident.get(key);
			if (list) list.push({ face: f, from: a, to: b });
			else incident.set(key, [{ face: f, from: a, to: b }]);
		}
	}
	for (const list of incident.values()) {
		if (list.length !== 2) return null;
	}

	// flipped[f] === true means face f's ring must be reversed.
	const flipped: (boolean | null)[] = new Array(faces.length).fill(null);
	flipped[0] = false;
	const stack = [0];

	while (stack.length) {
		const f = stack.pop() as number;
		const ring = flipped[f] ? [...faces[f]].reverse() : faces[f];
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			const key = a < b ? halfEdgeKey(a, b) : halfEdgeKey(b, a);
			for (const inc of incident.get(key) as { face: number; from: number; to: number }[]) {
				if (inc.face === f) continue;
				// The neighbour must traverse this edge as b→a. If its stored ring already does, it
				// keeps its orientation; otherwise it flips.
				const wantFlip = !(inc.from === b && inc.to === a);
				if (flipped[inc.face] === null) {
					flipped[inc.face] = wantFlip;
					stack.push(inc.face);
				} else if (flipped[inc.face] !== wantFlip) {
					return null;
				}
			}
		}
	}

	// A disconnected dual means a disconnected surface, which is not a polyhedron.
	if (flipped.some((f) => f === null)) return null;
	return faces.map((ring, f) => (flipped[f] ? [...ring].reverse() : ring));
}

/**
 * Build the map from already-oriented rings, certifying orientation as it goes.
 *
 * @returns the map, or null if the rings are not a consistently oriented closed surface
 */
export function buildMap(faces: number[][], vertexCount: number): PlanarMap | null {
	const faceLeftOf = new Map<string, number>();
	for (let f = 0; f < faces.length; f++) {
		const ring = faces[f];
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			if (a < 0 || a >= vertexCount || b < 0 || b >= vertexCount) return null;
			const key = halfEdgeKey(a, b);
			if (faceLeftOf.has(key)) return null; // used twice → orientations disagree
			faceLeftOf.set(key, f);
		}
	}
	// Every half-edge needs its twin, or the surface has a boundary.
	for (const key of faceLeftOf.keys()) {
		const [u, v] = key.split(",");
		if (!faceLeftOf.has(halfEdgeKey(Number(v), Number(u)))) return null;
	}

	const adjacency: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
	const edgeSet = new Set<string>();
	const edges: [number, number][] = [];
	for (const key of faceLeftOf.keys()) {
		const [us, vs] = key.split(",");
		const u = Number(us);
		const v = Number(vs);
		adjacency[u].add(v);
		adjacency[v].add(u);
		const lo = Math.min(u, v);
		const hi = Math.max(u, v);
		const ek = halfEdgeKey(lo, hi);
		if (!edgeSet.has(ek)) {
			edgeSet.add(ek);
			edges.push([lo, hi]);
		}
	}
	edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

	return { vertexCount, faces, faceLeftOf, edges, adjacency };
}

/** Orient then build, the usual entry point. Returns null if the rings cannot form a planar map. */
export function planarMapFromFaces(faces: number[][], vertexCount: number): PlanarMap | null {
	const oriented = orientFaces(faces);
	if (!oriented) return null;
	return buildMap(oriented, vertexCount);
}

/** V − E + F. Must be 2 for the sphere; anything else has no Smith diagram. */
export function eulerCharacteristic(map: PlanarMap): number {
	return map.vertexCount - map.edges.length + map.faces.length;
}

/**
 * Is the map 3-connected? BSST's theorem is about 3-connected planar graphs, and Steinitz's theorem
 * says those are exactly the convex-polyhedron skeletons — so this is the property that makes the
 * output a *polyhedron's* rectangle rather than just some graph's.
 *
 * Brute force: remove each pair of vertices and test connectivity of the rest. O(V²·E), which at
 * V ≤ 60 is nothing, and is worth far more than a clever algorithm nobody can check by eye.
 */
export function isThreeConnected(map: PlanarMap): boolean {
	const n = map.vertexCount;
	if (n < 4) return false;
	for (let a = 0; a < n; a++) {
		for (let b = a + 1; b < n; b++) {
			const removed = new Set([a, b]);
			let start = -1;
			for (let v = 0; v < n; v++) {
				if (!removed.has(v)) {
					start = v;
					break;
				}
			}
			if (start < 0) continue;
			const seen = new Set([start]);
			const stack = [start];
			while (stack.length) {
				const v = stack.pop() as number;
				for (const w of map.adjacency[v]) {
					if (removed.has(w) || seen.has(w)) continue;
					seen.add(w);
					stack.push(w);
				}
			}
			if (seen.size !== n - 2) return false;
		}
	}
	return true;
}
