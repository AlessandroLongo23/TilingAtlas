// Placing two vertex figures at the two ends of one edge — the picture behind the word "compatible".
//
// The relation itself is decided elsewhere (`VertexConfiguration.isCompatible`, precomputed into
// lib/defense/vcCompatibility.ts). This is only the geometry a slide needs to SHOW a compatible pair,
// and it is separate from the component that draws it so that tests/vertex-join.test.ts can check the
// placement against that relation instead of against my eyes.

import { figureFromWord } from "@/lib/render/vertexFigure";
import type { RawPolygon } from "@/lib/utils/renderTiling";

export interface VertexJoin {
	/** The first configuration's tiles, vertex at the origin. */
	a: RawPolygon[];
	/** The second's, minus the two it shares with the first: those are already in `a`. */
	b: RawPolygon[];
	/** Indices into `a` of the two tiles either side of the shared edge. */
	shared: [number, number];
	/** The two vertices: the origin, and a unit step along the shared edge. */
	ends: [[number, number], [number, number]];
}

export interface JoinAttempt {
	a: RawPolygon[];
	/** The second configuration's tiles, minus any the first already has in the same place. */
	b: RawPolygon[];
	/** Indices into `a` of the tiles the second one agrees about. Two of them means it fits. */
	shared: number[];
	/**
	 * Where a tile the second one brings lands on top of one the first already has, as the overlapping
	 * region itself. Empty exactly when the pair is compatible: both figures close 360° around their
	 * own vertex, so each side of the shared edge is covered from both ends, and two DIFFERENT tiles
	 * covering the same side must overlap.
	 */
	clashes: { x: number; y: number }[][];
	ends: [[number, number], [number, number]];
}

const TAU = 2 * Math.PI;
/** Unit-edge tiles, so anything this small is a rounding artefact and not a real overlap. */
const EPS = 1e-7;

function centroid(p: RawPolygon): [number, number] {
	const n = p.vertices.length;
	return [p.vertices.reduce((s, v) => s + v.x, 0) / n, p.vertices.reduce((s, v) => s + v.y, 0) / n];
}

/**
 * Do two convex polygons share interior area? Separating-axis: if some edge normal of either one
 * separates the projections, they do not. Touching along an edge or at a corner is not an overlap,
 * which is exactly what the tolerance buys — two tiles of a tiling always touch.
 */
function overlaps(p: RawPolygon, q: RawPolygon): boolean {
	for (const poly of [p, q]) {
		const v = poly.vertices;
		for (let i = 0; i < v.length; i++) {
			const w = v[(i + 1) % v.length];
			const nx = -(w.y - v[i].y);
			const ny = w.x - v[i].x;
			const len = Math.hypot(nx, ny) || 1;
			const project = (r: RawPolygon) => {
				let lo = Infinity, hi = -Infinity;
				for (const u of r.vertices) {
					const t = (u.x * nx + u.y * ny) / len;
					if (t < lo) lo = t;
					if (t > hi) hi = t;
				}
				return [lo, hi] as const;
			};
			const [alo, ahi] = project(p);
			const [blo, bhi] = project(q);
			if (ahi - blo < EPS || bhi - alo < EPS) return false;
		}
	}
	return true;
}

function transform(polys: RawPolygon[], rot: number, dx: number, dy: number): RawPolygon[] {
	const c = Math.cos(rot), s = Math.sin(rot);
	return polys.map((p) => ({
		n: p.n,
		vertices: p.vertices.map((v) => ({ x: c * v.x - s * v.y + dx, y: s * v.x + c * v.y + dy })),
	}));
}

function rotated<T>(xs: readonly T[], k: number): T[] {
	return xs.slice(k).concat(xs.slice(0, k));
}

/** Anticlockwise, so the half-plane test in the clipper knows which side is inside. */
function anticlockwise(p: RawPolygon): { x: number; y: number }[] {
	const v = p.vertices;
	let area = 0;
	for (let i = 0; i < v.length; i++) {
		const w = v[(i + 1) % v.length];
		area += v[i].x * w.y - w.x * v[i].y;
	}
	return area < 0 ? [...v].reverse() : [...v];
}

/**
 * The region two convex tiles have in common, by Sutherland–Hodgman: clip one against each edge of
 * the other. Convexity is what makes this three lines instead of a polygon-boolean library, and every
 * tile here is a regular polygon.
 */
