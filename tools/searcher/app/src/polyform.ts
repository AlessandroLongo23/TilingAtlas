// Polyforms on any grid of a triangle reflection group: the square, triangle and hexagon grids, the regular
// {p,q} grids of the hyperbolic plane and the sphere, and Schwarz triangle grids such as (2,3,7).
//
// Marek grows a polyform by editing its boundary angle word. A word only sees its own neighbourhood, so two arms
// that meet far apart, a hole, or a boundary that crosses itself all pass unnoticed. Here a polyform is a set of
// cells, each named exactly, and the word is read off the boundary at the end: cells cannot overlap, and a hole
// shows up as a boundary of more than one loop.
//
// The grid is the triangle with angles π/m[0], π/m[1], π/m[2] (m[r] at the corner across from side r) reflected
// in its sides; a cell is the triangles that the sides listed in `cell` reflect into one another (none: the
// triangle itself). Triangle w (a word in the reflections 0, 1, 2) is named by w⁻¹·ρ in the dual of the Tits
// representation, where W acts simply transitively on chambers, so equal names are equal triangles. Crossing
// side s of w gives ws, named s·(w⁻¹ρ): one reflection applied to the name. The coordinates are in ℤ[ζ_N]
// (2cos(π/m) = ζ^{N/2m} + ζ^{-N/2m}), exact integers, so nothing depends on rounding.
import { isUnitLength, printLength, readLength, type Angle, type Board, type Face } from "./board";
import { angleOf, cyclotomic, faceOfCorners, nextPrefix, withMadeFace, type Pt } from "./freeface";

export type GridSpec = { m: [number, number, number]; cell: number[] };

/** The {p,q} grid: p-gons, q at a vertex. Side 2 of the triangle lies on a cell's side, the cell's centre is
 *  across from it, its corner across from side 1. */
export const regularGrid = (p: number, q: number): GridSpec => ({ m: [2, q, p], cell: [0, 1] });

