// ── Families of faces ──
//
// A family is a set of faces added at once: regular polygons by size, the isotoxal faces whose corners sit on
// one angle grid (Marek's star palettes: 360°/24, 360°/10, 360°/5), the n-cell polyforms of a {p,q} grid, the
// Laves tiles, or the polyforms of a Schwarz triangle's grid (the triangle itself at one cell). Each family builds
// the board with all of its faces; the modal then keeps the ones picked (keepNew).

import planigon from "@/tools/ctrnact-oracle/alphabets/palettes/planigon.json";
import { cyclicKey, printLength, readLength, type Board, type Face } from "./board";
import { dentOf, isotoxal, withFace, type FaceSpec } from "./corners";
import { problemOf, withDrawnFace, type Edge } from "./freeface";
import { boardPolyforms, withBoardPolyforms } from "./boardforms";
import { MAX_CELLS, regularGrid, withPolyforms, type Picture } from "./polyform";

export type Family =
	| { kind: "regular"; sizes: (number | null)[] }
	| { kind: "system"; N: number; stars: boolean; convex: boolean }
	| { kind: "polyform"; p: number; q: number; n: number }
	| { kind: "laves"; all: boolean }
	/** The polyforms of n triangles of the Schwarz triangle's grid: n = 1 (the default) the triangle itself. */
	| { kind: "schwarz"; pqr: [number, number, number]; n?: number }
	/** The polyforms of n of the board's own faces (`cells`, all by default) that its vertex lines allow
	 *  (boardforms.ts). */
	| { kind: "board"; n: number; cells?: number[] };

/** Sizes typed as `3, 4, 6-8, oo` (oo the apeirogon), in order and each once; null when a part does not read. */
export function readSizes(text: string): (number | null)[] | null {
	const out: (number | null)[] = [];
	for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
		const m = /^(\d+)(?:-(\d+))?$/.exec(part);
		if (part === "oo" || part === "∞") out.push(null);
		else if (!m || +m[1] < 3 || +(m[2] ?? m[1]) > 360 || +(m[2] ?? m[1]) < +m[1]) return null;
		else for (let n = +m[1]; n <= +(m[2] ?? m[1]); n++) out.push(n);
	}
	return out.length ? [...new Set(out)] : null;
}

/**
 * The isotoxal faces whose every corner is a whole number of 360°/N steps: N divides 360, and a 2n-gon has n
 * dividing N (its corners add to 360 − 360/n). Stars come with their point, convex isotoxal faces (a rhombus
 * from n = 2) once, by their smaller corner. Regular polygons are their own family.
 */
export function systemSpecs(f: Extract<Family, { kind: "system" }>): FaceSpec[] {
	const { N } = f;
	if (!Number.isInteger(N) || N < 2 || 360 % N) return [];
	const step = 360 / N;
	const out: FaceSpec[] = [];
	for (let n = 2; n <= N; n++) {
		if (N % n) continue;
		for (let k = 1; k * step < 180; k++) {
			const point = k * step;
			if (!isotoxal(n, point)) continue;
			const star = dentOf(n, point) > 180;
			if (star ? f.stars : f.convex && point < dentOf(n, point)) out.push({ n, seg: 1, point });
		}
	}
	return out;
}

/** The board with every face of the family added after b's own, and for polyforms how many had holes and each
 *  added face drawn in its grid. */
export function withFamily(
	b: Board,
	f: Family,
): { board: Board; holes: number; pictures?: Picture[]; problem?: string } {
	if (f.kind === "laves") return { board: withLaves(b, f.all), holes: 0 };
	if (f.kind === "board") return withBoardPolyforms(b, boardPolyforms(b, f.n, f.cells));
	if (f.kind === "polyform" || f.kind === "schwarz") {
		const [m, low, n] = f.kind === "schwarz" ? [f.pqr, 2, f.n ?? 1] : [[f.p, f.q], 3, f.n];
		const ok = m.every((x) => Number.isInteger(x) && x >= low && x <= 60) && n >= 1 && n <= MAX_CELLS;
		if (!ok) return { board: b, holes: 0 };
		const spec = f.kind === "schwarz" ? { m: f.pqr, cell: [] } : regularGrid(f.p, f.q);
		const { board, holes, pictures } = withPolyforms(b, spec, n);
		// the triangle alone keeps its name
		const named = f.kind === "schwarz" && n === 1;
		const trail = (x: Face, i: number) => (named && i >= b.faces.length ? { ...x, trail: `(${f.pqr.join(",")})` } : x);
		return { board: { ...board, faces: board.faces.map(trail) }, holes, pictures };
	}
	const specs: FaceSpec[] = f.kind === "regular" ? f.sizes.map((n) => ({ n, seg: 1 })) : systemSpecs(f);
	return { board: specs.reduce((acc, s) => withFace(acc, s), b), holes: 0 };
}

