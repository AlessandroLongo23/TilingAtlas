// Everything the atlas can say about one vertex figure, e.g. 3.4.7.4: its geometry, how many uniform
// tilings it has, and which boards of the hyperbolic polygon shelf carry it. The /theory/vertex lookup
// reads this; Marek Čtrnáct asked for it (2026-09-28) as the front door to the 4-valent shelf.
//
// The uniform count is COMPUTED (uniformTilingsOfFigure, a one-vertex-orbit D-symbol enumeration), not
// read off the shelf, so it answers for figures no corpus covers. It agrees with every k = 1 slice the
// shelf ships at valence ≤ 8: 225 (board, figure) pairs, zero mismatches (vertex-figure.test.ts holds a
// sample).

import { uniformTilingsOfFigure } from "@/lib/classes/algorithm/delaney/DSymGenerator";
import { HYP_POLY_BOARDS, canonicalCycle, hypPolySubOfBoard, type HypPolyBoard } from "@/lib/tilings/hyp-poly";

export type Geometry = "spherical" | "euclidean" | "hyperbolic";

/** Valences the lookup answers. The enumeration is instant to 8 and slows sharply past it. */
export const MIN_VALENCE = 3;
export const MAX_VALENCE = 8;

/** "3.4.7.4", "3 4 7 4" or "3,4,7,4" → [3, 4, 7, 4]; null unless every entry is an integer ≥ 3. */
export function parseFigure(s: string): number[] | null {
	const parts = s.trim().split(/[\s.,]+/).filter(Boolean).map(Number);
	return parts.length && parts.every((n) => Number.isInteger(n) && n >= 3) ? parts : null;
}

/** Exact: the Euclidean corner angles sum to 2π iff Σ 1/n = q/2 − 1. Compared by cross-multiplying. */
export function geometryOf(fig: readonly number[]): Geometry {
	const L = fig.reduce((a, n) => a * n, 1);
	const lhs = 2 * fig.reduce((a, n) => a + L / n, 0);
	const rhs = (fig.length - 2) * L;
	return lhs > rhs ? "spherical" : lhs === rhs ? "euclidean" : "hyperbolic";
}

/** Interior angle of a regular hyperbolic n-gon of edge ℓ. */
const angle = (n: number, l: number) => 2 * Math.asin(Math.cos(Math.PI / n) / Math.cosh(l / 2));

/** The edge length at which a hyperbolic figure closes (angles sum to 2π). Every angle falls as ℓ grows,
 *  so bisection is exact to float precision. */
export function closingEdge(fig: readonly number[]): number {
	let lo = 0;
	let hi = 64;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (fig.reduce((a, n) => a + angle(n, mid), 0) > 2 * Math.PI) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** A board's defining figure and alphabet, per family. */
function boardShape(b: HypPolyBoard): { fig: number[]; alphabet: number[] } {
	if (b.family === "ai1") return { fig: [3, 4, b.n, 4], alphabet: [3, 4, b.n, 2 * b.n] };
	if (b.family === "ai2") return { fig: Array(b.n).fill(3), alphabet: [3, b.n] };
	const fig = b.label.split(",").map(Number);
	return { fig, alphabet: [...new Set(fig)].sort((x, y) => x - y) };
}

/** Every vertex MULTISET over `alphabet` that closes at edge ℓ, sorted, as "3.3.7.7". Bounded because
 *  every angle is positive. */
function closingMultisets(alphabet: readonly number[], l: number): string[] {
	const a = alphabet.map((n) => angle(n, l));
	const out: string[] = [];
	const rec = (i: number, left: number, acc: number[]) => {
		if (Math.abs(left) < 1e-9) {
			if (acc.length >= 3) out.push(acc.join("."));
			return;
		}
		if (i === alphabet.length || left < 0) return;
		for (let c = 0; c * a[i] <= left + 1e-9; c++) rec(i + 1, left - c * a[i], [...acc, ...Array(c).fill(alphabet[i])]);
	};
	rec(0, 2 * Math.PI, []);
	return out.sort();
}

export interface BoardMatch {
	board: HypPolyBoard;
	/** /library sub-axis key, for the board link. */
	sub: string;
	alphabet: number[];
	/** Every vertex multiset over the board's alphabet that closes at its edge length. Length 1 means the
	 *  board holds only tilings built from this figure's multiset (in any cyclic order). */
	multisets: string[];
	/** k values the corpus has tilings for, ascending. */
	ks: number[];
}

export interface FigureReport {
	figure: number[];
	geometry: Geometry;
	/** Distinct vertex-transitive tilings, mirror pairs counted once. */
	uniform: number;
	/** Closing edge length; hyperbolic only. */
	edge?: number;
	boards: BoardMatch[];
}

export function describeFigure(input: readonly number[]): FigureReport {
	const figure = canonicalCycle(input);
	const geometry = geometryOf(figure);
	const uniform = uniformTilingsOfFigure(figure).length;
	if (geometry !== "hyperbolic") return { figure, geometry, uniform, boards: [] };
	const edge = closingEdge(figure);
	const boards: BoardMatch[] = [];
	for (const board of HYP_POLY_BOARDS) {
		if (board.family === "hybrid") continue; // apeirogons: outside what a typed figure can name yet
		const { fig, alphabet } = boardShape(board);
		if (!figure.every((n) => alphabet.includes(n)) || Math.abs(closingEdge(fig) - edge) > 1e-9) continue;
		const ks = Object.keys(board.counts).map(Number).sort((x, y) => x - y);
		boards.push({ board, sub: hypPolySubOfBoard(board), alphabet, multisets: closingMultisets(alphabet, edge), ks });
	}
	return { figure, geometry, uniform, edge, boards };
}

/** Whether a record's `config` ("3.4.7.4 + 4.7.14") has `figure` (canonical) at some vertex, in exactly
 *  this cyclic order up to rotation and reflection. */
export function configUsesFigure(config: string, figure: readonly number[]): boolean {
	const want = figure.join(".");
	return config.split(" + ").some((v) => canonicalCycle(v.split(".").map(Number)).join(".") === want);
}