export type Geometry = "plane" | "hyperbolic" | "sphere";
export const geometryOf = (s: GridSpec): Geometry => {
	const t = s.m.reduce((a, m) => a + 1 / m, 0);
	return Math.abs(t - 1) < 1e-12 ? "plane" : t > 1 ? "sphere" : "hyperbolic";
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const LIMIT = 2 ** 52;

/** The triangles met so far, each with its name, parity (even triangles run their sides 0→1→2 anticlockwise),
 *  its three neighbours (−1 until met) and its cell. */
export class Grid {
	readonly d: number;
	private readonly phi: number[];
	private readonly mul: number[][][][] = [];
	readonly par: number[] = [];
	readonly nb: number[][] = [];
	readonly cellOfTri: number[] = [];
	readonly cells: number[][] = [];
	private readonly cellNb: number[][] = [];
	private readonly name: number[][][] = [];
	private readonly at = new Map<string, number>();
	private readonly inCell: boolean[];

	constructor(readonly spec: GridSpec) {
		const N = spec.m.reduce((a, m) => (a * 2 * m) / gcd(a, 2 * m), 1);
		this.phi = cyclotomic(N);
		this.d = this.phi.length - 1;
		this.inCell = [0, 1, 2].map((s) => spec.cell.includes(s));
		for (let s = 0; s < 3; s++) {
			this.mul.push([]);
			for (let t = 0; t < 3; t++) {
				const m = spec.m[3 - s - t];
				if (s === t || m === 2) {
					this.mul[s].push([]);
					continue;
				}
				// −2cos(π/m) as a polynomial in ζ; column j of the matrix is ζ^j times it, reduced
				const c = Array<number>(N).fill(0);
				c[N / (2 * m)] -= 1;
				c[N - N / (2 * m)] -= 1;
				const cols = Array.from({ length: this.d }, (_, j) => this.reduce([...Array<number>(j).fill(0), ...c]));
				this.mul[s].push(Array.from({ length: this.d }, (_, i) => cols.map((col) => col[i])));
			}
		}
		const one = [1, ...Array<number>(this.d - 1).fill(0)];
		this.triangle([one, one, one], 0);
	}

	private reduce(p: number[]): number[] {
		const { d, phi } = this;
		for (let i = p.length - 1; i >= d; i--) {
			const c = p[i];
			if (c) for (let j = 0; j <= d; j++) p[i - d + j] -= c * phi[j];
		}
		return p.slice(0, d).concat(Array<number>(Math.max(0, d - p.length)).fill(0));
	}

	private triangle(f: number[][], par: number): number {
		const key = f.map((v) => v.join(",")).join("|");
		let id = this.at.get(key);
		if (id === undefined) {
			id = this.par.length;
			this.at.set(key, id);
			this.name.push(f);
			this.par.push(par);
			this.nb.push([-1, -1, -1]);
			this.cellOfTri.push(-1);
		}
		return id;
	}

	/** The triangle across side s of triangle t. */
	move(t: number, s: number): number {
		const known = this.nb[t][s];
		if (known >= 0) return known;
		const f = this.name[t];
		const g = f.map((v, u) => {
			if (u === s) return v.map((x) => -x);
			const M = this.mul[s][u];
			if (!M.length) return v; // perpendicular sides (or none): reflection s leaves coordinate u alone
			return v.map((x, i) => {
				let y = x;
				for (let j = 0; j < this.d; j++) y -= M[i][j] * f[s][j];
				if (Math.abs(y) > LIMIT) throw new Error("polyform too large to name exactly");
				return y;
			});
		});
		const n = this.triangle(g, 1 - this.par[t]);
		this.nb[t][s] = n;
		this.nb[n][s] = t;
		return n;
	}

	/** The cell holding triangle t: its triangles are those the cell's sides reflect t into. */
	cell(t: number): number {
		if (this.cellOfTri[t] >= 0) return this.cellOfTri[t];
		const id = this.cells.length;
		const tris = [t];
		this.cellOfTri[t] = id;
		for (let i = 0; i < tris.length; i++)
			for (const s of this.spec.cell) {
				const u = this.move(tris[i], s);
				if (this.cellOfTri[u] < 0) ((this.cellOfTri[u] = id), tris.push(u));
			}
		this.cells.push(tris);
		return id;
	}

	/** The vertex at the end of side e of triangle t, of type r: the least triangle round it, with the type. */
	vertex(t: number, e: number, r: number): number {
		let [x, y] = [3 - e - r, e];
		let [w, least] = [t, t];
		for (let i = 0; i < 2 * this.spec.m[r]; i++)
			((w = this.move(w, x)), ([x, y] = [y, x]), (least = Math.min(least, w)));
		return least * 3 + r;
	}

	/** The cells sharing a side with cell c. */
	neighbours(c: number): number[] {
		let out = this.cellNb[c];
		if (!out) {
			const seen = new Set<number>();
			for (const t of this.cells[c])
				for (let s = 0; s < 3; s++) if (!this.inCell[s]) seen.add(this.cell(this.move(t, s)));
			this.cellNb[c] = out = [...seen];
		}
		return out;
	}
}

/** A boundary step: side e of triangle t, then the corner where it ends, of type r (across from side r), with k
 *  of the polyform's triangles round it. */
type Step = { t: number; e: number; r: number; k: number };

/** The polyform's boundary as loops, each anticlockwise (the polyform on the left). One loop: a disk. */
function boundary(g: Grid, tris: number[], inP: (t: number) => boolean): Step[][] {
	const open = new Set<number>();
	for (const t of tris) for (let s = 0; s < 3; s++) if (!inP(g.move(t, s))) open.add(t * 3 + s);
	const loops: Step[][] = [];
	for (const first of open) {
		const loop: Step[] = [];
		let [t, e] = [Math.floor(first / 3), first % 3];
		while (open.delete(t * 3 + e)) {
			// round the corner at the end of side e, through the polyform, to the next side on the boundary
			let x = g.par[t] ? (e + 2) % 3 : (e + 1) % 3;
			let y = e;
			const r = 3 - e - x;
			let w = t;
			let k = 1;
			while (inP(g.move(w, x))) ((w = g.move(w, x)), ([x, y] = [y, x]), k++);
			loop.push({ t, e, r, k });
			[t, e] = [w, x];
		}
		loops.push(loop);
	}
	return loops;
}

/** Index of the least rotation of `a` (Booth). */
function leastRotation(a: number[]): number {
	const n = a.length;
	const f = Array<number>(2 * n).fill(-1);
	let k = 0;
	for (let j = 1; j < 2 * n; j++) {
		const sj = a[j % n];
		let i = f[j - k - 1];
		while (i !== -1 && sj !== a[(k + i + 1) % n]) {
			if (sj < a[(k + i + 1) % n]) k = j - i - 1;
			i = f[i];
		}
		if (sj !== a[(k + i + 1) % n]) {
			if (sj < a[k % n]) k = j;
			f[j - k] = -1;
		} else f[j - k] = i + 1;
	}
	return k;
}

const less = (a: number[], b: number[]) => {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return a.length < b.length;
};

/** The grid's symmetries fixing the base triangle: permutations of its sides that keep the angles and the cell,
 *  with their sign (an odd one turns the grid over). */
function sideMaps(spec: GridSpec): { p: number[]; odd: boolean }[] {
	const perms = [
		[0, 1, 2],
		[1, 2, 0],
		[2, 0, 1],
		[0, 2, 1],
		[2, 1, 0],
		[1, 0, 2],
	];
	return perms
		.map((p, i) => ({ p, odd: i >= 3 }))
		.filter(({ p }) => p.every((x, r) => spec.m[x] === spec.m[r]) && spec.cell.every((s) => spec.cell.includes(p[s])));
}

export type Corner = { num: number; den: number };
export type Polyform = {
	/** A disk: one boundary loop. Others have holes and cannot be faces. */
	simple: boolean;
	/** Symmetries of the polyform (among the grid's, mirrors included when counting free polyforms). */
	symmetries: number;
	/** Round the boundary anticlockwise: each grid vertex's interior angle in degrees (num/den), and the length of
	 *  the side after it. Flat corners (180°) at grid vertices are kept. Empty when not simple. */
	corners: Corner[];
	sides: number[];
	/** With `draw`, a simple polyform as it lies in its geometry. */
	picture?: Picture;
};

/** A polyform drawn in its geometry: its outline, and its cells' sides inside it, as polylines (diskView). */
export type Picture = { outline: Pt[]; lines: Pt[][] };

/**
 * Points of a geometry's model, centred and flattened: on the hyperboloid (z² − x² − y² = 1) or the unit
 * sphere, moved so their mean is at (0, 0, 1) and then seen from (0, 0, −1), which is the Poincaré disk and the
 * sphere's stereographic view; in the plane, (x, y, ·) moved so their mean is at the origin.
 */
export function diskView(geo: Geometry, pts: number[][]): Pt[] {
	const n = pts.length || 1;
	const c = [0, 1, 2].map((i) => pts.reduce((t, p) => t + p[i], 0) / n);
	if (geo === "plane") return pts.map((p) => ({ x: p[0] - c[0], y: p[1] - c[1] }));
	const e = geo === "sphere" ? 1 : -1;
	const r = Math.sqrt(Math.abs(c[0] ** 2 + c[1] ** 2 + e * c[2] ** 2));
	// the mirror swapping the mean and (0, 0, 1)
	const m = [c[0] / r, c[1] / r, c[2] / r - 1];
	return pts.map((p) => {
		const q = reflectIn(e, m, p);
		return { x: q[0] / (1 + q[2]), y: q[1] / (1 + q[2]) };
	});
}

const form = (e: number, u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + e * u[2] * v[2];
/** x mirrored in the plane through the origin whose normal is m, in the form of sign e (−1 the hyperboloid's). */
function reflectIn(e: number, m: number[], x: number[]): number[] {
	const mm = form(e, m, m);
	if (Math.abs(mm) < 1e-15) return x;
	const k = (2 * form(e, x, m)) / mm;
	return x.map((v, i) => v - k * m[i]);
}

/** A side from a to b, as points along it: the geodesic is where the plane through a, b and the origin meets
 *  the model, so each mix of a and b, scaled back onto it, lies on it. */
export function along(geo: Geometry, a: number[], b: number[], steps = 8): number[][] {
	if (geo === "plane") return [a, b];
	const e = geo === "sphere" ? 1 : -1;
	return Array.from({ length: steps + 1 }, (_, i) => {
		const v = a.map((x, j) => x + ((b[j] - x) * i) / steps);
		const r = Math.sqrt(Math.abs(form(e, v, v)));
		return v.map((x) => x / r);
	});
}

/** The polyform's triangles laid out: the base triangle's corner 2 at the origin, then each neighbour the mirror
 *  image of the one it was reached from in their shared side. Its outline and its cells' inner sides. */
function pictureOf(g: Grid, tris: number[], inP: (t: number) => boolean, loop: Step[]): Picture {
	const geo = geometryOf(g.spec);
	const side = sideLengths(g.spec);
	const e = geo === "sphere" ? 1 : -1;
	const point = (d: number, th: number) =>
		geo === "plane"
			? [d * Math.cos(th), d * Math.sin(th), 1]
			: geo === "sphere"
				? [Math.sin(d) * Math.cos(th), Math.sin(d) * Math.sin(th), Math.cos(d)]
				: [Math.sinh(d) * Math.cos(th), Math.sinh(d) * Math.sin(th), Math.cosh(d)];
	// corner r across side r: side 1 joins corners 0 and 2, side 0 corners 1 and 2, at the angle π/m[2]
	const at = new Map([[tris[0], [point(side[1], 0), point(side[0], Math.PI / g.spec.m[2]), point(0, 0)]]]);
	const reflect = (a: number[], b: number[], x: number[]) => {
		if (geo === "plane") {
			const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
			const t = ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / (dx * dx + dy * dy);
			return [2 * (a[0] + t * dx) - x[0], 2 * (a[1] + t * dy) - x[1], 1];
		}
		const m = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], e * (a[0] * b[1] - a[1] * b[0])];
		return reflectIn(e, m, x);
	};
	const queue = [tris[0]];
	for (const t of queue)
		for (let s = 0; s < 3; s++) {
			const u = g.move(t, s);
			if (!inP(u) || at.has(u)) continue;
			const P = at.get(t)!;
			at.set(
				u,
				P.map((x, r) => (r === s ? reflect(P[(s + 1) % 3], P[(s + 2) % 3], x) : x)),
			);
			queue.push(u);
		}
	// side e of t runs from the corner neither e nor r to corner r
	const outline = loop.flatMap(({ t, e: s, r }) => along(geo, at.get(t)![3 - s - r], at.get(t)![r]).slice(1));
	const inner = new Set([0, 1, 2].filter((s) => !g.spec.cell.includes(s)));
	const lines = tris.flatMap((t) =>
		[...inner].flatMap((s) => {
			const u = g.move(t, s);
			const P = at.get(t)!;
			return inP(u) && t < u ? [along(geo, P[(s + 1) % 3], P[(s + 2) % 3])] : [];
		}),
	);
	const flat = diskView(geo, [...outline, ...lines.flat()]);
	let i = outline.length;
	return { outline: flat.slice(0, i), lines: lines.map((l) => flat.slice(i, (i += l.length))) };
}

