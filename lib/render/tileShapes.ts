// The shapes of an edge system's tiles, in the plane and in the disk: the faces merge across undrawn edges
// into tiles, and congruent tiles (mirror images included) are one shape. Read off the darts: union the faces
// across undrawn gaps, walk each tile's boundary, and develop that walk (on the hyperboloid, or in the plane)
// until it closes (a finite tile, its boundary that word repeated) or does not (an infinite one, known by its
// period). Two tiles have one shape when their boundary words agree up to turning and mirroring, so the key
// does not depend on the tiling the tile came from: a board's runs and shelves can give a shape one colour
// throughout (ShapeRanks).

import type { FreedrawPatch } from "@/lib/freedraw/pattern";
import { interiorAngle, type Darts } from "@/lib/render/hyperbolicDevelopClient";

/** The plane's hue for shape class i (lib/freedraw/render.ts orbitColour), so a class reads alike in both. */
export const shapeClassHue = (i: number) => (34 + i * 137.508) % 360;

/** A board's shapes in colour order: shape id -> its rank, the commonest first (rankShapes). */
export type ShapeRanks = ReadonlyMap<string, number>;

type M = number[];
const mul = (a: M, b: M): M =>
	[0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]));
const hypStep = (l: number): M => [Math.cosh(l), 0, Math.sinh(l), 0, 1, 0, Math.sinh(l), 0, Math.cosh(l)];
const flatStep = (l: number): M => [1, 0, l, 0, 1, 0, 0, 0, 1];
const turn = (a: number): M => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
// the walk runs on rounded letters (below), so a closed boundary misses by up to its length times the rounding;
// an open one (a strip's) is off by at least a side
const isIdentity = (m: M) => m.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 0.05 * Math.max(1, Math.abs(v)));

/** The least turn of `w` and of its mirror (each letter an edge and the corner after it), as a string. */
function canonical(w: { l: string; a: string }[]): string {
	const n = w.length;
	// mirrored, the walk runs the edges backwards and each ends at the corner before it
	const back = w.map((_, k) => ({ l: w[n - 1 - k].l, a: w[(2 * n - 2 - k) % n].a }));
	let best = "";
	for (const v of [w, back])
		for (let s = 0; s < n; s++) {
			const key = Array.from({ length: n }, (_, k) => `${v[(s + k) % n].l}/${v[(s + k) % n].a}`).join(" ");
			if (!best || key < best) best = key;
		}
	return best;
}

/** The shortest word that `w` repeats. */
function root<T>(w: T[], same: (x: T, y: T) => boolean): T[] {
	const p = Array.from({ length: w.length }, (_, i) => i + 1).find(
		(q) => w.length % q === 0 && w.every((x, i) => same(x, w[i % q])),
	)!;
	return w.slice(0, p);
}

/** A short id for a shape key (two 32-bit FNV-1a hashes), what a board's table stores. */
export function shapeId(key: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let i = 0; i < key.length; i++) {
		const c = key.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193) >>> 0;
		b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
	}
	return a.toString(36) + b.toString(36);
}

/**
 * Per dart, the id of its tile's shape ("" on a digon). The corner at h (between h and rneig[h]) has the record's `alpha`, or
 * the regular polygon's angle at `edge`; in the plane (`flat`) it must be given. Between two faces' corners at
 * a vertex lies one edge, or a digon's two sides; it is drawn by its `drawn` flag where the record has them
 * (typed sides, the Schwarz boards' digon on every edge), else by the digon in it.
 */
