// What an edit touches under Wallpaper mode.
//
// Under Lattice mode the answer is short: an edit is recorded against the quotient, so it lands on every
// lattice translate, which is one component. Under Wallpaper mode the point group comes too, so a click
// on one tile also reaches the tiles the group carries it onto, and the hover preview has to say so
// before the click happens.
//
// The generators all come out of `SymmetryData`, which `analyzeSymmetry` already computes and /play
// already caches: rotations about each `Center`, reflections across each mirror `Axis`, and a glide for
// each glide axis. The glide vector is the one piece `SymmetryData` does not carry and it is
// reconstructed the way docs/superpowers/specs/2026-07-09-wallpaper-fd-subdivision-design.md sets out:
// half the shortest lattice period parallel to the axis. That reconstruction is what makes pg, pgg, pmg
// and p4g work, since none of them has a point with full site symmetry.
//
// The orbit is taken over COMPONENTS and not over faces, because a component is what an edit names: a
// merged tile is one thing to paint and one thing to cut.

import type { SymmetryData } from "@/lib/classes/symmetry/types";
import { faceCentroid, pickFace } from "./snap";
import type { PeriodMode, Pt, StudioPatch } from "./types";

/** A plane isometry as a 2x3 matrix: p -> (a p.x + b p.y + e, c p.x + d p.y + f). */
type Iso = readonly [number, number, number, number, number, number];

const apply = (m: Iso, p: Pt): Pt => [m[0] * p[0] + m[1] * p[1] + m[4], m[2] * p[0] + m[3] * p[1] + m[5]];

/** Rotation by `ang` about `z`. */
function rotation(z: Pt, ang: number): Iso {
	const c = Math.cos(ang);
	const s = Math.sin(ang);
	return [c, -s, s, c, z[0] - c * z[0] + s * z[1], z[1] - s * z[0] - c * z[1]];
}

/** Reflection across the line through `p` along `d`, optionally followed by a translation (a glide). */
function reflection(p: Pt, d: Pt, glide?: Pt): Iso {
	const len = Math.hypot(d[0], d[1]) || 1;
	const ux = d[0] / len;
	const uy = d[1] / len;
	// The standard reflection about a line through the origin along u, conjugated by the translation to p.
	const a = ux * ux - uy * uy;
	const b = 2 * ux * uy;
	const gx = glide?.[0] ?? 0;
	const gy = glide?.[1] ?? 0;
	return [a, b, b, -a, p[0] - a * p[0] - b * p[1] + gx, p[1] - b * p[0] + a * p[1] + gy];
}

/** The shortest nonzero lattice vector parallel to `d`. The glide's translation is half of it. */
function periodAlong(patch: StudioPatch, d: Pt): Pt | null {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const len = Math.hypot(d[0], d[1]) || 1;
	const ux = d[0] / len;
	const uy = d[1] / len;
	let best: Pt | null = null;
	let bestLen = Infinity;
	for (let i = -4; i <= 4; i++) {
		for (let j = -4; j <= 4; j++) {
			if (i === 0 && j === 0) continue;
			const vx = i * t1x + j * t2x;
			const vy = i * t1y + j * t2y;
			const vl = Math.hypot(vx, vy);
			// Parallel to within a thousandth of its own length, the same relative test the
			// fundamental-domain spec uses for this search.
			if (Math.abs(vx * uy - vy * ux) > 1e-3 * vl) continue;
			if (vl < bestLen) {
				bestLen = vl;
				best = [vx, vy];
			}
		}
	}
	return best;
}

/** The point group's generators as isometries, plus the glides the lattice reconstructs. */
export function generators(patch: StudioPatch, sym: SymmetryData): Iso[] {
	const out: Iso[] = [];
	for (const c of sym.centers ?? []) {
		for (let k = 1; k < c.order; k++) {
			out.push(rotation([c.z.x, c.z.y], (k * 2 * Math.PI) / c.order));
		}
	}
	for (const ax of sym.axes ?? []) {
		const p: Pt = [ax.p.x, ax.p.y];
		const d: Pt = [ax.d.x, ax.d.y];
		if (ax.kind === "glide") {
			const per = periodAlong(patch, d);
			// No lattice period along the axis means the glide cannot be reconstructed, and a guess here
			// would move an edit to the wrong tile. Skipping is the honest failure: the orbit comes out
			// smaller than the truth, never wrong.
			if (per) out.push(reflection(p, d, [per[0] / 2, per[1] / 2]));
		} else {
			out.push(reflection(p, d));
		}
	}
	return out;
}

