// Frames: regions a polyform tiles in exactly two ways, with no tile in the same place in both; and,
// in the same lists, the regions with three or more tilings that carry such a pair.
//
// A census, like /heesch's: every free polyform of a size on a grid (a "set"), each with every frame
// of at most N tiles a tiling, N the same for the whole set. tools/frames/census.py runs the search
// (frames.cpp, the FrameFinder debt search made grid-generic) and build_data.py packs and re-audits
// it. Shapes and copies are in the /heesch formats, so lib/heesch/data.ts draws both.
//
// The search builds two tilings at once with no tile in common, and stops when they close up: so it
// finds every MINIMAL disjoint pair, a pair no smaller closed pair sits inside. A frame is the region
// of such a pair when it has no other tiling. A second run (frames.cpp -tilings 3 …) keeps the regions
// that have other tilings too, with their count, to its own N; the page lists those tilings itself
// (allTilings), so the files carry only the pair, as they do for frames.

import { cellSides, copyCells, copyPolygons, tileCells, type HeeschGridId, type Polyform } from "@/lib/heesch/data";
import type { RawPolygon } from "@/lib/utils/renderTiling";
import { shardBody } from "@/lib/services/atlasCodec";

export interface FrameShape extends Polyform {
	cells: number;
	/** Frames of the shape, and how many have each number of tiles a tiling (index = tiles). */
	f: number;
	byN: number[];
	/** byN split by Frame.m: byM[n][m], m < 8. Within a number of tiles the regions run by m in M_ORDER. */
	byM: number[][];
	/** The tile's orientations as solver maps, six numbers each (for listing a region's tilings). */
	or?: number[];
}

/** The order of Frame.m values within a number of tiles: each choice of hidden kinds is one run. */
export const M_ORDER = [0, 4, 6, 7, 5];

export interface Frame {
	/** Tiles a tiling. */
	n: number;
	/** Hole sizes, in cells. */
	h: number[];
	/** How the two tilings cut each other: [cells shared, pairs of tiles sharing that many]. */
	p: [number, number][];
	/** The kinds of symmetry of the region that join all its tilings into one class (tilingClasses):
	 *  bit 1 reflections, bit 2 rotations, bit 4 both. On a frame: its pair are mirror images, rotated. */
	m: number;
	/** The region's tilings in all, when past two (absent on a frame). */
	c?: number;
	/** The two tilings: six numbers a copy, the cell map (x, y) → (ax + by + c, dx + ey + f). */
	t: [number[], number[]];
}

export interface FrameSetInfo {
	id: string;
	grid: HeeschGridId;
	cells: number;
	/** Every frame with at most N tiles a tiling is in the set, and every region with three or more
	 *  tilings and at most N3 (null where that run has not reached the set). */
	N: number;
	N3: number | null;
	count: number;
	/** Shapes with at least one region. */
	framed: number;
	/** Frames, and regions in all (frames and those with more tilings). */
	frames: number;
	regions: number;
	/** Regions whose tilings are one class by reflections, by rotations, by either (Frame.m). */
	mirror: number;
	rotated: number;
	either: number;
	byN: number[];
	/** Frames a file, per shape. */
	shard: number;
}

const cache = new Map<string, Promise<unknown>>();
function load<T>(file: string): Promise<T | null> {
	const url = `/frames/${file}.json.gz`;
	let p = cache.get(url) as Promise<T | null> | undefined;
	if (!p) {
		p = fetch(url)
			.then((res) => (res.ok ? (shardBody(res) as Promise<T>) : null))
			.catch(() => null);
		cache.set(url, p);
	}
	return p;
}

export const loadFramesIndex = () => load<{ sets: FrameSetInfo[] }>("index");
export const loadFrameSet = (id: string) =>
	load<{ grid: HeeschGridId; period?: number[] | null; shapes: Omit<FrameShape, "grid">[] }>(id).then((d) =>
		d ? { period: d.period ?? null, shapes: d.shapes.map((s) => ({ ...s, grid: d.grid })) } : null,
	);
