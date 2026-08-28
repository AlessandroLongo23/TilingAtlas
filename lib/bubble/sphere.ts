// SPHERICAL BUBBLE TILES: the combinatorics, shared by the census, the shelf builder and the app.
//
// A bubble tiling decorates every edge with a BUMP on one side and a BITE on the other, and the
// matching rule — a bump must meet a bite — is then satisfied by construction. On the plane the hard
// part is finding the substrate, which is why the Euclidean boards are a DFS over vertex types
// (tools/ctrnact-oracle). On the sphere the substrate is one of a fixed list of 28 solids, so there is
// NOTHING TO SEARCH: a decoration is a free choice, per edge, of which of its two faces owns the bump,
// and the only question is which of the 2^E choices are distinct under the solid's own symmetry.
//
// ⚑ WHICH MAKES k THE WHOLE SHELF. The 28 boards carry 1.277e52 decorations between them; the
// truncated icosidodecahedron alone has 1.28e52 and exactly EIGHT of them are vertex-transitive. Low k
// is not a slice of this catalogue, it IS the catalogue.
//
// Everything here is verified against an independent implementation that shares none of it —
// scripts/bubble-sphere-verify.ts derives the symmetry group from the COORDINATES instead. All 28
// totals agree, 12 boards agree on the full k column by direct enumeration of 2^E, and the
// tetrahedron's 4 is OEIS A000568(4), the number of tournaments on 4 nodes. See DEVELOPMENT_NOTES
// 2026-08-27 for the scope of that check and for the vertex-map bug it was written to catch.

import type { Polyhedron } from "@/lib/render/platonicSolids";

/**
 * One shipped spherical bubble tiling: a solid, and one bit per half-edge.
 *
 * `bites[f][i] = 1` means face f owns the BITE on the edge leaving its i-th ring vertex — the same
 * convention public/bubble/*.json uses on the plane, so one reader serves both geometries. No geometry
 * ships: the face rings come from the solid catalogue through `sphereMapOf`, which is what keeps 29,517
 * records at 4.7 MB.
 */
export interface SphBubblePattern {
	id: string;
	k: number;
	solid: string;
	bites: number[][];
}

/** One board's coverage, as public/bubble-sphere/manifest.json records it. */
export interface SphBubbleBoard {
	solid: string;
	/** "complete" where the board's whole decoration set fits, else "k<=3". */
	coverage: string;
	/** Decorations up to symmetry — astronomically larger than `shards` hold, off the complete boards. */
	total: string;
	shards: string[];
}

export interface Map3 {
	darts: number;
	next: Int32Array;
	prev: Int32Array;
	twin: Int32Array;
	edgeOf: Int32Array;
	/** The lower-numbered dart of each edge — the one a mask bit of 0 selects as the bump owner. */
	firstDartOf: Int32Array;
	/** Ring length of each face, in face order; the darts of face f are consecutive. */
	faceSizes: number[];
	edges: number;
	vertices: number;
	faces: number;
	tailOf: Int32Array;
}

/**
 * Consistently wound face rings.
 *
 * ⚑ The solid catalogue does NOT guarantee them: the cube's rings disagree, so an edge can be listed
 * in the SAME direction by both its faces and the dart pairing has nothing to pair. Fixed here rather
 * than in the catalogue, because the renderer never needed it — it normalises each face's own normal.
 * Done combinatorially and not from the coordinates: flood-fill the face adjacency, reversing any
 * neighbour that reads a shared edge the same way round as the face it was reached from. A sphere is
 * orientable, so this always closes, and it is exact where a normal-versus-centroid test is a float
 * comparison on a face that may be very nearly through the origin.
 */
export function orientFaces(faces: number[][]): number[][] {
	const key = (a: number, b: number) => `${a},${b}`;
	const at = new Map<string, number[]>(); // undirected edge -> face indices touching it
	faces.forEach((f, fi) =>
		f.forEach((v, i) => {
			const u = f[(i + 1) % f.length];
			const k = v < u ? key(v, u) : key(u, v);
			(at.get(k) ?? at.set(k, []).get(k)!).push(fi);
		}));
	const out = faces.map((f) => [...f]);
	const done = new Uint8Array(faces.length);
	const reads = (f: number[], a: number, b: number) =>
		f.some((v, i) => v === a && f[(i + 1) % f.length] === b);
	done[0] = 1;
	const queue = [0];
	while (queue.length) {
		const fi = queue.shift()!;
		const f = out[fi];
		for (let i = 0; i < f.length; i++) {
			const a = f[i];
			const b = f[(i + 1) % f.length];
			const k = a < b ? key(a, b) : key(b, a);
			for (const gj of at.get(k) ?? []) {
				if (gj === fi || done[gj]) continue;
				// The neighbour must read this edge b→a. Reading it a→b means its ring winds the other
				// way round the surface, so reverse it.
				if (reads(out[gj], a, b)) out[gj].reverse();
				done[gj] = 1;
				queue.push(gj);
			}
		}
	}
	if (done.some((d) => !d)) throw new Error("face adjacency is not connected");
	return out;
}

