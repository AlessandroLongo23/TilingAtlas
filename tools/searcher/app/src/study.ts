// Studies: one board, many searches (docs/searcher/board-format.md, "Studies").
//
// A study board marks some faces `optional` and may name parameters with `vary`. The study runs one ordinary
// board per row: every subset of the optional faces whose size `subsets` allows, for every combination of the
// parameters' values. A row's board keeps the faces that are not optional and the optional faces of its subset,
// requires each of those (a `require face` line apiece), and keeps only the vertex lines whose corners its faces
// have. So a row answers "which tilings use exactly these optional faces", the question a census asks. A subset
// holding no face of a `require face` line over optional faces (Require any) is no row (requiredGroups).
//
// Before any search each row is checked, and a row is ruled out only with a reason that holds for every k:
// a required face has a corner no vertex line can hold (here); the engine's balance check leaves no vertex for
// one (main, tilesearch --balance); or the faces cannot touch each other on the vertices it leaves (splitReason).
import {
	cyclicKey,
	evaluate,
	fill,
	flatOf,
	PARAM_NAME as NAME,
	parse,
	removeVertices,
	requiredFaceKeys,
	serialize,
	faceId,
	withoutFaces,
	withPermutations,
	withRequiredFaces,
	type Board,
	type Face,
	type Problem,
} from "./board";
import type { FaceTally, StudyRow } from "./bridge";

/** Rows past this many are refused: each one is a search, and a check before it. */
export const MAX_ROWS = 10_000;

export interface Param {
	name: string;
	values: number[];
	/** 1-based line of its `vary` statement. */
	line: number;
}

// ── parameters: `vary n 5 6 7..10`, then {n}, {2n}, {360/n} anywhere below ──


