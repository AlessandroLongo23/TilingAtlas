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
import { walkDarts, type DartWalk } from "@/lib/render/flatDartWalk";
import { paletteFor } from "@/lib/colors/render";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { Cyclotomic, CyclotomicRing, setActiveRing, zetaIndexFromAngle } from "@/lib/classes/Cyclotomic";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { pushEdge, type BubbleEdgeStyle } from "@/lib/bubble/edges";
import { coloredCorner, edgeTypes, faceSize, sameCycle, type Board } from "./board";
import { bubbleGrid, cornerAngle, cornerShapes, solveEdge, type Shape } from "./corners";

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

/** The certificates an output file holds, up to the last complete one. */
export const certificatesIn = (text: string) => {
	const end = text.lastIndexOf("---\n");
	return end < 0
		? []
		: text
				.slice(0, end)
				.split(/\n?---\n\n?/)
				.filter(Boolean);
};

/** A certificate with the engine's X<n> labels read back as the board's symbols (symbols.txt). */
export const withSymbols = (cert: string, symbols: Record<string, string>) =>
	Object.entries(symbols).reduce((t, [x, sym]) => t.replace(new RegExp(`\\b${x}\\b`, "g"), sym), cert);

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
	/** Each dart's copy in the vertex's mirrored table (walked the other way round). */
	mirror: number[];
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
	return { rneig, glue, corner, orbit, mirror: mirro };
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
			message: `The corners add up to more than 360° (${deg(Math.max(...sums))}), and ${list(set.map((s) => `“${s}”`))} ha${set.length === 1 ? "s" : "ve"} a set angle, which stays fixed as the edge grows: in the hyperbolic plane only regular, star and isotoxal faces can be drawn. Clear the angle to draw it with regular faces.`,
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

/** Whether the board draws some edges and hides others (digons, or an edge line marked hidden): then a
 *  tiling of it is an edge pattern, its faces merging across the hidden edges. */
export const marksEdges = (board: Board) =>
	digons(board).size > 0 || [...edgeTypes(board).values()].some((e) => e.style === "hidden");

/**
 * Per dart, the edge line of the side it runs along (its midpoint corner, at one end of the dart or the
 * other), and that edge's length, 1 for a side with no edge line. Every dart is half a side, so a side is
 * drawn twice its length, the same scale for every edge type.
 */
function dartEdges(d: Darts, board: Board) {
	const types = edgeTypes(board);
	const lneig = new Array<number>(d.rneig.length);
	d.rneig.forEach((r, h) => (lneig[r] = h));
	const edge = d.rneig.map((_, h) =>
		[d.corner[h], d.corner[lneig[h]], d.corner[d.glue[h]], d.corner[lneig[d.glue[h]]]].find((c) => types.has(c)),
	);
	const length = Float64Array.from(edge, (e) => (e === undefined ? 1 : types.get(e)!.length));
	return { types, lneig, edge, length };
}

// ── the plane ──

/**
 * One period of a tiling of the plane, as the site's flat edge-pattern renderer takes it
 * (components/freedraw/freedraw-canvas.tsx): the darts walked out with unit edges, and the period read off
 * the walk by lib/freedraw/edgePatchCore.ts. Faces merge across undrawn edges into tiles, so a board that
 * marks edges with digons draws as its marked tiles. Throws, in plain words, when the angles do not close
 * or no period is found.
 */
export function flatPattern(d: Darts, board: Board, turn: (sym: string) => number, id: string): FreedrawPattern {
	return {
		id,
		k: 1,
		a: 1,
		b: 0,
		d: 1,
		h: [0],
		v: [0],
		orbit: [0],
		grid: "ts",
		patch: flatPeriod(d, board, turn).patch,
	};
}