/** A vertex word as Laves names its dual: the least of its turns and mirrors, read as numbers (4.6.12, not 12.6.4). */
export function lavesName(word: number[]): string {
	const turns = word.flatMap((_, i) => {
		const w = [...word.slice(i), ...word.slice(0, i)];
		return [w, [...w].reverse()];
	});
	const less = (x: number[], y: number[]) => {
		const j = x.findIndex((v, k) => v !== y[k]);
		return j >= 0 && x[j] < y[j];
	};
	return `V${turns.reduce((m, w) => (less(w, m) ? w : m)).join(".")}`;
}

/**
 * The Laves tiles: the duals of the eleven Archimedean tilings, and with `all` the other four planigons, duals of
 * vertices only k-uniform tilings have (3.3.4.12, 3.3.6.6, 3.4.3.12, 3.4.4.6). The atlas's planigon palette
 * (alphabets/make_planigons.py), its scale of 6 divided out: each tile is drawn at the scale of the tiling of unit
 * edges it is dual to, a corner at each polygon's centre, its sides typed by length so only equal sides glue (the
 * square's sides, length 1, are plain unit edges). Each face carries its Laves name as a comment.
 */
function withLaves(b: Board, all: boolean): Board {
	let out = b;
	for (const t of planigon.tiles) {
		const name = lavesName(t.name.slice(1).split(".").map(Number));
		if (!all && !ARCHIMEDEAN.has(name)) continue;
		let dir = 0;
		const edges: Edge[] = t.edgeLens.map((len, i) => {
			if (i) dir = (dir + 12 - t.angles[i] + 24) % 24;
			const l = readLength(`(${len})/${planigon.lengthScale}`)!;
			return { dir, len: l.value, text: printLength(l) };
		});
		if (problemOf(edges)) continue;
		const next = withDrawnFace(out, edges);
		const at = next.faces.length - 1;
		out = { ...next, faces: next.faces.map((f, i) => (i === at ? { ...f, trail: name } : f)) };
	}
	return out;
}
const ARCHIMEDEAN = new Set(
	["3.3.3.3.3.3", "3.3.3.3.6", "3.3.3.4.4", "3.3.4.3.4", "3.4.6.4", "3.6.3.6", "3.12.12", "4.4.4.4", "4.6.12", "4.8.8", "6.6.6"].map(
		(w) => `V${w}`,
	),
);

const faceKey = (f: Face) => `${cyclicKey(f.word)} × ${f.repeat}`;

/** Which of the faces `full` adds after b's own the board already has. */
export function onBoard(b: Board, full: Board): boolean[] {
	const have = new Set(b.faces.map(faceKey));
	return full.faces.slice(b.faces.length).map((f) => have.has(faceKey(f)));
}

/** b with the faces `full` adds kept where `keep(i)` and b lacks them, and the corners those faces need. */
export function keepNew(b: Board, full: Board, keep: (i: number) => boolean): { board: Board; added: number } {
	const dup = onBoard(b, full);
	const faces = full.faces.slice(b.faces.length).filter((_, i) => keep(i) && !dup[i]);
	const used = new Set(faces.flatMap((f) => f.word));
	const angles = full.angles.filter((a) => b.angles.some((x) => x.sym === a.sym) || used.has(a.sym));
	// the lines gluing a new edge type to itself (a Laves tile's lengths), for the types the kept faces use
	const edge = (c: string) => used.has(c) && !!angles.find((a) => a.sym === c)?.edge;
	const glue = full.vertices.slice(b.vertices.length).filter((v) => v.word.length === 2 && v.word.every(edge));
	return { board: { ...b, angles, faces: [...b.faces, ...faces], vertices: [...b.vertices, ...glue] }, added: faces.length };
}