/** Face rings → the dart structure. One dart per (face, boundary edge), directed along the ring. */
export function sphereMapOf(raw: Polyhedron): Map3 {
	const p = { ...raw, faces: orientFaces(raw.faces) };
	const next: number[] = [];
	const prev: number[] = [];
	const tail: number[] = [];
	const head: number[] = [];
	for (const f of p.faces) {
		const base = next.length;
		for (let i = 0; i < f.length; i++) {
			next.push(base + ((i + 1) % f.length));
			prev.push(base + ((i - 1 + f.length) % f.length));
			tail.push(f[i]);
			head.push(f[(i + 1) % f.length]);
		}
	}
	const byDirected = new Map<string, number>();
	for (let d = 0; d < tail.length; d++) byDirected.set(`${tail[d]},${head[d]}`, d);
	const twin = new Int32Array(tail.length);
	for (let d = 0; d < tail.length; d++) {
		const t = byDirected.get(`${head[d]},${tail[d]}`);
		if (t === undefined) throw new Error(`${p.id}: edge ${tail[d]}-${head[d]} has no second face`);
		twin[d] = t;
	}
	// Edge ids: the two darts of an edge share one. Also the count E, checked against Euler below.
	const edgeOf = new Int32Array(tail.length).fill(-1);
	const firstDart: number[] = [];
	let edges = 0;
	for (let d = 0; d < tail.length; d++)
		if (edgeOf[d] < 0) { edgeOf[d] = edges; edgeOf[twin[d]] = edges; firstDart.push(d); edges++; }
	return {
		darts: tail.length, next: Int32Array.from(next), prev: Int32Array.from(prev), twin,
		edgeOf, firstDartOf: Int32Array.from(firstDart), faceSizes: p.faces.map((f) => f.length),
		edges, vertices: p.vertices.length, faces: p.faces.length, tailOf: Int32Array.from(tail),
	};
}

/**
 * The VERTEX permutation an automorphism induces.
 *
 * ⚑ NOT simply `tail(phi(d))`. A dart here is a directed edge, and the rotation about its tail is
 * `next ∘ twin`; an orientation-PRESERVING automorphism commutes with that and so carries tails to
 * tails, but a REVERSING one does not — it carries a dart to one whose HEAD is the image vertex. Read
 * off the tail regardless and the union-find behind every k chains unrelated vertices together: on the
 * decagonal antiprism a reflection of order 2 came out "vertex-transitive" on 20 vertices, which is
 * impossible, and that was the symptom. So try the tail, fall back to the head, and assert that one of
 * them is consistent — an automorphism for which neither is would mean the dart structure is wrong.
 */
export function vertexMap(m: Map3, phi: Int32Array): Int32Array {
	for (const readHead of [false, true]) {
		const v = new Int32Array(m.vertices).fill(-1);
		let ok = true;
		for (let d = 0; d < m.darts && ok; d++) {
			const src = m.tailOf[d];
			const dst = m.tailOf[readHead ? m.twin[phi[d]] : phi[d]];
			if (v[src] < 0) v[src] = dst;
			else if (v[src] !== dst) ok = false;
		}
		if (ok) return v;
	}
	throw new Error("automorphism induces no vertex map — the dart structure is wrong");
}

/** Vertex orbits of a set of automorphisms. */
export function orbitCount(m: Map3, gs: Int32Array[]): number {
	const par = Array.from({ length: m.vertices }, (_, i) => i);
	const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
	for (const g of gs) {
		const v = vertexMap(m, g);
		for (let x = 0; x < m.vertices; x++) { const a = find(x), b = find(v[x]); if (a !== b) par[a] = b; }
	}
	return new Set(par.map((_, i) => find(i))).size;
}

