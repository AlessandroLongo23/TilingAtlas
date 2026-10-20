// A tiler's certificate from polyform_census (`tilers` mode, one JSON line per tiler) as the page's
// record: the outline and the tiling. The same conversion as tools/heesch/build_data.py's tilings() and
// outline(), so the sizes whose tilers are computed in the browser look exactly like the shipped ones;
// engine.test.ts holds the two to each other.

import GRIDS from "./grids.json";
import type { HeeschGridId, HeeschShape } from "./data";

/** polyform_census's certificate: the cells, the lattice (A, 0), (B, C), and the copies of one period,
 *  as cell maps (`k`, squares) or as the images of the cells (`q`, the other grids). */
export interface Certificate {
	c: number[];
	l: [number, number, number];
	k?: number[];
	q?: number[][];
}

type Pt = [number, number];
type GridDef = { den: number; period: number[][]; page: number[][]; cells: { at: number[]; verts: number[][] }[] };
const def = (g: HeeschGridId) => GRIDS[g] as GridDef;

/** polyform_census's cell to the page's: on the triangle grid x = 2a + t is the cell (3a + t, 3y + t). */
function nativeCell(g: HeeschGridId, x: number, y: number): Pt {
	if (g !== "iamond") return [x, y];
	return [3 * Math.floor(x / 2) + (x & 1), 3 * y + (x & 1)];
}

/** A cell's corners, from the grid's table of cells per translation class. */
function corners(g: HeeschGridId, p: Pt): Pt[] {
	const { den, period, cells } = def(g);
	const [[ax, ay], [bx, by]] = period;
	const det = ax * by - ay * bx;
	const u = Math.floor((p[0] * by - p[1] * bx) / det),
		v = Math.floor((ax * p[1] - ay * p[0]) / det);
	const kx = p[0] - u * ax - v * bx,
		ky = p[1] - u * ay - v * by;
	const cell = cells.find((c) => c.at[0] === kx && c.at[1] === ky);
	if (!cell) throw new Error(`no cell at (${p})`);
	return cell.verts.map(([x, y]) => [p[0] + x / den, p[1] + y / den]);
}

