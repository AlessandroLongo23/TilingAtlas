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
import {
	coloredCorner,
	cyclicKey,
	edgeLength,
	edgeTypes,
	engineBoard,
	faceSize,
	sameCycle,
	searchesFaces,
	type Board,
} from "./board";
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

/**
 * The darts of a certificate: the first choice of mirror axes whose faces are the board's. A tile-orbit search
 * (`search faces`) ran on the board with faces and vertices swapped (engineBoard): its certificate is read with
 * that board, and the darts are swapped back, so a drawing sees the board's own tiling.
 */
export function decode(text: string, board: Board): Darts {
	if (!searchesFaces(board)) return decodeAs(text, board);
	const d = dualOf(decodeAs(text, swappedOf(board)));
	if (!facesMatch(d, board)) throw new Error("Cannot read this certificate: swapped back, its faces are not the board's.");
	return d;
}
const engines = new WeakMap<Board, Board>();
const swappedOf = (b: Board) => {
	let s = engines.get(b);
	if (!s) engines.set(b, (s = engineBoard(b)));
	return s;
};

/**
 * The dual of a quotient's darts: its faces are the vertices and its vertices the faces. A step round a new vertex is
 * a step round an old face (turn, then cross the edge); the edges and each corner's symbol stay, the corner being
 * the same meeting of a vertex and a face. A dart's mirror copy is its old one across the edge, which reverses the
 * new steps as the old mirror reversed the old ones; and a dart's vertex type is the class of its new vertex under
 * the steps and the mirror.
 */
function dualOf(d: Darts): Darts {
	const n = d.rneig.length;
	const rneig = d.rneig.map((r) => d.glue[r]);
	const mirror = d.mirror.map((m) => d.glue[m]);
	const orbit = new Array<number>(n).fill(-1);
	let k = 0;
	for (let h0 = 0; h0 < n; h0++) {
		if (orbit[h0] >= 0) continue;
		const stack = [h0];
		orbit[h0] = k;
		while (stack.length) {
			const h = stack.pop()!;
			for (const x of [rneig[h], mirror[h]]) if (orbit[x] < 0) ((orbit[x] = k), stack.push(x));
		}
		k++;
	}
	return { rneig, glue: d.glue, corner: d.corner, orbit, mirror };
}

/**
 * The tiling's vertex words, one per vertex type, each whole: for a tile-orbit search from the swapped darts, a
 * step round a vertex in the quotient being one period of it, repeated to the length of the face of the swapped
 * board it is (that board's faces are this board's vertices); otherwise as the certificate lists them.
 */
export function vertexWordsOf(text: string, board: Board): string[][] {
	if (!searchesFaces(board)) return vertexWords(text);
	const d = decode(text, board);
	const sizes = new Map(swappedOf(board).faces.map((f) => [cyclicKey(Array.from({ length: f.repeat as number }, () => f.word).flat()), f.word.length * (f.repeat as number)]));
	const out = new Map<number, string[]>();
	for (let h0 = 0; h0 < d.rneig.length; h0++) {
		if (out.has(d.orbit[h0])) continue;
		const period: string[] = [];
		for (let h = h0, i = 0; i === 0 || h !== h0; h = d.rneig[h], i++) period.push(d.corner[h]);
		const n = [...new Set(sizes.values())].find((m) => m % period.length === 0 && sizes.has(cyclicKey(repeat(period, m / period.length))));
		out.set(d.orbit[h0], n ? repeat(period, n / period.length) : period);
	}
	return [...out.values()];
}

