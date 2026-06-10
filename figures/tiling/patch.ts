/**
 * Lattice replication for figures — metadata-carrying port of the ring-growth in
 * lib/utils/renderTiling.ts:expandToViewport (the web reference implementation stays untouched).
 * Emits every lattice copy of the cell whose bbox intersects the window; since the cell copies
 * tile the plane, their union covers the window fully — the hard trim is the emitters' clip.
 */
import type { Rect, V2 } from '../ir/types';
import type { CellModel, CellPoly } from './cellModel';

export type PlacedPoly = CellPoly & {
	cellIndex: number;
	ij: [number, number];
};

export function replicate(model: CellModel, window: Rect, maxRadius = 200): PlacedPoly[] {
	const { basis, bbox, polys } = model;
	const [u, v] = basis;
	const out: PlacedPoly[] = [];

	const cellInWindow = (i: number, j: number): boolean => {
		const ox = i * u.x + j * v.x;
		const oy = i * u.y + j * v.y;
		return (
			bbox.maxX + ox >= window.minX &&
			bbox.minX + ox <= window.maxX &&
			bbox.maxY + oy >= window.minY &&
			bbox.minY + oy <= window.maxY
		);
	};

	const emit = (i: number, j: number): void => {
		const ox = i * u.x + j * v.x;
		const oy = i * u.y + j * v.y;
		polys.forEach((p, cellIndex) => {
			out.push({
				n: p.n,
				verts: p.verts.map((pt): V2 => ({ x: pt.x + ox, y: pt.y + oy })),
				orbitOfCorner: p.orbitOfCorner,
				cellIndex,
				ij: [i, j],
			});
		});
	};

	if (cellInWindow(0, 0)) emit(0, 0);
	for (let r = 1; r <= maxRadius; r++) {
		let added = 0;
		for (let i = -r; i <= r; i++) {
			for (let j = -r; j <= r; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
				if (cellInWindow(i, j)) {
					emit(i, j);
					added++;
				}
			}
		}
		if (added === 0) break;
	}
	return out;
}