/**
 * Every polyform of n cells, one per class under the grid's symmetries: rotations only when `mirror` is false
 * (one-sided polyforms), rotations and reflections when true (free). Polyforms with holes are included, marked
 * not simple, so the counts match the published ones (A000105 for the square grid). With `draw`, each simple
 * one comes with its picture.
 */
export function polyforms(spec: GridSpec, n: number, mirror = true, draw = false): Polyform[] {
	const g = new Grid(spec);
	const maps = sideMaps(spec);
	const K = 2 * Math.max(...spec.m) + 1;
	const variants = maps.flatMap(({ p, odd }) =>
		[0, 1].flatMap((flip) => (!mirror && (flip === 1) !== odd ? [] : [{ p, flip, reverse: (flip === 1) !== odd }])),
	);
	const codeOf = (cells: number[]): { code: string; symmetries: number; loop: Step[] | null } => {
		const inCells = new Set(cells);
		const tris = cells.flatMap((c) => g.cells[c]);
		const inP = (t: number) => inCells.has(g.cell(t));
		const loops = boundary(g, tris, inP);
		const simple = loops.length === 1 && new Set(loops[0].map((s) => g.vertex(s.t, s.e, s.r))).size === loops[0].length;
		let best: number[] | null = null;
		let count = 0;
		if (simple) {
			const L = loops[0];
			const sym = (s: Step, r: number, k: number, v: (typeof variants)[0]) =>
				(((g.par[s.t] ^ v.flip) * 3 + v.p[s.e]) * 3 + v.p[r]) * K + k;
			for (const v of variants) {
				const seq = v.reverse
					? L.map((_, j) => {
							const i = L.length - 1 - j;
							const before = L[(i + L.length - 1) % L.length];
							return sym(L[i], before.r, before.k, v);
						})
					: L.map((s) => sym(s, s.r, s.k, v));
				const at = leastRotation(seq);
				const rot = [...seq.slice(at), ...seq.slice(0, at)];
				const period = Array.from({ length: L.length }, (_, q) => q + 1).find(
					(q) => L.length % q === 0 && rot.every((x, i) => x === rot[i % q]),
				)!;
				if (!best || less(rot, best)) ((best = rot), (count = 0));
				if (!less(best, rot)) count += L.length / period;
			}
			return { code: "S" + best!.join(","), symmetries: count, loop: L };
		}
		// a polyform with a hole: read it breadth first from each of its triangles, in each orientation allowed
		for (const u of tris)
			for (const v of maps) {
				if (!mirror && (g.par[u] === 1) !== v.odd) continue; // one-sided: orientation kept
				const index = new Map([[u, 0]]);
				const order = [u];
				const code: number[] = [];
				for (let i = 0; i < order.length; i++)
					for (const s of [0, 1, 2]) {
						const w = g.move(order[i], v.p.indexOf(s));
						if (!inP(w)) code.push(-1);
						else {
							if (!index.has(w)) (index.set(w, order.length), order.push(w));
							code.push(index.get(w)!);
						}
					}
				if (!best || less(code, best)) ((best = code), (count = 0));
				if (!less(best, code)) count++;
			}
		return { code: "H" + best!.join(","), symmetries: count, loop: null };
	};

	let level = new Map<string, number[]>([[codeOf([g.cell(0)]).code, [g.cell(0)]]]);
	for (let size = 1; size < n; size++) {
		const next = new Map<string, number[]>();
		for (const cells of level.values()) {
			const have = new Set(cells);
			const tried = new Set<number>();
			for (const c of cells)
				for (const d of g.neighbours(c)) {
					if (have.has(d) || tried.has(d)) continue;
					tried.add(d);
					const grown = [...cells, d];
					const { code } = codeOf(grown);
					if (!next.has(code)) next.set(code, grown);
				}
		}
		level = next;
	}

	const side = sideLengths(spec);
	const corner = new Set(cornerTypes(g));
	return [...level.values()].map((cells): Polyform => {
		const { symmetries, loop } = codeOf(cells);
		if (!loop) return { simple: false, symmetries, corners: [], sides: [] };
		const inCells = new Set(cells);
		const picture = draw
			? pictureOf(
					g,
					cells.flatMap((c) => g.cells[c]),
					(t) => inCells.has(g.cell(t)),
					loop,
				)
			: undefined;
		const corners: Corner[] = [];
		const sides: number[] = [];
		let run = 0;
		// start just after a grid vertex, so each side is summed whole
		const start = loop.findIndex((s) => corner.has(s.r));
		for (let j = 1; j <= loop.length; j++) {
			const s = loop[(start + j) % loop.length];
			run += side[s.e];
			if (!corner.has(s.r)) continue;
			const [num, den] = [180 * s.k, spec.m[s.r]].map((x) => x / gcd(180 * s.k, spec.m[s.r]));
			corners.push({ num, den });
			sides.push(run);
			run = 0;
		}
		// the side after corner i is sides[i + 1]: rotate so each corner is followed by its own side
		return { simple: true, symmetries, corners, sides: [...sides.slice(1), sides[0]], picture };
	});
}