function decodeAs(text: string, board: Board): Darts {
	const cert = parseCertificate(text);
	// each vertex type's tables, those holding every label the gluing line names for it: any other fails
	// whatever the rest are. Without this the axes multiply, two for every edge midpoint, and listing their
	// combinations ran out of memory at k = 13 on a board with lengths as edge types
	const named = cert.types.map(() => new Set<string>());
	for (const { kind, items } of cert.structure)
		for (const [r, star] of [
			[items[0], false],
			[items[1] ?? items[0], kind === "[]"],
		] as const)
			named[r.orbit]?.add((r.mirror !== star ? "*" : "") + r.pos);
	const options = cert.types.map((t, o) =>
		variants(t.figure, t.tag).filter((v) => [...named[o]].every((l) => v.labels.includes(l))),
	);
	if (!cert.types.length) throw new Error("Cannot read this certificate: no vertex types.");
	if (options.some((vs) => !vs.length)) throw new Error("Cannot read this certificate: a label is not in its table.");
	// the tables type by type, each choice checked against the gluings it completes: a gluing joins half-edges of
	// two types, and a choice that conflicts with one fails whatever the others are. Depth first, in the order the
	// combinations were listed in (the last type's table turning fastest), so the first that reads is the one it
	// always was. Trying whole combinations instead gave up after 10^5 of them, which a board with lengths as edge
	// types passes by k = 20 (a square and a 1 × √2 house: 29 of 355 tilings at k = 21 unread, and slow)
	const n = options.length;
	const size = options.map((vs) => vs[0].rneig.length);
	const base = size.map((_, o) => size.slice(0, o).reduce((t, x) => t + x, 0));
	const orbitOf = size.flatMap((m, o) => Array<number>(m).fill(o));
	const ends = cert.structure.map(
		({ kind, items }) =>
			[
				[items[0], false],
				[items[1] ?? items[0], kind === "[]"],
			] as const,
	);
	// the gluings each type completes, chosen in order
	const due = options.map(() => [] as number[]);
	ends.forEach((e, s) => due[Math.min(n - 1, Math.max(e[0][0].orbit, e[1][0].orbit))].push(s));
	const pick = options.map(() => 0);
	const glue = new Array<number>(orbitOf.length).fill(-1);
	const changed: number[] = [];
	const dart = ([r, star]: readonly [Ref, boolean]) => {
		const l = options[r.orbit]?.[pick[r.orbit]].labels.indexOf((r.mirror !== star ? "*" : "") + r.pos) ?? -1;
		return l < 0 ? -1 : base[r.orbit] + l;
	};
	const mirror = (h: number) => base[orbitOf[h]] + options[orbitOf[h]][pick[orbitOf[h]]].mirro[h - base[orbitOf[h]]];
	const join = (a: number, b: number) => {
		if ((glue[a] !== -1 && glue[a] !== b) || (glue[b] !== -1 && glue[b] !== a)) return false;
		for (const [x, y] of [
			[a, b],
			[b, a],
		])
			if (glue[x] === -1) ((glue[x] = y), changed.push(x));
		return true;
	};
	const place = (s: number) => {
		const [h0, h1] = [dart(ends[s][0]), dart(ends[s][1])];
		return h0 >= 0 && h1 >= 0 && join(h0, h1) && join(mirror(h0), mirror(h1));
	};
	let last = "conflicting gluing";
	let nodes = 0;
	const search = (o: number): Darts | null => {
		if (o === n) {
			try {
				const d = block(
					cert,
					pick.map((j, q) => options[q][j]),
				);
				if (facesMatch(d, board)) return d;
				last = "its faces are not the board's";
			} catch (e) {
				last = (e as Error).message;
			}
			return null;
		}
		for (let j = 0; j < options[o].length && nodes++ < 1e6; j++) {
			pick[o] = j;
			const mark = changed.length;
			const found = due[o].every(place) ? search(o + 1) : null;
			if (found) return found;
			while (changed.length > mark) glue[changed.pop()!] = -1;
		}
		return null;
	};
	const found = search(0);
	if (found) return found;
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
	if (sums.every((s) => Math.abs(s - TWO_PI) < CLOSE)) {
		// the vertices close at any edge; a face whose set angles add up to less than a plane polygon's
		// ({3,7} triangles at 360/7) closes only in the hyperbolic plane, at the edge it fixes
		const finite = board.faces
			.filter((f) => f.repeat !== "inf")
			.map((f) => Array.from({ length: f.repeat as number }, () => f.word).flat());
		const open = finite.filter((w) => Math.abs(w.reduce((t, s) => t + flat(s), 0) - (w.length - 2) * Math.PI) > CLOSE);
		if (!open.length) return { kind: "plane", turn: flat };
		const word = open[0].join(" ");
		if (open.some((w) => w.some((s) => !["set", "pi"].includes(shapes.get(s)!.kind))))
			return {
				kind: "none",
				message: `Face ${word} does not close in the plane, and its corners are not all set: give each an angle to draw it.`,
			};
		if (open.some((w) => w.reduce((t, s) => t + flat(s), 0) > (w.length - 2) * Math.PI))
			return {
				kind: "none",
				message: `Face ${word} has corners adding up to more than a plane polygon's: a tiling of the sphere, which is not drawn yet.`,
			};
		// each face walked with its typed sides at their own lengths (a Schwarz triangle's) and its plain ones at
		// the shortest length every face closes at: one face alone may close at two (faceEdges)
		const walks = finite.map((w) => ({ w, alphas: w.map(flat), steps: stepsOf(board, w) }));
		const typed = walks.find((x) => !x.steps.includes(null) && missAt(x.alphas, x.steps)(0) > 1e-6);
		if (typed)
			return {
				kind: "none",
				message: `Face ${typed.w.join(" ")} does not close in the hyperbolic plane with its sides at their lengths.`,
			};
		const plain = walks.filter((x) => x.steps.includes(null));
		// typed all round, no side is plain and the length is never used
		const l = plain.length ? sharedEdge(plain) : 1;
		if (l === null)
			return {
				kind: "none",
				message: `With equal sides, the faces of this board close at different edge lengths, so it has no drawing in the hyperbolic plane.`,
			};
		return { kind: "hyperbolic", edge: l, turn: flat, shape: (s) => shapes.get(s)! };
	}
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
	// solved from the first vertex that fixes it: one of flat corners only (Pi Pi) closes at every length
	const seed = words.find((w) => solveEdge(w, shapes, "hyperbolic") !== null);
	const l = seed ? solveEdge(seed, shapes, "hyperbolic") : null;
	const bad =
		l === null
			? words.find((w) => w !== seed)
			: words.find(
					(w) => Math.abs(w.reduce((t, s) => t + cornerAngle(shapes.get(s), "hyperbolic", l)!, 0) - TWO_PI) > 1e-6,
				);
	if (l === null || bad)
		return {
			kind: "none",
			message: `With regular faces, vertex ${(seed ?? words[0]).join(" ")} and vertex ${(bad ?? words[0]).join(" ")} close at different edge lengths, so this tiling has no drawing with regular faces. Give its corners angles that close in the plane to draw it there.`,
		};
	return {
		kind: "hyperbolic",
		edge: l,
		turn: (s) => cornerAngle(shapes.get(s), "hyperbolic", l)!,
		shape: (s) => shapes.get(s)!,
	};
}