/** One file of a shape's frames. */
export const loadFrames = (id: string, shape: number, shard: number) =>
	load<{ frames: Frame[] }>(`${id}-${shape}-${shard}`).then((d) => d?.frames ?? null);

/** Most tilings the page lists for one region; the census's largest so far is a few hundred. */
const TILINGS_CAP = 2000;

/**
 * Every tiling of a frame's region by copies of the tile, as cell maps: the stored pair first, then
 * the rest. Exact cover on the region's cells, always covering the lowest uncovered one: a copy covers
 * it with some cell p of some orientation O, which fixes the translation, and that must be a lattice
 * step. `orient` and `period` (the lattice's two steps, flattened) come from the census.
 */
export function allTilings(s: FrameShape, f: Frame, period: number[]): number[][] {
	const orient = s.or;
	if (!orient) return [f.t[0], f.t[1]];
	const pts = tileCells(s).map((c) => c.at);
	const place = (m: number[], [x, y]: [number, number]): [number, number] => [
		m[0] * x + m[1] * y + m[2],
		m[3] * x + m[4] * y + m[5],
	];
	const key = ([x, y]: [number, number]) => `${x},${y}`;
	const copyKey = (m: number[]) =>
		pts
			.map((p) => key(place(m, p)))
			.sort()
			.join(" ");
	const tilingKey = (maps: number[]) => {
		const ks = [];
		for (let i = 0; i < maps.length; i += 6) ks.push(copyKey(maps.slice(i, i + 6)));
		return ks.sort().join("|");
	};
	const region: [number, number][] = [];
	for (let i = 0; i < f.t[0].length; i += 6) for (const p of pts) region.push(place(f.t[0].slice(i, i + 6), p));
	region.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
	const inRegion = new Set(region.map(key));
	const [v0x, v0y, v1x, v1y] = period;
	const det = v0x * v1y - v1x * v0y;
	const isStep = (dx: number, dy: number) => (dx * v1y - v1x * dy) % det === 0 && (v0x * dy - v0y * dx) % det === 0;
	const covered = new Set<string>();
	const maps: number[] = [];
	const out: number[][] = [];
	const go = (from: number) => {
		if (out.length >= TILINGS_CAP) return;
		let i = from;
		while (i < region.length && covered.has(key(region[i]))) i++;
		if (i === region.length) return void out.push(maps.slice());
		const [qx, qy] = region[i];
		for (let o = 0; o < orient.length; o += 6) {
			const O = orient.slice(o, o + 6);
			for (const p of pts) {
				const [ox, oy] = place(O, p);
				const dx = qx - ox,
					dy = qy - oy;
				if (!isStep(dx, dy)) continue;
				const m = [O[0], O[1], O[2] + dx, O[3], O[4], O[5] + dy];
				const cells = pts.map((c) => key(place(m, c)));
				if (cells.some((c) => !inRegion.has(c) || covered.has(c))) continue;
				for (const c of cells) covered.add(c);
				maps.push(...m);
				go(i + 1);
				maps.length -= 6;
				for (const c of cells) covered.delete(c);
			}
		}
	};
	go(0);
	const pair = new Set([tilingKey(f.t[0]), tilingKey(f.t[1])]);
	return [f.t[0], f.t[1], ...out.filter((t) => !pair.has(tilingKey(t)))];
}

/** How a frame is drawn; a region with more tilings is always drawn as all of them ("all"). */
/** Which kinds of symmetry of a region join its tilings: reflections, rotations. */
export type Hide = { mirror: boolean; rotated: boolean };

/** Whether a region is hidden: its tilings are one class under the hidden kinds (Frame.m's bits). */
export const hides = (h: Hide, m: number) => (h.mirror && h.rotated ? m & 4 : h.mirror ? m & 1 : h.rotated ? m & 2 : 0);

/** A set's regions left after hiding: the index's per-kind counts are the same bits `hides` reads. */
export const shownRegions = (s: FrameSetInfo, h: Hide) =>
	s.regions - (h.mirror && h.rotated ? s.either : h.mirror ? s.mirror : h.rotated ? s.rotated : 0);