/** The triangle's side lengths: side r across from the angle π/m[r]. Euclidean ones up to scale. */
function sideLengths(spec: GridSpec): number[] {
	const a = spec.m.map((m) => Math.PI / m);
	const geo = geometryOf(spec);
	return [0, 1, 2].map((r) => {
		const [s, t] = [(r + 1) % 3, (r + 2) % 3];
		if (geo === "plane") return Math.sin(a[r]) / Math.sin(a[0]);
		const c = (Math.cos(a[r]) + Math.cos(a[s]) * Math.cos(a[t])) / (Math.sin(a[s]) * Math.sin(a[t]));
		return geo === "hyperbolic" ? Math.acosh(c) : Math.acos(c);
	});
}

/** The grid's vertices: the corner types where one cell's angle is not 180°. */
function cornerTypes(g: Grid): number[] {
	const c = g.cell(0);
	const [loop] = boundary(g, g.cells[c], (t) => g.cell(t) === c);
	return [...new Set(loop.filter((s) => s.k !== g.spec.m[s.r]).map((s) => s.r))];
}

export const MAX_CELLS = 8;

/**
 * A Schwarz triangle's sides as a board writes them, side r across corner r: in the plane exactly, the shortest
 * 1 ((2,4,4) is √2, 1, 1; (2,3,6) 2, √3, 1); off it by the law of cosines for angles (tools/ctrnact-oracle/
 * schwarz_board.py) to ten places, each type named for the triangle and the corner across (E237_2), as Marek's
 * Schwarz edge systems have them (lib/freedraw/schwarz.ts). `lengths` are sideLengths', as polyforms' sides.
 */