/**
 * The corners of a face of set angles, from one period of its ring in the quotient: the board face that
 * period repeats round (A1 A2 once for an A1 A2 A1 A2 rhombus, as its two halves are one orbit).
 */
function setFaceSize(board: Board, period: string[]): number {
	let sizes = faceSizes.get(board);
	if (!sizes) {
		// each finite face by its word up to turning and mirroring, once a board: a run draws thousands of tilings
		const words = board.faces.flatMap((f) => (f.repeat === "inf" ? [] : [Array.from({ length: f.repeat }, () => f.word).flat()]));
		faceSizes.set(board, (sizes = new Map(words.map((w) => [cyclicKey(w), w.length]))));
	}
	for (const n of new Set(sizes.values())) {
		if (n % period.length) continue;
		const size = sizes.get(cyclicKey(Array.from({ length: n / period.length }, () => period).flat()));
		if (size !== undefined) return size;
	}
	return 3;
}
const faceSizes = new WeakMap<Board, Map<string, number>>();

/**
 * The plain sides, shortest first, at which a face of these corner angles closes in the hyperbolic plane, its
 * typed steps (`steps`, as stepsOf gives them) at their own lengths. The walk (a side, then a turn of π − α, on
 * the hyperboloid) returns to its start only there; they are found by scanning the distance the walk ends from
 * its start, then refining each dip. Usually there is one, but an angle word can close twice: 90° 90° 90° 180°
 * four times round is four pentagons of {5,4} round a vertex, and four hexagons of {6,4}.
 */
