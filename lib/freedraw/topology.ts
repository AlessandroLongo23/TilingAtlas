// Periodic face topology: which faces of a quotient ring set are glued to which, and what the glued
// tiles are. Lifted out of edgePatchCore.ts (2026-09-21) so the tiling EDITOR can reuse it — the edge
// table this builds is the one thing the app never had, and the merge below is the one thing the
// editor needs most. edgePatchCore is still its first caller and nothing about its behaviour moved.
//
// WHAT A RING SET IS. `polys[p]` is face p as a ring of `[vi, offX, offY]` corners: corner j sits at
// `verts[vi] + offX*T1 + offY*T2`. The offsets are relative to the ring's own anchor corner, so a face
// straddling the cell boundary is expressed without ever leaving the quotient. That is the whole
// reason everything here is integer arithmetic on lattice coordinates — no tolerance, no float.
//
// WHY THE UNION-FIND CARRIES AN OFFSET. Merging faces across undrawn edges on a TORUS loses the fact
// we care about: a finite polyomino and an infinite strip are both one torus component. So each member
// carries its lift into Z^2 relative to its root, and reaching an already-merged face by a second
// route with a DIFFERENT lift yields a nonzero lattice vector that maps the tile onto itself. The rank
// of the span of those vectors is the classification: 0 finite, 1 strip, 2 unbounded sheet. The same
// holonomy trick lib/freedraw/faces.ts runs on grid cells, here on explicit rings.

/** A lattice coordinate pair — a lift, an offset, or a period vector. Always integers. */
export type Lift = [number, number];

/** One face's ring: `[vertexIndex, offX, offY]` per corner, offsets relative to the ring's anchor. */
export type Ring = readonly (readonly [number, number, number])[];

/** Where one directed half-edge is carried: which face, which of its corners it leaves, and where
 *  that face sits when the half-edge starts at its own class anchor. */
export interface HalfEdgeSite {
	p: number;
	edgeIdx: number;
	off: Lift;
}

/**
 * Whether a quotient edge is drawn, keyed by DIRECTED half-edge (`halfEdgeKey`).
 *
 * Deliberately tri-state, and the distinction is load-bearing: faces merge across an edge only when
 * this answers exactly `false`. `undefined` means the caller never folded that edge into its quotient,
 * which makes it a boundary — never a merge. Returning `true` for the unknown case would be wrong in
 * the other direction and silently merge nothing.
 */
export type DrawnLookup = (key: string) => boolean | undefined;

export interface FaceMerge {
	/** Component (tile) id per face. */
	polyComp: number[];
	/** Per component: 0 finite, 1 strip, 2 unbounded. */
	compRank: (0 | 1 | 2)[];
	/** Faces per component per period — a finite tile's area in cells. */
	compCells: number[];
	/** Holes in a finite tile; always 0 above rank 0. */
	compHoles: number[];
	/** One lift per member face, in the order the faces were visited. */
	compLift: Lift[][];
	/** The lift mismatches attributed to each component. They generate its period subgroup. */
	compPeriods: Lift[][];
	stats: {
		faceOrbits: number;
		finite: number;
		strips: number;
		unbounded: number;
		withHoles: number;
	};
	/**
	 * Directed half-edge -> the faces carrying it. THE EDGE-IDENTITY TABLE: two faces meet along every
	 * interior edge, so looking up the reversed key of one face's edge names its neighbour and which of
	 * that neighbour's corners the shared edge leaves.
	 */
	half: Map<string, HalfEdgeSite[]>;
}

/** Key of the DIRECTED quotient half-edge from corner `va` to corner `vb` across the lattice step `d`. */
export const halfEdgeKey = (va: number, vb: number, dx: number, dy: number): string =>
	`${va},${vb},${dx},${dy}`;

/**
 * Key of the UNDIRECTED quotient edge, and the orientation that produced it.
 *
 * One orientation per undirected edge, so two developed copies of one quotient edge agree on which
 * they are. The tie-break has to cover `vi === vj` (a loop closing through the lattice), which is why
 * the lattice step decides when the endpoints do not.
 */
export function canonicalEdge(
	vi: number,
	vj: number,
	dx: number,
	dy: number,
): { key: string; vi: number; vj: number; dx: number; dy: number; flipped: boolean } {
	if (vj < vi || (vj === vi && (dx < 0 || (dx === 0 && dy < 0)))) {
		return { key: halfEdgeKey(vj, vi, -dx, -dy), vi: vj, vj: vi, dx: -dx, dy: -dy, flipped: true };
	}
	return { key: halfEdgeKey(vi, vj, dx, dy), vi, vj, dx, dy, flipped: false };
}

