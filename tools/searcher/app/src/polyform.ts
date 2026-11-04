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
import type { Angle, Board, Face } from "./board";
import { angleOf, cyclotomic, faceOfCorners, nextPrefix } from "./freeface";

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
};

/**
 * Every polyform of n cells, one per class under the grid's symmetries: rotations only when `mirror` is false
 * (one-sided polyforms), rotations and reflections when true (free). Polyforms with holes are included, marked
 * not simple, so the counts match the published ones (A000105 for the square grid).
 */
export function polyforms(spec: GridSpec, n: number, mirror = true): Polyform[] {
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
	return [...level.values()].map((cells) => {
		const { symmetries, loop } = codeOf(cells);
		if (!loop) return { simple: false, symmetries, corners: [], sides: [] };
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
		return { simple: true, symmetries, corners, sides: [...sides.slice(1), sides[0]] };
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
 * The board with every free n-cell polyform of the {p,q} grid added as a face (a polyform and its mirror image
 * are one face on a board). Corners are named once for the lot (`F3_90`, `F3_270`): with sides of one cell edge
 * each, equal angles are the same corner whichever polyform holds them. A 180° corner at a grid vertex is Pi.
 * Polyforms with holes are no faces and are only counted.
 */
export function withPolyforms(
	b: Board,
	p: number,
	q: number,
	n: number,
): { board: Board; added: number; holes: number } {
	const forms = polyforms(regularGrid(p, q), n);
	const prefix = nextPrefix(b);
	const faces: Face[] = [];
	const declare = new Map<string, Angle>();
	for (const f of forms.filter((x) => x.simple)) {
		const start = f.corners.findIndex((c) => c.num !== 180 * c.den);
		const corner: { value: string; tag: string }[] = [];
		const lens: number[] = [];
		for (let i = 0; i < f.corners.length; i++) {
			const c = f.corners[(start + i) % f.corners.length];
			if (c.num === 180 * c.den) lens[lens.length - 1]++;
			else (corner.push(angleOf(c.num, c.den)), lens.push(1));
		}
		const { face, angles } = faceOfCorners(corner, lens, prefix);
		faces.push(face);
		for (const a of angles) declare.set(a.sym, a);
	}
	if (faces.some((f) => f.word.includes("Pi"))) declare.set("Pi", { sym: "Pi" });
	const angles = [...b.angles, ...[...declare.values()].filter((a) => !b.angles.some((x) => x.sym === a.sym))];
	return {
		board: { ...b, angles, faces: [...b.faces, ...faces] },
		added: faces.length,
		holes: forms.length - faces.length,
	};
}