export function faceEdges(alphas: number[], steps: (number | null)[] = []): number[] {
	const miss = missAt(alphas, steps);
	const at = (i: number) => 0.01 * Math.pow(3000, i / 600); // 0.01 to 30, evenly in log
	const d = Array.from({ length: 601 }, (_, i) => miss(at(i)));
	// every dip that reaches zero, not only the deepest sample: where the turns add up to whole turns (a {4,5}
	// pentomino's to 720°) the walk closes in the plane too, so the miss also falls to nothing as the side shrinks
	const out: number[] = [];
	for (let i = 1; i < 600; i++) {
		if (!(d[i] <= d[i - 1] && d[i] <= d[i + 1])) continue;
		let [lo, hi] = [at(i - 1), at(i + 1)];
		for (let k = 0; k < 200; k++) {
			const [a, b] = [lo + (hi - lo) / 3, hi - (hi - lo) / 3];
			if (miss(a) < miss(b)) hi = b;
			else lo = a;
		}
		const s = (lo + hi) / 2;
		// a face that closes in the plane closes only as its side shrinks to nothing
		if (miss(s) < 1e-6 && s > 0.02 && !out.some((x) => Math.abs(x - s) < 1e-6)) out.push(s);
	}
	return out;
}

/**
 * The shortest plain side at which every face closes (each as faceEdges takes it), or null. Only the first face is
 * scanned; each of its sides is then checked on the others, one walk each: on AL's board of 78 {3,7} octiamonds a
 * scan per face cost 5.4 s per tiling drawn.
 */
export function sharedEdge(faces: { alphas: number[]; steps: (number | null)[] }[]): number | null {
	if (!faces.length) return null;
	const rest = faces.slice(1).map((f) => missAt(f.alphas, f.steps));
	return faceEdges(faces[0].alphas, faces[0].steps).find((s) => rest.every((miss) => miss(s) < 1e-6)) ?? null;
}

/** How far the isometry a walk ends on is from the identity: the end's distance alone vanishes for a tiny face
 *  too, the turn it is left with does not (a {3,7} triangle drawn small turns by 27° too many). */
export const missOf = (end: number[]) => Math.hypot(...end.map((v, i) => v - (i % 4 === 0 ? 1 : 0)));

/** missOf(faceWalk(alphas, s, steps).end) as a function of s, the turns and typed steps worked out once and each
 *  call nine numbers multiplied in place: the scan calls it some 2,000 times a face. */