/**
 * Union-find whose members carry an integer lattice offset relative to their root, and which records
 * every offset mismatch it meets. Those mismatches generate the period subgroup of the component —
 * the whole basis of telling a finite tile from a strip from a sheet.
 */
export class OffsetDSU {
	private readonly parent: number[];
	private readonly ox: number[];
	private readonly oy: number[];
	readonly periods: Lift[] = [];

	constructor(n: number) {
		this.parent = Array.from({ length: n }, (_, i) => i);
		this.ox = new Array(n).fill(0);
		this.oy = new Array(n).fill(0);
	}

	find(i: number): { root: number; x: number; y: number } {
		let root = i;
		let ax = 0;
		let ay = 0;
		while (this.parent[root] !== root) {
			ax += this.ox[root];
			ay += this.oy[root];
			root = this.parent[root];
		}
		let cur = i;
		let cx = ax;
		let cy = ay;
		while (this.parent[cur] !== cur) {
			const p = this.parent[cur];
			const px = this.ox[cur];
			const py = this.oy[cur];
			this.parent[cur] = root;
			this.ox[cur] = cx;
			this.oy[cur] = cy;
			cx -= px;
			cy -= py;
			cur = p;
		}
		return { root, x: ax, y: ay };
	}

	/** Assert offset(j) - offset(i) = (dx, dy). */
	union(i: number, j: number, dx: number, dy: number): void {
		const a = this.find(i);
		const b = this.find(j);
		if (a.root === b.root) {
			const mx = b.x - (a.x + dx);
			const my = b.y - (a.y + dy);
			if (mx !== 0 || my !== 0) this.periods.push([mx, my]);
			return;
		}
		this.parent[b.root] = a.root;
		this.ox[b.root] = a.x + dx - b.x;
		this.oy[b.root] = a.y + dy - b.y;
	}
}

/** 0 finite, 1 strip, 2 unbounded — the rank of the Q-span of a component's period vectors. */
export function spanRank(vs: readonly Lift[]): 0 | 1 | 2 {
	let first: Lift | null = null;
	for (const w of vs) {
		if (w[0] === 0 && w[1] === 0) continue;
		if (!first) {
			first = w;
			continue;
		}
		if (first[0] * w[1] - first[1] * w[0] !== 0) return 2;
	}
	return first ? 1 : 0;
}

/**
 * A ring's canonical form: the rotation whose corner word sorts smallest, anchored so the first corner
 * has offset (0, 0).
 *
 * Canonical in the only sense that matters here, which is that it does not depend on WHERE the producer
 * started. A face cut out of a rotation system starts at whichever dart the walk reached first, and two
 * faces that are lattice translates of one another start in different places; both come out of this
 * with the identical word, so they can be compared and deduped.
 */
export function canonicalRing(ring: Ring): Ring {
	let bestKey: string | null = null;
	let best: [number, number, number][] | null = null;
	for (let r = 0; r < ring.length; r++) {
		const base = ring[r];
		const rot: [number, number, number][] = [];
		for (let i = 0; i < ring.length; i++) {
			const c = ring[(r + i) % ring.length];
			rot.push([c[0], c[1] - base[1], c[2] - base[2]]);
		}
		const k = rot.map((c) => c.join(",")).join("|");
		if (bestKey === null || k < bestKey) {
			bestKey = k;
			best = rot;
		}
	}
	return best ?? ring;
}

/**
 * A face's identity, stable across rebuilds.
 *
 * Component ids are NOT this: `mergeFaces` numbers components in face order, and face order comes from
 * the order a walk met the darts, so adding one cut anywhere renumbers them. Anything persisted against
 * a face (a colour, most obviously) has to key on the shape of the ring and not on where it landed in
 * an array.
 */
export const ringKey = (ring: Ring): string =>
	canonicalRing(ring)
		.map((c) => c.join(","))
		.join("|");

/** Directed half-edge -> the faces carrying it. The edge-identity table, on its own so a caller that
 *  only wants adjacency does not pay for the merge. */