/** One period, and the last walk it was read off. */
function flatPeriod(d: Darts, board: Board, turn: (sym: string) => number) {
	const n = d.rneig.length;
	const dig = digons(board);
	const t = Float64Array.from(d.corner, turn);
	const { types, lneig, edge, length } = dartEdges(d, board);
	// a dart's edge is drawn when the corner on either side of it is a digon (develop_hyp_edges.py), or its
	// edge line is not marked hidden
	const drawn = (h: number) =>
		dig.has(d.corner[h]) ||
		dig.has(d.corner[lneig[h]]) ||
		(edge[h] !== undefined ? types.get(edge[h]!)!.style !== "hidden" : !dig.size);
	// two darts at one vertex pointing the same way: the angles do not close round the faces. The sides
	// of a digon do point the same way (its corner is 0°), so a run of them counts as its first dart.
	const first = (h: number) => {
		for (let i = 0; i < n && t[lneig[h]] === 0; i++) h = lneig[h];
		return h;
	};
	let last: DartWalk | null = null;
	const walkAt = (radius: number, budget: number) => {
		const graph = { rneig: d.rneig, glue: d.glue, turn: t, length, drawn, orbit: d.orbit };
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
		return (last = walk);
	};
	const built = buildEdgePatch({ classLengths: [...new Set(length)] }, walkAt, { reach: 8, budget: 80000 });
	if (!built.ok) throw new Error(`No period of this tiling was found: ${built.reason}.`);
	return { patch: built.patch, walk: last!, turns: t, length };
}

/**
 * Whether the board labels faces of one shape differently: then a tiling of it is a colouring. A shape is
 * the cycle of a face's corner angles, so a square and a rhombus, both four corners, are two shapes.
 */
export function isColoring(board: Board): boolean {
	const shapes = cornerShapes(board);
	const seen: { shape: string[]; word: string[] }[] = [];
	for (const f of board.faces) {
		if (faceSize(f) === 2) continue;
		const word = f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat();
		const shape = word.map((c) => cornerAngle(shapes.get(c), "plane", 0)?.toFixed(6) ?? "?");
		if (seen.some((x) => sameCycle(x.shape, shape, false) && !sameCycle(x.word, word, false))) return true;
		seen.push({ shape, word });
	}
	return false;
}

/**
 * A colouring's colour per face: the colour letter of its corners on a coloured board (A4@B is colour 1), so
 * a red triangle and a red square share a colour; otherwise which board face it is. `count` sizes the palette.
 */
export function faceColors(board: Board): { count: number; of: (word: string[]) => number } {
	const lettered = board.faces.some((f) => f.word.some((c) => coloredCorner(c)));
	if (lettered) {
		const count = 1 + Math.max(0, ...board.angles.map((a) => coloredCorner(a.sym)?.color ?? 0));
		return { count, of: (word) => Math.max(0, ...word.map((c) => coloredCorner(c)?.color ?? 0)) };
	}
	const full = board.faces.map((f) => (f.repeat === "inf" ? null : repeat(f.word, f.repeat)));
	return {
		count: board.faces.length,
		of: (word) => Math.max(0, full.findIndex((w) => w !== null && w.length % word.length === 0 && sameCycle(repeat(word, w.length / word.length), w, false))),
	};
}

/**
 * One period as the site's flat cell renderer takes it (lib/hooks/useFlatCellPreview.ts, the /theory
 * cards and the landing wall): a tiling's faces fill by side count, the atlas's tile palette; a colouring's
 * by which board face each is, through the colourings palette (lib/colors/render.ts).
 */
/**
 * A ring as the tile it is: its straight points dropped (the Pi corners along a side of several edges, so a
 * triangle with sides of two edges is a triangle and takes the triangle's colour), and a ring whose corners
 * alternate convex and reflex marked a star of half as many points, which the atlas colours by its own
 * star ramp (RawPolygon.star).
 */
function tileOf(ring: number[][]): { v: number[][]; n: number; star?: boolean } {
	const turn = (v: number[][], i: number) => {
		const [a, p, c] = [v[(i + v.length - 1) % v.length], v[i], v[(i + 1) % v.length]];
		return (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0]);
	};
	const v = ring.filter((_, i) => Math.abs(turn(ring, i)) > 1e-9);
	const area = v.reduce((t, p, i) => t + p[0] * v[(i + 1) % v.length][1] - v[(i + 1) % v.length][0] * p[1], 0);
	const reflex = v.map((_, i) => turn(v, i) * area < 0);
	const star =
		v.length >= 6 && v.length % 2 === 0 && reflex.every((r, i) => r === reflex[i % 2]) && reflex[0] !== reflex[1];
	return star ? { v, n: v.length / 2, star: true } : { v, n: v.length };
}

/**
 * The period, and the vertex orbit at any point of it: the certificate numbers its vertex orbits, so every
 * vertex the walk placed carries its orbit, keyed modulo the lattice (orbits are translation-invariant).
 * The big preview draws /play's orbit dots from it.
 */