function intersectConvex(p: RawPolygon, q: RawPolygon): { x: number; y: number }[] {
	let out = anticlockwise(p);
	const clip = anticlockwise(q);
	for (let i = 0; i < clip.length && out.length; i++) {
		const a = clip[i], b = clip[(i + 1) % clip.length];
		const side = (u: { x: number; y: number }) => (b.x - a.x) * (u.y - a.y) - (b.y - a.y) * (u.x - a.x);
		const cut = (u: { x: number; y: number }, w: { x: number; y: number }) => {
			const su = side(u), sw = side(w);
			const t = su / (su - sw);
			return { x: u.x + t * (w.x - u.x), y: u.y + t * (w.y - u.y) };
		};
		const input = out;
		out = [];
		for (let j = 0; j < input.length; j++) {
			const cur = input[j], prev = input[(j - 1 + input.length) % input.length];
			const inCur = side(cur) >= -EPS, inPrev = side(prev) >= -EPS;
			if (inCur) {
				if (!inPrev) out.push(cut(prev, cur));
				out.push(cur);
			} else if (inPrev) out.push(cut(prev, cur));
		}
	}
	return out;
}

/** The tiles either side of each edge leaving the vertex, as ordered pairs (clockwise side first). */
export function edgePairs(word: string): [number, number][] {
	const ns = word.split(".").map(Number);
	return ns.map((n, i) => [ns[(i - 1 + ns.length) % ns.length], n] as [number, number]);
}

/**
 * Put `wordB`'s figure at the far end of one of `wordA`'s edges, in the best way there is: fewest
 * tiles landing on top of each other, then most tiles agreed on. For a compatible pair that is a
 * clean join, and for an incompatible one it is the picture of WHY — the closest the two get, with
 * the tiles that collide, and the region they collide over.
 *
 * `figureFromWord` fans the tiles anticlockwise from the origin with tile 0's first edge along angle
 * 0, so the ray at angle theta_i separates tile i-1, on its clockwise side, from tile i on its
 * anticlockwise side. Step a unit along that ray and look back: clockwise and anticlockwise have
 * swapped, so a rotation of B's word that begins with tile i-1 and ends with tile i, turned to face
 * back down the edge, agrees about both tiles beside it — a regular n-gon is fixed by one edge and a
 * side, so the two fans produce the same tile in the same place, and B's copy is dropped. Every OTHER
 * rotation is tried as well, and those are the near misses the failing case is drawn from.
 *
 * The reversed word is tried too. Mirror images carry one name here, as they do everywhere else in
 * the deck, so a pair that meets only through a reflection still meets.
 */
export function attemptJoin(wordA: string, wordB: string): JoinAttempt | null {
	const polysA = figureFromWord(wordA);
	if (!polysA) return null;
	const nsA = wordA.split(".").map(Number);
	const nsB = wordB.split(".").map(Number);

	// Ray i leaves the vertex at the sum of the interior angles of tiles 0..i-1.
	const rayAngle = (i: number) => nsA.slice(0, i).reduce((t, n) => t + Math.PI - TAU / n, 0);
	const same = (u: RawPolygon, v: RawPolygon) => {
		const [ux, uy] = centroid(u), [vx, vy] = centroid(v);
		return u.n === v.n && Math.hypot(ux - vx, uy - vy) < 1e-6;
	};

	let best: JoinAttempt | null = null;
	let bestScore = [Infinity, -Infinity];

	for (let i = 0; i < nsA.length; i++) {
		const phi = rayAngle(i);
		for (const candidate of [nsB, [...nsB].reverse()]) {
			for (let p = 0; p < candidate.length; p++) {
				const fanB = figureFromWord(rotated(candidate, p).join("."));
				if (!fanB) continue;
				const placed = transform(fanB, phi + Math.PI, Math.cos(phi), Math.sin(phi));

				// Which of B's tiles are A's tiles: same shape in the same place.
				const sharedA: number[] = [];
				const sharedB = new Set<number>();
				for (let x = 0; x < polysA.length; x++)
					for (let y = 0; y < placed.length; y++)
						if (same(polysA[x], placed[y])) {
							sharedA.push(x);
							sharedB.add(y);
						}

				const rest = placed.filter((_, y) => !sharedB.has(y));
				const clashes: { x: number; y: number }[][] = [];
				for (const q of rest)
					for (const r of polysA)
						if (overlaps(q, r)) {
							const region = intersectConvex(q, r);
							if (region.length >= 3) clashes.push(region);
						}

				// Fewest clashes wins, then most tiles agreed on. Ties keep the placement found first,
				// so a pair that fits is drawn the same way it always was.
				const score = [clashes.length, sharedA.length];
				if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
					bestScore = score;
					best = {
						a: polysA,
						b: rest,
						shared: sharedA,
						clashes,
						ends: [
							[0, 0],
							[Math.cos(phi), Math.sin(phi)],
						],
					};
				}
			}
		}
	}
	return best;
}

/** The strict form: the placement, only when it is a real join. Null is the answer "these never meet". */
export function joinFigures(wordA: string, wordB: string): VertexJoin | null {
	const attempt = attemptJoin(wordA, wordB);
	if (!attempt || attempt.clashes.length || attempt.shared.length !== 2) return null;
	return { ...attempt, shared: [attempt.shared[0], attempt.shared[1]] };
}