export function missAt(alphas: number[], steps: (number | null)[] = []): (s: number) => number {
	const co = alphas.map((a) => Math.cos(Math.PI - a));
	const si = alphas.map((a) => Math.sin(Math.PI - a));
	const ch = steps.map((l) => (l == null ? NaN : Math.cosh(l)));
	const sh = steps.map((l) => (l == null ? NaN : Math.sinh(l)));
	return (s) => {
		const [C, H] = [Math.cosh(s), Math.sinh(s)];
		// the columns of the walk so far, rows 0 to 2
		let [a0, a1, a2, b0, b1, b2, c0, c1, c2] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
		for (let i = 0; i < alphas.length; i++) {
			const [c, h] = steps[i] == null ? [C, H] : [ch[i], sh[i]];
			// a side: columns 0 and 2 mix by the boost
			[a0, c0] = [a0 * c + c0 * h, a0 * h + c0 * c];
			[a1, c1] = [a1 * c + c1 * h, a1 * h + c1 * c];
			[a2, c2] = [a2 * c + c2 * h, a2 * h + c2 * c];
			// a turn: columns 0 and 1 by the rotation
			[a0, b0] = [a0 * co[i] + b0 * si[i], b0 * co[i] - a0 * si[i]];
			[a1, b1] = [a1 * co[i] + b1 * si[i], b1 * co[i] - a1 * si[i]];
			[a2, b2] = [a2 * co[i] + b2 * si[i], b2 * co[i] - a2 * si[i]];
		}
		return Math.sqrt((a0 - 1) ** 2 + b0 ** 2 + c0 ** 2 + a1 ** 2 + (b1 - 1) ** 2 + c1 ** 2 + a2 ** 2 + b2 ** 2 + (c2 - 1) ** 2);
	};
}

/** The walk round a face on the hyperboloid, the step to corner i `steps[i]` long where set and `s` where not:
 *  the point (x, y, z with z² − x² − y² = 1) of each corner, where it turns by π − alphas[i], and the isometry
 *  it ends on (row-major 3×3), the identity when the face closes. */
export function faceWalk(
	alphas: number[],
	s: number,
	steps: (number | null)[] = [],
): { corners: number[][]; end: number[] } {
	type M = number[];
	const mul = (a: M, b: M) =>
		[0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]));
	const step = (l: number) => {
		const [c, h] = [Math.cosh(l), Math.sinh(l)];
		return [c, 0, h, 0, 1, 0, h, 0, c];
	};
	const plain = step(s);
	const corners: number[][] = [];
	const end = alphas.reduce(
		(m, a, i) => {
			const at = mul(m, steps[i] == null ? plain : step(steps[i]!));
			corners.push([at[2], at[5], at[8]]); // the origin, carried along the sides so far
			const [co, si] = [Math.cos(Math.PI - a), Math.sin(Math.PI - a)];
			return mul(at, [co, -si, 0, si, co, 0, 0, 0, 1]);
		},
		[1, 0, 0, 0, 1, 0, 0, 0, 1],
	);
	return { corners, end };
}

/** Each edge corner whose type has a length of its own (`edge E237_2 length 0.2831…`), with that length. */
function typedLengths(b: Board): Map<string, number> {
	return new Map(
		b.angles.flatMap((a) => {
			const l = a.edge?.length === undefined ? null : edgeLength(a.edge.length);
			return l === null ? [] : [[a.sym, l] as const];
		}),
	);
}

/** Each step round a face's word, from the corner before to corner i: half its side beside an edge corner of a
 *  typed length (a Schwarz triangle's sides), null for a plain step, one edge of the length a drawing solves. */
export function stepsOf(b: Board, word: string[]): (number | null)[] {
	const len = typedLengths(b);
	return word.map((c, i) => {
		const l = len.get(word[(i + word.length - 1) % word.length]) ?? len.get(c);
		return l === undefined ? null : l / 2;
	});
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
 * other), and that edge's length. A dart of a typed side is half the side, so the side is drawn twice its
 * length, the same scale for every edge type; a plain unit edge is one dart, so on a board with edge types it
 * is 2 (a face of plain sides of length 1 and typed ones, as Lengths as edge types draws it), else 1.
 */