export const flatCell = (d: Darts, board: Board, turn: (sym: string) => number): TranslationalCellData =>
	flatCellWithOverlays(d, board, turn).cell;

export function flatCellWithOverlays(
	d: Darts,
	board: Board,
	turn: (sym: string) => number,
): { cell: TranslationalCellData; orbits: OrbitData; symmetry: (() => SymmetryData | null) | null } {
	const { patch, walk, turns, length } = flatPeriod(d, board, turn);
	const { T1, T2, verts, polys } = patch;
	const at = ([vi, ox, oy]: [number, number, number]) => [
		verts[vi][0] + ox * T1[0] + oy * T2[0],
		verts[vi][1] + ox * T1[1] + oy * T2[1],
	];
	const rings = polys.map((r) => r.map(at));
	const det = T1[0] * T2[1] - T1[1] * T2[0];
	const cellKey = (x: number, y: number) =>
		[(x * T2[1] - y * T2[0]) / det, (T1[0] * y - T1[1] * x) / det]
			.map((u) => (((Math.round(u * 1e4) % 1e4) + 1e4) % 1e4).toString())
			.join(",");
	// k counts only the orbits where three or more faces meet (tilesearch.cpp "k: the vertices that count"):
	// a flat vertex, a point along a straight side or a corner filling a notch, has two edges and no orbit.
	// An orbit's valence is the most edges any of its walked vertices has (the walk's rim ones miss some).
	const degree = new Array<number>(walk.vertices.length).fill(0);
	for (const { u, v } of walk.edges) (degree[u]++, degree[v]++);
	const valence = new Array<number>(Math.max(...d.orbit) + 1).fill(0);
	walk.vorbit.forEach((o, i) => (valence[o] = Math.max(valence[o], degree[i])));
	let k = 0;
	const counted = valence.map((n) => (n >= 3 ? k++ : -1));
	const orbitOf = new Map<string, number>();
	walk.vertices.forEach((v, i) => orbitOf.set(cellKey(v.x, v.y), counted[walk.vorbit[i]]));
	const orbits: OrbitData = { k, orbitAt: (x, y) => orbitOf.get(cellKey(x, y)) ?? -1 };
	const coloring = isColoring(board);
	const types = edgeTypes(board);
	const styleOf = (c: string) => types.get(c)?.style;
	const bubbly = [...types.values()].some((e) => e.style === "bump" || e.style === "bite");
	if (!coloring && !bubbly)
		return {
			cell: { p: rings.map((v) => tileOf(v)), b: [T1, T2] },
			orbits,
			symmetry: () => exactSymmetry(walk, T1, T2, rings),
		};
	// each face walked once from the darts: which board face it is (a colouring's hue), and its outline with
	// bump and bite sides curved (lib/bubble/edges.ts), keyed by where its centre falls in the period
	const mean = (ps: number[][]) => ps.reduce((m, p) => [m[0] + p[0] / ps.length, m[1] + p[1] / ps.length], [0, 0]);
	const shapes = cornerShapes(board);
	const grid = bubbleGrid(board);
	const colorsOf = faceColors(board);
	const found = new Map<string, { cls: number; ring: number[][]; word: string[] }>();
	for (const { h, x, y, th } of walk.instances) {
		const ring: number[][] = [];
		const word: string[] = [];
		let [g, px, py, dir] = [h, x, y, th];
		for (let i = 0; i < 128 && (!i || Math.hypot(px - x, py - y) > 1e-6); i++) {
			ring.push([px, py]);
			word.push(d.corner[g]);
			dir += turns[g];
			px += length[g] * Math.cos(dir);
			py += length[g] * Math.sin(dir);
			g = d.glue[d.rneig[g]];
			dir += Math.PI;
		}
		if (Math.hypot(px - x, py - y) > 1e-6) continue;
		const c = mean(ring);
		const key = cellKey(c[0], c[1]);
		if (!found.has(key))
			found.set(key, { cls: colorsOf.of(word), ring, word });
		if (found.size >= polys.length) break;
	}
	/** A face's outline: clockwise (the bubble corpus's winding, so a bump and the bite it meets draw one
	 *  curve), each side between real corners curved when its midpoint corner is a bump or a bite. */
	const curved = (ring: number[][], word: string[], style: BubbleEdgeStyle) => {
		const area = ring.reduce((t, p, i) => t + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0);
		const [r, w] = area > 0 ? [[...ring].reverse(), [...word].reverse()] : [ring, word];
		const real = w.flatMap((c, i) => (shapes.get(c)?.kind === "pi" ? [] : [i]));
		const out: { x: number; y: number }[] = [];
		real.forEach((i, j) => {
			const next = real[(j + 1) % real.length];
			const between = Array.from({ length: (next - i + w.length) % w.length || w.length }, (_, s) => (i + s) % w.length);
			const mid = between.map((m) => styleOf(w[m])).find((x) => x === "bump" || x === "bite");
			if (mid) pushEdge(out, r[i] as [number, number], r[next] as [number, number], mid === "bump", style, grid);
			else for (const m of between) out.push({ x: r[m][0], y: r[m][1] });
		});
		return { v: out.map((p) => [p.x, p.y]), n: real.length };
	};
	const palette = paletteFor(colorsOf.count);
	const hueOf = (i: number) => {
		const c = palette[Math.max(0, i)];
		return typeof c === "number" ? c : c === "dark" ? -1 : 42; // the flat renderer takes hues: cream is its hue
	};
	return {
		cell: {
			p: rings.map((v) => {
				const c = mean(v);
				const face = found.get(cellKey(c[0], c[1]));
				let tile = tileOf(v);
				if (bubbly && face) {
					const [o, m] = [c, mean(face.ring)];
					const at = face.ring.map((p) => [p[0] + o[0] - m[0], p[1] + o[1] - m[1]]);
					tile = curved(at, face.word, "arc");
				}
				return coloring ? { ...tile, hue: hueOf(face?.cls ?? 0) } : tile;
			}),
			b: [T1, T2],
		},
		orbits,
		// the wallpaper analysis reads vertices only, and a colouring's group can be smaller than its tiling's
		symmetry: coloring ? null : () => exactSymmetry(walk, T1, T2, rings),
	};
}

