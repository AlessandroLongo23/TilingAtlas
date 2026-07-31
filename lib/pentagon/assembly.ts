/**
 * How each type's translational unit is built from its pentagon, and the lattice it repeats on.
 *
 * The recipes are DERIVED, not transcribed. `scripts/derive-pentagon-units.ts` grows a patch from the
 * pentagon alone by backtracking over vertex gaps, reads the lattice off it, and checks the result by
 * area plus SAT before emitting the data below. See that file for the method and for the provenance
 * note on Kit Wallace's unlicensed OpenSCAD library, which was not read into this code.
 *
 * WHY THE RECIPE IS COMBINATORIAL, AND WHY THAT IS SAFE UNDER THE SLIDERS.
 *
 * A gluing names indices only: which edge of which already-placed tile, which end of it, which edge of
 * the new copy, and whether the copy is mirrored. No lengths, no angles, no coordinates. Replaying it
 * against a different member of the same family therefore gives that member's tiling, which is what
 * makes a parameter slider move the whole tiling coherently.
 *
 * That this cannot break is not a hope, it is the content of the type's own conditions. Two things
 * could go wrong when the parameters move: two glued edges could stop being the same length, or a
 * vertex could stop closing to 360°. The first is exactly what the side conditions (`d = c + e`,
 * `2a = d`, and so on) forbid, and the second is exactly what the angle conditions (`B + D = 180°`,
 * `2C + D = 360°`, and so on) forbid. Both hold identically across the family by construction. The only
 * real failure mode left is the pentagon itself degenerating, which `solvePentagon` catches first.
 *
 * `build.test.ts` turns that argument into a fact by re-checking area and overlap at sampled tuples
 * across each type's range, not only at its default.
 */

import type { Point } from "./solve";
import assemblies from "./assemblies.json";

export interface Glue {
	/** Index into the unit being built, of an already-placed tile. */
	ref: number;
	/** Edge of the reference tile, running from corner `refEdge` to `refEdge + 1`. */
	refEdge: number;
	/** Which end of that edge the new tile is anchored to. */
	refEnd: 0 | 1;
	/** Edge of the new copy that lands along it. */
	newEdge: number;
	newEnd: 0 | 1;
	mirror: boolean;
}

/**
 * A lattice vector as a difference of two corners of assembled tiles, so it tracks the parameters
 * instead of freezing one instance's numbers.
 */
export interface LatticeRef {
	from: [tile: number, corner: number];
	to: [tile: number, corner: number];
}

export interface Assembly {
	/** One entry per tile after the seed; the seed is implicit at index 0. */
	glues: Glue[];
	/**
	 * Which assembled tiles form the translational unit.
	 *
	 * The chain usually builds a few tiles beyond the unit. Those exist only so `t1` and `t2` can be
	 * written as corner differences reaching into the neighbouring lattice cells, which is what keeps
	 * the lattice parametric. They are not drawn.
	 */
	unit: number[];
	t1: LatticeRef;
	t2: LatticeRef;
}

/**
 * The mirrored prototile, re-indexed so corner 0 stays corner 0.
 *
 * Reflecting a counter-clockwise ring reverses its orientation, so the order must be reversed to get
 * back to counter-clockwise. Doing that with `.reverse()` also shifts every index by one, which would
 * make a recorded gluing replay as a different placement. Indexing by (5 − i) mod 5 reverses AND holds
 * corner 0 fixed, so a recipe means the same thing in the derivation script and here.
 */
export function mirrorProto(proto: Point[]): Point[] {
	return proto.map((_, i) => {
		const p = proto[(5 - i) % 5];
		return { x: -p.x, y: p.y };
	});
}

/**
 * Place a fresh copy of the prototile against an already-placed tile.
 *
 * The new tile's chosen edge endpoint lands on the reference tile's chosen edge endpoint, and the new
 * edge runs ANTIPARALLEL to the reference edge, which is what puts the two tiles on opposite sides of
 * the shared line instead of on top of each other. Mirroring reflects the copy first; the antiparallel
 * rule then applies either way, so the pair of flags covers both handednesses.
 *
 * Anchoring by ENDPOINTS, not by whole edges, is what makes T-junctions expressible. When the two edges
 * differ in length the shorter one's far end lands part way along the longer, which is precisely the
 * arrangement types 10 to 13 require: their conditions (`a = b = c + e`, `2a + c = d`, `2a = d = c + e`,
 * `d = 2a = 2e`) say one tile's long edge is covered by two neighbours' short edges. A generator that
 * only matched equal-length edges could not assemble them at all.
 */
export function placeTile(proto: Point[], refPts: Point[], g: Glue): Point[] | null {
	const base = g.mirror ? mirrorProto(proto) : proto;

	const q0 = base[g.newEdge];
	const q1 = base[(g.newEdge + 1) % 5];
	const r0 = refPts[g.refEdge];
	const r1 = refPts[(g.refEdge + 1) % 5];

	const qdx = q1.x - q0.x;
	const qdy = q1.y - q0.y;
	const rdx = r1.x - r0.x;
	const rdy = r1.y - r0.y;
	if (Math.hypot(qdx, qdy) < 1e-12 || Math.hypot(rdx, rdy) < 1e-12) return null;

	const th = Math.atan2(-rdy, -rdx) - Math.atan2(qdy, qdx);
	const c = Math.cos(th);
	const s = Math.sin(th);

	const an = g.newEnd ? q1 : q0;
	const ar = g.refEnd ? r1 : r0;
	const ax = c * an.x - s * an.y;
	const ay = s * an.x + c * an.y;
	const tx = ar.x - ax;
	const ty = ar.y - ay;

	return base.map((p) => ({ x: c * p.x - s * p.y + tx, y: s * p.x + c * p.y + ty }));
}

/** Replay an assembly: the unit's tiles, and the two lattice vectors, for this pentagon. */
export function assembleUnit(
	proto: Point[],
	asm: Assembly,
): { unit: Point[][]; t1: Point; t2: Point } | null {
	const tiles: Point[][] = [proto];
	for (const g of asm.glues) {
		const ref = tiles[g.ref];
		if (!ref) return null;
		const pts = placeTile(proto, ref, g);
		if (!pts) return null;
		tiles.push(pts);
	}

	const vec = (r: LatticeRef): Point => {
		const a = tiles[r.from[0]]?.[r.from[1]];
		const b = tiles[r.to[0]]?.[r.to[1]];
		if (!a || !b) return { x: 0, y: 0 };
		return { x: b.x - a.x, y: b.y - a.y };
	};
	const t1 = vec(asm.t1);
	const t2 = vec(asm.t2);
	if (Math.abs(t1.x * t2.y - t1.y * t2.x) < 1e-12) return null;

	const unit = asm.unit.map((i) => tiles[i]).filter(Boolean);
	if (unit.length !== asm.unit.length) return null;

	return { unit, t1, t2 };
}

/**
 * Derived by `pnpm tsx scripts/derive-pentagon-units.ts`, which writes assemblies.json.
 *
 * Data, not code, because it is a search result: re-running the script regenerates the file, and the
 * diff is then readable as "the units changed" instead of being buried in a source edit.
 */
export const ASSEMBLIES = assemblies as unknown as Record<number, Assembly>;
