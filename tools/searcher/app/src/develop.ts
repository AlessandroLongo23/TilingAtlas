// From a certificate to a drawing: decode it into darts, decide the geometry from the board, develop.
//
// The decoder is a port of tools/ctrnact-oracle/develop_freedraw.py (parse_block, VTable, Block's glue),
// which reads any corner alphabet; develop.test.ts holds the two to the same darts. What it does not
// port is the geometry, because a board says only which corners meet. A corner's angle comes from, in
// order: Pi (180°), a digon (0°), the value set on the board, or the regular polygon of the one face
// size it occurs in. When that leaves a vertex unclosed, or two vertices that close only at different
// edge lengths, the tiling has no drawing this can stand behind, and `geometry` says which corners need
// an angle instead of guessing one.
import type { Darts as SiteDarts } from "@/lib/render/hyperbolicDevelopClient";
import { buildEdgePatch } from "@/lib/freedraw/edgePatchCore";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { walkDarts } from "@/lib/render/flatDartWalk";
import { faceSize, type Board } from "./board";
import { cornerAngle, cornerShapes, solveEdge, type Shape } from "./corners";

// ── the certificate (docs/marek-engine-reconstruction-2026-10-12.md "The certificate") ──

interface Ref {
	mirror: boolean;
	pos: number;
	orbit: number;
}
export interface Certificate {
	k: number;
	/** Per vertex orbit: its corners folded by the site's rotation, and the site-symmetry tag. */
	types: { figure: string[]; tag: string }[];
	structure: { kind: "()" | "[]"; items: Ref[] }[];
}

const VTYPE = /\(([^)]*)\)([A-Za-z0-9]*)/g;
const REF = /^(\*?)(\d+)('*)(?:@(\d+))?$/;

export function parseCertificate(text: string): Certificate {
	const lines = text
		.split("\n")
		.map((l) => l.trimEnd())
		.filter((l) => l.trim());
	let i = 0;
	let k = 0;
	if (/^number of vertices/i.test(lines[0] ?? "")) k = Number(lines[i++].split(":")[1]);
	const types = [...(lines[i++] ?? "").matchAll(VTYPE)].map((m) => ({
		figure: m[1].split(",").map((s) => s.trim()),
		tag: m[2],
	}));
	if (lines[i] && /\(/.test(lines[i]) && !lines[i].includes("/")) i++; // the multiplicity line
	const structure = [...(lines[i] ?? "").matchAll(/([([])([^)\]]*)[)\]]/g)].map((m) => ({
		kind: (m[1] === "(" ? "()" : "[]") as "()" | "[]",
		items: m[2].split(/\s+/).filter(Boolean).map(parseRef),
	}));
	return { k, types, structure };
}

function parseRef(s: string): Ref {
	const m = REF.exec(s.trim());
	if (!m) throw new Error(`bad label ${s}`);
	return { mirror: m[1] === "*", pos: Number(m[2]), orbit: m[4] ? Number(m[4]) : m[3].length };
}

// pruner.py's edgelabel(): orbits 0..3 get primes, beyond that "@n"
const edgeLabel = (core: string, orbit: number) => core + (orbit <= 3 ? "'".repeat(orbit) : `@${orbit}`);

/** One vertex orbit's folded half-edge table (develop_freedraw.py VTable). */
interface VTable {
	rneig: number[];
	mirro: number[];
	/** The corner crossed stepping s → rneig[s]. */
	tile: string[];
	labels: string[];
}

function vtable(listed: string[], chiral: boolean, axis = 0): VTable {
	const t = listed.length;
	const r = (s: number) => (s + t) % t;
	if (chiral) {
		// plain slots 0..t-1 walked forward, plus a full mirrored copy walked backward
		const idx = [...Array(t).keys()];
		return {
			rneig: [...idx.map((s) => r(s + 1)), ...idx.map((s) => t + r(s - 1))],
			tile: [...listed, ...idx.map((s) => listed[r(s - 1)])],
			mirro: [...idx.map((s) => t + s), ...idx],
			labels: [...idx.map(String), ...idx.map((s) => `*${s}`)],
		};
	}
	// a mirror in the site group: mirro is the axis involution, the later of each pair labelled *rep
	const mu = [...Array(t).keys()].map((s) => r(axis - s));
	return {
		rneig: [...Array(t).keys()].map((s) => r(s + 1)),
		tile: [...listed],
		mirro: mu,
		labels: mu.map((m, s) => (s <= m ? String(s) : `*${m}`)),
	};
}