/** What the hidden kinds are called in a sentence. */
export const hiddenKinds = (h: Hide) => (h.mirror && h.rotated ? "symmetry" : h.mirror ? "mirror images" : "rotation");

/**
 * One tiling a class: tilings are joined when a symmetry of the region of a hidden kind maps one onto
 * the other, and joined tilings chain (tools/frames/build_data.py classes() is the same rule, and sets
 * Frame.m from it). Symmetries are found on cell centroids: one fixes the region's centroid and takes a
 * cell farthest from it to another, so each farthest cell tried as the image of one of them, by a
 * rotation and by a reflection, tries every candidate.
 */
export function tilingClasses(s: Polyform, tilings: number[][], h: Hide): number[][] {
	if (!h.mirror && !h.rotated) return tilings;
	// Rounded, and + 0 so a -0 from a symmetry keys as 0.
	const key = (x: number, y: number) => `${Math.round(x * 1e5) + 0},${Math.round(y * 1e5) + 0}`;
	const centroid = (ring: { x: number; y: number }[]) => ({
		x: ring.reduce((t, v) => t + v.x, 0) / ring.length,
		y: ring.reduce((t, v) => t + v.y, 0) / ring.length,
	});
	// A tiling as its tiles, each the sorted keys of its cells' centroids.
	const rings = copyCells(s, tilings[0]).flat();
	const tiles = tilings.map((t) => copyCells(s, t).map((cells) => cells.map(centroid)));
	const tileKey = (pts: { x: number; y: number }[]) =>
		pts
			.map((p) => key(p.x, p.y))
			.sort()
			.join(" ");
	const tilingKey = (ts: { x: number; y: number }[][]) => ts.map(tileKey).sort().join("|");
	const region = tiles[0].flat();
	const cx = region.reduce((t, p) => t + p.x, 0) / region.length,
		cy = region.reduce((t, p) => t + p.y, 0) / region.length;
	const dist = region.map((p) => Math.hypot(p.x - cx, p.y - cy));
	const far = region.filter((_, i) => dist[i] > Math.max(...dist) - 1e-7);
	const px = far[0].x - cx,
		py = far[0].y - cy;
	const maps: number[][] = [];
	for (const q of far) {
		const qx = q.x - cx,
			qy = q.y - cy;
		let [ux, uy] = Math.hypot(px + qx, py + qy) > 1e-9 ? [px + qx, py + qy] : [-py, px];
		const n = Math.hypot(ux, uy);
		ux /= n;
		uy /= n;
		const th = Math.atan2(qy, qx) - Math.atan2(py, px);
		if (h.mirror) maps.push([2 * ux * ux - 1, 2 * ux * uy, 2 * ux * uy, 2 * uy * uy - 1]);
		if (h.rotated && q !== far[0]) maps.push([Math.cos(th), -Math.sin(th), Math.sin(th), Math.cos(th)]);
	}
	const move = ([a, b, c, d]: number[], p: { x: number; y: number }) => ({
		x: cx + a * (p.x - cx) + b * (p.y - cy),
		y: cy + c * (p.x - cx) + d * (p.y - cy),
	});
	// A symmetry of the cells, not only of their centroids: on some grids (drafters) a reflection takes
	// centroids onto centroids and cells onto other shapes.
	const cellKey = (ring: { x: number; y: number }[]) =>
		ring
			.map((v) => key(v.x, v.y))
			.sort()
			.join(" ");
	const cellKeys = new Set(rings.map(cellKey));
	const syms = maps.filter((g) => rings.every((r) => cellKeys.has(cellKey(r.map((v) => move(g, v))))));
	const index = new Map(tiles.map((t, i) => [tilingKey(t), i]));
	const parent = tilings.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	tiles.forEach((t, i) => {
		for (const g of syms) {
			const j = index.get(tilingKey(t.map((tile) => tile.map((p) => move(g, p)))));
			if (j !== undefined) parent[find(i)] = find(j);
		}
	});
	// The first tiling of each class, so the stored pair leads.
	const seen = new Set<number>();
	return tilings.filter((_, i) => !seen.has(find(i)) && !!seen.add(find(i)));
}