function dartEdges(d: Darts, board: Board) {
	const types = edgeTypes(board);
	const lneig = new Array<number>(d.rneig.length);
	d.rneig.forEach((r, h) => (lneig[r] = h));
	const edge = d.rneig.map((_, h) =>
		[d.corner[h], d.corner[lneig[h]], d.corner[d.glue[h]], d.corner[lneig[d.glue[h]]]].find((c) => types.has(c)),
	);
	const plain = types.size ? 2 : 1;
	const length = Float64Array.from(edge, (e) => (e === undefined ? plain : types.get(e)!.length));
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

/** Whether each dart's edge is drawn: the corner on either side of it is a digon (develop_hyp_edges.py), or
 *  its edge line is not marked hidden. */
function dartsDrawn(d: Darts, board: Board) {
	const dig = digons(board);
	const { types, lneig, edge, length } = dartEdges(d, board);
	const drawn = (h: number) =>
		dig.has(d.corner[h]) ||
		dig.has(d.corner[lneig[h]]) ||
		(edge[h] !== undefined ? types.get(edge[h]!)!.style !== "hidden" : !dig.size);
	return { drawn, lneig, length };
}

/** One period, and the last walk it was read off. */
function flatPeriod(d: Darts, board: Board, turn: (sym: string) => number) {
	const n = d.rneig.length;
	const t = Float64Array.from(d.corner, turn);
	const { drawn, lneig, length } = dartsDrawn(d, board);
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
	const built = buildEdgePatch({ classLengths: [...new Set(length)] }, walkAt, {
		reach: 8,
		budget: 80000,
		attempts: 6,
	});
	if (!built.ok) throw new Error(`No period of this tiling was found: ${built.reason}.`);
	return { patch: built.patch, walk: last!, turns: t, length };
}

/**
 * Whether the board labels faces of one shape differently: then a tiling of it is a colouring. A shape is
 * the cycle of a face's corner angles, so a square and a rhombus, both four corners, are two shapes.
 */
export function isColoring(board: Board): boolean {
	let out = colorings.get(board);
	if (out !== undefined) return out;
	// asked for every tiling drawn, and each face is compared with all before it: once a board
	const shapes = cornerShapes(board);
	const seen: { shape: string[]; word: string[] }[] = [];
	out = board.faces.some((f) => {
		if (faceSize(f) === 2) return false;
		const word = f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat();
		const shape = word.map((c) => cornerAngle(shapes.get(c), "plane", 0)?.toFixed(6) ?? "?");
		if (seen.some((x) => sameCycle(x.shape, shape, false) && !sameCycle(x.word, word, false))) return true;
		seen.push({ shape, word });
		return false;
	});
	colorings.set(board, out);
	return out;
}
const colorings = new WeakMap<Board, boolean>();

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
	// an apeirogon's walked word is some number of its periods
	const full = (f: Board["faces"][number], n: number) =>
		f.repeat !== "inf" ? repeat(f.word, f.repeat) : n % f.word.length ? null : repeat(f.word, n / f.word.length);
	return {
		count: board.faces.length,
		of: (word) =>
			Math.max(
				0,
				board.faces.findIndex((f) => {
					const w = full(f, word.length);
					return (
						w !== null && w.length % word.length === 0 && sameCycle(repeat(word, w.length / word.length), w, false)
					);
				}),
			),
	};
}

/**
 * The board with each apeirogon made finite, for drawing a tiling's combinatorics (Marek's abstract mode,
 * 2026-10-31): every face of an apeirogon's class goes round its ring in the quotient some number of
 * periods, and the class becomes the polygon of the least common multiple of those counts, as a regular
 * polygon whose corners follow the geometry (1 is drawn as a triangle and 2 as a square, the fewest
 * sides that cover them). Null when the board has no apeirogon, or the tiling none of its faces.
 */