/** Every map automorphism, as a dart permutation. Pinned by the image of dart 0 and a chirality. */
export function sphereAutomorphisms(m: Map3): Int32Array[] {
	const out: Int32Array[] = [];
	for (const flip of [false, true])
		for (let img = 0; img < m.darts; img++) {
			const phi = new Int32Array(m.darts).fill(-1);
			phi[0] = img;
			const stack = [0];
			let ok = true;
			while (stack.length && ok) {
				const d = stack.pop()!;
				for (const [step, image] of [
					[m.next, flip ? m.prev : m.next],
					[m.twin, m.twin],
				] as const) {
					const e = step[d];
					const want = image[phi[d]];
					if (phi[e] < 0) { phi[e] = want; stack.push(e); }
					else if (phi[e] !== want) { ok = false; break; }
				}
			}
			if (!ok || phi.some((v) => v < 0) || new Set(phi).size !== m.darts) continue;
			out.push(phi);
		}
	return out;
}

/** Fixed decorations of one automorphism: 2^(dart cycles / 2), or 0 if a cycle flips an edge. */
export function fixedDecorations(m: Map3, phi: Int32Array): bigint {
	const seen = new Uint8Array(m.darts);
	let cycles = 0;
	for (let s = 0; s < m.darts; s++) {
		if (seen[s]) continue;
		cycles++;
		const members = new Set<number>();
		for (let d = s; !seen[d]; d = phi[d]) { seen[d] = 1; members.add(d); }
		// A cycle carrying an edge to itself with its sides swapped admits no fixed decoration.
		for (const d of members) if (members.has(m.twin[d])) return 0n;
	}
	return 1n << BigInt(cycles / 2);
}

/**
 * The k DISTRIBUTION, by enumeration — the shape a shelf would actually have.
 *
 * `k` counts VERTEX ORBITS of the decorated tiling, which is the axis every other spherical shelf is
 * indexed on, and a decoration's symmetry group is its STABILISER in Aut. So k = vertex orbits under
 * that stabiliser, and Burnside cannot give it: the sum counts orbits without ever naming one. This
 * enumerates, so it is bounded by 2^E and only runs where that is small — which is the honest half of
 * the answer, because the boards where it does not run are the ones with no shippable slice anyway.
 */
export function kDistribution(m: Map3, aut: Int32Array[]): { k: number; mask: bigint }[] | null {
	if (m.edges > 20) return null; // 2^20 · |Aut| is already ~10^8 dart maps
	const edgeDarts: [number, number][] = [];
	const dartEdge = new Int32Array(m.darts);
	{
		const seen = new Uint8Array(m.darts);
		for (let d = 0; d < m.darts; d++)
			if (!seen[d]) { seen[d] = seen[m.twin[d]] = 1; dartEdge[d] = dartEdge[m.twin[d]] = edgeDarts.length; edgeDarts.push([d, m.twin[d]]); }
	}
	const E = edgeDarts.length;
	// A decoration is a bitmask: bit e says which of edge e's two darts owns the bump.
	const act = (mask: number, phi: Int32Array) => {
		let out = 0;
		for (let e = 0; e < E; e++) {
			const t = phi[edgeDarts[e][(mask >> e) & 1]];
			if (edgeDarts[dartEdge[t]][1] === t) out |= 1 << dartEdge[t];
		}
		return out;
	};
	const reps: { k: number; mask: bigint }[] = [];
	const done = new Uint8Array(1 << E);
	for (let mask = 0; mask < 1 << E; mask++) {
		if (done[mask]) continue;
		// One pass over the group gives the orbit AND the stabiliser, so the k is free.
		const stab: Int32Array[] = [];
		for (const phi of aut) {
			const img = act(mask, phi);
			done[img] = 1;
			if (img === mask) stab.push(phi);
		}
		reps.push({ k: orbitCount(m, stab), mask: BigInt(mask) });
	}
	return reps;
}

/**
 * The LOW-k slice, for every board — including the ones 2^E puts out of reach.
 *
 * A decoration has k vertex orbits where k is measured under its STABILISER, so a low-k decoration is
 * one with a large, vertex-nearly-transitive stabiliser. That inverts the enumeration: instead of
 * walking 2^E decorations and reading each stabiliser off, walk the SUBGROUPS of Aut — there are a
 * few hundred at most, Aut having order ≤ 120 — keep those whose vertex action has few orbits, and
 * build their fixed sets directly. Each fixed set is tiny, because a subgroup that large leaves few
 * free choices. Their union is exactly the set of decorations with k ≤ the cutoff (if H ≤ Stab(x)
 * then Stab(x) has no more vertex orbits than H), and orbiting that union under Aut gives the count.
 *
 * This is what makes the truncated icosidodecahedron answerable at all: it has 2^180 decorations and
 * 120 symmetries, so its entire low-k slice is reachable while 99.999…% of the board never is.
 */