export type FrameView = "side" | "overlay" | "all";

/** Segments [x0, y0, x1, y1, …] moved by (dx, dy). */
const shiftSegs = (segs: number[], dx: number, dy = 0) => segs.map((v, i) => v + (i % 2 ? dy : dx));

/** A frame as the page draws it: the patch canvas's polygons, and what the overlay canvas strokes. */
export interface FrameDrawing {
	/** The tilings, one hue per orientation of the tile across all of them. */
	polys: RawPolygon[];
	/** Tiling 2's edges in the overlaid view, dashed. */
	lines: number[];
	/** The empty region, first: its cells to fill, its boundary, the sides between cells. */
	empty: { cells: { x: number; y: number }[][]; outer: number[]; inner: number[] } | null;
	/** The sides between the cells of each drawn tile. */
	seams: number[];
}

/**
 * A frame laid out in reading order: the empty region, then its tilings. Side by side shows the pair,
 * overlaid shows tiling 1 filled with tiling 2's edges over it, and "all" every tiling in `tilings`, in
 * rows. The empty region is drawn by the overlay canvas, not the patch renderer, which outlines every
 * polygon at one weight and so cannot draw a region whose cells read as one piece.
 */
export function frameDrawing(s: Polyform, tilings: number[][], view: FrameView): FrameDrawing {
	const hueOf = new Map<string, number>();
	const shown = view === "all" ? tilings : view === "side" ? tilings.slice(0, 2) : tilings.slice(0, 1);
	const polys = shown.map((t) => copyPolygons(s, t, hueOf));
	let minx = Infinity,
		maxx = -Infinity,
		miny = Infinity,
		maxy = -Infinity;
	for (const p of polys[0])
		for (const v of p.vertices) {
			minx = Math.min(minx, v.x);
			maxx = Math.max(maxx, v.x);
			miny = Math.min(miny, v.y);
			maxy = Math.max(maxy, v.y);
		}
	const gap = Math.max(1, 0.2 * Math.max(maxx - minx, maxy - miny));
	const stepX = maxx - minx + gap,
		stepY = maxy - miny + gap;
	// Panel 0 is the empty region; tiling i is panel i + 1.
	const panels = shown.length + 1;
	const cols = view === "all" ? Math.ceil(Math.sqrt(panels * 1.5)) : panels;
	// Page y points up, so a row below is a step down.
	const at = (k: number) => ({ dx: (k % cols) * stepX, dy: -Math.floor(k / cols) * stepY });
	const move = (ps: RawPolygon[], { dx, dy }: { dx: number; dy: number }) =>
		ps.map((p) => ({ ...p, vertices: p.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })) }));
	const region = copyCells(s, tilings[0]).flat();
	const seams = shown.flatMap((t, i) => {
		const { dx, dy } = at(i + 1);
		return shiftSegs(
			copyCells(s, t).flatMap((c) => cellSides(c).inner),
			dx,
			dy,
		);
	});
	const lines =
		view === "overlay"
			? shiftSegs(
					copyPolygons(s, tilings[1]).flatMap((p) =>
						p.vertices.flatMap((a, i) => {
							const b = p.vertices[(i + 1) % p.vertices.length];
							return [a.x, a.y, b.x, b.y];
						}),
					),
					at(1).dx,
					at(1).dy,
				)
			: [];
	return {
		polys: polys.flatMap((ps, i) => move(ps, at(i + 1))),
		lines,
		empty: { cells: region, ...cellSides(region) },
		seams,
	};
}

/** A frame's silhouette for the picker: tiling 1's copies, which fill the region. */
export const frameRings = (s: Polyform, f: Frame) => copyPolygons(s, f.t[0]).map((p) => p.vertices);

/** The tile alone, where a shape has no frame to draw. */
export const tilePolygons = (s: Polyform) => copyPolygons(s, [1, 0, 0, 0, 1, 0]);
