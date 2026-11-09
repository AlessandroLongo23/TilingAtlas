// Polyforms of a board: patches of its own faces glued edge to edge, every vertex one of its vertex lines.
//
// polyform.ts grows polyforms on the grid of a reflection group, where each cell has an exact name and nothing
// can overlap. Here there is no grid. The cells are the board's faces (triangles and squares, say) and the rule is
// its vertex lines, as Marek asked (2026-11-09): with 3⁶, 4⁴ and 3³4² as sets (permutations on), a corner of three
// squares and a triangle, which no vertex completes, is never made. A board with no vertex lines allows every set
// of corners that closes. Without a grid two arms can meet far apart, so each patch is laid out, in the plane or on
// the hyperboloid (faces of set angles that close only there), and every new face is tested against the others.
//
// A patch grows a face at a time along a free edge. Every polyform has a face whose removal leaves a polyform (a
// leaf of a spanning tree of its faces), so growing level by level reaches all of them. A patch is named by its
// gluing: from every start, the faces met breadth first, each read from the edge it was entered by; the least code
// over all starts and both orientations. Rigid faces glued edge to edge have one shape per gluing, so the code
// names a polyform up to turning and mirroring.
import { cyclicKey, type Board } from "./board";
import { closingVertices, cornerShapes, type Shape } from "./corners";
import { sharedEdge } from "./develop";
import { along, diskView, withOutlines, type Corner, type Picture } from "./polyform";

type M = number[];
const mul = (a: M, b: M): M => {
	const out = new Array<number>(9);
	for (let i = 0; i < 9; i += 3)
		for (let j = 0; j < 3; j++) out[i + j] = a[i] * b[j] + a[i + 1] * b[3 + j] + a[i + 2] * b[6 + j];
	return out;
};
function inv(m: M): M {
	const [a, b, c, d, e, f, g, h, i] = m;
	const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
	return [
		e * i - f * h,
		c * h - b * i,
		b * f - c * e,
		f * g - d * i,
		a * i - c * g,
		c * d - a * f,
		d * h - e * g,
		b * g - a * h,
		a * e - b * d,
	].map((x) => x / det);
}
const rot = (t: number): M => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
const ROT_PI = rot(Math.PI);
/** The point a frame stands on: the origin moved by it. */
const pos = (m: M) => [m[2], m[5], m[8]];
const TWO_PI = 2 * Math.PI;
const EPS = 1e-7;
const mod = (x: number) => ((x % TWO_PI) + TWO_PI) % TWO_PI;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const add = (x: Corner, y: Corner): Corner => {
	const [num, den] = [x.num * y.den + y.num * x.den, x.den * y.den];
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
};

type Geo = "plane" | "hyperbolic";

/** A face as a cell, one way round (a face and its mirror image are two cells unless they are one): its corners,
 *  and the frame at each corner heading along its next edge, the walk from corner 0 at the origin. */
type Cell = {
	syms: string[];
	alpha: number[];
	deg: Corner[];
	frame: M[];
	frameInv: M[];
	/** The frame arriving at corner i + 1 along edge i. */
	arrive: M[];
	/** The edges worth gluing by: one per turn of the face onto itself. */
	edges: number[];
};

type Placed = { cell: number; m: M; v: number[]; glue: number[] };
type Seat = { f: number; k: number; s: number; a: number; sym: string };
type Vert = { p: number[]; ref: M; seats: Seat[] };
type Patch = { faces: Placed[]; verts: Vert[] };
/** A glued edge: the other face's index and edge, as one number; −1 a free edge. */
const pack = (f: number, k: number) => f * 1024 + k;

/** A corner's angle in degrees exactly: a set angle as written, Pi, or a regular polygon's in the plane. */
function degreesOf(b: Board, s: Shape | undefined, sym: string): Corner | null {
	if (s?.kind === "pi") return { num: 180, den: 1 };
	if (s?.kind === "polygon" && s.n) return add({ num: 180 * (s.n - 2), den: s.n }, { num: 0, den: 1 });
	if (s?.kind !== "set") return null;
	const m = /^(\d+)(?:\.(\d+))?(?:\/(\d+))?$/.exec(b.angles.find((a) => a.sym === sym)?.value ?? "");
	if (!m) return null;
	const scale = 10 ** (m[2]?.length ?? 0);
	return add({ num: Number(m[1] + (m[2] ?? "")), den: scale * Number(m[3] ?? 1) }, { num: 0, den: 1 });
}

/** The vertices a patch may make, each a word of corners (a set of them when `sets`) that closes. */
type Rule = { words: { syms: string[]; alpha: number[] }[]; sets: boolean };