export function lowK(m: Map3, aut: Int32Array[], cutoff: number): { k: number; mask: bigint }[] | null {
	const mul = (a: Int32Array, b: Int32Array) => { const c = new Int32Array(m.darts); for (let i = 0; i < m.darts; i++) c[i] = a[b[i]]; return c; };
	// ⚑ An automorphism is PINNED BY TWO NUMBERS: where it sends dart 0, and where it sends dart 0's
	// face-successor — that fixes the image dart and the chirality, and the propagation does the rest.
	// So this is a complete key. Stringifying the whole permutation is also complete and costs 1.5 kB
	// an element against 8 bytes; at 120 elements per subgroup and ~10^5 closures it was 20 GB of
	// transient strings a round, which is what had the census at 1.1 GB and still climbing.
	const key = (g: Int32Array) => g[0] * m.darts + g[m.next[0]];

	// Every subgroup, by closing generating sets. Start from the cyclic ones and keep extending by a
	// single element until nothing new appears — enough for |Aut| ≤ 120 and it needs no group theory.
	const close = (gens: Int32Array[]) => {
		const seen = new Map<number, Int32Array>();
		const id = new Int32Array(m.darts).map((_, i) => i);
		seen.set(key(id), id);
		const q = [id];
		while (q.length) {
			const x = q.pop()!;
			for (const g of gens) { const y = mul(g, x); const k = key(y); if (!seen.has(k)) { seen.set(k, y); q.push(y); } }
		}
		return [...seen.values()];
	};
	const subgroups = new Map<string, Int32Array[]>();
	const add = (els: Int32Array[]) => { const k = els.map(key).sort((a, b) => a - b).join(","); if (!subgroups.has(k)) { subgroups.set(k, els); return true; } return false; };
	for (const g of aut) add(close([g]));
	for (let grew = true; grew; ) {
		grew = false;
		for (const els of [...subgroups.values()]) for (const g of aut) if (!els.some((e) => key(e) === key(g))) if (add(close([...els, g]))) grew = true;
	}

	/** Decorations fixed by a subgroup, as edge-choice bitmasks. Empty when an orbit flips an edge. */
	const fixedOf = (els: Int32Array[]): bigint[] | null => {
		const orbit = new Int32Array(m.darts).fill(-1);
		let n = 0;
		for (let d = 0; d < m.darts; d++) {
			if (orbit[d] >= 0) continue;
			const members: number[] = [];
			const stack = [d];
			orbit[d] = n;
			while (stack.length) { const x = stack.pop()!; members.push(x); for (const g of els) { const y = g[x]; if (orbit[y] < 0) { orbit[y] = n; stack.push(y); } } }
			for (const x of members) if (orbit[m.twin[x]] === n) return null; // an orbit carrying an edge to its own other side
			n++;
		}
		// Orbits pair under `twin`; one free binary choice per pair.
		const pairs: [number, number][] = [];
		const done = new Set<number>();
		for (let d = 0; d < m.darts; d++) { const o = orbit[d], t = orbit[m.twin[d]]; if (done.has(o)) continue; done.add(o); done.add(t); pairs.push([o, t]); }
		if (pairs.length > 22) return null; // 4M fixed decorations from one subgroup is not a low-k slice
		const edgeDart: number[] = [];
		for (let d = 0; d < m.darts; d++) if (edgeDart[m.edgeOf[d]] === undefined) edgeDart[m.edgeOf[d]] = d;
		const out: bigint[] = [];
		for (let sel = 0; sel < 1 << pairs.length; sel++) {
			let mask = 0n;
			for (let e = 0; e < m.edges; e++) {
				const d = edgeDart[e];
				const pi = pairs.findIndex(([a, b]) => a === orbit[d] || b === orbit[d]);
				const takeFirst = pairs[pi][0] === orbit[d];
				if (((sel >> pi) & 1) === (takeFirst ? 1 : 0)) mask |= 1n << BigInt(e);
			}
			out.push(mask);
		}
		return out;
	};

	// ⚑ The pool is CAPPED, and a board that trips the cap reports nothing rather than a wrong number.
	// A subgroup with few vertex orbits can still leave many free edge choices — the low-k slice is
	// small because the STABILISER is large, and a subgroup being vertex-transitive does not by itself
	// make it large. Without the cap the union ran past JavaScript's Set limit and the run died.
	const POOL_CAP = 4_000_000;
	const pool = new Set<bigint>();
	for (const els of subgroups.values()) {
		if (orbitCount(m, els) > cutoff) continue;
		const f = fixedOf(els);
		if (!f) continue;
		for (const x of f) {
			pool.add(x);
			if (pool.size > POOL_CAP) return null;
		}
	}
	// Orbit the pool under Aut, and read each representative's true k off its stabiliser.
	const edgeDarts: [number, number][] = [];
	const dartEdge = new Int32Array(m.darts);
	{ const seen = new Uint8Array(m.darts);
	  for (let d = 0; d < m.darts; d++) if (!seen[d]) { seen[d] = seen[m.twin[d]] = 1; dartEdge[d] = dartEdge[m.twin[d]] = edgeDarts.length; edgeDarts.push([d, m.twin[d]]); } }
	const act = (mask: bigint, phi: Int32Array) => {
		let out = 0n;
		for (let e = 0; e < m.edges; e++) {
			const t = phi[edgeDarts[e][Number((mask >> BigInt(e)) & 1n)]];
			if (edgeDarts[dartEdge[t]][1] === t) out |= 1n << BigInt(dartEdge[t]);
		}
		return out;
	};
	const reps: { k: number; mask: bigint }[] = [];
	const seen = new Set<bigint>();
	for (const x of pool) {
		if (seen.has(x)) continue;
		const stab: Int32Array[] = [];
		for (const phi of aut) { const y = act(x, phi); seen.add(y); if (y === x) stab.push(phi); }
		const k = orbitCount(m, stab);
		if (k <= cutoff) reps.push({ k, mask: x });
	}
	return reps;
}