export function dartShapeIds(darts: Darts, edge: number, flat = false): string[] {
	const { rneig, glue, lvert } = darts;
	const n = rneig.length;
	const alpha = (h: number) => (darts.alpha ? darts.alpha[h] : interiorAngle(lvert[rneig[h]], edge));
	const len = (h: number) => (darts.elen ? darts.elen[h] : edge);
	const step = flat ? flatStep : hypStep;
	const digon = (h: number) => lvert[rneig[h]] === 2;
	// after face corner g: the dart it leaves along, the next face corner round the vertex, and whether drawn
	const gap = (g: number) => {
		const r = rneig[g];
		const d = digon(r);
		return { r, next: d ? rneig[r] : r, drawn: darts.drawn ? darts.drawn[r] === 1 : d };
	};
	// faces, as the walk has them: the orbits of h -> glue[rneig[h]]
	const face = new Int32Array(n).fill(-1);
	let faces = 0;
	for (let h0 = 0; h0 < n; h0++)
		if (face[h0] < 0) for (let h = h0, f = faces++; face[h] < 0; h = glue[rneig[h]]) face[h] = f;
	// tiles: faces joined across every undrawn gap
	const up = Array.from({ length: faces }, (_, i) => i);
	const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
	for (let g = 0; g < n; g++) {
		const x = digon(g) ? null : gap(g);
		if (x && !x.drawn) up[find(face[g])] = find(face[x.next]);
	}
	// each tile's boundary: a drawn gap, along it, then round the far vertex through the tile's corners to the next.
	// Letters are rounded well above the noise of a shipped patch (1e-6) and away from the values tilings have:
	// a corner to 0.01° (120° is 2.0943951 rad, which noise flips at the fifth decimal), a side to 1e-4
	const deg = (x: number) => ((x * 180) / Math.PI).toFixed(2);
	const q = (x: number) => x.toFixed(4);
	const keys = new Map<number, string[]>();
	const seen = new Uint8Array(n);
	for (let g0 = 0; g0 < n; g0++) {
		const x0 = digon(g0) ? null : gap(g0);
		if (!x0?.drawn || seen[x0.r]) continue;
		const word: { l: string; a: string }[] = [];
		let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
		for (let r = x0.r, guard = 0; !seen[r] && guard < n; guard++) {
			seen[r] = 1;
			let g = glue[r];
			let a = 0;
			let out = r;
			for (let i = 0; i < n; i++) {
				a += alpha(g);
				const x = gap(g);
				if (x.drawn) {
					out = x.r;
					break;
				}
				g = x.next;
			}
			const letter = { l: q(len(r)), a: deg(a) };
			word.push(letter);
			m = mul(mul(m, step(Number(letter.l))), turn(Math.PI - (Number(letter.a) * Math.PI) / 180));
			r = out;
		}
		// a finite tile closes after some turns of its quotient word; an infinite one never does
		let p = m;
		let times = 0;
		for (let s = 1; s <= 64 && p.every((v) => Math.abs(v) < 1e12); s++, p = mul(p, m))
			if (isIdentity(p)) {
				times = s;
				break;
			}
		const key = times
			? canonical(Array.from({ length: times }, () => word).flat())
			: `inf ${canonical(root(word, (x, y) => x.l === y.l && x.a === y.a))}`;
		const tile = find(face[g0]);
		keys.set(tile, [...(keys.get(tile) ?? []), key]);
	}
	const idOf = new Map<number, string>();
	// a digon's darts belong to no tile: ""
	return Array.from({ length: n }, (_, h) => {
		if (digon(h)) return "";
		const tile = find(face[h]);
		if (!idOf.has(tile)) idOf.set(tile, shapeId([...(keys.get(tile) ?? ["plane"])].sort().join(";")));
		return idOf.get(tile)!;
	});
}

const patchIds = new WeakMap<FreedrawPatch, string[]>();
/**
 * Per component of a plane patch, the id of its tile's shape: the patch read as darts (a half-edge per corner
 * side, every ring turned anticlockwise, the rotation round a vertex taken from its rings) and given to
 * dartShapeIds, so a plane tile and a disk tile are keyed by one rule.
 */
