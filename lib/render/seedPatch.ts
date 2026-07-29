// The seed of a k-uniform tiling: a finite patch holding one vertex of each orbit, cut out of the
// tiling itself.
//
// This is what the symmetry-first method (/defense, "Architecture one") starts from — the patch whose
// construction points the seventeen fundamental domains were fitted against — and the atlas ships no
// such artifact, only the fundamental cell and the exact source the orbit partition is derived from.
// So the seed is reconstructed here from those two.
//
// The result is returned as a synthetic TranslationalCellData, not a polygon list. That is the
// whole trick: buildCellMesh, buildOrbitDotMesh and the rest of the preview pipeline take a cell, so
// handing them a cell whose polygons happen not to tile it draws the seed through the existing path,
// with its polygon points, orbit dots and symmetry overlays all landing in one world frame. The
// caller is responsible for asking the renderer for a single copy (FlatDrawParams.single) — a seed
// laid out on its lattice would just be the tiling again.

import {
	expandToViewport,
	parseBaseCell,
	type RawPolygon,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";

/**
 * Lattice radius of the window the seed is cut from: 5×5 cells. Not arbitrary — orbitsFromExactSource
 * builds its position→orbit map over a ±3-cell block, so ±2 is the largest window every vertex of
 * which is guaranteed to have an answer.
 */
export const SEED_WINDOW_RADIUS = 2;

/** Same quantum orbitsFromExactSource keys on: edges are unit length, so 1e-4 separates every
 *  distinct vertex with a wide margin while absorbing the drift of a lattice translation. */
const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

const centroidOf = (poly: RawPolygon) => {
	let x = 0, y = 0;
	for (const v of poly.vertices) { x += v.x; y += v.y; }
	return { x: x / poly.vertices.length, y: y / poly.vertices.length };
};

/**
 * Pick the candidate nearest `ax, ay`, breaking ties on (x, then y).
 *
 * The tie-break is not decoration: a vertex orbit of a symmetric tiling routinely puts several of its
 * vertices at exactly the same distance from the anchor, and without an order the seed would depend
 * on the iteration order of a Map — which would make the slide's picture change between builds.
 */
function nearest(cands: readonly { x: number; y: number }[], ax: number, ay: number) {
	let best = cands[0];
	let bestD = Infinity;
	for (const p of cands) {
		const d = (p.x - ax) ** 2 + (p.y - ay) ** 2;
		if (d < bestD - 1e-9) { best = p; bestD = d; continue; }
		if (d > bestD + 1e-9) continue;
		if (p.x < best.x - 1e-9 || (Math.abs(p.x - best.x) <= 1e-9 && p.y < best.y)) best = p;
	}
	return best;
}

/**
 * One vertex figure per orbit, as a cell.
 *
 * Orbit 0's representative is the vertex nearest the cell's centre, and each subsequent orbit takes the
 * vertex of that orbit nearest the centroid of the representatives already chosen — so the k figures
 * come out as one clump, not scattered across the window. It is a heuristic: this is *a* valid
 * one-vertex-per-orbit seed, not the one the search would have started from.
 *
 * Returns null when the cell cannot be parsed or no vertex of the patch has an orbit (a tiling with no
 * usable exact source); the caller then draws the plain tiling.
 */
export function seedFromCell(
	cell: TranslationalCellData,
	orbits: OrbitData,
): TranslationalCellData | null {
	const base = parseBaseCell(cell);
	if (!base) return null;

	const cx = (base.minX + base.maxX) / 2;
	const cy = (base.minY + base.maxY) / 2;
	// expandToViewport culls against a viewport box; a box this large culls nothing, leaving the plain
	// (2·r+1)² replication the radius asks for.
	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const reach =
		(SEED_WINDOW_RADIUS + 1) * (Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)) +
		Math.max(base.maxX - base.minX, base.maxY - base.minY);
	const patch = expandToViewport(base, cx, cy, reach, reach, SEED_WINDOW_RADIUS);

	// Every distinct vertex of the patch, grouped by orbit. Vertices the partition does not know
	// (orbitAt = −1) are dropped, not pooled: they are positions the exact cell never produced.
	const byOrbit = new Map<number, { x: number; y: number }[]>();
	const seenVertex = new Set<string>();
	for (const poly of patch) {
		for (const v of poly.vertices) {
			const k = key(v.x, v.y);
			if (seenVertex.has(k)) continue;
			seenVertex.add(k);
			const o = orbits.orbitAt(v.x, v.y);
			if (o < 0) continue;
			const bucket = byOrbit.get(o);
			if (bucket) bucket.push(v);
			else byOrbit.set(o, [v]);
		}
	}
	if (byOrbit.size === 0) return null;

	const reps: { x: number; y: number }[] = [];
	let ax = cx, ay = cy;
	for (const id of [...byOrbit.keys()].sort((a, b) => a - b)) {
		const rep = nearest(byOrbit.get(id)!, ax, ay);
		reps.push(rep);
		ax = reps.reduce((s, p) => s + p.x, 0) / reps.length;
		ay = reps.reduce((s, p) => s + p.y, 0) / reps.length;
	}

	// The vertex figures: every patch polygon touching a representative. Deduplicated by centroid,
	// since a cell whose polygons straddle its boundary emits the same tile from two replicas.
	const repKeys = new Set(reps.map((r) => key(r.x, r.y)));
	const seenPoly = new Set<string>();
	const seed: RawPolygon[] = [];
	for (const poly of patch) {
		if (!poly.vertices.some((v) => repKeys.has(key(v.x, v.y)))) continue;
		const c = centroidOf(poly);
		const pk = key(c.x, c.y);
		if (seenPoly.has(pk)) continue;
		seenPoly.add(pk);
		seed.push(poly);
	}
	if (seed.length === 0) return null;

	// `n`, `star` and `hue` ride along so the seed's tiles keep the colours they have in the atlas.
	return {
		p: seed.map((poly) => ({ v: poly.vertices, n: poly.n, star: poly.star, hue: poly.hue })),
		b: [[v1x, v1y], [v2x, v2y]],
	};
}