/** Whether the corners seated round a point fit some vertex of the rule: in their places as one of its words
 *  (or its mirror image), or, as a set, with every gap between them filled exactly by the corners it has left. */
function fits(seats: Seat[], rule: Rule): boolean {
	if (!seats.length) return true;
	const s0 = seats[0].s;
	const at = seats.map((c) => ({ ...c, s: mod(c.s - s0) })).sort((x, y) => x.s - y.s);
	const near = (x: number, y: number) => Math.min(mod(x - y), mod(y - x)) < EPS;
	return rule.words.some(({ syms, alpha }) => {
		if (rule.sets) {
			const left = [...alpha];
			const free = syms.map(() => true);
			for (const c of at) {
				const i = syms.findIndex((x, j) => free[j] && x === c.sym);
				if (i < 0) return false;
				free[i] = false;
				left[i] = NaN;
			}
			const gaps = at.map((c, i) => (i + 1 < at.length ? at[i + 1].s : TWO_PI) - c.s - c.a);
			return fill(
				left.filter((x) => !Number.isNaN(x)).sort((x, y) => y - x),
				gaps,
			);
		}
		return [syms, [...syms].reverse()].some((w, r) => {
			const a = r ? [...alpha].reverse() : alpha;
			const start = a.map((_, i) => a.slice(0, i).reduce((t, x) => t + x, 0));
			return w.some(
				(x, p) => x === at[0].sym && at.every((c) => w.some((y, q) => y === c.sym && near(start[q] - start[p], c.s))),
			);
		});
	});
}

/** Whether `items` (largest first) fill every gap exactly. */
function fill(items: number[], gaps: number[]): boolean {
	if (!items.length) return gaps.every((g) => Math.abs(g) < EPS);
	const [x, ...rest] = items;
	const tried = new Set<number>();
	for (let i = 0; i < gaps.length; i++) {
		const key = Math.round(gaps[i] / EPS);
		if (gaps[i] < x - EPS || tried.has(key)) continue;
		tried.add(key);
		gaps[i] -= x;
		const ok = fill(rest, gaps);
		gaps[i] += x;
		if (ok) return true;
	}
	return false;
}

/** Points in a plane where straight lines are the geodesics: the plane itself, or Beltrami–Klein's disk. */
const flat = (geo: Geo, p: number[]): [number, number] => (geo === "plane" ? [p[0], p[1]] : [p[0] / p[2], p[1] / p[2]]);
const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p: number[], a: number[], b: number[]) =>
	Math.abs(cross(a, b, p)) < 1e-9 && (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]) < -1e-12;
/** Whether p is inside the polygon or on one of its sides (not at a corner: corners are told apart by name). */
function inside(p: number[], poly: number[][]): boolean {
	let wind = 0;
	for (let i = 0; i < poly.length; i++) {
		const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
		if (onSegment(p, a, b)) return true;
		if (a[1] <= p[1] ? b[1] > p[1] && cross(a, b, p) > 0 : b[1] <= p[1] && cross(a, b, p) < 0)
			wind += a[1] <= p[1] ? 1 : -1;
	}
	return wind !== 0;
}
/** Whether two faces, given by their vertices' names and points, overlap anywhere but at shared corners. */
function clash(va: number[], pa: number[][], vb: number[], pb: number[][]): boolean {
	const [ina, inb] = [new Set(va), new Set(vb)];
	if (vb.some((v, i) => !ina.has(v) && inside(pb[i], pa))) return true;
	if (va.some((v, i) => !inb.has(v) && inside(pa[i], pb))) return true;
	for (let i = 0; i < va.length; i++)
		for (let j = 0; j < vb.length; j++) {
			const [a1, a2, b1, b2] = [va[i], va[(i + 1) % va.length], vb[j], vb[(j + 1) % vb.length]];
			if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
			const [p, q, r, s] = [pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length]];
			if (cross(p, q, r) * cross(p, q, s) < -1e-12 && cross(r, s, p) * cross(r, s, q) < -1e-12) return true;
		}
	return false;
}

/** A polyform of the board: its outline's corners (none when it is no disk) and its picture. */
export type BoardForm = { simple: boolean; corners: Corner[]; picture?: Picture };

type Grown = { forms: BoardForm[]; problem?: string };

/**
 * Every polyform of n of the board's faces (`cells`, all by default) whose every vertex fits one of its vertex
 * lines, or with none every set of corners that closes, one per class under turning and mirroring. `problem`
 * says why there are none when the board cannot be grown from: a face with an unknown angle, faces that close
 * in different geometries, or too many patches. A generator: it yields how many polyforms of the size being
 * grown it has so far, every few hundred patches, so a window can grow them a slice at a time (growAsync).
 */