/**
 * The atlas's exact wallpaper analysis (lib/services/oracleSymmetry.ts) of a period: every edge is a unit
 * step, so when every turn is a multiple of 15° each vertex is a sum of 24th roots of unity, exact in
 * ℤ[ζ₂₄], built outward from the walk's origin. null when a turn is off that grid (the board's angles say
 * otherwise) or the walk does not reach a corner: the overlays then stay off.
 */
function exactSymmetry(walk: DartWalk, T1: number[], T2: number[], rings: number[][][]): SymmetryData | null {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const V = walk.vertices;
	const adj = V.map(() => [] as number[]);
	for (const { u, v } of walk.edges) (adj[u].push(v), adj[v].push(u));
	const exact: (Cyclotomic | undefined)[] = [Cyclotomic.ZERO(ring)];
	try {
		for (const queue = [0]; queue.length; ) {
			const u = queue.shift()!;
			for (const w of adj[u]) {
				if (exact[w]) continue;
				const [dx, dy] = [V[w].x - V[u].x, V[w].y - V[u].y];
				if (Math.abs(Math.hypot(dx, dy) - 1) > 1e-6) return null;
				exact[w] = exact[u]!.add(Cyclotomic.zeta(ring, zetaIndexFromAngle(Math.atan2(dy, dx), 24)));
				queue.push(w);
			}
		}
	} catch {
		return null; // an edge off the 15° grid
	}
	const at = (x: number, y: number) => {
		const i = walk.index.find(x, y);
		return i >= 0 ? exact[i] : undefined;
	};
	// a period exactly: the step between a vertex and its translate
	const period = ([px, py]: number[]) => {
		for (const v of V) {
			const a = at(v.x, v.y);
			const b = a && at(v.x + px, v.y + py);
			if (b) return b.sub(a);
		}
	};
	const [e1, e2] = [period(T1), period(T2)];
	if (!e1 || !e2) return null;
	const seed = new Map<string, Cyclotomic>();
	for (const [x, y] of rings.flat()) {
		const c = at(x, y);
		if (!c) return null;
		seed.set(c.key(), c);
	}
	return analyzeSymmetry(ring, e1, e2, [...seed.values()]);
}

// ── the hyperbolic plane ──