export function patchShapeIds(patch: FreedrawPatch): string[] {
	const hit = patchIds.get(patch);
	if (hit) return hit;
	const { verts, T1, T2 } = patch;
	const at = (vi: number, ox: number, oy: number) => [
		verts[vi][0] + ox * T1[0] + oy * T2[0],
		verts[vi][1] + ox * T1[1] + oy * T2[1],
	];
	const drawnEdge = new Map<string, boolean>();
	for (const [a, b, dx, dy, d] of patch.edges) {
		drawnEdge.set(`${a}>${b}@${dx},${dy}`, d === 1);
		drawnEdge.set(`${b}>${a}@${-dx},${-dy}`, d === 1);
	}
	// a half-edge: from vertex vi to vertex wi, the lattice step between them
	const index = new Map<string, number>();
	const dart = (key: string) => index.get(key) ?? (index.set(key, index.size), index.size - 1);
	const rneig: number[] = [];
	const alpha: number[] = [];
	const elen: number[] = [];
	const dartOfPoly: number[] = [];
	const twin: [number, string][] = [];
	patch.polys.forEach((ring0) => {
		const pts0 = ring0.map(([vi, ox, oy]) => at(vi, ox, oy));
		const area = pts0.reduce(
			(t, p, i) => t + p[0] * pts0[(i + 1) % pts0.length][1] - pts0[(i + 1) % pts0.length][0] * p[1],
			0,
		);
		const ring = area < 0 ? [...ring0].reverse() : ring0;
		const pts = area < 0 ? [...pts0].reverse() : pts0;
		const n = ring.length;
		const half = (i: number, j: number) => {
			const [vi, ox, oy] = ring[i];
			const [wi, wx, wy] = ring[j];
			return `${vi}>${wi}@${wx - ox},${wy - oy}`;
		};
		for (let j = 0; j < n; j++) {
			const [prev, next] = [(j + n - 1) % n, (j + 1) % n];
			// anticlockwise ring: the corner at j runs from the side back to j-1 round to the side on to j+1
			const g = dart(half(j, prev));
			const r = dart(half(j, next));
			rneig[g] = r;
			const u = [pts[prev][0] - pts[j][0], pts[prev][1] - pts[j][1]];
			const v = [pts[next][0] - pts[j][0], pts[next][1] - pts[j][1]];
			const ang = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
			alpha[g] = ang < 0 ? -ang : 2 * Math.PI - ang;
			elen[r] = Math.hypot(v[0], v[1]);
			if (j === 0) dartOfPoly.push(g);
			twin.push([r, half(next, j)]);
		}
	});
	const n = index.size;
	const glue = new Array<number>(n).fill(-1);
	for (const [r, back] of twin) glue[r] = index.get(back) ?? -1;
	const drawn = [...index.keys()].map((k) => (drawnEdge.get(k) ? 1 : 0));
	const ok = glue.every((g) => g >= 0) && rneig.length === n && !rneig.includes(undefined as unknown as number);
	const ids = ok
		? dartShapeIds({ rneig, glue, lvert: new Array(n).fill(3), seed: 0, alpha, elen, drawn }, 1, true)
		: null;
	const comp = new Array<string>(patch.compRank.length).fill("");
	patch.polys.forEach((_, pi) => {
		if (!comp[patch.polyComp[pi]]) comp[patch.polyComp[pi]] = ids ? ids[dartOfPoly[pi]] : `c${patch.polyComp[pi]}`;
	});
	patchIds.set(patch, comp);
	return comp;
}

/**
 * Colour classes for shape ids: by the board's ranks where it has them (a shape the table lacks takes one of
 * the later hues by its id, so it too is the same wherever it falls), else numbered as they first appear.
 */
export function shapeClasses(ids: string[], ranks?: ShapeRanks): number[] {
	if (ranks) {
		const spill = (id: string) => ranks.size + (parseInt(id.slice(0, 6), 36) % 61);
		return ids.map((id) => ranks.get(id) ?? spill(id));
	}
	const seen = new Map<string, number>();
	return ids.map((id) => seen.get(id) ?? (seen.set(id, seen.size), seen.size - 1));
}

/** A board's table from the shape ids of some of its tilings: the shapes in most tilings first, ties by first sight. */
export function rankShapes(tilings: Iterable<string[]>): Map<string, number> {
	const count = new Map<string, number>();
	for (const ids of tilings) for (const id of new Set(ids)) if (id) count.set(id, (count.get(id) ?? 0) + 1);
	const first = new Map([...count.keys()].map((id, i) => [id, i]));
	const order = [...count.keys()].sort((x, y) => count.get(y)! - count.get(x)! || first.get(x)! - first.get(y)!);
	return new Map(order.map((id, i) => [id, i]));
}
