// Families: a tiling whose star points can slide, the angle α of a star's point changing while every
// vertex still closes. A grid search finds each member at its own α as its own tiling, the corners named
// A6p30, A6p45…; the atlas shows a family once (DEVELOPMENT_NOTES 2026-08-07). This folds a run the same
// way, after the search, since the engine reads no angles.
//
// Two tilings are members of one family when they are the same tiling once each star corner is read as
// "a point (or dent) of an n-pointed star" whatever its α: the same corners round every vertex and the
// same gluing. That is an exact canonical form of the certificate's map with those labels, never a hash,
// so a collision cannot fold two tilings into one. The gluing matters: grouping by vertex words alone
// folded away twelve tilings at k = 8 in the atlas's first prover.
//
// The pinning test says which tilings flex at all (tools/ctrnact-oracle/pin_test.py): per star species
// (n points, sides of `seg` edges) a flex δ moves its point by +δ and its dent by −δ, and each vertex
// keeps its 360° when Σ (points − dents)·δ = 0 over its corners. The tiling flexes when that matrix has
// rank below the number of species. A group of several members must flex; a pinned one with several
// members would be a contradiction, and is reported.
import type { Board } from "./board";
import { cornerShapes, type Shape } from "./corners";
import { decode, vertexWords, type Darts } from "./develop";

/** A corner's label with a star's α left out; any other corner keeps its own name. */
function abstractOf(board: Board): (sym: string) => string {
	const shapes = cornerShapes(board);
	return (sym) => {
		const s = shapes.get(sym);
		return s?.kind === "iso" ? `*${s.n}/${s.seg}${s.dent ? "d" : "p"}` : sym;
	};
}

/**
 * The map's canonical code with corners read through `label`: from every start dart in both orientations
 * (mirror images are one tiling), number the darts in the order a breadth-first walk over the vertex turn,
 * the gluing and the mirror copy meets them, and keep the least code. A map the walk cannot cover throws. Starts are limited to the darts whose corner label
 * and vertex size are least, which every isomorphic copy shares.
 */
export function canonical(d: Darts, label: (sym: string) => string): string {
	const n = d.rneig.length;
	const inv = new Array<number>(n);
	d.rneig.forEach((x, h) => (inv[x] = h));
	let best: string | null = null;
	for (const forward of [true, false]) {
		const turn = forward ? d.rneig : inv;
		const lab = (h: number) => label(d.corner[forward ? h : inv[h]]);
		const size = (h: number) => {
			let m = 1;
			for (let x = turn[h]; x !== h; x = turn[x]) m++;
			return m;
		};
		const keyOf = (h: number) => `${lab(h)}\u0001${size(h)}`;
		const keys = Array.from({ length: n }, (_, h) => keyOf(h));
		const least = keys.reduce((a, b) => (b < a ? b : a));
		for (let s = 0; s < n; s++) {
			if (keys[s] !== least) continue;
			const num = new Array<number>(n).fill(-1);
			const order = [s];
			num[s] = 0;
			for (let i = 0; i < order.length; i++)
				for (const x of [turn[order[i]], d.glue[order[i]], d.mirror[order[i]]])
					if (num[x] < 0) {
						num[x] = order.length;
						order.push(x);
					}
			if (order.length !== n) throw new Error("the map is not connected");
			const code = order.map((h) => `${num[turn[h]]},${num[d.glue[h]]},${num[d.mirror[h]]},${lab(h)}`).join(";");
			if (best === null || code < best) best = code;
		}
	}
	if (best === null) throw new Error("no start dart");
	return best;
}

/** How many ways the tiling's stars can flex together (0: pinned), from its vertex words. */
export function flexDim(shapes: Map<string, Shape>, words: string[][]): number {
	const species = new Map<string, number>();
	for (const w of words)
		for (const c of w) {
			const s = shapes.get(c);
			if (s?.kind === "iso" && !species.has(`${s.n}/${s.seg}`)) species.set(`${s.n}/${s.seg}`, species.size);
		}
	if (!species.size) return 0;
	const rows = words.map((w) => {
		const r = new Array<number>(species.size).fill(0);
		for (const c of w) {
			const s = shapes.get(c);
			if (s?.kind === "iso") r[species.get(`${s.n}/${s.seg}`)!] += s.dent ? -1 : 1;
		}
		return r;
	});
	return species.size - rank(rows);
}

function rank(m: number[][]): number {
	const a = m.map((r) => [...r]);
	let r = 0;
	for (let c = 0; c < (a[0]?.length ?? 0) && r < a.length; c++) {
		const p = a.findIndex((row, i) => i >= r && Math.abs(row[c]) > 1e-9);
		if (p < 0) continue;
		[a[r], a[p]] = [a[p], a[r]];
		for (let i = 0; i < a.length; i++)
			if (i !== r && Math.abs(a[i][c]) > 1e-9) {
				const f = a[i][c] / a[r][c];
				for (let j = c; j < a[i].length; j++) a[i][j] -= f * a[r][j];
			}
		r++;
	}
	return r;
}

export interface Folded {
	/** Per k: the tilings, and the count with each family shown once. */
	perK: Map<number, { tilings: number; folded: number; families: number; flexing: number }>;
	/** Groups of two or more tilings that are one family: their indices into the certificates given. */
	groups: number[][];
	/** Certificates that could not be read, and groups whose members do not flex (should be none). */
	unread: number;
	pinnedGroups: number;
}

/**
 * Fold the certificates (`text` with the board's symbols, `k` from its file) by family. It yields to the
 * window every 100 certificates and reports how many are done, so a run of thousands keeps it responsive.
 */
export async function foldFamilies(
	board: Board,
	certs: { text: string; k: number }[],
	progress?: (done: number) => void,
): Promise<Folded> {
	const label = abstractOf(board);
	const shapes = cornerShapes(board);
	const byKey = new Map<string, number[]>();
	const dims: number[] = [];
	let unread = 0;
	for (let i = 0; i < certs.length; i++) {
		if (i % 100 === 0 && progress) (progress(i), await new Promise((r) => setTimeout(r)));
		const { text, k } = certs[i];
		dims[i] = flexDim(shapes, vertexWords(text));
		let key: string;
		try {
			key = `${k}|${canonical(decode(text, board), label)}`;
		} catch {
			unread++;
			key = `${k}|unread ${i}`;
		}
		byKey.set(key, [...(byKey.get(key) ?? []), i]);
	}
	const perK: Folded["perK"] = new Map();
	const groups: number[][] = [];
	let pinnedGroups = 0;
	for (const members of byKey.values()) {
		const k = certs[members[0]].k;
		const row = perK.get(k) ?? { tilings: 0, folded: 0, families: 0, flexing: 0 };
		row.tilings += members.length;
		row.folded += 1;
		const flexes = dims[members[0]] > 0;
		if (flexes) row.flexing += 1;
		if (members.length > 1) {
			row.families += 1;
			groups.push(members);
			if (!flexes) pinnedGroups++;
		}
		perK.set(k, row);
	}
	return { perK, groups, unread, pinnedGroups };
}