/** Representatives bucketed by k — what the census reports and the shelf builder shards on. */
export function byK(reps: { k: number; mask: bigint }[]): Map<number, { k: number; mask: bigint }[]> {
	const out = new Map<number, { k: number; mask: bigint }[]>();
	for (const r of reps) (out.get(r.k) ?? out.set(r.k, []).get(r.k)!).push(r);
	return out;
}

/**
 * A decoration mask as PER-FACE BITE WORDS — the form the shelf ships and the renderer reads.
 *
 * `bites[f][i] = 1` means face f owns the BITE on the edge leaving its i-th ring vertex, which is the
 * same convention public/bubble/*.json uses on the plane, so one reader serves both. Nothing else has
 * to be shipped: the face rings come from the solid catalogue through `sphereMapOf`, so a spherical
 * record is a solid id and a bit per half-edge.
 */
export function biteWords(m: Map3, mask: bigint): number[][] {
	const out: number[][] = [];
	let d = 0;
	for (const n of m.faceSizes) {
		const word: number[] = [];
		for (let i = 0; i < n; i++, d++) {
			// The mask bit says which of the edge's two darts owns the BUMP; this face owns the bite
			// exactly when the bump is on the other side.
			const owner = ((mask >> BigInt(m.edgeOf[d])) & 1n) === 1n ? m.twin[m.firstDartOf[m.edgeOf[d]]] : m.firstDartOf[m.edgeOf[d]];
			word.push(owner === d ? 0 : 1);
		}
		out.push(word);
	}
	return out;
}


/**
 * How deep a bubble arc may go on THIS board, as the offset `t` fed to `edgeCircles`.
 *
 * ⚑ NOT a constant. The Euclidean profiles are capped by the tile's tightest corner (lib/bubble/edges.ts);
 * the spherical cap is the same idea in the other units — an arc that bulges further than the edge is
 * long leaves directions no tile claims, which renders as holes in the sphere. A fixed 0.06 left 4.8%
 * of the truncated icosidodecahedron unclaimed, that solid having 180 short edges, while the tetrahedron
 * with six long ones was fine at the same number. So the depth is a FRACTION of the shortest edge's
 * angular length, which makes one constant serve all 28 boards.
 *
 * The fraction is 0.16: the sagitta of the plane shelf's default 60° arc is 0.134 of its chord, and a
 * little more reads better on a sphere seen at an angle. `edgeCircles` takes the result as `depth`.
 */
export function bubbleDepth(m: Map3, poly: Polyhedron, fraction = 0.16): number {
	const unit = poly.vertices.map((v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L] as const; });
	let minArc = Infinity;
	for (let e = 0; e < m.edges; e++) {
		const d = m.firstDartOf[e];
		const a = unit[m.tailOf[d]];
		const b = unit[m.tailOf[m.twin[d]]];
		minArc = Math.min(minArc, Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))));
	}
	// `t` is compared against dot(dir, unit axis), so it is a sine of an angular offset, not the angle.
	return Math.sin(minArc * fraction);
}

