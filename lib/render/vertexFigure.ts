// Naming and ordering a vertex figure: the tiles that meet at one vertex, put into the cyclic order
// you meet them walking around it, and named the way the literature names them ("3.4.6.4").
//
// The configuration alphabet ships its figures already placed around the vertex
// (public/vertex-configs/*.json) but writes its own ordering for the name ("6·4·3·4"), so the name a
// slide shows is recomputed here rather than taken from the file.

import type { RawPolygon } from "@/lib/utils/renderTiling";

// How close a corner must be to the vertex to count as sitting on it. Placed figures are stored
// rounded to five decimals, so exact comparison is not available; distinct corners of a unit-edge
// figure are at least half an edge apart, so 1e-4 is far from anything real.
const EPS = 1e-4;

export interface VertexFigure {
	/** The cyclic word, canonicalised: "3.4.6.4". */
	word: string;
	/** The tiles meeting at the vertex, in cyclic order. */
	polys: RawPolygon[];
}

/**
 * Lexicographically smallest rotation of `ns`, taken over both directions of travel. Walking a vertex
 * clockwise or anticlockwise has to produce the same name, and so does starting at a different tile.
 */
export function canonicalWord(ns: number[]): string {
	const best = (seq: number[]) => {
		let winner = seq;
		for (let r = 1; r < seq.length; r++) {
			const rot = seq.slice(r).concat(seq.slice(0, r));
			for (let i = 0; i < rot.length; i++) {
				if (rot[i] !== winner[i]) {
					if (rot[i] < winner[i]) winner = rot;
					break;
				}
			}
		}
		return winner;
	};
	const a = best(ns);
	const b = best([...ns].reverse());
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return (a[i] < b[i] ? a : b).join(".");
	}
	return a.join(".");
}

/** The direction a tile lies in as seen from one of its own corners: the bisector of the two edges
 *  meeting there. Bisecting rather than pointing at the centroid keeps the cyclic order right for
 *  tiles that are long, or non-convex away from this corner. */
function bisectorAngle(poly: RawPolygon, at: number): number {
	const v = poly.vertices;
	const prev = v[(at - 1 + v.length) % v.length];
	const next = v[(at + 1) % v.length];
	const here = v[at];
	const a1 = Math.atan2(prev.y - here.y, prev.x - here.x);
	const a2 = Math.atan2(next.y - here.y, next.x - here.x);
	// Bisect the interior angle: rotate from a2 toward a1 by half the positive turn between them.
	let turn = a1 - a2;
	while (turn < 0) turn += 2 * Math.PI;
	while (turn >= 2 * Math.PI) turn -= 2 * Math.PI;
	return a2 + turn / 2;
}

/**
 * Draw the figure a name describes: regular polygons fanned round the origin in the order given, each
 * with a corner on it, unit edges. Returns null unless the name is a list of polygon side counts whose
 * interior angles close a full turn.
 *
 * Building the figure from its name rather than reading it out of the alphabet file lets a slide draw
 * configurations no palette ships, including the ones that reach 360 degrees and then tile nothing:
 * 3.7.42 wants a 42-gon, which no tile alphabet in the atlas contains.
 */
export function figureFromWord(word: string): RawPolygon[] | null {
	const ns = word.split(".").map(Number);
	if (ns.length < 3 || ns.some((n) => !Number.isInteger(n) || n < 3)) return null;
	const total = ns.reduce((s, n) => s + ((n - 2) * 180) / n, 0);
	if (Math.abs(total - 360) > 1e-9) return null;

	const out: RawPolygon[] = [];
	let theta = 0; // direction of the current tile's first edge out of the vertex
	for (const n of ns) {
		// Walk the boundary counterclockwise from the origin, turning by the exterior angle each step.
		// The tile then occupies exactly the sector from theta to theta + its interior angle.
		const vertices = [{ x: 0, y: 0 }];
		let x = 0;
		let y = 0;
		let dir = theta;
		for (let i = 0; i < n - 1; i++) {
			x += Math.cos(dir);
			y += Math.sin(dir);
			vertices.push({ x, y });
			dir += (2 * Math.PI) / n;
		}
		out.push({ n, vertices });
		theta += Math.PI - (2 * Math.PI) / n;
	}
	return out;
}

/**
 * The figure made by tiles already placed around a vertex at the origin: sorted into cyclic order and
 * named. Returns null if any tile has no corner at the origin, which would mean the caller handed us
 * something that is not a vertex figure.
 */
export function figureFromPlacedPolys(polys: RawPolygon[]): VertexFigure | null {
	const around: { poly: RawPolygon; angle: number }[] = [];
	for (const p of polys) {
		const at = p.vertices.findIndex((v) => Math.abs(v.x) < EPS && Math.abs(v.y) < EPS);
		if (at < 0) return null;
		around.push({ poly: p, angle: bisectorAngle(p, at) });
	}
	if (around.length === 0) return null;
	around.sort((a, b) => a.angle - b.angle);
	return {
		word: canonicalWord(around.map((a) => a.poly.n)),
		polys: around.map((a) => a.poly),
	};
}