export function* growing(
	b: Board,
	n: number,
	cells = b.faces.map((_, i) => i),
	limit = 200_000,
): Generator<number, Grown> {
	const shapes = cornerShapes(b);
	const words = cells.flatMap((i) => {
		const f = b.faces[i];
		return f && f.repeat !== "inf" ? [Array.from({ length: f.repeat }, () => f.word).flat()] : [];
	});
	if (!words.length) return { forms: [], problem: "The board has no face to grow from." };
	const deg = new Map<string, Corner>();
	for (const sym of new Set(words.flat())) {
		const d = degreesOf(b, shapes.get(sym), sym);
		if (!d || !(d.num > 0))
			return { forms: [], problem: `Corner “${sym}” has no angle of its own: set it to grow from it.` };
		deg.set(sym, d);
	}
	const rad = (sym: string) => (deg.get(sym)!.num * Math.PI) / (180 * deg.get(sym)!.den);
	// where the faces close: a polygon's corners add up to (n − 2)·180° in the plane only, less off it
	const off = words.map((w) => w.reduce((t, s) => t + rad(s), 0) - (w.length - 2) * Math.PI);
	const geo: Geo | null = off.every((x) => Math.abs(x) < 1e-9)
		? "plane"
		: off.every((x) => x < -1e-9)
			? "hyperbolic"
			: null;
	if (!geo)
		return { forms: [], problem: "These faces do not all close in one geometry (the sphere is not grown on yet)." };
	let len = 1;
	if (geo === "hyperbolic") {
		const l = sharedEdge(words.map((w) => ({ alphas: w.map(rad), steps: [] })));
		if (l === null) return { forms: [], problem: "With equal sides these faces close at different edge lengths." };
		len = l;
	}
	const step: M =
		geo === "plane"
			? [1, 0, len, 0, 1, 0, 0, 0, 1]
			: [Math.cosh(len), 0, Math.sinh(len), 0, 1, 0, Math.sinh(len), 0, Math.cosh(len)];
	// each face and its mirror image (its word reversed), once when they are one
	const variants = words.flatMap((w) => {
		const r = [...w].reverse();
		return cyclicKey(w) === cyclicKey(r) ? [w] : [w, r];
	});
	const all: Cell[] = variants.map((syms) => {
		const alpha = syms.map(rad);
		const frame: M[] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
		for (let k = 1; k < syms.length; k++) frame.push(mul(mul(frame[k - 1], step), rot(Math.PI - alpha[k])));
		const turn = syms.findIndex(
			(_, p) => p > 0 && syms.length % p === 0 && syms.every((x, i) => x === syms[(i + p) % syms.length]),
		);
		return {
			syms,
			alpha,
			deg: syms.map((s) => deg.get(s)!),
			frame,
			frameInv: frame.map(inv),
			arrive: frame.map((f) => mul(f, step)),
			edges: Array.from({ length: turn > 0 ? turn : syms.length }, (_, i) => i),
		};
	});
	// the vertices: the board's own lines, else every set of the cells' corners that closes
	const symbols = new Set(words.flat());
	const lines = b.vertices.map((v) => v.word).filter((w) => w.every((s) => symbols.has(s)));
	const rule: Rule = {
		words: (b.vertices.length
			? lines
			: closingVertices(b, geo, len, 24).words.filter((w) => w.every((s) => symbols.has(s)))
		)
			.map((w) => ({ syms: w, alpha: w.map(rad) }))
			.filter(({ alpha }) => Math.abs(alpha.reduce((t, x) => t + x, 0) - TWO_PI) < 1e-9),
		sets: b.vertices.length ? b.permutations : true,
	};
	if (!rule.words.length)
		return {
			forms: [],
			problem:
				"No vertex of these faces' corners adds up to 360° (off the plane, give the corners angles of their own).",
		};

	const close = (p: number[], q: number[]) =>
		Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < EPS * Math.max(1, Math.abs(p[2]));
	/** The patch with cell c's edge j glued to face f's free edge k, or null where it overlaps or makes a vertex
	 *  that fits none. */
	const grow = (patch: Patch, f: number, k: number, c: number, j: number): Patch | null => {
		const A = patch.faces[f];
		const cell = all[c];
		const m = mul(mul(mul(A.m, all[A.cell].arrive[k]), ROT_PI), cell.frameInv[j]);
		return place(patch, c, m);
	};
	const place = (patch: Patch, c: number, m: M): Patch | null => {
		const cell = all[c];
		const size = cell.syms.length;
		const frames = cell.frame.map((g) => mul(m, g));
		const verts = patch.verts.slice();
		const v = frames.map((fr) => {
			const p = pos(fr);
			let id = verts.findIndex((x) => close(x.p, p));
			if (id < 0) ((id = verts.length), verts.push({ p, ref: inv(fr), seats: [] }));
			return id;
		});
		if (new Set(v).size < size) return null;
		const fi = patch.faces.length;
		for (let i = 0; i < size; i++) {
			const x = verts[v[i]];
			const r = mul(x.ref, frames[i]);
			const seat = { f: fi, k: i, s: mod(Math.atan2(r[3], r[0])), a: cell.alpha[i], sym: cell.syms[i] };
			const over = (o: Seat) => mod(seat.s - o.s) < o.a - EPS || mod(o.s - seat.s) < seat.a - EPS;
			if (x.seats.some(over)) return null;
			verts[v[i]] = { ...x, seats: [...x.seats, seat] };
		}
		const pts = v.map((id) => flat(geo, verts[id].p));
		for (const F of patch.faces)
			if (
				clash(
					F.v,
					F.v.map((id) => flat(geo, verts[id].p)),
					v,
					pts,
				)
			)
				return null;
		if (!v.every((id) => fits(verts[id].seats, rule))) return null;
		const faces = patch.faces.slice();
		const glue = v.map(() => -1);
		for (let i = 0; i < size; i++)
			faces.forEach((F, g) => {
				const e = F.v.findIndex((x, t) => x === v[(i + 1) % size] && F.v[(t + 1) % F.v.length] === v[i]);
				if (e < 0) return;
				glue[i] = pack(g, e);
				faces[g] = { ...F, glue: F.glue.map((y, t) => (t === e ? pack(fi, i) : y)) };
			});
		faces.push({ cell: c, m, v, glue });
		return { faces, verts };
	};

	const ids = all.map((c) => c.syms.map((s) => [...symbols].indexOf(s)));
	const codeOf = (faces: Placed[]): string => {
		// the least code starts at a largest face (each face is written −2 − its size first)
		const top = Math.max(...faces.map((F) => F.v.length));
		const index = new Int32Array(faces.length);
		const order = new Int32Array(faces.length);
		const entry = new Int32Array(faces.length);
		let best: number[] | null = null;
		const code: number[] = [];
		for (let u = 0; u < faces.length; u++) {
			if (faces[u].v.length < top) continue;
			for (let k = 0; k < top; k++)
				for (const dir of [1, -1]) {
					index.fill(-1);
					index[u] = 0;
					order[0] = u;
					entry[0] = k;
					let seen = 1;
					code.length = 0;
					// against the best so far, entry by entry: −1 below it (a new best), 1 above (give up)
					let cmp = best ? 0 : -1;
					const put = (x: number) => {
						if (cmp === 0 && x !== best![code.length]) cmp = x < best![code.length] ? -1 : 1;
						code.push(x);
					};
					for (let i = 0; i < seen && cmp <= 0; i++) {
						const F = faces[order[i]];
						const syms = ids[F.cell];
						const size = syms.length;
						put(-2 - size);
						for (let t = 0; t < size && cmp <= 0; t++) {
							const e = (((entry[i] + dir * t) % size) + size) % size;
							put(syms[dir === 1 ? e : (e + 1) % size]);
							const g = F.glue[e];
							if (g < 0) put(-1);
							else {
								const w = Math.floor(g / 1024);
								if (index[w] < 0) ((index[w] = seen), (order[seen] = w), (entry[seen] = g % 1024), seen++);
								put(index[w]);
							}
						}
					}
					if (cmp < 0) best = code.slice();
				}
		}
		return best!.join(",");
	};

	let level = new Map<string, Patch>();
	const id: M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	for (let c = 0; c < all.length; c++) {
		const p = place({ faces: [], verts: [] }, c, id);
		if (p) level.set(codeOf(p.faces), p);
	}
	let done = 0;
	for (let size = 1; size < n; size++) {
		const next = new Map<string, Patch>();
		for (const patch of level.values()) {
			patch.faces.forEach((F, f) =>
				F.glue.forEach((g, k) => {
					if (g >= 0) return;
					for (let c = 0; c < all.length; c++)
						for (const j of all[c].edges) {
							const grown = grow(patch, f, k, c, j);
							if (grown) {
								const code = codeOf(grown.faces);
								if (!next.has(code)) next.set(code, grown);
							}
						}
				}),
			);
			if (++done % 100 === 0) yield next.size;
			if (next.size > limit)
				return {
					forms: [],
					problem: `More than ${limit.toLocaleString()} polyforms of ${size + 1}: too many to list.`,
				};
		}
		level = next;
	}
	return { forms: [...level.values()].map((p) => formOf(p, all, geo)) };
}