export function buildHalfEdges(polys: readonly Ring[]): Map<string, HalfEdgeSite[]> {
	const half = new Map<string, HalfEdgeSite[]>();
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const k = halfEdgeKey(va, vb, bx - ax, by - ay);
			const site: HalfEdgeSite = { p, edgeIdx: i, off: [ax, ay] };
			const list = half.get(k);
			if (list) list.push(site);
			else half.set(k, [site]);
		}
	}
	return half;
}

/**
 * Faces merged across undrawn edges, carrying each face's lift.
 *
 * Pure, integer, and independent of how the rings were produced — a developed dart walk and an edited
 * catalogue cell reach it the same way.
 */
export function mergeFaces(polys: readonly Ring[], drawnOf: DrawnLookup): FaceMerge {
	const half = buildHalfEdges(polys);

	const merge = new OffsetDSU(polys.length);
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const dx = bx - ax;
			const dy = by - ay;
			if (drawnOf(halfEdgeKey(va, vb, dx, dy)) !== false) continue; // drawn, or unknown: a boundary
			for (const m of half.get(halfEdgeKey(vb, va, -dx, -dy)) ?? []) {
				// The twin half-edge starts at vb, which sits at (bx, by) in p's frame and at m.off in the
				// neighbour's own frame — so the neighbour is lifted by the difference.
				merge.union(p, m.p, bx - m.off[0], by - m.off[1]);
			}
		}
	}

	const compOf = new Map<number, number>();
	const polyComp: number[] = [];
	const compLift: Lift[][] = [];
	const compPeriods: Lift[][] = [];
	for (let p = 0; p < polys.length; p++) {
		const f = merge.find(p);
		let c = compOf.get(f.root);
		if (c === undefined) {
			c = compLift.length;
			compOf.set(f.root, c);
			compLift.push([]);
			compPeriods.push([]);
		}
		polyComp.push(c);
		compLift[c].push([f.x, f.y]);
	}
	// Attribute each mismatch to its component by re-walking the undrawn adjacencies once more; the DSU
	// records them globally, and a strip's period must not classify its neighbour.
	for (let p = 0; p < polys.length; p++) {
		const ring = polys[p];
		const fp = merge.find(p);
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const dx = bx - ax;
			const dy = by - ay;
			if (drawnOf(halfEdgeKey(va, vb, dx, dy)) !== false) continue;
			for (const m of half.get(halfEdgeKey(vb, va, -dx, -dy)) ?? []) {
				const fq = merge.find(m.p);
				if (fq.root !== fp.root) continue;
				const mx = fq.x - (fp.x + bx - m.off[0]);
				const my = fq.y - (fp.y + by - m.off[1]);
				if (mx !== 0 || my !== 0) compPeriods[compOf.get(fp.root)!].push([mx, my]);
			}
		}
	}

	const compRank = compPeriods.map((ps) => spanRank(ps));
	const compCells = compLift.map((l) => l.length);
	const compHoles = compRank.map((r, c) => (r === 0 ? holesOf(polys, polyComp, compLift[c], c) : 0));

	return {
		polyComp,
		compRank,
		compCells,
		compHoles,
		compLift,
		compPeriods,
		stats: {
			faceOrbits: compRank.length,
			finite: compRank.filter((r) => r === 0).length,
			strips: compRank.filter((r) => r === 1).length,
			unbounded: compRank.filter((r) => r === 2).length,
			withHoles: compHoles.filter((h) => h > 0).length,
		},
		half,
	};
}

/** Holes in a finite tile, as 1 - Euler characteristic of the assembled polyform. */
export function holesOf(
	polys: readonly Ring[],
	polyComp: readonly number[],
	lifts: readonly Lift[],
	comp: number,
): number {
	const members: number[] = [];
	for (let p = 0; p < polys.length; p++) if (polyComp[p] === comp) members.push(p);
	const V = new Set<string>();
	const E = new Set<string>();
	for (let i = 0; i < members.length; i++) {
		const ring = polys[members[i]];
		const [lx, ly] = lifts[i];
		for (let j = 0; j < ring.length; j++) {
			const [va, ax, ay] = ring[j];
			const [vb, bx, by] = ring[(j + 1) % ring.length];
			V.add(`${va},${ax + lx},${ay + ly}`);
			const a = `${va},${ax + lx},${ay + ly}`;
			const b = `${vb},${bx + lx},${by + ly}`;
			E.add(a < b ? `${a}|${b}` : `${b}|${a}`);
		}
	}
	return 1 - (V.size - E.size + members.length);
}