/** Every table a (figure, tag) may stand for: one, unless the figure admits several mirror axes. */
function variants(figure: string[], tag: string): VTable[] {
	const m = /^(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?$/.exec(tag || "F");
	if (!m) throw new Error(`unknown site tag ${tag}`);
	if (m[1] === "F" || m[1].startsWith("C")) return [vtable(figure, true)];
	// the writer's axis letter is only right modulo 2 (reconstruction note, trap 1): try every valid axis
	const t = figure.length;
	const axes = [...Array(t).keys()].filter((a) => figure.every((c, s) => c === figure[(((a - s - 1) % t) + t) % t]));
	if (!axes.length) throw new Error(`tag ${tag} claims a mirror that ${figure.join(".")} does not have`);
	return axes.map((a) => vtable(figure, false, a));
}

/** The quotient's darts: what the developers walk. */
export interface Darts {
	rneig: number[];
	glue: number[];
	/** The corner symbol crossed stepping h → rneig[h]. */
	corner: string[];
	orbit: number[];
}

function block(cert: Certificate, tables: VTable[]): Darts {
	const rneig: number[] = [];
	const mirro: number[] = [];
	const corner: string[] = [];
	const orbit: number[] = [];
	const index = new Map<string, number>();
	tables.forEach((tb, o) => {
		const base = rneig.length;
		tb.rneig.forEach((x) => rneig.push(base + x));
		tb.mirro.forEach((x) => mirro.push(base + x));
		corner.push(...tb.tile);
		tb.labels.forEach((l, s) => {
			const lab = edgeLabel(l, o);
			if (index.has(lab)) throw new Error(`label ${lab} twice`);
			index.set(lab, base + s);
			orbit.push(o);
		});
	});
	const entry = (r: Ref, extraStar = false) => {
		const lab = edgeLabel((r.mirror !== extraStar ? "*" : "") + r.pos, r.orbit);
		const e = index.get(lab);
		if (e === undefined) throw new Error(`label ${lab} not in the table`);
		return e;
	};
	const glue = new Array<number>(rneig.length).fill(-1);
	for (const { kind, items } of cert.structure) {
		const k0 = entry(items[0]);
		const k1 = entry(items[1] ?? items[0], kind === "[]");
		for (const [a, b] of [
			[k0, k1],
			[mirro[k0], mirro[k1]],
		]) {
			if ((glue[a] !== -1 && glue[a] !== b) || (glue[b] !== -1 && glue[b] !== a)) throw new Error("conflicting gluing");
			glue[a] = b;
			glue[b] = a;
		}
	}
	if (glue.includes(-1)) throw new Error("the gluing line leaves a half-edge open");
	return { rneig, glue, corner, orbit };
}

/** Each face is an orbit of h → glue[rneig[h]]: its corner word must be one of the board's faces. */
function facesMatch(d: Darts, board: Board): boolean {
	const words = board.faces.map((f) => ({ word: f.word, inf: f.repeat === "inf", n: faceSize(f) }));
	const seen = new Uint8Array(d.rneig.length);
	for (let h0 = 0; h0 < d.rneig.length; h0++) {
		if (seen[h0]) continue;
		const w: string[] = [];
		for (let h = h0; !seen[h]; h = d.glue[d.rneig[h]]) {
			seen[h] = 1;
			w.push(d.corner[h]);
		}
		// a rotation centre in the face folds it: the orbit is the face's word read a fraction of the way round
		const ok = words.some(({ word, inf, n }) =>
			inf ? cyclesInto(w, word) : n !== null && n % w.length === 0 && cyclesInto(w, repeat(word, n / word.length)),
		);
		if (!ok) return false;
	}
	return true;
}
const repeat = (w: string[], m: number) => Array.from({ length: m }, () => w).flat();
/** `full`, read cyclically either way round, is `part` repeated. */
function cyclesInto(part: string[], full: string[]): boolean {
	if (full.length % part.length && part.length % full.length) return false;
	const n = Math.max(part.length, full.length);
	const f = repeat(full, n / full.length);
	const p = repeat(part, n / part.length);
	for (const q of [p, [...p].reverse()])
		for (let r = 0; r < n; r++) if (q.every((c, i) => c === f[(i + r) % n])) return true;
	return false;
}

/** The darts of a certificate: the first choice of mirror axes whose faces are the board's. */
export function decode(text: string, board: Board): Darts {
	const cert = parseCertificate(text);
	let combos: VTable[][] = [[]];
	for (const t of cert.types) {
		const vs = variants(t.figure, t.tag);
		combos = combos.flatMap((c) => vs.map((v) => [...c, v]));
	}
	let last = "no vertex types";
	for (const tables of combos) {
		try {
			const d = block(cert, tables);
			if (facesMatch(d, board)) return d;
			last = "its faces are not the board's";
		} catch (e) {
			last = (e as Error).message;
		}
	}
	throw new Error(`Cannot read this certificate: ${last}.`);
}

// ── geometry ──

export type Drawing =
	| { kind: "plane"; turn: (sym: string) => number }
	| { kind: "hyperbolic"; edge: number; turn: (sym: string) => number; shape: (sym: string) => Shape }
	| { kind: "none"; message: string };

const TWO_PI = 2 * Math.PI;
const CLOSE = 1e-7;

/** The geometry a certificate's vertices close in (corners.ts says what each corner is), or why none. */
export function geometry(board: Board, words: string[][]): Drawing {
	const shapes = cornerShapes(board);
	const unknown = [...new Set(words.flat())].filter((s) => cornerAngle(shapes.get(s), "plane", 0) === null);
	if (unknown.length)
		return {
			kind: "none",
			message: `To draw this tiling, give ${list(unknown.map((s) => `“${s}”`))} an angle: ${unknown
				.map((s) => {
					const sh = shapes.get(s);
					return `“${s}” ${sh?.kind === "unknown" ? sh.why : "is not declared"}`;
				})
				.join("; ")}.`,
		};
	const flat = (s: string) => cornerAngle(shapes.get(s), "plane", 0)!;
	const sums = words.map((w) => w.reduce((t, s) => t + flat(s), 0));
	if (sums.every((s) => Math.abs(s - TWO_PI) < CLOSE)) return { kind: "plane", turn: flat };
	const deg = (r: number) => `${+((r * 180) / Math.PI).toFixed(2)}°`;
	if (sums.some((s) => s < TWO_PI - CLOSE)) {
		const i = sums.findIndex((s) => s < TWO_PI - CLOSE);
		return {
			kind: "none",
			message: `Vertex ${words[i].join(" ")} adds up to ${deg(sums[i])}, under 360°: a tiling of the sphere, which is not drawn yet.`,
		};
	}
	const set = [...new Set(words.flat())].filter((s) => shapes.get(s)?.kind === "set");
	if (set.length)
		return {
			kind: "none",
			message: `The corners add up to more than 360° (${deg(Math.max(...sums))}), and ${list(set.map((s) => `“${s}”`))} ha${set.length === 1 ? "s" : "ve"} a set angle: only regular faces can be drawn in the hyperbolic plane. Clear the angle to draw it with regular faces.`,
		};
	// the hyperbolic plane with regular faces: one edge length must close every vertex
	const l = solveEdge(words[0], shapes, "hyperbolic");
	const bad =
		l === null
			? words[0]
			: words.find(
					(w) => Math.abs(w.reduce((t, s) => t + cornerAngle(shapes.get(s), "hyperbolic", l)!, 0) - TWO_PI) > 1e-6,
				);
	if (l === null || bad)
		return {
			kind: "none",
			message: `With regular faces, vertex ${words[0].join(" ")} and vertex ${bad!.join(" ")} close at different edge lengths, so this tiling has no drawing with regular faces. Give its corners angles that close in the plane to draw it there.`,
		};
	return {
		kind: "hyperbolic",
		edge: l,
		turn: (s) => cornerAngle(shapes.get(s), "hyperbolic", l)!,
		shape: (s) => shapes.get(s)!,
	};
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** A vertex type's whole corner cycle: the figure the certificate lists, once per turn of its site's rotation. */
export function vertexWords(text: string): string[][] {
	return parseCertificate(text).types.map(({ figure, tag }) => {
		const c = /^C(\d+)|^D(\d+)/.exec(tag);
		const rot = c ? (c[1] ? Number(c[1]) : Number(c[2]) / 2) : 1;
		return repeat(figure, rot);
	});
}

/** The board's digon corners: an edge beside one is drawn (a marked edge), the others are scaffold. */
const digons = (board: Board) => new Set(board.faces.filter((f) => faceSize(f) === 2).flatMap((f) => f.word));

// ── the plane ──

/**
 * One period of a tiling of the plane, as the site's flat edge-pattern renderer takes it
 * (components/freedraw/freedraw-canvas.tsx): the darts walked out with unit edges, and the period read off
 * the walk by lib/freedraw/edgePatchCore.ts. Faces merge across undrawn edges into tiles, so a board that
 * marks edges with digons draws as its marked tiles. Throws, in plain words, when the angles do not close
 * or no period is found.
 */
export function flatPattern(d: Darts, board: Board, turn: (sym: string) => number, id: string): FreedrawPattern {
	const n = d.rneig.length;
	const dig = digons(board);
	const t = Float64Array.from(d.corner, turn);
	// a dart's edge is drawn when the corner on either side of it is a digon (develop_hyp_edges.py)
	const lneig = new Array<number>(n);
	d.rneig.forEach((r, h) => (lneig[r] = h));
	const drawn = (h: number) => !dig.size || dig.has(d.corner[h]) || dig.has(d.corner[lneig[h]]);
	// two darts at one vertex pointing the same way: the angles do not close round the faces. The sides
	// of a digon do point the same way (its corner is 0°), so a run of them counts as its first dart.
	const first = (h: number) => {
		for (let i = 0; i < n && t[lneig[h]] === 0; i++) h = lneig[h];
		return h;
	};
	const walkAt = (radius: number, budget: number) => {
		const graph = { rneig: d.rneig, glue: d.glue, turn: t, length: new Float64Array(n).fill(1), drawn, orbit: d.orbit };
		const walk = walkDarts(graph, { tol: 1e-6, radius, budget });
		const heading = new Map<string, number>();
		for (const inst of walk.instances) {
			const h = first(inst.h);
			const key = `${inst.vid}|${Math.round(Math.cos(inst.th) * 1e5)},${Math.round(Math.sin(inst.th) * 1e5)}`;
			const other = heading.get(key);
			if (other !== undefined && other !== h)
				throw new Error("These angles do not close round every face: the drawing overlaps itself.");
			heading.set(key, h);
		}
		return walk;
	};
	const built = buildEdgePatch({ classLengths: [1] }, walkAt, { reach: 8, budget: 80000 });
	if (!built.ok) throw new Error(`No period of this tiling was found: ${built.reason}.`);
	return { id, k: 1, a: 1, b: 0, d: 1, h: [0], v: [0], orbit: [0], grid: "ts", patch: built.patch };
}

// ── the hyperbolic plane ──

/**
 * The darts as lib/render/hyperbolicDevelopClient.ts takes them, with every turn and edge given (its
 * scalene form): a Pi corner turns by 180° and a subdivided side is several edges, so turns cannot be
 * derived from polygon sizes alone. lvert and faceColor carry each dart's face as its polygon size (0 for
 * an apeirogon), which the renderer reads for apeirogons and to colour faces; `sizes` lists them, in the
 * order faceColor numbers them.
 */
export function hyperbolicDarts(
	d: Darts,
	g: Extract<Drawing, { kind: "hyperbolic" }>,
): SiteDarts & { sizes: number[] } {
	const n = d.rneig.length;
	// each dart's face (an orbit of h -> glue[rneig[h]]), sized by its first corner that is not a Pi
	const size = new Array<number>(n).fill(-1);
	for (let h0 = 0; h0 < n; h0++) {
		if (size[h0] >= 0) continue;
		const orbit: number[] = [];
		for (let h = h0; !orbit.includes(h) && orbit.length <= n; h = d.glue[d.rneig[h]]) orbit.push(h);
		const s = orbit.map((h) => g.shape(d.corner[h])).find((x) => x.kind === "polygon" || x.kind === "digon");
		const sides = s?.kind === "digon" ? 2 : s?.kind === "polygon" ? (s.n ?? 0) : 3;
		for (const h of orbit) size[h] = sides;
	}
	const sizes = [...new Set(size)].sort((x, y) => x - y);
	const lvert = new Array<number>(n);
	d.rneig.forEach((r, h) => (lvert[r] = size[h]));
	const lneig = new Array<number>(n);
	d.rneig.forEach((r, h) => (lneig[r] = h));
	const marked = d.corner.some((c) => g.shape(c).kind === "digon");
	const digon = (h: number) => g.shape(d.corner[h]).kind === "digon";
	return {
		rneig: d.rneig,
		glue: d.glue,
		lvert,
		seed: 0,
		alpha: d.corner.map(g.turn),
		elen: new Array<number>(n).fill(g.edge),
		drawn: d.corner.map((_, h) => (!marked || digon(h) || digon(lneig[h]) ? 1 : 0)),
		faceColor: size.map((x) => sizes.indexOf(x)),
		sizes,
	};
}