/** growing, run to the end. */
export function boardPolyforms(...args: Parameters<typeof growing>): Grown {
	const g = growing(...args);
	for (let r = g.next(); ; r = g.next()) if (r.done) return r.value;
}

/** growing, run in slices of a few milliseconds with the window free between them; `progress` hears the count
 *  so far. Null once `stopped` says it is no longer wanted. */
export async function growAsync(
	g: Generator<number, Grown>,
	progress: (count: number) => void,
	stopped: () => boolean,
): Promise<Grown | null> {
	for (;;) {
		const end = performance.now() + 12;
		let r = g.next();
		while (!r.done && performance.now() < end) r = g.next();
		if (r.done) return r.value;
		progress(r.value);
		await new Promise((go) => setTimeout(go, 0));
		if (stopped()) return null;
	}
}

/** A patch's outline, walked with the patch on its left: each corner the sum of its faces' corners there. A disk
 *  when it is one loop through distinct points. */
function formOf(p: Patch, all: Cell[], geo: Geo): BoardForm {
	const loops: { f: number; k: number; deg: Corner }[][] = [];
	const seen = new Set<number>();
	p.faces.forEach((F, f0) =>
		F.glue.forEach((g, k0) => {
			if (g >= 0 || seen.has(pack(f0, k0))) return;
			const loop: { f: number; k: number; deg: Corner }[] = [];
			let [f, k] = [f0, k0];
			while (!seen.has(pack(f, k))) {
				seen.add(pack(f, k));
				// round the corner at the end of edge k, through the faces glued there, to the next free edge
				let size = p.faces[f].v.length;
				let [h, e] = [f, (k + 1) % size];
				let deg = all[p.faces[f].cell].deg[e];
				while (p.faces[h].glue[e] >= 0) {
					const g2 = p.faces[h].glue[e];
					h = Math.floor(g2 / 1024);
					size = p.faces[h].v.length;
					e = ((g2 % 1024) + 1) % size;
					deg = add(deg, all[p.faces[h].cell].deg[e]);
				}
				loop.push({ f, k, deg });
				[f, k] = [h, e];
			}
			loops.push(loop);
		}),
	);
	const point = (f: number, k: number) => p.verts[p.faces[f].v[k % p.faces[f].v.length]].p;
	const loop = loops[0];
	const ends = loop.map(({ f, k }) => p.faces[f].v[(k + 1) % p.faces[f].v.length]);
	if (loops.length !== 1 || new Set(ends).size !== ends.length) return { simple: false, corners: [] };
	const outline = loop.flatMap(({ f, k }) => along(geo, point(f, k), point(f, k + 1)).slice(1));
	const lines = p.faces.flatMap((F, f) =>
		F.glue.flatMap((g, k) => (g > pack(f, k) ? [along(geo, point(f, k), point(f, k + 1))] : [])),
	);
	const flatPts = diskView(geo, [...outline, ...lines.flat()]);
	let i = outline.length;
	const picture = { outline: flatPts.slice(0, i), lines: lines.map((l) => flatPts.slice(i, (i += l.length))) };
	// the corner at the end of each free edge, followed by the next free edge
	return { simple: true, corners: loop.map((x) => x.deg), picture };
}

/** The board with every polyform grown from it added as a face (a disk only; each outline once), and how many had
 *  holes or touched themselves, with each added face's picture. */
export function withBoardPolyforms(
	b: Board,
	{ forms, problem }: Grown,
): { board: Board; holes: number; pictures: Picture[]; problem?: string } {
	const simple = forms.filter((f) => f.simple);
	// two cuttings of one outline are one face
	const key = (c: Corner[]) => {
		const w = c.map((x) => `${x.num}/${x.den}`);
		return [cyclicKey(w), cyclicKey([...w].reverse())].sort()[0];
	};
	const seen = new Set<string>();
	const kept = simple.filter((f) => !seen.has(key(f.corners)) && !!seen.add(key(f.corners)));
	return {
		board: withOutlines(
			b,
			kept.map((f) => f.corners),
		),
		holes: forms.length - simple.length,
		pictures: kept.map((f) => f.picture!),
		problem,
	};
}