/**
 * The components one edit on `face` would touch.
 *
 * Under `lattice` that is the face's own component and nothing else. Under `wallpaper` it is the closure
 * of that component under the generators: each image's centroid is located back in the tiling (folded
 * modulo the lattice by `pickFace`, which probes the neighbouring cells), and whatever component it
 * lands in joins the set.
 *
 * An image whose centroid lands in no face is dropped instead of guessed at. That happens when a
 * generator does not actually preserve the tiling's own faces, which is a real possibility: the group is
 * classified from the UNDECORATED tiling, and a tiling can carry a symmetry its cell decomposition does
 * not respect.
 */
export function affectedComponents(
	patch: StudioPatch,
	sym: SymmetryData | null,
	face: number,
	mode: PeriodMode,
): Set<number> {
	const own = patch.polyComp[face];
	const out = new Set<number>([own]);
	if (mode !== "wallpaper" || !sym) return out;
	const gens = generators(patch, sym);
	if (gens.length === 0) return out;

	// One representative face per component, so a merged tile is orbited once and not once per cell.
	const repOf = new Map<number, number>();
	for (let f = 0; f < patch.rings.length; f++) {
		if (!repOf.has(patch.polyComp[f])) repOf.set(patch.polyComp[f], f);
	}
	const queue: number[] = [own];
	// Bounded: the point group has order at most 12 and a component count is small, so this is a cap
	// against a pathological float loop and not a real limit.
	for (let guard = 0; queue.length > 0 && guard < 256; guard++) {
		const comp = queue.shift() as number;
		const rep = repOf.get(comp);
		if (rep === undefined) continue;
		const c = faceCentroid(patch, rep);
		if (!c) continue;
		for (const g of gens) {
			const hit = pickFace(patch, apply(g, c));
			if (!hit) continue;
			const got = patch.polyComp[hit.face];
			if (out.has(got)) continue;
			out.add(got);
			queue.push(got);
		}
	}
	return out;
}

/**
 * The site symmetry of a point: what, if anything, pins it in place.
 *
 * Under Wallpaper mode a vertex cannot move freely. One on a mirror may only slide along it, and one at
 * a rotation centre cannot move at all, because the edit is carried through the group and any other
 * displacement would break it. Returned as a description the inspector can say out loud, since a handle
 * that refuses to follow the cursor looks like a bug until it is named.
 */
export function siteSymmetry(
	patch: StudioPatch,
	sym: SymmetryData | null,
	at: Pt,
): { label: string; rotation: number; mirrors: Pt[] } {
	const tol = patch.medianEdge * 1e-3;
	let rotOrder = 1;
	const mirrors: Pt[] = [];
	if (!sym) return { label: "free", rotation: 1, mirrors };
	for (const c of sym.centers ?? []) {
		if (Math.hypot(c.z.x - at[0], c.z.y - at[1]) < tol && c.order > rotOrder) rotOrder = c.order;
	}
	for (const ax of sym.axes ?? []) {
		if (ax.kind !== "mirror") continue;
		const dx = at[0] - ax.p.x;
		const dy = at[1] - ax.p.y;
		const len = Math.hypot(ax.d.x, ax.d.y) || 1;
		if (Math.abs(dx * (ax.d.y / len) - dy * (ax.d.x / len)) < tol) mirrors.push([ax.d.x, ax.d.y]);
	}
	const label =
		rotOrder > 1 && mirrors.length > 0
			? `${rotOrder}mm`
			: rotOrder > 1
				? `${rotOrder}`
				: mirrors.length > 0
					? "m"
					: "free";
	return { label, rotation: rotOrder, mirrors };
}

/**
 * A displacement projected onto what the site symmetry allows.
 *
 * At a rotation centre nothing is allowed and the answer is zero. On one mirror the displacement keeps
 * only its component along that mirror. On two or more mirrors the intersection is a point, so again
 * zero. This is not a restriction bolted on: it is what "the edit keeps the group" means for a drag.
 */
export function projectToSite(
	delta: Pt,
	site: { rotation: number; mirrors: Pt[] },
): Pt {
	if (site.rotation > 1) return [0, 0];
	if (site.mirrors.length === 0) return delta;
	if (site.mirrors.length > 1) return [0, 0];
	const d = site.mirrors[0];
	const len = Math.hypot(d[0], d[1]) || 1;
	const ux = d[0] / len;
	const uy = d[1] / len;
	const t = delta[0] * ux + delta[1] * uy;
	return [t * ux, t * uy];
}
