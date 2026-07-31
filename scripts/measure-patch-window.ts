/**
 * The largest gap-free square inside a finite aperiodic patch. Run:
 *   pnpm tsx scripts/measure-patch-window.ts
 *
 * `components/patch-card.tsx` shows a window of a finite patch and lets the viewer pan inside it. Both
 * halves of that need a number nobody can eyeball: how far from the centre the patch is still solid.
 * Past that edge the substitution's ragged boundary appears, and on a slide whose claim is that a
 * tiling covers the plane, a gap reads as a rendering fault.
 *
 * Method: bucket every tile by its bounding box into a uniform grid, then walk outward from the
 * card's centre one ring at a time, sampling a lattice of points per ring and asking whether each
 * lies in some tile. The first ring with a miss ends it, and the answer is the previous ring. That
 * is a genuine largest-centred-square, not a binary search, because coverage is not monotone in the
 * half-width — a patch can be solid at radius r, holed at r+1 and solid again further out, and a
 * bisection would happily return the far side of a hole.
 *
 * SAMPLES_PER_UNIT is the resolution, so it bounds the size of hole this can miss. At 6/unit the
 * probe spacing is a sixth of an edge, comfortably finer than any tile here.
 */
import { hatPatch } from "@/lib/render/hatPatch";
import { penrosePatch } from "@/lib/render/penrosePatch";
import type { RawPolygon } from "@/lib/utils/renderTiling";

const SAMPLES_PER_UNIT = 6;
const RING_STEP = 0.25;
/**
 * Push every probe off the lattice. A point landing exactly on an edge shared by two tiles is inside
 * NEITHER under a strict ray-cast parity test, so an unjittered scan reports phantom holes wherever a
 * tile edge happens to sit at a round coordinate — which for the hat is most of them, and made the
 * first run of this script return a clean square of 5.5 for a window that renders solid at 18.
 */
const JITTER = 0.0013759;

type Poly = { v: { x: number; y: number }[]; minX: number; maxX: number; minY: number; maxY: number };

function index(polys: RawPolygon[], cell: number) {
	const buckets = new Map<string, Poly[]>();
	const key = (i: number, j: number) => `${i},${j}`;
	for (const p of polys) {
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
		const q: Poly = { v: p.vertices, minX, maxX, minY, maxY };
		for (let i = Math.floor(minX / cell); i <= Math.floor(maxX / cell); i++) {
			for (let j = Math.floor(minY / cell); j <= Math.floor(maxY / cell); j++) {
				const k = key(i, j);
				const b = buckets.get(k);
				if (b) b.push(q); else buckets.set(k, [q]);
			}
		}
	}
	return (x: number, y: number) => {
		const b = buckets.get(key(Math.floor(x / cell), Math.floor(y / cell)));
		if (!b) return false;
		for (const p of b) {
			if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
			let inside = false;
			const n = p.v.length;
			for (let i = 0, j = n - 1; i < n; j = i++) {
				const a = p.v[i], c = p.v[j];
				if (a.y > y !== c.y > y && x < ((c.x - a.x) * (y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
			}
			if (inside) return true;
		}
		return false;
	};
}

/** Largest half-width h such that the square [cx±h, cy±h] is fully covered. */
function cleanHalfWidth(polys: RawPolygon[], cx: number, cy: number, limit: number): number {
	const covered = index(polys, 2);
	let best = 0;
	for (let h = RING_STEP; h <= limit; h += RING_STEP) {
		const n = Math.max(8, Math.ceil(2 * h * SAMPLES_PER_UNIT));
		let ok = true;
		// the ring only: everything inside it was checked on a previous pass
		for (let i = 0; i <= n && ok; i++) {
			const t = -h + (2 * h * i) / n + JITTER;
			if (!covered(cx + t, cy - h + JITTER) || !covered(cx + t, cy + h + JITTER)) ok = false;
			if (!covered(cx - h + JITTER, cy + t) || !covered(cx + h + JITTER, cy + t)) ok = false;
		}
		if (!ok) break;
		best = h;
	}
	return best;
}

const CASES: { name: string; build: (n: number) => RawPolygon[]; levels: number[]; cx: number; cy: number }[] = [
	{ name: "penrose", build: penrosePatch, levels: [5, 6, 7], cx: 0, cy: 0 },
	{ name: "hat", build: hatPatch, levels: [4, 5, 6], cx: 11, cy: 2.57 },
];

for (const c of CASES) {
	for (const level of c.levels) {
		const polys = c.build(level);
		const h = cleanHalfWidth(polys, c.cx, c.cy, 400);
		console.log(
			`${c.name} ${level}: ${polys.length} tiles, centre (${c.cx}, ${c.cy}), ` +
				`clean half-width ${h.toFixed(2)} => square of side ${(2 * h).toFixed(2)}`,
		);
	}
}