export function schwarzSides(spec: GridSpec) {
	const lengths = sideLengths(spec);
	const plane = geometryOf(spec) === "plane";
	const unit = Math.min(...lengths);
	const texts = lengths.map((l) => {
		if (!plane) return l.toFixed(10);
		const sq = Math.round((l / unit) ** 2);
		return Number.isInteger(Math.sqrt(sq)) ? String(Math.sqrt(sq)) : `sqrt${sq}`;
	});
	const name = plane
		? undefined
		: (key: string) => `E${spec.m.join("")}_${spec.m[texts.findIndex((t) => printLength(readLength(t)!) === key)]}`;
	return { lengths, texts, name };
}

/**
 * The board with every free n-cell polyform of the grid added as a face (a polyform and its mirror image are
 * one face on a board), and each drawn in its geometry. Corners are named once for the lot (`F3_90`,
 * `F3_270`): equal angles are the same corner whichever polyform holds them. On a {p,q} grid every side is a
 * cell edge, so a 180° corner at a grid vertex is Pi along a longer side. On a Schwarz triangle's grid (its
 * cells the triangles) the three sides differ: each is typed by its length (schwarzSides), so only like sides
 * glue, and a 180° corner is Pi between two of them. Polyforms with holes are no faces and are only counted.
 */
