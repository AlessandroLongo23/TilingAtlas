// Shared vocabulary for the four squared-torus stages, mirroring stage-shared.ts one genus up.
//
// The join between stages is again an EDGE, but of the QUOTIENT map: one edge of the torus graph is
// many parallel edges of the plane tiling, so hovering it lights up every copy at once. That is the
// thing worth seeing, because it is exactly what "quotient by the lattice" means.

import type { TorusMap } from "@/lib/squaring/torusMap";
import type { TorusSquaring } from "@/lib/squaring/torusSquaring";

/** One drawn copy of a quotient edge, in plane coordinates. */
export interface PatchSegment {
	a: [number, number];
	b: [number, number];
	edge: number;
}

/** One drawn copy of a tile. */
export interface PatchFace {
	points: [number, number][];
	face: number;
}

export interface Patch {
	faces: PatchFace[];
	segments: PatchSegment[];
	/** The corners of one translation cell, for outlining it. */
	cell: [number, number][];
	bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * The tiling drawn over a block of lattice translates.
 *
 * Each edge is emitted once per copy, using the dart the quotient calls positive, so a shared side is
 * not stroked twice at slightly different opacities.
 */
export function buildPatch(map: TorusMap, radius: number): Patch {
	const [a1, a2] = map.basis;
	const faces: PatchFace[] = [];
	const segments: PatchSegment[] = [];
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (let i = -radius; i <= radius; i++) {
		for (let j = -radius; j <= radius; j++) {
			const ox = i * a1[0] + j * a2[0];
			const oy = i * a1[1] + j * a2[1];
			for (let f = 0; f < map.polygons.length; f++) {
				const poly = map.polygons[f];
				const pts = poly.map((p) => [p[0] + ox, p[1] + oy] as [number, number]);
				faces.push({ points: pts, face: f });
				for (const p of pts) {
					minX = Math.min(minX, p[0]);
					maxX = Math.max(maxX, p[0]);
					minY = Math.min(minY, p[1]);
					maxY = Math.max(maxY, p[1]);
				}
				for (let k = 0; k < pts.length; k++) {
					const dart = map.faces[f][k];
					if (map.signOf[dart] !== 1) continue;
					segments.push({ a: pts[k], b: pts[(k + 1) % pts.length], edge: map.edgeOf[dart] });
				}
			}
		}
	}
	const cell: [number, number][] = [
		[0, 0],
		[a1[0], a1[1]],
		[a1[0] + a2[0], a1[1] + a2[1]],
		[a2[0], a2[1]],
	];
	return { faces, segments, cell, bounds: { minX, maxX, minY, maxY } };
}

/** Map plane coordinates into a square viewBox, preserving aspect. */
export function viewFit(
	bounds: { minX: number; maxX: number; minY: number; maxY: number },
	size: number,
	margin: number,
): (p: readonly [number, number]) => [number, number] {
	const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
	const scale = (size - 2 * margin) / span;
	const cx = (bounds.minX + bounds.maxX) / 2;
	const cy = (bounds.minY + bounds.maxY) / 2;
	// SVG's y axis points down; flip so the tiling is not drawn upside down relative to the maths.
	return (p) => [size / 2 + (p[0] - cx) * scale, size / 2 - (p[1] - cy) * scale];
}

/**
 * A colour per quotient edge, keyed on the SIZE of the square it becomes.
 *
 * Keying on size and not on edge index is what makes stages 3 and 4 legible together: two tiles the
 * same size are the same colour, so a squaring that looks perfect but is not gives itself away as a
 * repeated hue before you have compared any numbers.
 */
export function torusFills(squaring: TorusSquaring, edges: number, hueSpan = 300): string[] {
	const sizes = [...new Set(squaring.squares.map((s) => s.side))].sort((a, b) => Number(a) - Number(b));
	const rank = new Map(sizes.map((s, i) => [s, i]));
	const out = new Array<string>(edges).fill("var(--color-line)");
	for (const s of squaring.squares) {
		const t = sizes.length > 1 ? (rank.get(s.side) as number) / (sizes.length - 1) : 0.5;
		out[s.edge] = `hsl(${(hueSpan * (1 - t)).toFixed(1)}, 62%, 55%)`;
	}
	return out;
}

/** Sides and coordinates are exact integers shipped as strings; at these sizes a double holds them. */
export const num = (s: string): number => Number(s);