const key = (p: Pt) => `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
const keyOrder = (a: string, b: string) => {
	const [ax, ay] = a.split(",").map(Number),
		[bx, by] = b.split(",").map(Number);
	return ax - bx || ay - by;
};

/** The tile's boundary, counter-clockwise, straight corners dropped, in units of 1/den: interior edges
 *  cancel against their reverse, and where the tile touches itself at a corner the sharpest right turn
 *  keeps the loop on its lobe. */
export function outline(g: HeeschGridId, cells: Pt[]): number[] {
	const at = new Map<string, Pt>();
	const edges = new Set<string>();
	const pairs: [string, string][] = [];
	for (const cell of cells) {
		const vs = corners(g, cell);
		const ks = vs.map(key);
		vs.forEach((v, i) => at.set(ks[i], v));
		ks.forEach((k, i) => {
			const e: [string, string] = [k, ks[(i + 1) % ks.length]];
			if (edges.has(e.join("|"))) return;
			edges.add(e.join("|"));
			pairs.push(e);
		});
	}
	const exits = new Map<string, string[]>();
	for (const [a, b] of pairs) if (!edges.has(`${b}|${a}`)) exits.set(a, [...(exits.get(a) ?? []), b]);
	const start = [...exits.keys()].sort(keyOrder)[0];
	const turn = (a: Pt, b: Pt, c: Pt) => {
		const t = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
		return (((t + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	};
	const loop = [start];
	let prev = "",
		cur = start;
	for (;;) {
		const out = exits.get(cur)!;
		const next =
			out.length === 1
				? out[0]
				: out.reduce((m, q) =>
						turn(at.get(prev)!, at.get(cur)!, at.get(q)!) < turn(at.get(prev)!, at.get(cur)!, at.get(m)!) ? q : m,
					);
		out.splice(out.indexOf(next), 1);
		if (next === start && [...exits.values()].every((o) => !o.length)) break;
		loop.push(next);
		prev = cur;
		cur = next;
	}
	const ring = loop.map((k) => at.get(k)!);
	const n = ring.length;
	const keep = ring.filter((q, i) => {
		const a = ring[(i - 1 + n) % n],
			b = ring[(i + 1) % n];
		return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > 1e-9;
	});
	const { den } = def(g);
	const exact = (c: number) =>
		Math.abs(c * den - Math.round(c * den)) < 1e-6 ? Math.round(c * den) : Math.round(c * den * 1e5) / 1e5;
	return keep.flatMap((q) => [exact(q[0]), exact(q[1])]);
}

/** The integer map (x, y) -> (ax + by + c, dx + ey + f) taking the cells src to dst, read off three that
 *  are not on a line. On a line the rotation carrying it onto its image, measured on the page; a single
 *  cell is a translate, or a half-turn when `half` (a triangle pointing the other way). */
function affine(g: HeeschGridId, src: Pt[], dst: Pt[], half: boolean): number[] {
	const [p0, q0] = [src[0], dst[0]];
	for (let i = 1; i < src.length; i++)
		for (let j = i + 1; j < src.length; j++) {
			const [ux, uy, vx, vy] = [src[i][0] - p0[0], src[i][1] - p0[1], src[j][0] - p0[0], src[j][1] - p0[1]];
			const det = ux * vy - uy * vx;
			if (Math.abs(det) < 1e-9) continue;
			const [ex, ey, fx, fy] = [dst[i][0] - q0[0], dst[i][1] - q0[1], dst[j][0] - q0[0], dst[j][1] - q0[1]];
			const a = (ex * vy - fx * uy) / det,
				b = (fx * ux - ex * vx) / det;
			const d = (ey * vy - fy * uy) / det,
				e = (fy * ux - ey * vx) / det;
			return [a, b, q0[0] - a * p0[0] - b * p0[1], d, e, q0[1] - d * p0[0] - e * p0[1]].map((x) => Math.round(x) || 0); // || 0: no -0, which JSON cannot hold
		}
	const [[pa, pb], [pc, pd]] = def(g).page;
	const geo = (p: Pt): Pt => [pa * p[0] + pb * p[1], pc * p[0] + pd * p[1]];
	const dist = (p: Pt) => Math.hypot(geo(p)[0] - geo(p0)[0], geo(p)[1] - geo(p0)[1]);
	const far = src.reduce((m, _, i) => (dist(src[i]) > dist(src[m]) ? i : m), 0);
	let tr = half ? -1 : 1,
		ti = 0;
	if (far) {
		const [sx, sy] = [geo(src[far])[0] - geo(p0)[0], geo(src[far])[1] - geo(p0)[1]];
		const [dx, dy] = [geo(dst[far])[0] - geo(q0)[0], geo(dst[far])[1] - geo(q0)[1]];
		const n = sx * sx + sy * sy;
		[tr, ti] = [(dx * sx + dy * sy) / n, (dy * sx - dx * sy) / n];
	}
	const det = pa * pd - pb * pc;
	const back = (z: Pt): Pt => [(pd * z[0] - pb * z[1]) / det, (pa * z[1] - pc * z[0]) / det];
	const turned = (p: Pt): Pt => {
		const [x, y] = geo(p);
		return back([tr * x - ti * y, ti * x + tr * y]);
	};
	const [a, d] = turned([1, 0]);
	const [b, e] = turned([0, 1]);
	return [a, b, q0[0] - a * p0[0] - b * p0[1], d, e, q0[1] - d * p0[0] - e * p0[1]].map((x) => Math.round(x) || 0); // || 0: no -0, which JSON cannot hold
}

/** One certificate as the page's tiler record. */
export function tilerRecord(g: HeeschGridId, cert: Certificate): HeeschShape {
	const cells: Pt[] = [];
	for (let i = 0; i < cert.c.length; i += 2) cells.push([cert.c[i], cert.c[i + 1]]);
	const base = cells.map(([x, y]) => nativeCell(g, x, y));
	const maps =
		g === "omino"
			? cert.k!
			: cert.q!.flatMap((q) => {
					const copy: Pt[] = [];
					for (let i = 0; i < q.length; i += 2) copy.push(nativeCell(g, q[i], q[i + 1]));
					return affine(g, base, copy, g === "iamond" && Math.abs(q[0] - cert.c[0]) % 2 === 1);
				});
	// The shortest basis of the lattice (Lagrange, measured on the page), so a patch comes out round.
	const [A, B, C] = cert.l;
	let u: Pt = g === "iamond" ? [Math.floor((3 * A) / 2), 0] : nativeCell(g, A, 0);
	let v: Pt = g === "iamond" ? [Math.floor((3 * B) / 2), 3 * C] : nativeCell(g, B, C);
	const [[pa, pb], [pc, pd]] = def(g).page;
	const dot = (p: Pt, q: Pt) =>
		(pa * p[0] + pb * p[1]) * (pa * q[0] + pb * q[1]) + (pc * p[0] + pd * p[1]) * (pc * q[0] + pd * q[1]);
	for (;;) {
		if (dot(u, u) > dot(v, v)) [u, v] = [v, u];
		const mu = dot(u, v) / dot(u, u);
		if (Math.abs(mu) <= 0.5 + 1e-9) break;
		// Halves to even, as Python's round() does in build_data.py: same basis as the shipped records.
		const r = Math.round(mu);
		const m = Math.abs(mu % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
		v = [v[0] - m * u[0], v[1] - m * u[1]];
	}
	return { grid: g, cells: cells.length, o: outline(g, base), p: { l: [...u, ...v], k: maps } };
}