export function abstractBoard(board: Board, d: Darts): Board | null {
	const inf = board.faces.map((f, i) => (f.repeat === "inf" ? i : -1)).filter((i) => i >= 0);
	if (!inf.length) return null;
	const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
	const periods = new Map<number, number>(); // board face -> lcm of the periods its rings go round
	const seen = new Set<number>();
	for (let h0 = 0; h0 < d.rneig.length; h0++) {
		if (seen.has(h0)) continue;
		const ring: number[] = [];
		for (let h = h0; !seen.has(h); h = d.glue[d.rneig[h]]) (seen.add(h), ring.push(h));
		const word = ring.map((h) => d.corner[h]);
		const i = inf.find((j) => {
			const w = board.faces[j].word;
			return word.length % w.length === 0 && sameCycle(word, repeat(w, word.length / w.length), false);
		});
		if (i === undefined) continue;
		const n = word.length / board.faces[i].word.length;
		const m = periods.get(i) ?? 1;
		periods.set(i, (m * n) / gcd(m, n));
	}
	if (!periods.size) return null;
	return {
		...board,
		faces: board.faces.map((f, i) =>
			periods.has(i) ? { ...f, repeat: Math.max(3, periods.get(i)! === 2 ? 4 : periods.get(i)!) } : f,
		),
	};
}

/** A hue per board face, for colouring by shape: the golden angle apart, so faces next to each other on the
 *  board never come out close. */
export const shapeHue = (i: number) => (20 + i * 137.508) % 360;

/**
 * One period as the site's flat cell renderer takes it (lib/hooks/useFlatCellPreview.ts, the /theory
 * cards and the landing wall): a tiling's faces fill by side count, the atlas's tile palette; a colouring's
 * by which board face each is, through the colourings palette (lib/colors/render.ts).
 */