export function withPolyforms(
	b: Board,
	spec: GridSpec,
	n: number,
): { board: Board; added: number; holes: number; pictures: Picture[] } {
	const forms = polyforms(spec, n, true, true);
	const simple = forms.filter((x) => x.simple);
	const prefix = nextPrefix(b);
	const out = { added: simple.length, holes: forms.length - simple.length, pictures: simple.map((f) => f.picture!) };
	if (!spec.cell.length) {
		const { lengths, texts, name } = schwarzSides(spec);
		const text = (l: number) => texts[lengths.findIndex((x) => Math.abs(x - l) < 1e-9)];
		const board = simple.reduce(
			(acc, f) =>
				withMadeFace(
					acc,
					(_, typeOf) =>
						faceOfCorners(
							f.corners.map((c) => angleOf(c.num, c.den)),
							f.sides.map((l) => (isUnitLength(text(l)) ? 1 : typeOf(text(l)))),
							prefix,
						),
					acc.faces.length,
					name,
				),
			b,
		);
		// a curved side's length as the decimal it was given, not the exact fraction that reads it
		const decimal = new Map(texts.map((t) => [printLength(readLength(t)!), t]));
		const curved = (l?: string) => !!name && l !== undefined && decimal.has(l);
		return {
			...out,
			board: {
				...board,
				angles: board.angles.map((a) =>
					curved(a.edge?.length) ? { ...a, edge: { ...a.edge, length: decimal.get(a.edge!.length!) } } : a,
				),
			},
		};
	}
	return {
		...out,
		board: withOutlines(
			b,
			simple.map((f) => f.corners),
		),
	};
}

/**
 * The board with a face per outline: its corners round it anticlockwise, each followed by one unit edge. Named
 * once for the lot (`F3_90`, `F3_270`): with sides of unit edges, equal angles are the same corner whichever
 * face holds them, and a 180° corner is Pi along a longer side.
 */
export function withOutlines(b: Board, outlines: Corner[][]): Board {
	const prefix = nextPrefix(b);
	const faces: Face[] = [];
	const declare = new Map<string, Angle>();
	for (const corners of outlines) {
		const start = corners.findIndex((c) => c.num !== 180 * c.den);
		const corner: { value: string; tag: string }[] = [];
		const lens: number[] = [];
		for (let i = 0; i < corners.length; i++) {
			const c = corners[(start + i) % corners.length];
			if (c.num === 180 * c.den) lens[lens.length - 1]++;
			else (corner.push(angleOf(c.num, c.den)), lens.push(1));
		}
		const { face, angles } = faceOfCorners(corner, lens, prefix);
		faces.push(face);
		for (const a of angles) declare.set(a.sym, a);
	}
	if (faces.some((f) => f.word.includes("Pi"))) declare.set("Pi", { sym: "Pi" });
	const angles = [...b.angles, ...[...declare.values()].filter((a) => !b.angles.some((x) => x.sym === a.sym))];
	return { ...b, angles, faces: [...b.faces, ...faces] };
}