/** The `vary` lines of a board text, and what is wrong with them. */
export function readParams(text: string): { params: Param[]; problems: Problem[] } {
	const params: Param[] = [];
	const problems: Problem[] = [];
	text.split(/\r?\n/).forEach((raw, i) => {
		const t = raw.replace(/#.*/, "").trim().split(/[ \t]+/).filter(Boolean);
		if (t[0] !== "vary") return;
		const line = i + 1;
		const bad = (message: string) =>
			problems.push({ severity: "error", line, where: { kind: "board" }, message });
		if (t.length < 3) return bad("Vary takes a name, then its values: vary n 5 6 7, or vary n 5..12.");
		if (!NAME.test(t[1])) return bad(`“${t[1]}” cannot name a parameter: use letters, digits and _, starting with a letter.`);
		if (params.some((p) => p.name === t[1])) return bad(`Parameter “${t[1]}” is varied twice.`);
		const values: number[] = [];
		for (const v of t.slice(2)) {
			const range = /^(-?\d+)\.\.(-?\d+)$/.exec(v);
			if (range) {
				const [a, b] = [Number(range[1]), Number(range[2])];
				if (b < a) return bad(`The range ${v} runs backwards.`);
				if (b - a > 1000) return bad(`The range ${v} is longer than 1,000 values.`);
				for (let x = a; x <= b; x++) values.push(x);
			} else if (/^-?\d+$/.test(v)) values.push(Number(v));
			else return bad(`“${v}” is not a whole number or a range like 5..12.`);
		}
		params.push({ name: t[1], values: [...new Set(values)], line });
	});
	// a parameter no {…} reads makes every row the same board
	const body = text.split(/\r?\n/).filter((l) => !/^\s*vary\b/.test(l)).map((l) => l.replace(/#.*/, "")).join("\n");
	const used = new Set((body.match(/\{[^{}]*\}/g) ?? []).flatMap((e) => e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
	for (const p of params)
		if (!used.has(p.name))
			problems.push({
				severity: "error",
				line: p.line,
				where: { kind: "board" },
				message: `Parameter ${p.name} is used nowhere yet: give a face ${p.name} sides in its dialog, or write {${p.name}} in a line.`,
			});
	return { params, problems };
}

/** The text with every {…} outside a `vary` line and a comment replaced by its value at `values`. */
export function substitute(text: string, values: Record<string, number>): { text: string; problems: Problem[] } {
	const problems: Problem[] = [];
	const bad = (i: number, message: string) => problems.push({ severity: "error", line: i + 1, where: { kind: "board" }, message });
	// A3^{n-2j} is n-2j corners A3: none at 0, and only a whole number from 0 up
	const powers = (s: string, i: number) =>
		s.replace(/(\s+)(\S+)\^(\S+)/g, (all, _: string, sym: string, p: string) => {
			if (p === "0") return "";
			if (!/^[1-9]\d*$/.test(p)) bad(i, `The power ${sym}^${p} must be a whole number from 0 up.`);
			return all;
		});
	const more: string[] = [];
	const lines = text.split("\n").map((raw, i) => {
		const hash = raw.indexOf("#");
		const body = hash < 0 ? raw : raw.slice(0, hash);
		if (/^\s*vary\b/.test(body) || !body.includes("{")) return raw;
		// `… for j 0..{n/2}`: the line once per whole j in the range, written after the board's last line
		const each = /^(.*\S)\s+for\s+(\S+)\s+(-?\d+|\{[^{}]*\})\.\.(-?\d+|\{[^{}]*\})\s*$/.exec(body);
		if (each) {
			const [, line, j, lo, hi] = each;
			if (!NAME.test(j) || j in values) return bad(i, `“${j}” cannot count the lines here: use a name that is not a parameter.`), "";
			try {
				const at = (s: string) => {
					const v = /^-?\d+$/.test(s) ? { p: Number(s), q: 1 } : evaluate(s.slice(1, -1), values);
					return v.p / v.q;
				};
				const [a, b] = [Math.ceil(at(lo)), Math.floor(at(hi))];
				if (b - a > 1000) return bad(i, `The range of ${j} is longer than 1,000 values.`), "";
				for (let x = a; x <= b; x++) {
					const { text: out, error } = fill(line, { ...values, [j]: x });
					if (error) return bad(i, error), "";
					more.push(powers(out, i));
				}
			} catch (e) {
				bad(i, `The range of ${j}: ${(e as Error).message}.`);
			}
			return hash < 0 ? "" : raw.slice(hash);
		}
		const { text: out, error } = fill(body, values);
		if (error) bad(i, error);
		return (error ? out : powers(out, i)) + (hash < 0 ? "" : raw.slice(hash));
	});
	if (more.length) lines.splice(lines.length - (lines.at(-1) === "" ? 1 : 0), 0, ...more);
	return { text: lines.join("\n"), problems };
}

/** Every combination of the parameters' values, the first parameter changing slowest. */
export function valueGrid(params: Param[]): Record<string, number>[] {
	return params.reduce<Record<string, number>[]>(
		(grid, p) => grid.flatMap((g) => p.values.map((v) => ({ ...g, [p.name]: v }))),
		[{}],
	);
}

// ── rows ──

/** The optional faces' indices on the board, in board order. */
export const optionalFaces = (b: Board) => b.faces.flatMap((f, i) => (f.optional ? [i] : []));

/** The subset sizes a row may have: the `subsets` line, else every size from 1. */
export function sizesOf(b: Board): [number, number] {
	const n = optionalFaces(b).length;
	if (!n) return [0, 0];
	const [lo, hi] = b.subsets ?? [1, n];
	return [Math.min(lo, n), Math.min(hi, n)];
}

const binomial = (n: number, k: number) => {
	let r = 1;
	for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
	return Math.round(r);
};

/** Required groups past this many are refused: the row count takes a term per choice of them. */
export const MAX_GROUPS = 20;

/**
 * The `require face` lines a row meets only through its optional faces (Require any over them), each as the
 * optional faces it names, by position among them. A line naming a face that is always on the board, every row
 * meets; a line holding all of another's faces is met with it, so it is left out.
 */
export function requiredGroups(b: Board): number[][] {
	const opt = optionalFaces(b);
	const ids = b.faces.map(faceId);
	const groups = b.require.flatMap((r) => {
		if (!r.faces) return [];
		const want = new Set(requiredFaceKeys(r));
		const named = ids.flatMap((k, i) => (want.has(k) ? [i] : []));
		return named.some((i) => !b.faces[i].optional) ? [] : [named.map((i) => opt.indexOf(i))];
	});
	return groups.filter((g, j) => !groups.some((h, i) => i !== j && h.every((x) => g.includes(x)) && (h.length < g.length || i < j)));
}

/** How many rows the optional faces give: subsets of a size allowed that hold a face of every required group, by
 *  inclusion–exclusion (each term counts the subsets missing a choice of groups, signed by how many). */
export function subsetCount(b: Board): number {
	const n = optionalFaces(b).length;
	const [lo, hi] = sizesOf(b);
	const groups = requiredGroups(b);
	let total = 0;
	for (let m = 0; m < 2 ** Math.min(groups.length, MAX_GROUPS); m++) {
		const miss = new Set(groups.flatMap((g, j) => (m & (1 << j) ? g : [])));
		let sign = 1;
		for (let x = m; x; x &= x - 1) sign = -sign;
		for (let k = lo; k <= hi; k++) total += sign * binomial(n - miss.size, k);
	}
	return total;
}

/**
 * The rows' subsets, smallest first and in board order within a size, as Marek's census lists them. A subset
 * holding no face of a required group asks what the board excludes, so it is no row.
 */
export function subsetsOf(b: Board): number[][] {
	const opt = optionalFaces(b);
	const [lo, hi] = sizesOf(b);
	const groups = requiredGroups(b);
	const out: number[][] = [];
	const pick = (from: number, k: number, acc: number[]) => {
		// a group whose faces all come before what is left to pick, none of them picked, is missed
		const end = k ? from : opt.length;
		if (groups.some((g) => g.every((x) => x < end && !acc.includes(x)))) return;
		if (!k) return void out.push(acc.map((i) => opt[i]));
		for (let i = from; i <= opt.length - k; i++) pick(i + 1, k - 1, [...acc, i]);
	};
	for (let k = lo; k <= hi; k++) pick(0, k, []);
	return out;
}

/**
 * A face's short name, for rows and their run folders: its first corner that is not a point along a side
 * (A12p30 for `A12p30 A12d30 x 12`, Boo for `Boo Pi x inf`), or its first corner when it has no other.
 */
export function faceName(b: Board, f: Face): string {
	const flat = flatOf(b);
	return f.word.find((c) => !flat(c)) ?? f.word[0] ?? "face";
}

/** Names for the optional faces, made unique with the face's number where two would read the same. */
export function optionalNames(b: Board): Map<number, string> {
	const opt = optionalFaces(b);
	const base = opt.map((i) => faceName(b, b.faces[i]));
	return new Map(opt.map((i, j) => [i, base.filter((x) => x === base[j]).length > 1 ? `${base[j]}_${i + 1}` : base[j]]));
}

export type Outcome = { board: Board } | { none: string };

/**
 * A board's rows, made fast: the checks a row needs (which faces and lines it keeps, which corners those lines
 * hold) come from tables built once, so thousands of subsets are checked in milliseconds, and a row's board is
 * built only when asked for.
 */
export function rowMaker(b: Board) {
	const names = optionalNames(b);
	const ids = b.faces.map(faceId);
	// per corner, the faces that have it; per line, its corners; per corner, the lines that hold it
	const facesOf = new Map<string, number[]>();
	b.faces.forEach((f, i) => new Set(f.word).forEach((c) => facesOf.set(c, [...(facesOf.get(c) ?? []), i])));
	const cornersOf = b.vertices.map((v) => [...new Set(v.word)]);
	const linesOf = new Map<string, number[]>();
	cornersOf.forEach((cs, j) => cs.forEach((c) => linesOf.set(c, [...(linesOf.get(c) ?? []), j])));
	// each optional face's own `require face` line
	const alone = new Map(optionalFaces(b).map((i) => [i, withRequiredFaces({ ...b, require: [] }, [b.faces[i]]).require[0]]));
	const kept = (take: number[]) => {
		const keep = new Set(take);
		const faces = b.faces.map((f, i) => !f.optional || keep.has(i));
		const lines = cornersOf.map((cs) => cs.every((c) => (facesOf.get(c) ?? []).some((i) => faces[i])));
		return { faces, lines };
	};
	/** Why the row that keeps optional faces `take` has no tiling at any k, or null. */
	const none = (take: number[]): string | null => {
		const { faces, lines } = kept(take);
		if (!faces.some(Boolean)) return "No face is left on this row's board.";
		if (!lines.some(Boolean)) return "No vertex is left: each has a corner of a face this row leaves out.";
		for (const [i, r] of b.require.entries()) {
			if (r.faces) {
				const want = new Set(requiredFaceKeys(r));
				if (!ids.some((k, j) => faces[j] && want.has(k))) return `No face of required set ${i + 1} is on this row's board.`;
			} else if (r.set.every((n) => !lines[n - 1])) return `Required set ${i + 1} loses every vertex on this row.`;
		}
		if (b.initial.length && b.initial.every((n) => !lines[n - 1])) return "Every initial vertex is gone on this row.";
		// a corner of a required face that no line it keeps holds: that face is never placed
		for (const i of take)
			for (const c of new Set(b.faces[i].word))
				if (!(linesOf.get(c) ?? []).some((j) => lines[j]))
					return `No vertex on this row holds corner ${c} of ${names.get(i) ?? faceName(b, b.faces[i])}.`;
		return null;
	};
	/**
	 * The row's board: its faces, the lines they can make, and a `require face` line per optional face it holds.
	 * The faces it leaves out leave the board's `require face` lines too (the engine refuses a face it has no
	 * angles for), and a line that names one of the row's own faces goes, as that face's line already meets it.
	 */
	const board = (take: number[], name: string): Board => {
		const { faces, lines } = kept(take);
		const cut = withoutFaces(b, faces.flatMap((on, i) => (on ? [] : [i])));
		const row = removeVertices(
			{ ...cut, faces: cut.faces.map(({ optional: _, ...f }) => f) },
			lines.flatMap((on, j) => (on ? [] : [j])),
		);
		const own = new Set(take.map((i) => ids[i]));
		const used = new Set([...row.faces.flatMap((f) => f.word), ...row.vertices.flatMap((v) => v.word)]);
		return {
			...row,
			name,
			// the edge's minimal polynomial goes with the row, so its runs can show it
			header: b.header.filter((h) => /^minpoly\s/.test(h)),
			subsets: undefined,
			require: [...row.require.filter((r) => !requiredFaceKeys(r).some((k) => own.has(k))), ...take.map((i) => alone.get(i)!)],
			angles: b.angles.filter((a) => used.has(a.sym)),
			extra: row.extra.filter((e) => !/^vary\b/.test(e.text)),
		};
	};
	return { names, none, board };
}


/**
 * The board of the row that keeps optional faces `take` (board indices) and leaves out the others; or, when
 * the row cannot have a tiling whatever k, why. `name` becomes the row board's name.
 */
export function rowBoard(b: Board, take: number[], name: string): Outcome {
	const make = rowMaker(b);
	const why = make.none(take);
	return why ? { none: why } : { board: make.board(take, name) };
}

/** The template a study's checks and the editor's engine calls see: optional faces as faces, no study lines. */
export function plainBoard(b: Board): Board {
	return {
		...b,
		subsets: undefined,
		faces: b.faces.map(({ optional: _, ...f }) => f),
		extra: b.extra.filter((e) => !/^vary\b/.test(e.text)),
	};
}

/**
 * The study's whole board, for each combination of its parameters' values: its board as one, every optional face
 * an ordinary face. A row requires exactly its optional faces, so this board's tilings at each k are all the rows'
 * together (measured equal, experiments/results/study-union), and it draws any row's tilings.
 */
export function wholeBoards(text: string): { values: Record<string, number>; text: string }[] {
	return valueGrid(readParams(text).params).map((values) => ({
		values,
		text: serialize(plainBoard(parse(substitute(text, values).text).board)),
	}));
}

/** A board's text as its search reads it, its k range aside: comments, spacing and blank lines dropped. */
export const withoutK = (t: string) =>
	t
		.split("\n")
		.map((l) => l.replace(/#.*/, "").trim().replace(/\s+/g, " "))
		.filter((l) => l && !/^k /.test(l))
		.join("\n");

// ── a study board's text, edited line by line ──

const tokens = (line = "") => line.replace(/#.*/, "").trim().split(/[ \t]+/).filter(Boolean);

/** A name per face for picking them (A{n} on a board with parameters), numbered where two would read the same. */
export function faceLabels(b: Board): string[] {
	const base = b.faces.map((f) => faceName(b, f));
	return base.map((x, i) => (base.indexOf(x) === base.lastIndexOf(x) ? x : `${x}_${i + 1}`));
}

/** What a `vary` line lists after the name, as written: "6..10", "5 6 8". */
export const paramText = (text: string, p: Param) => tokens(text.split(/\r?\n/)[p.line - 1]).slice(2).join(" ");

/** The text varying parameter `name` over `values`: its line rewritten, or added under the last `vary` line
 *  (else the k line); with `values` null, its line removed. */
export function withParam(text: string, name: string, values: string | null): string {
	const ls = text.split("\n");
	const at = ls.findIndex((l) => tokens(l)[0] === "vary" && tokens(l)[1] === name);
	if (values === null) return at < 0 ? text : ls.filter((_, i) => i !== at).join("\n");
	const line = `vary ${name} ${values}`;
	if (at >= 0) {
		const hash = ls[at].indexOf("#");
		ls[at] = hash < 0 ? line : `${line} ${ls[at].slice(hash)}`;
		return ls.join("\n");
	}
	const vary = ls.map((l) => tokens(l)[0]).lastIndexOf("vary");
	const after = vary >= 0 ? vary : ls.findIndex((l) => tokens(l)[0] === "k");
	if (after < 0) return `${text.trimEnd()}\n${line}\n`;
	return [...ls.slice(0, after + 1), line, ...ls.slice(after + 1)].join("\n");
}

/** The text with its `subsets` line saying `lo` to `hi`: rewritten in place (its comment kept), or added last. */
export function withSubsets(text: string, [lo, hi]: [number, number]): string {
	const ls = text.split("\n");
	const at = ls.findIndex((l) => tokens(l)[0] === "subsets");
	const line = `subsets ${lo} ${hi}`;
	if (at < 0) return `${text.trimEnd()}\n${line}\n`;
	const hash = ls[at].indexOf("#");
	ls[at] = hash < 0 ? line : `${line} ${ls[at].slice(hash)}`;
	return ls.join("\n");
}

/**
 * The study board without optional face `name` (optionalNames): its line, the vertex lines no face left has
 * every corner of, and the angles nothing uses any more; a `require face` line loses it. Rows without the face
 * keep the same board, as a row only ever had the lines its own faces make. Null on a board with parameters,
 * whose lines are edited as text.
 */
export function withoutOptionalFace(text: string, name: string): string | null {
	if (readParams(text).params.length) return null;
	const b = parse(text).board;
	const i = [...optionalNames(b)].find(([, x]) => x === name)?.[0];
	if (i === undefined) return null;
	const c = withoutFaces(b, [i]);
	const corners = new Set(c.faces.flatMap((f) => f.word));
	const d = removeVertices(c, c.vertices.flatMap((v, j) => (v.word.every((x) => corners.has(x)) ? [] : [j])));
	const used = new Set([...d.faces, ...d.vertices].flatMap((x) => x.word));
	return serialize({ ...d, angles: d.angles.filter((a) => used.has(a.sym)) });
}

/**
 * What a study's rows found for one optional face: the rows holding it, those with tilings, and for the rest how
 * far they were searched (the least k, once none is left unsearched), or that each was ruled out at every k.
 */
export function faceTally(rows: Pick<StudyRow, "faces" | "state" | "total" | "through">[], face: string): FaceTally {
	const mine = rows.filter((r) => r.faces.includes(face));
	const found = mine.filter((r) => r.total > 0);
	// a row repeating another (same) has that row's tilings; a ruled-out row has none at any k
	const open = mine.filter((r) => !r.total && r.state !== "ruled-out" && r.state !== "same");
	const left = open.filter((r) => r.state !== "none" || !r.through).length;
	return {
		rows: mine.length,
		found: found.length,
		tilings: found.reduce((t, r) => t + r.total, 0),
		left,
		...(open.length && !left ? { through: Math.min(...open.map((r) => r.through!)) } : {}),
		proven: mine.length > 0 && mine.every((r) => r.state === "ruled-out"),
	};
}

/** A name for a new parameter: n, then m, p, q, … */
export const freeParam = (params: Param[]) =>
	["n", "m", "p", "q", "r", "s", "t"].find((x) => !params.some((p) => p.name === x)) ?? `n${params.length + 1}`;

export interface RowPlan {
	/** 0-based, in the order the study lists them. */
	index: number;
	name: string;
	/** The optional faces it holds, by name, and by board index. */
	faces: string[];
	take: number[];
	values: Record<string, number>;
	/** Which of the plan's boards (one per combination of values) it is a row of. */
	instance: number;
	/** Why it has no tiling at any k, when a check without the engine shows it. */
	none?: string;
}

export interface StudyPlan {
	params: Param[];
	/** The optional faces' names, in board order. */
	optional: string[];
	sizes: [number, number];
	/** How many required groups a row's optional faces must each meet (requiredGroups). */
	required: number;
	rows: number;
	/** Errors that keep the study from running (a bad parameter, a row board that does not parse). */
	problems: Problem[];
	/** Null when the rows are too many to list (past MAX_ROWS) or the board has problems. */
	list: RowPlan[] | null;
	/** The board at each combination of parameter values, with its row maker. */
	instances: { board: Board; make: ReturnType<typeof rowMaker> }[];
}

/** Whether a board text describes a study: an optional face, or a parameter. */
export const isStudy = (text: string) => /^[ \t]*(optional|vary)[ \t]/m.test(text);

/** A row's folder and board name: its values and faces, safe as one word; `row-<n>` when too long. */
function rowName(values: Record<string, number>, faces: string[], index: number): string {
	const parts = [...Object.entries(values).map(([k, v]) => `${k}=${v}`), ...(faces.length ? [faces.join(",")] : [])];
	const name = (parts.join("_") || "base").replace(/[\s#/\\:*?"<>|]/g, "_");
	return name.length > 80 ? `row-${index + 1}` : name;
}

/**
 * Every row of the study a board text describes: for each combination of parameter values (the text with
 * them filled in), each subset of the optional faces, with the checks that need no engine. `list: false` only
 * counts them. A row's board comes from rowText, built on request.
 */
export function planStudy(text: string, list = true): StudyPlan {
	const { params, problems } = readParams(text);
	const grid = valueGrid(params);
	const first = substitute(text, grid[0] ?? {});
	const b0 = parse(first.text).board;
	const optional = optionalFaces(b0).map((i) => optionalNames(b0).get(i)!);
	const required = requiredGroups(b0).length;
	const rows = grid.length * subsetCount(b0);
	const plan: StudyPlan = { params, optional, sizes: sizesOf(b0), required, rows, problems: [...problems], list: null, instances: [] };
	if (required > MAX_GROUPS)
		plan.problems.push({
			severity: "error",
			line: null,
			where: { kind: "board" },
			message: `${required} required sets name only optional faces; a study takes at most ${MAX_GROUPS}, as it counts its rows over every choice of them.`,
		});
	if (plan.problems.length || !list || rows > MAX_ROWS) return plan;
	const out: RowPlan[] = [];
	for (const values of grid) {
		const sub = substitute(text, values);
		const parsed = parse(sub.text);
		const errors = [...sub.problems, ...parsed.problems.filter((p) => p.severity === "error" && !p.beforeRun)];
		if (errors.length) {
			const at = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");
			plan.problems.push(...errors.map((p) => ({ ...p, message: at ? `At ${at}: ${p.message}` : p.message })));
			return plan;
		}
		const b = parsed.board;
		const make = rowMaker(b);
		plan.instances.push({ board: b, make });
		for (const take of subsetsOf(b)) {
			const faces = take.map((i) => make.names.get(i)!);
			const none = make.none(take);
			out.push({
				index: out.length,
				name: rowName(values, faces, out.length),
				faces,
				take,
				values,
				instance: plan.instances.length - 1,
				...(none ? { none } : {}),
			});
		}
	}
	plan.list = out;
	return plan;
}

/** Rows past this many vertex orders are not given to the engine: it lists every order before it checks or
 *  searches, and 1.4·10⁵ already took it up to 12 minutes and 0.9 GB (docs/HYBRID_SEARCH_LIMITS.md). */
export const MAX_ORDERS = 500_000;

/** How many orders of corners round a vertex a board's lines give: one a line, or with permutations every cyclic
 *  order of its corners (Burnside over the rotations; mirror images counted apart). A float: 10²¹ happens. */
export function cyclicOrders(b: Board): number {
	if (!b.permutations) return b.vertices.length;
	const gcd = (a: number, c: number): number => (c ? gcd(c, a % c) : a);
	return b.vertices.reduce((total, v) => {
		const n = v.word.length;
		const counts = [...v.word.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>()).values()];
		let fixed = 0;
		for (let r = 0; r < n; r++) {
			const len = n / gcd(r, n); // a rotation by r has gcd(r, n) cycles of this length
			if (counts.some((c) => c % len)) continue;
			let ways = 1, placed = 0; // (n/len)! / prod (c/len)!
			for (const c of counts) for (let i = 1; i <= c / len; i++) ways = (ways * ++placed) / i;
			fixed += ways;
		}
		return total + fixed / n;
	}, 0);
}

const built = new WeakMap<RowPlan, { text: string; key: string }>();
/** A row's board as text, and its searchKey: built once, the first time a row is asked for. */
export function rowText(plan: StudyPlan, r: RowPlan): { text: string; key: string } {
	let t = built.get(r);
	if (!t) {
		const b = plan.instances[r.instance].make.board(r.take, r.name);
		built.set(r, (t = { text: serialize(b), key: searchKey(b) }));
	}
	return t;
}

// ── the checks that need the engine's balance answer ──

/** Whether a face's side has two points along it in a row (Pi Pi), so a stretch of side runs between two. */
function hasLooseSide(f: Face, flat: (c: string) => boolean) {
	const w = f.word;
	return w.some((c, i) => flat(c) && flat(w[(i + 1) % w.length]));
}

/**
 * Why a row's required faces cannot all be in one tiling, given the vertex lines the balance check leaves
 * (`alive`, 1-based), or null when nothing here rules it out. Two tests, each sound for every k:
 *
 *  - each corner of a required face sits at a vertex the tiling uses, so some live line holds it;
 *  - a tiling is connected, so its faces are linked by faces that share sides. Two faces that share a side
 *    meet at its ends, and at one end the first face has a corner that is not a point along a side (unless
 *    its sides have two such points in a row): so some live line holds that corner beside a corner of the
 *    second face (a point along a side, Pi, counts for any face that has it). Faces linked both ways form
 *    groups; required faces in two groups never share a tiling.
 *
 * Both only over-count what can meet, so a row they rule out has no tiling. The second catches what the
 * balance count cannot see: counting adds two tilings into one solution, so faces that tile apart (B10 and
 * B5 on Marek's 1.061275 board) pass the count together.
 */
export function splitReason(b: Board, alive: number[]): string | null {
	const flat = flatOf(b);
	const live = alive.map((n) => b.vertices[n - 1]?.word).filter((w): w is string[] => !!w);
	const keys = b.faces.map(faceId);
	const required = [
		...new Set(
			b.require.flatMap((r) => {
				if (!r.faces || r.faces.length !== 1) return [];
				const k = requiredFaceKeys(r)[0];
				const i = keys.indexOf(k);
				return i < 0 ? [] : [i];
			}),
		),
	];
	const label = (i: number) => faceName(b, b.faces[i]);
	for (const i of required)
		for (const c of new Set(b.faces[i].word))
			if (!live.some((w) => w.includes(c)))
				return `The balance check leaves no vertex for corner ${c} of ${label(i)}.`;
	if (required.length < 2) return null;
	const syms = b.faces.map((f) => new Set(f.word));
	const ends = b.faces.map((f, i) => (hasLooseSide(f, flat) ? syms[i] : new Set(f.word.filter((c) => !flat(c)))));
	const reach = (f: number, g: number) =>
		live.some((w) => w.some((c) => ends[f].has(c)) && w.some((c) => syms[g].has(c)));
	const parent = b.faces.map((_, i) => i);
	const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
	for (let f = 0; f < b.faces.length; f++)
		for (let g = f + 1; g < b.faces.length; g++)
			if (root(f) !== root(g) && reach(f, g) && reach(g, f)) parent[root(f)] = root(g);
	const apart = required.find((i) => root(i) !== root(required[0]));
	return apart === undefined
		? null
		: `${label(required[0])} and ${label(apart)} cannot be in one tiling: on the vertices the balance check leaves, no chain of faces sharing sides joins them.`;
}

// ── the same search, whatever the file looks like ──

const sorted = (xs: string[]) => [...xs].sort().join(" | ");
/** A vertex line as the engine reads it: up to turning and mirroring, or as a multiset with permutations. */
export const vertexKeys = (b: Board) => b.vertices.map((v) => cyclicKey(v.word, b.permutations));

/**
 * What a board searches on, apart from its vertex lines and what it requires, as text. Line order, comments,
 * names, angle values and k do not count; faces, permutations, chirality and colours do.
 */
export function frameKey(b: Board): string {
	return [
		`permutations ${b.permutations ? 1 : 0} chiral ${b.chiral ? 1 : 0} labeled ${b.colorsLabeled ? 1 : 0}`,
		`faces ${sorted(b.faces.map(faceId))}`,
		`other ${sorted(b.extra.flatMap((e) => (e.text && !/^vary\b/.test(e.text) ? [e.text] : [])))}`,
	].join("\n");
}

/**
 * What a board requires, each requirement as the vertex lines (keys) a tiling must use one of, or as its faces
 * when they share corners with other faces. `initial` is one more: it too asks for one of its lines. A `require
 * face` line whose faces' corners belong to no other face (points along a side aside) is the set of lines
 * holding one of those corners: a tiling uses such a line exactly when it holds one of the faces. So a face
 * required on the face card and the same face required by selecting its vertices read the same here.
 */
export function requirements(b: Board): ({ face: string } | { lines: string[] })[] {
	const vk = (n: number) => cyclicKey(b.vertices[n - 1]?.word ?? [], b.permutations);
	const flat = flatOf(b);
	const keys = b.faces.map(faceId);
	const out: ({ face: string } | { lines: string[] })[] = [];
	if (b.initial.length) out.push({ lines: b.initial.map(vk) });
	for (const r of b.require) {
		if (!r.faces) {
			out.push({ lines: r.set.map(vk) });
			continue;
		}
		const want = requiredFaceKeys(r);
		const faces = want.map((k) => keys.indexOf(k));
		const corners = new Set(faces.flatMap((i) => (i < 0 ? [] : b.faces[i].word.filter((c) => !flat(c)))));
		const own =
			faces.every((i) => i >= 0) &&
			corners.size > 0 &&
			b.faces.every((f, j) => faces.includes(j) || f.word.every((c) => !corners.has(c)));
		out.push(
			own
				? { lines: b.vertices.flatMap((v) => (v.word.some((c) => corners.has(c)) ? [cyclicKey(v.word, b.permutations)] : [])) }
				: { face: sorted(want) },
		);
	}
	return out;
}

/** Requirements as text, a set of lines cut to `alive` (every line, when absent). */
const requirementText = (reqs: ReturnType<typeof requirements>, alive?: Set<string>) =>
	sorted(reqs.map((r) => ("face" in r ? `face ${r.face}` : `set ${sorted(alive ? r.lines.filter((l) => alive.has(l)) : r.lines)}`)));

/** Two boards with the same key are the same search, whatever their files look like. */
export const searchKey = (b: Board) =>
	`${frameKey(b)}\nrequire ${requirementText(requirements(b))}\nvertices ${sorted(vertexKeys(b))}`;

/**
 * What sameSearch compares of a board: spelled out as corner orders (Permutations off), the way the engine reads
 * a set of corners, so a board with Permutations on and the same board spelled out are one search.
 */
export function searchShape(b: Board) {
	const s = (b.permutations && withPermutations(b, false)) || b;
	return { frame: frameKey(s), lines: new Set(vertexKeys(s)), reqs: requirements(s) };
}

/**
 * The corner orders the balance check leaves alive on a board (tilesearch --balance: `alive` lines, and with
 * Permutations on each line's orders in `orders`), keyed as searchShape keys them.
 */
export function aliveKeys(b: Board, report: { alive: number[]; orders?: { word: string; alive: boolean }[] }): Set<string> {
	if (!b.permutations) return new Set(report.alive.map((n) => cyclicKey(b.vertices[n - 1]?.word ?? [])));
	if (report.orders) return new Set(report.orders.filter((o) => o.alive).map((o) => cyclicKey(o.word.split(" "))));
	const live = withPermutations({ ...b, vertices: report.alive.map((n) => b.vertices[n - 1]), initial: [], require: [] }, false);
	return new Set((live?.vertices ?? []).map((v) => cyclicKey(v.word)));
}

/**
 * Whether a run's board finds exactly the tilings a row's board finds, at every k: the same frame, no vertex
 * line the row lacks, every line the balance check leaves alive on the row, and the same requirements once each
 * is cut to those live lines. A tiling of either board uses only live lines (the run's lines are the row's, so
 * its tilings are the row's), on both boards the same lines, meeting the same requirements. This is how a
 * study recognises runs made by hand, even from a board pruned in the editor.
 */
export function sameSearch(
	row: ReturnType<typeof searchShape> & { alive: Set<string> },
	run: ReturnType<typeof searchShape>,
): boolean {
	if (row.frame !== run.frame) return false;
	for (const l of run.lines) if (!row.lines.has(l)) return false;
	for (const l of row.alive) if (!run.lines.has(l)) return false;
	return requirementText(row.reqs, row.alive) === requirementText(run.reqs, row.alive);
}