/**
 * A ring as the tile it is. A plain tile keeps its straight points (the Pi corners along a side of several
 * edges), as the atlas's scaled shelf stores a side-2 triangle: a degenerate hexagon, which polygonFillHue
 * colours apart from the triangle and the hexagon. A ring whose corners alternate convex and reflex is a
 * star of half as many points, which the atlas colours by its own star ramp (RawPolygon.star).
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
	return star ? { v, n: v.length / 2, star: true } : { v: ring, n: ring.length };
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
	/** Each board face its own hue (shapeHue), not its side count's: an A3 and a B3 then differ. */
	byShape = false,
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
	if (!coloring && !bubbly && !byShape)
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
	// each face once, by where its centre falls in the period: matched within 1e-6, as a rounded key splits a face
	// whose centre sits on a rounding boundary (a 1/32 of the period) into two
	const frac = (x: number, y: number) =>
		[(x * T2[1] - y * T2[0]) / det, (T1[0] * y - T1[1] * x) / det].map((u) => u - Math.floor(u));
	const same = (a: number[], b: number[]) =>
		a.every((u, i) => Math.min(Math.abs(u - b[i]), 1 - Math.abs(u - b[i])) < 1e-6);
	const found: { at: number[]; cls: number; ring: number[][]; word: string[] }[] = [];
	const faceAt = (c: number[]) => found.find((f) => same(f.at, frac(c[0], c[1])));
	for (const { h, x, y, th } of walk.instances) {
		const ring: number[][] = [];
		const word: string[] = [];
		let [g, px, py, dir] = [h, x, y, th];
		for (let i = 0; i < 128 && (!i || Math.hypot(px - x, py - y) > 1e-6); i++) {
			ring.push([px, py]);
			word.push(d.corner[g]);
			// turned onto the next dart, the walk crosses that dart's edge (flatDartWalk.ts): its length, not g's
			const r = d.rneig[g];
			dir += turns[g];
			px += length[r] * Math.cos(dir);
			py += length[r] * Math.sin(dir);
			g = d.glue[r];
			dir += Math.PI;
		}
		if (Math.hypot(px - x, py - y) > 1e-6) continue;
		const c = mean(ring);
		if (!faceAt(c)) found.push({ at: frac(c[0], c[1]), cls: colorsOf.of(word), ring, word });
		if (found.length >= polys.length) break;
	}
	/** A face's outline: clockwise (the bubble corpus's winding, so a bump and the bite it meets draw one
	 *  curve), each side between real corners curved when its midpoint corner is a bump or a bite. */
	const curved = (ring: number[][], word: string[], style: BubbleEdgeStyle) => {
		const area = ring.reduce(
			(t, p, i) => t + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1],
			0,
		);
		const [r, w] = area > 0 ? [[...ring].reverse(), [...word].reverse()] : [ring, word];
		const real = w.flatMap((c, i) => (shapes.get(c)?.kind === "pi" ? [] : [i]));
		const out: { x: number; y: number }[] = [];
		real.forEach((i, j) => {
			const next = real[(j + 1) % real.length];
			const between = Array.from(
				{ length: (next - i + w.length) % w.length || w.length },
				(_, s) => (i + s) % w.length,
			);
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
				const face = faceAt(c);
				let tile = tileOf(v);
				if (bubbly && face) {
					const [o, m] = [c, mean(face.ring)];
					const at = face.ring.map((p) => [p[0] + o[0] - m[0], p[1] + o[1] - m[1]]);
					tile = curved(at, face.word, "arc");
				}
				return coloring
					? { ...tile, hue: hueOf(face?.cls ?? 0) }
					: byShape
						? { ...tile, hue: shapeHue(face?.cls ?? 0) }
						: tile;
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
	/** Each board face its own hue in degrees (shapeHue), for the disk's faceHue mode. */
	byShape = false,
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
	const colorsOf = board && (byShape || isColoring(board)) ? faceColors(board) : null;
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
						: {
								size: board
									? setFaceSize(
											board,
											orbit.map((h) => d.corner[h]),
										)
									: 3,
								seg: 1,
							};
		for (const h of orbit) face[h] = f;
	}
	// ascending, the apeirogon last (develop_ai1.py's order)
	const sizes = [...new Set(face.map((f) => f!.size))].sort((x, y) => (x === 0 ? 1 : 0) - (y === 0 ? 1 : 0) || x - y);
	const lvert = new Array<number>(n);
	d.rneig.forEach((r, h) => (lvert[r] = face[h]!.size * face[h]!.seg));
	// cut sides, Pi corners and isotoxal faces all need each dart's own turn
	const cut =
		face.some((f) => f!.seg !== 1 || "iso" in f!) || d.corner.some((c) => ["pi", "set"].includes(g.shape(c).kind));
	const marked = sizes.includes(2);
	// drawn and hidden sides: each dart says whether its edge is drawn, as a Schwarz record does
	const typed = !!board && !marked && marksEdges(board);
	const drawn = typed ? dartsDrawn(d, board).drawn : null;
	// bubble sides: the disk curves them (hyperbolicWalk.ts bump)
	const types = board ? edgeTypes(board) : new Map<string, { style?: string }>();
	const bumps = [...types.values()].some((e) => e.style === "bump" || e.style === "bite");
	// sides typed by length (a Schwarz triangle's): the step from h's corner to the next round its face is dart
	// rneig[h]'s edge, half its side beside an edge corner of a length, the plain edge elsewhere (stepsOf)
	const len = board ? typedLengths(board) : new Map<string, number>();
	const elen = len.size ? new Array<number>(n) : null;
	if (elen)
		for (let h = 0; h < n; h++) {
			const l = len.get(d.corner[h]) ?? len.get(d.corner[d.glue[d.rneig[h]]]);
			elen[d.rneig[h]] = l === undefined ? g.edge : l / 2;
		}
	return {
		rneig: d.rneig,
		glue: d.glue,
		lvert,
		seed: 0,
		...(marked || drawn
			? {}
			: { faceColor: colorsOf ? (byShape ? cls.map(shapeHue) : cls) : face.map((f) => sizes.indexOf(f!.size)) }),
		...(drawn ? { drawn: d.rneig.map((_, h) => (drawn(h) ? 1 : 0)) } : {}),
		...(cut ? { alpha: d.corner.map(g.turn) } : {}),
		...(elen ? { elen } : {}),
		...(bumps
			? { bump: d.corner.map((c) => (types.get(c)?.style === "bump" ? 1 : types.get(c)?.style === "bite" ? -1 : 0)) }
			: {}),
		sizes,
	};
}
