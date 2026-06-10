/**
 * Exact cell → float render model, carrying orbit ids. Floats come straight from the exact
 * vertices (`Cyclotomic.toVector()`), so the corner↔orbit correspondence is 1:1 by construction —
 * the figure pipeline never touches found_tilings.render_cell.
 */
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import type { SerializedCell } from '../../scripts/scoutCodec';
import { deserializeCell } from '../../scripts/scoutCodec';
import type { Rect, V2 } from '../ir/types';
import type { TilingOrbits } from './orbits';

export type CellPoly = {
	n: number;
	verts: V2[];
	/** orbit id per corner; -1 = not a tiling vertex (no marker). Parallel to `verts`. */
	orbitOfCorner: number[];
};

export type CellModel = {
	polys: CellPoly[];
	basis: [V2, V2];
	/** bbox of the base cell's polygons (model units). */
	bbox: Rect;
	/** max basis-vector length — the "cell diameter" used for window sizing. */
	cellDiam: number;
};

/**
 * Canonical display orientation: rotate so the SHORTEST lattice vector (float Gauss reduction)
 * lies along +x — solver cells come out in arbitrary orientations, which reads as noise in a
 * gallery. ROTATION ONLY, never reflection: chirality is type-distinguishing.
 */
function alignmentRotation(u: V2, v: V2): (p: V2) => V2 {
	let a = { ...u };
	let b = { ...v };
	const len2 = (w: V2) => w.x * w.x + w.y * w.y;
	if (len2(b) < len2(a)) [a, b] = [b, a];
	for (let i = 0; i < 32; i++) {
		const mu = Math.round((a.x * b.x + a.y * b.y) / len2(a));
		if (mu === 0) break;
		b = { x: b.x - mu * a.x, y: b.y - mu * a.y };
		if (len2(b) < len2(a)) [a, b] = [b, a];
	}
	const L = Math.hypot(a.x, a.y);
	const c = a.x / L;
	const s = a.y / L;
	return (p: V2): V2 => ({ x: c * p.x + s * p.y, y: -s * p.x + c * p.y });
}

export function buildCellModel(codec: SerializedCell, orbits: TilingOrbits): CellModel {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const cell = deserializeCell(ring, codec);
	if (cell.cellPolygons.length !== orbits.orbitOfCorner.length) {
		throw new Error('cellModel: orbit cache does not match cell polygon count — rebuild orbits.json');
	}
	const u0 = cell.basisExact[0].toVector();
	const v0 = cell.basisExact[1].toVector();
	const rot = alignmentRotation({ x: u0.x, y: u0.y }, { x: v0.x, y: v0.y });

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	const polys: CellPoly[] = cell.cellPolygons.map((p, pi) => {
		const verts = p.exactVertices!.map((vx) => {
			const w = vx.toVector();
			const v = rot({ x: w.x, y: w.y });
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
			return v;
		});
		const orbitOfCorner = orbits.orbitOfCorner[pi];
		if (orbitOfCorner.length !== verts.length) {
			throw new Error(`cellModel: poly ${pi} corner count mismatch — rebuild orbits.json`);
		}
		return { n: p.n, verts, orbitOfCorner };
	});
	const u = rot({ x: u0.x, y: u0.y });
	const v = rot({ x: v0.x, y: v0.y });
	return {
		polys,
		basis: [u, v],
		bbox: { minX, minY, maxX, maxY },
		cellDiam: Math.max(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y)),
	};
}
