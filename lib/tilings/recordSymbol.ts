// The Delaney-Dress symbol behind a catalogue record, for the symmetry controls (orbifoldMorph.ts): the
// Tegula shelf ships its own; any other flat periodic tiling has it computed from its period cell
// (dsymFromMap.ts). Null for everything else (aperiodic patches, decorations, curved surfaces), and for a
// cell that does not close into a map. Cached per record: /play and its Options tab both ask.

import type { DSymbol } from "@/lib/classes/algorithm/delaney/DSymbol";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { hasCurvedTiles, surfaceOf } from "@/lib/services/shelfRegistry";
import { minimalBlocks } from "@/lib/classes/algorithm/delaney/DSymbol";
import { cellMap, type DrawnMap, drawnLabels } from "@/lib/tilings/dsymFromMap";
import { geometryOf, parseTegulaSymbol, type RecordShape } from "@/lib/tilings/orbifoldMorph";
import { polygonFillHue, starApexAngleDeg, starHue } from "@/lib/utils/renderTiling";

const cache = new Map<string, DSymbol | null>();
// A flat record's drawn map and each of its chambers' chamber in the symbol, for recordShape.
const drawn = new Map<string, { map: DrawnMap; block: number[] }>();

export function recordSymbol(t: CatalogueTiling | null | undefined): DSymbol | null {
	if (!t) return null;
	const hit = cache.get(t.canonicalKey);
	if (hit !== undefined) return hit;
	let sym: DSymbol | null = null;
	if (t.dsym) sym = parseTegulaSymbol(t.dsym);
	else if (surfaceOf(t) === "flat" && !hasCurvedTiles(t) && t.renderCell) {
		const map = cellMap(t.renderCell);
		const m = map && minimalBlocks(map.sym, drawnLabels(map));
		if (map && m && geometryOf(m.sym) === 0) {
			sym = m.sym;
			drawn.set(t.canonicalKey, { map, block: m.block });
		}
	}
	cache.set(t.canonicalKey, sym);
	return sym;
}

/** Tegula types are coloured by symmetry class; every other shelf by side count, and so are its morphs. */
export const morphHues = (t: CatalogueTiling | null | undefined): "class" | "sides" => (t?.dsym ? "class" : "sides");

const shapes = new Map<string, RecordShape | null>();

/**
 * What the topology does not hold, per chamber of the record's symbol: the points along each edge where
 * only two tiles meet (a star's dent, the 12-gon corner it fits), as (t, h) from the chamber's vertex in
 * edge lengths, h toward its tile; and the tile's colour and star as the record draws them. The morph puts
 * both back, so a star stays a star in another geometry. Null for a Tegula type and anything unshaped.
 */
export function recordShape(t: CatalogueTiling | null | undefined): RecordShape | null {
	if (!t || t.dsym) return null;
	const hit = shapes.get(t.canonicalKey);
	if (hit !== undefined) return hit;
	const sym = recordSymbol(t);
	const d = drawn.get(t.canonicalKey);
	let shape: RecordShape | null = null;
	if (sym && d?.map.at) {
		const at = d.map.at;
		const map = d.map;
		const first = new Array<number>(sym.n).fill(-1);
		d.block.forEach((y, x) => {
			if (first[y] < 0) first[y] = x;
		});
		shape = { bends: [], tiles: [], corner: [], turns: [], segs: [] };
		// The angle swept from direction a to direction b on the tile's side of a (its left when `left`).
		const sweep = (a: number[], b: number[], left: boolean) => {
			const t = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
			const ccw = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
			return left ? ccw : 2 * Math.PI - ccw;
		};
		const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1]];
		for (let y = 0; y < sym.n; y++) {
			const x = first[y];
			const { v, path, left, face } = at[x];
			const w = at[x ^ 1].v; // the edge's far end: chambers 2s and 2s + 1 share the side
			const dx = w[0] - v[0];
			const dy = w[1] - v[1];
			const l2 = dx * dx + dy * dy;
			shape.bends.push(
				path.map(([px, py]) => {
					const ex = px - v[0];
					const ey = py - v[1];
					return [(ex * dx + ey * dy) / l2, ((dx * ey - dy * ex) / l2) * (left ? 1 : -1)];
				}),
			);
			// The drawing's own angles and lengths along this side, from the chamber's vertex.
			const line = [v, ...path, w];
			const next = d.map.sym.s[1][x]; // the tile's other side at this vertex
			const other = at[next].path[0] ?? at[next ^ 1].v;
			shape.corner.push(sweep(sub(line[1], v), sub(other, v), left));
			shape.turns.push(path.map((p, j) => sweep(sub(line[j + 2], p), sub(line[j], p), left)));
			shape.segs.push(line.slice(1).map((p, j) => Math.hypot(p[0] - line[j][0], p[1] - line[j][1])));
			const poly = map.sources![face];
			const vs = (poly.vertices ?? poly.v ?? []).map((q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : q));
			const star = poly.star ? { points: poly.n ?? vs.length / 2, apex: starApexAngleDeg(vs) } : undefined;
			shape.tiles.push({
				hue: poly.hue ?? (star ? starHue(star.points, star.apex) : polygonFillHue(vs)),
				star,
			});
		}
	}
	shapes.set(t.canonicalKey, shape);
	return shape;
}