/**
 * The darts exactly as the atlas's developers ship them, so the site's disk draws them as it draws its own
 * shelves: develop_ai1.py for tilings (`lvert` a face's count of UNIT edges, so a triangle whose sides are
 * cut in two is 6, and `alpha` only when sides are cut or Pi corners appear) and develop_hyp_edges.py for
 * digon-marked boards (digons are `lvert` 2, from which the client derives the drawn edges). `alpha`,
 * `elen` and `drawn` together would mark a scalene board, and the walk would then build every face as an
 * irregular polygon. develop.test.ts checks this against develop_ai1.py's own output.
 */
export function hyperbolicDarts(
	d: Darts,
	g: Extract<Drawing, { kind: "hyperbolic" }>,
	board?: Board,
): SiteDarts & { sizes: number[] } {
	const n = d.rneig.length;
	// every vertex must close: round a vertex (an orbit of rneig) the angles divide 360°, as develop_ai1.py
	// checks; a vertex the gluing forms can fail where the board's own vertex lines all close
	const seen = new Set<number>();
	for (let h0 = 0; h0 < n; h0++) {
		if (seen.has(h0)) continue;
		let sum = 0;
		const word: string[] = [];
		for (let h = h0; !seen.has(h); h = d.rneig[h]) {
			seen.add(h);
			sum += g.turn(d.corner[h]);
			word.push(d.corner[h]);
		}
		const r = (2 * Math.PI) / sum;
		if (!(Math.abs(r - Math.round(r)) < 1e-6))
			throw new Error(
				`A vertex of this tiling, ${word.join(" ")}, adds up to ${+((sum * 180) / Math.PI).toFixed(2)}° at edge ${g.edge.toFixed(4)}, which does not close: it has no drawing with regular faces.`,
			);
	}
	// each dart's face (an orbit of h -> glue[rneig[h]]): its polygon size (0 an apeirogon) and edges per side
	const face = new Array<{ size: number; seg: number; iso?: boolean } | null>(n).fill(null);
	// a board whose faces of one shape are told apart by their corners (a colouring, bubble tiles): each
	// face takes the colour of the board face it is, as the plane does
	const colorsOf = board && isColoring(board) ? faceColors(board) : null;
	const cls = new Array<number>(n).fill(0);
	for (let h0 = 0; h0 < n; h0++) {
		if (face[h0]) continue;
		const orbit: number[] = [];
		for (let h = h0; !orbit.includes(h) && orbit.length <= n; h = d.glue[d.rneig[h]]) orbit.push(h);
		if (colorsOf) {
			const word = orbit.map((h) => d.corner[h]);
			const c = colorsOf.of(word);
			for (const h of orbit) cls[h] = c;
		}
		const s = orbit
			.map((h) => g.shape(d.corner[h]))
			.find((x) => x.kind === "polygon" || x.kind === "digon" || x.kind === "iso");
		const f =
			s?.kind === "digon"
				? { size: 2, seg: 1 }
				: s?.kind === "polygon"
					? { size: s.n ?? 0, seg: s.seg }
					: s?.kind === "iso"
						? { size: 2 * s.n, seg: s.seg, iso: true }
						: { size: 3, seg: 1 };
		for (const h of orbit) face[h] = f;
	}
	// ascending, the apeirogon last (develop_ai1.py's order)
	const sizes = [...new Set(face.map((f) => f!.size))].sort((x, y) => (x === 0 ? 1 : 0) - (y === 0 ? 1 : 0) || x - y);
	const lvert = new Array<number>(n);
	d.rneig.forEach((r, h) => (lvert[r] = face[h]!.size * face[h]!.seg));
	// cut sides, Pi corners and isotoxal faces all need each dart's own turn
	const cut = face.some((f) => f!.seg !== 1 || "iso" in f!) || d.corner.some((c) => g.shape(c).kind === "pi");
	const marked = sizes.includes(2);
	// bubble sides: the disk curves them (hyperbolicWalk.ts bump)
	const types = board ? edgeTypes(board) : new Map<string, { style?: string }>();
	const bumps = [...types.values()].some((e) => e.style === "bump" || e.style === "bite");
	return {
		rneig: d.rneig,
		glue: d.glue,
		lvert,
		seed: 0,
		...(marked ? {} : { faceColor: colorsOf ? cls : face.map((f) => sizes.indexOf(f!.size)) }),
		...(cut ? { alpha: d.corner.map(g.turn) } : {}),
		...(bumps ? { bump: d.corner.map((c) => (types.get(c)?.style === "bump" ? 1 : types.get(c)?.style === "bite" ? -1 : 0)) } : {}),
		sizes,
	};
}
