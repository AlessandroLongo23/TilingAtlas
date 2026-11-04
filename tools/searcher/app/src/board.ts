// The board file (docs/searcher/board-format.md) as data, for the visual editor.
//
// The engine's parser (read_board in tools/searcher/tilesearch.cpp) is the authority: the app also runs
// `tilesearch --dump` on every edit and shows its verdict. This module exists so the editor can say
// where a problem is, and in plain words, before the engine is asked. board.test.ts holds the two to
// the same first error line.
//
// Nothing a user typed is lost on the way through. Comments ride on the statement they precede or
// trail, and a line this module cannot read is kept verbatim in `extra`, with its problem attached.

export interface Note {
	/** Comment lines directly above the statement, without the leading "#". */
	lead?: string[];
	/** A comment at the end of the statement's own line. */
	trail?: string;
}
/** A `require` line: a tiling must hold one of these vertices (1-based), or, with `faces`, one of these
 *  faces (`require face … | face …`, each written out in full; `set` is then empty). */
export interface Required extends Note {
	set: number[];
	faces?: string[][];
	/** Per face of `faces`: an apeirogon (`x inf`), its word then being its period. */
	infinite?: boolean[];
	/** Per face of `faces`: a repeat written with a parameter (`x {n}`), the face then being its period that
	 *  many times at the values shown. */
	repeatExprs?: (Expr<number> | undefined)[];
}
/** On a board with parameters, a value written with them (`{n}`, `{180-360/n}`) and what it came to at the
 *  values shown. The board holds the value, so drawing and checks need nothing new; the text gets the formula
 *  back while the value is still `at`, and an edit that changes the value replaces it. */
export interface Expr<T> {
	text: string;
	at: T;
}
export type EdgeStyle = "drawn" | "hidden" | "bump" | "bite";
/** The highest k the engine takes (tilesearch.cpp MAX_K). */
export const MAX_K = 254;

export const EDGE_STYLES: EdgeStyle[] = ["drawn", "hidden", "bump", "bite"];
export interface Angle extends Note {
	sym: string;
	/** As written: degrees ("90"), a fraction of degrees ("360/7") or "free". */
	value?: string;
	valueExpr?: Expr<string>;
	/** An `edge` line: the 180° corner at the midpoint of every side of this edge type. Vertex lines that
	 *  pair edge corners are the gluing rule (`vertex Eu Eu` like to like, `vertex EB EI` bump to bite). */
	edge?: { length?: string; style?: EdgeStyle };
}
export interface Face extends Note {
	word: string[];
	repeat: number | "inf";
	repeatExpr?: Expr<number>;
	/** An `optional` line: a study runs the board with and without this face (study.ts). */
	optional?: boolean;
}
export interface Vertex extends Note {
	word: string[];
}
/** A statement the visual editor shows but does not edit: search, geometry, or a line it cannot read. */
export interface Extra extends Note {
	text: string;
}

export interface Board {
	header: string[];
	name: string;
	kmin: number;
	kmax: number;
	angles: Angle[];
	faces: Face[];
	vertices: Vertex[];
	permutations: boolean;
	/** `colors labeled`: on a coloured board, all-A and all-B are two tilings. By default tilings that
	 *  differ only by permuting the colours count once. */
	colorsLabeled?: boolean;
	/** `chiral yes`: only tilings with no reflection or glide reflection among their symmetries. */
	chiral?: boolean;
	/** `subsets <min> <max>`: how many optional faces each row of a study holds. */
	subsets?: [number, number];
	/** 1-based vertex numbers; empty means all. */
	initial: number[];
	/** Required sets: a tiling holds a vertex of each (and of `initial`, when both are given). */
	require: Required[];
	extra: Extra[];
	notes: Partial<Record<"name" | "k" | "permutations" | "initial", Note>>;
}

export type Where =
	| { kind: "name" | "k" | "permutations" | "initial" | "board" }
	| { kind: "angle" | "face" | "vertex" | "extra" | "require"; index: number };

export interface Problem {
	severity: "error" | "warning";
	/** 1-based line in the text the board was parsed from; null for a board built in the editor. */
	line: number | null;
	where: Where;
	message: string;
	/** Something unused, which a board being built always has: kept out of the editor, shown before a search. */
	beforeRun?: true;
}

export const emptyBoard = (): Board => ({
	header: [],
	name: "untitled",
	kmin: 1,
	kmax: 3,
	angles: [],
	faces: [],
	vertices: [],
	permutations: false,
	initial: [],
	require: [],
	extra: [],
	notes: {},
});

// ── Marek's corner codes (tilesearch.cpp corner_code, materials/marek-source/include/corner.h) ──

export const ANGLE_LETTERS = "SMLABCDEFG";
const MAREK = /^([SMLABCDEFG]?)([1-9][0-9]*|oo)$/;
const X_TYPE = ANGLE_LETTERS.length + 1;

/** A symbol's code as the engine computes it, or -1 for a number past 16 bits. X symbols take the next free X code. */
export function cornerCode(sym: string, next: { x: number }): number {
	if (sym === "Pi") return 0;
	const m = MAREK.exec(sym);
	if (m) {
		const number = m[2] === "oo" ? 0 : Number(m[2]);
		if (number > 0xffff) return -1;
		return number | ((m[1] ? ANGLE_LETTERS.indexOf(m[1]) + 1 : 0) << 16);
	}
	return next.x++ | (X_TYPE << 16);
}

/** How the engine prints a symbol in certificates and file names: itself, or X<n> for a free symbol. */
export function printedLabels(angles: Angle[]): Map<string, string> {
	const next = { x: 1 };
	const out = new Map<string, string>();
	for (const a of angles) {
		const c = cornerCode(a.sym, next);
		if (c >= 0 && c >> 16 === X_TYPE) out.set(a.sym, `X${c & 0xffff}`);
		else out.set(a.sym, a.sym);
	}
	return out;
}

// ── text → board ──

const KEYWORDS = new Set([
	"name",
	"k",
	"angle",
	"colors",
	"edge",
	"face",
	"vertex",
	"permutations",
	"chiral",
	"initial",
	"require",
	"search",
	"geometry",
	"optional",
	"subsets",
	"vary",
]);
const isInt = (s: string) => /^[0-9]+$/.test(s) && String(Number(s)) === s;
/** A repeat count written with a parameter, at `values`: a whole number from 1 up, or why not (`at` is then 1). */
function repeatAt(s: string, values: Record<string, number>): { at: number; error?: string } {
	const { text, error } = fill(s, values);
	if (error) return { at: 1, error };
	return isInt(text) && Number(text) >= 1
		? { at: Number(text) }
		: { at: 1, error: `The repeat ${s} is ${text} here: it must be a whole number from 1 up.` };
}

/** The board a text describes. With `values`, a study board's {…} in angle values and repeat counts is
 *  worked out at those values and kept as an Expr; names keep their {…} as written (A{n}). */
export function parse(
	text: string,
	values?: Record<string, number>,
): { board: Board; problems: Problem[]; lines: Map<string, number> } {
	const b = emptyBoard();
	b.name = "";
	const problems: Problem[] = [];
	// statement → its line, keyed like `face:2`, so problems found later can point at the text
	const lines = new Map<string, number>();
	let lead: string[] = [];
	let seenStatement = false;
	let hasK = false;
	const raw = text.split(/\r?\n/);
	if (raw.length && raw[raw.length - 1] === "") raw.pop();

	raw.forEach((line, i) => {
		const lineno = i + 1;
		const hash = line.indexOf("#");
		const body = hash < 0 ? line : line.slice(0, hash);
		const trail = hash < 0 ? undefined : line.slice(hash + 1).trim() || undefined;
		const t = powers(body.split(/[ \t]+/).filter(Boolean));
		if (!t.length) {
			if (hash >= 0) lead.push(line.slice(hash + 1).replace(/^ /, ""));
			else if (!seenStatement && lead.length) {
				b.header.push(...lead, "");
				lead = [];
			}
			return;
		}
		// comments above the first statement are the file's header
		if (!seenStatement && lead.length) {
			b.header.push(...lead);
			lead = [];
		}
		seenStatement = true;
		const note: Note = { ...(lead.length ? { lead } : {}), ...(trail ? { trail } : {}) };
		lead = [];
		const kw = t[0];
		const bad = (message: string) => {
			b.extra.push({ text: t.join(" "), ...note });
			lines.set(`extra:${b.extra.length - 1}`, lineno);
			problems.push({ severity: "error", line: lineno, where: { kind: "extra", index: b.extra.length - 1 }, message });
		};
		// a formula that does not work out here: the statement stays, with its problem
		const formula = (key: string, where: Where, message: string) => {
			lines.set(key, lineno);
			problems.push({ severity: "error", line: lineno, where, message });
		};

		// a bare `name` is a name being typed: empty, which only Run search asks to fill
		if (kw === "name" && t.length <= 2) {
			b.name = t[1] ?? "";
			b.notes.name = note;
			lines.set("name", lineno);
		} else if (kw === "name") bad("The name must be one word, with no spaces.");
		else if (kw === "k" && t.length === 3) {
			const [lo, hi] = [atoi(t[1]), atoi(t[2])];
			if (lo < 1 || hi < lo || hi > MAX_K) bad(`k needs whole numbers with 1 ≤ from ≤ to ≤ ${MAX_K}.`);
			else {
				[b.kmin, b.kmax, hasK, b.notes.k] = [lo, hi, true, note];
				lines.set("k", lineno);
			}
		} else if (kw === "angle" && (t.length === 2 || t.length === 3)) {
			const v = values && t[2]?.includes("{") ? fill(t[2], values) : null;
			if (v?.error) formula(`angle:${b.angles.length}`, { kind: "angle", index: b.angles.length }, v.error);
			const value = v && !v.error ? { value: v.text, valueExpr: { text: t[2], at: v.text } } : t[2] !== undefined ? { value: t[2] } : {};
			b.angles.push({ sym: t[1], ...value, ...note });
			lines.set(`angle:${b.angles.length - 1}`, lineno);
		} else if (kw === "edge" && t.length >= 2) {
			const edge: NonNullable<Angle["edge"]> = {};
			let ok = true;
			for (let i = 2; i < t.length; i++) {
				if (t[i] === "length" && i + 1 < t.length) edge.length = t[++i];
				else if ((EDGE_STYLES as string[]).includes(t[i]) && !edge.style) edge.style = t[i] as EdgeStyle;
				else ok = false;
			}
			if (!ok) bad("An edge line is edge, a name, then length <L> and one of drawn, hidden, bump, bite.");
			else {
				b.angles.push({ sym: t[1], value: "180", edge, ...note });
				lines.set(`angle:${b.angles.length - 1}`, lineno);
			}
		} else if ((kw === "face" || kw === "optional") && t.length >= 2) {
			const x = t.indexOf("x");
			const end = x < 0 ? t.length : x;
			const mult = x < 0 ? "1" : x + 2 === t.length ? t[x + 1] : "";
			const times = values && mult.includes("{") ? repeatAt(mult, values) : null;
			if (times) {
				// kept with the repeat it has, or 1 when it has none here, so its dialog stays open on it
				if (times.error) formula(`face:${b.faces.length}`, { kind: "face", index: b.faces.length }, times.error);
				b.faces.push({
					word: t.slice(1, end),
					repeat: times.at,
					repeatExpr: { text: mult, at: times.at },
					...(kw === "optional" ? { optional: true } : {}),
					...note,
				});
				lines.set(`face:${b.faces.length - 1}`, lineno);
			} else if (mult !== "inf" && !(isInt(mult) && Number(mult) >= 1))
				bad("The repeat count after x must be a whole number from 1 up, or inf for an apeirogon.");
			else {
				b.faces.push({
					word: t.slice(1, end),
					repeat: mult === "inf" ? "inf" : Number(mult),
					...(kw === "optional" ? { optional: true } : {}),
					...note,
				});
				lines.set(`face:${b.faces.length - 1}`, lineno);
			}
		} else if (kw === "vertex" && t.length >= 2) {
			b.vertices.push({ word: t.slice(1), ...note });
			lines.set(`vertex:${b.vertices.length - 1}`, lineno);
		} else if (kw === "permutations" && t.length === 2 && (t[1] === "yes" || t[1] === "no")) {
			b.permutations = t[1] === "yes";
			b.notes.permutations = note;
			lines.set("permutations", lineno);
		} else if (kw === "colors" && t.length === 2 && (t[1] === "labeled" || t[1] === "unlabeled")) {
			b.colorsLabeled = t[1] === "labeled";
			lines.set("colors", lineno);
		} else if (kw === "chiral" && t.length === 2 && (t[1] === "yes" || t[1] === "no")) {
			b.chiral = t[1] === "yes";
			lines.set("chiral", lineno);
		} else if (kw === "initial" && t.length >= 2) {
			const all = t.length === 2 && t[1] === "all";
			if (!all && t.slice(1).some((s) => !isInt(s) || Number(s) < 1))
				bad("Initial takes vertex numbers (1, 2, …) or all.");
			else {
				b.initial = all ? [] : t.slice(1).map(Number);
				b.notes.initial = note;
				lines.set("initial", lineno);
			}
		} else if (kw === "require" && t.length >= 3 && t[1] === "face") {
			const faces: string[][] = [];
			const infinite: boolean[] = [];
			const repeatExprs: (Expr<number> | undefined)[] = [];
			let ok = true;
			// split on the | tokens, as the engine does
			const parts: string[][] = [[]];
			for (const x of t.slice(1)) if (x === "|") parts.push([]);
			else parts[parts.length - 1].push(x);
			for (const w of parts) {
				if (w[0] !== "face" || w.length < 2) ok = false;
				const x = w.indexOf("x");
				const inf = x >= 0 && x + 2 === w.length && w[x + 1] === "inf";
				const times = values && x >= 0 && x + 2 === w.length && w[x + 1].includes("{") ? repeatAt(w[x + 1], values) : null;
				repeatExprs.push(times && !times.error ? { text: w[x + 1], at: times.at } : undefined);
				const m = times
					? times.error ? 0 : times.at
					: inf || x < 0 ? 1 : x + 2 === w.length && isInt(w[x + 1]) && Number(w[x + 1]) >= 1 ? Number(w[x + 1]) : 0;
				if (!m) ok = false;
				const word = w.slice(1, x < 0 ? w.length : x);
				faces.push(Array.from({ length: m }, () => word).flat());
				infinite.push(inf);
			}
			if (!ok) bad("Require face takes faces, each written face <corners> [x m] (or x inf), separated by |.");
			else {
				b.require.push({
					set: [],
					faces,
					...(infinite.some(Boolean) ? { infinite } : {}),
					...(repeatExprs.some(Boolean) ? { repeatExprs } : {}),
					...note,
				});
				lines.set(`require:${b.require.length - 1}`, lineno);
			}
		} else if (kw === "require" && t.length >= 2) {
			if (t.slice(1).some((s) => !isInt(s) || Number(s) < 1)) bad("Require takes vertex numbers (1, 2, …).");
			else {
				b.require.push({ set: t.slice(1).map(Number), ...note });
				lines.set(`require:${b.require.length - 1}`, lineno);
			}
		} else if (kw === "subsets" && t.length === 3 && isInt(t[1]) && isInt(t[2]) && Number(t[1]) <= Number(t[2])) {
			b.subsets = [Number(t[1]), Number(t[2])];
			lines.set("subsets", lineno);
		} else if (kw === "subsets") bad("Subsets takes two whole numbers, the fewest and the most optional faces a row holds.");
		else if (kw === "vary") {
			// a study parameter (study.ts reads it from the text): kept as written
			b.extra.push({ text: t.join(" "), ...note });
			lines.set(`extra:${b.extra.length - 1}`, lineno);
		} else if ((kw === "search" || kw === "geometry") && t.length === 2) {
			b.extra.push({ text: t.join(" "), ...note });
			lines.set(`extra:${b.extra.length - 1}`, lineno);
			const ok = kw === "search" ? t[1] === "vertices" : t[1] === "none";
			if (!ok)
				problems.push({
					severity: "error",
					line: lineno,
					where: { kind: "extra", index: b.extra.length - 1 },
					message: kw === "search" ? "Face-first search is not built yet." : "Geometry checks are not built yet.",
				});
		} else if (kw === "vertex" || kw === "face" || kw === "optional") bad(`This ${kw === "optional" ? "face" : kw} has no corners.`);
		else bad(KEYWORDS.has(kw) ? `The ${kw} line is not in a form the searcher reads.` : `Unknown statement “${kw}”.`);
	});
	if (lead.length) b.extra.push({ text: "", lead });

	problems.push(...check(b, { lines, last: raw.length, hasK }));
	problems.sort((p, q) => (p.line ?? 1e9) - (q.line ?? 1e9));
	return { board: b, problems, lines };
}

/** In face, vertex and require lines, A3^2 is shorthand for A3 A3 (tilesearch.cpp expands it the same way). */
function powers(t: string[]): string[] {
	if (t[0] !== "face" && t[0] !== "vertex" && t[0] !== "require") return t;
	return t.flatMap((s) => {
		const m = /^(.+)\^([1-9]\d*)$/.exec(s);
		return m ? Array<string>(Number(m[2])).fill(m[1]) : [s];
	});
}

// atoi: the engine reads k with std::atoi, so "3x" is 3. Matching it keeps the first-error lines equal.
function atoi(s: string) {
	const m = /^[+-]?\d+/.exec(s);
	return m ? Number(m[0]) : 0;
}

// ── parameters: {n}, {2n}, {360/n} in a study board's lines (study.ts reads the vary lines) ──

/** A parameter's name, and a name inside {…}. */
export const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME = PARAM_NAME;

/** An exact fraction, so that {360/n} stays exact (an angle line reads 360/7 as written). */
type Q = { p: number; q: number };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const q = (p: number, d = 1): Q => {
	if (d === 0) throw new Error("division by zero");
	const g = gcd(p, d) || 1;
	return d < 0 ? { p: -p / g, q: -d / g } : { p: p / g, q: d / g };
};

/** {…} arithmetic: + - * / and brackets on whole numbers and parameters; 2n is 2*n. */
export function evaluate(expr: string, values: Record<string, number>): Q {
	const tokens = expr.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]|\S/g) ?? [];
	let i = 0;
	const peek = () => tokens[i];
	const atom = (): Q => {
		const t = tokens[i++];
		if (t === undefined) throw new Error("it ends too soon");
		if (t === "(") {
			const v = sum();
			if (tokens[i++] !== ")") throw new Error("a bracket is not closed");
			return v;
		}
		if (t === "-") {
			const v = factor();
			return { p: -v.p, q: v.q };
		}
		if (/^\d+$/.test(t)) return q(Number(t));
		if (NAME.test(t)) {
			if (!(t in values)) throw new Error(`“${t}” is not a parameter`);
			return q(values[t]);
		}
		throw new Error(`“${t}” is not arithmetic`);
	};
	// a number or bracket directly followed by a name or bracket multiplies: 2n, 2(n+1), (n)(n)
	const factor = (): Q => {
		let v = atom();
		while (peek() !== undefined && (NAME.test(peek()) || peek() === "(") && !/^[-+*/)]$/.test(peek())) {
			const w = atom();
			v = q(v.p * w.p, v.q * w.q);
		}
		return v;
	};
	const product = (): Q => {
		let v = factor();
		while (peek() === "*" || peek() === "/") {
			const op = tokens[i++];
			const w = factor();
			v = op === "*" ? q(v.p * w.p, v.q * w.q) : q(v.p * w.q, v.q * w.p);
		}
		return v;
	};
	const sum = (): Q => {
		let v = product();
		while (peek() === "+" || peek() === "-") {
			const op = tokens[i++];
			const w = product();
			v = op === "+" ? q(v.p * w.q + w.p * v.q, v.q * w.q) : q(v.p * w.q - w.p * v.q, v.q * w.q);
		}
		return v;
	};
	if (!tokens.length) throw new Error("the braces are empty");
	const v = sum();
	if (i < tokens.length) throw new Error(`“${tokens[i]}” is left over`);
	return v;
}

/** `s` with each {…} worked out at `values`, exactly ({360/n} at n = 7 is 360/7); the first problem, if any. */
export function fill(s: string, values: Record<string, number>): { text: string; error?: string } {
	let error: string | undefined;
	const text = s.replace(/\{([^{}]*)\}/g, (all, expr: string) => {
		try {
			const v = evaluate(expr, values);
			return v.q === 1 ? String(v.p) : `${v.p}/${v.q}`;
		} catch (e) {
			error ??= `{${expr}}: ${(e as Error).message}.`;
			return all;
		}
	});
	return { text, error: error ?? (/[{}]/.test(text) ? "A brace here is not closed." : undefined) };
}

// formulas the editor writes: counts of corners in n, kept short (2n, n/2, n+2)

export const bare = (t: string) => t.replace(/^\{(.*)\}$/, "$1");
export const wrap = (e: string) => (/^([A-Za-z_]\w*|\d+|\([^()]*\))$/.test(e) ? e : `(${e})`);
const coefficient = (e: string) => /^(\d+)([A-Za-z_]\w*|\(.+\))$/.exec(e);
/** k times formula e, written short: 2 × n is 2n, 2 × 3n is 6n, 2 × n/2 is n. */
export function times(k: number, e: string): string {
	const m = coefficient(e);
	const q = /^([A-Za-z_]\w*|\d+[A-Za-z_]\w*|\((.+)\))\/(\d+)$/.exec(e);
	if (k === 1) return e;
	if (/^\d+$/.test(e)) return String(k * Number(e));
	if (q && k % Number(q[3]) === 0) return times(k / Number(q[3]), q[2] ?? q[1]);
	return m ? `${k * Number(m[1])}${m[2]}` : `${k}${wrap(e)}`;
}
/** Formula e over k, written short: 2n over 2 is n, n over 2 is n/2. */
export function over(e: string, k: number): string {
	const m = coefficient(e);
	if (k === 1) return e;
	if (/^\d+$/.test(e) && Number(e) % k === 0) return String(Number(e) / k);
	return m && Number(m[1]) % k === 0 ? times(Number(m[1]) / k, m[2]) : `${wrap(e)}/${k}`;
}
/** Formula e at the values shown, as a whole number of corners from 2 up; null when it is not one. */
export function cornersAt(e: string, vars: Record<string, number>): number | null {
	try {
		const v = evaluate(e, vars);
		return v.q === 1 && v.p >= 2 && v.p <= 360 ? v.p : null;
	} catch {
		return null;
	}
}

// ── checks: everything the engine refuses, plus warnings it does not give ──

export function check(
	b: Board,
	ctx: { lines?: Map<string, number>; last?: number; hasK?: boolean } = {},
): Problem[] {
	const out: Problem[] = [];
	const at = (key: string) => ctx.lines?.get(key) ?? null;
	const err = (where: Where, key: string, message: string, severity: Problem["severity"] = "error") =>
		out.push({ severity, line: at(key), where, message });
	const unused = (where: Where, key: string, message: string) =>
		out.push({ severity: "warning", line: at(key), where, message, beforeRun: true });

	// angles, in order, exactly as the engine assigns codes
	const codes = new Map<string, number>();
	const declaredAt = new Map<string, number>();
	const next = { x: 1 };
	b.angles.forEach((a, i) => {
		const where = { kind: "angle", index: i } as const;
		const key = `angle:${i}`;
		if (a.sym === "x") return err(where, key, "“x” marks the repeat count, so it cannot name a corner.");
		if (codes.has(a.sym)) return err(where, key, `Corner “${a.sym}” is declared twice.`);
		const c = cornerCode(a.sym, next);
		if (c < 0) return err(where, key, `The number in “${a.sym}” is too large: corner numbers stop at 65535.`);
		for (const [s, other] of codes)
			if (other === c)
				return err(
					where,
					key,
					`“${a.sym}” and “${s}” are the same corner to the engine (both encode to ${c}). Rename one.`,
				);
		codes.set(a.sym, c);
		declaredAt.set(a.sym, at(key) ?? 0);
		if (a.edge?.length !== undefined && edgeLength(a.edge.length) === null)
			err(where, key, `The length of “${a.sym}” should be a number (2), a fraction (3/2), a root (sqrt2, 2sqrt3) or a sum of them (sqrt3-1).`, "warning");
		if (a.value !== undefined && angleDegrees(a.value) === null && a.value !== "free")
			err(where, key, `The angle of “${a.sym}” should be degrees (90), a fraction (360/7) or free.`, "warning");
	});

	const unknown = (word: string[], where: Where, key: string, what: string) => {
		if (!word.length) return err(where, key, `This ${what} has no corners.`);
		// the engine reads top to bottom: a corner must be declared on an earlier line than its use
		const late = word.find((s) => codes.has(s) && (declaredAt.get(s) ?? 0) > (at(key) ?? Infinity));
		const missing = [...new Set(word.filter((s) => !codes.has(s)))];
		if (late && !missing.length)
			return err(where, key, `“${late}” is used above its angle line. Move the angle line up.`);
		if (missing.length)
			err(
				where,
				key,
				missing.length === 1
					? `“${missing[0]}” is not a declared corner. Add it under Corners, or fix the spelling.`
					: `${missing.map((s) => `“${s}”`).join(", ")} are not declared corners.`,
			);
	};
	b.faces.forEach((f, i) => {
		unknown(f.word, { kind: "face", index: i }, `face:${i}`, "face");
		if (f.repeat !== "inf" && !(Number.isInteger(f.repeat) && f.repeat >= 1))
			err({ kind: "face", index: i }, `face:${i}`, "The repeat count must be a whole number from 1 up, or ∞.");
	});
	b.vertices.forEach((v, i) => unknown(v.word, { kind: "vertex", index: i }, `vertex:${i}`, "vertex"));

	if (!b.name)
		out.push({ severity: "error", line: at("name") ?? ctx.last ?? null, where: { kind: "name" }, message: "The board needs a name.", beforeRun: true });
	if (!(ctx.hasK ?? true) || !b.faces.length || !b.vertices.length) {
		const missing = [
			!(ctx.hasK ?? true) && "a k range",
			!b.faces.length && "a face",
			!b.vertices.length && "a vertex",
		].filter(Boolean);
		out.push({
			severity: "error",
			line: ctx.last ?? null,
			where: { kind: "board" },
			message: `The board needs ${list(missing as string[])}.`,
		});
	}
	for (const n of new Set(b.initial))
		if (n > b.vertices.length)
			out.push({
				severity: "error",
				line: ctx.last ?? null,
				where: { kind: "initial" },
				message: `Initial names vertex ${n}, but there ${b.vertices.length === 1 ? "is only 1 vertex" : `are only ${b.vertices.length}`}.`,
			});
	// a tiling's faces are the board's, so a line naming none of them can never be met
	const onBoard = new Set(b.faces.map(faceId));
	b.require.forEach((r, i) => {
		for (const w of r.faces ?? []) unknown(w, { kind: "require", index: i }, `require:${i}`, "required face");
		if (r.faces?.length && b.faces.length && !requiredFaceKeys(r).some((k) => onBoard.has(k)))
			err(
				{ kind: "require", index: i },
				`require:${i}`,
				r.faces.length === 1
					? "This required face is not on the board, so no tiling can hold it. Add it as a face, or remove the requirement."
					: "None of these required faces is on the board, so no tiling can hold one. Add one as a face, or remove the requirement.",
			);
		const past = r.set.find((n) => n > b.vertices.length);
		if (past)
			out.push({
				severity: "error",
				line: ctx.last ?? null,
				where: { kind: "require", index: i },
				message: `Required set ${i + 1} names vertex ${past}, but there ${b.vertices.length === 1 ? "is only 1 vertex" : `are only ${b.vertices.length}`}.`,
			});
	});
	const sets = b.require.filter((r) => !r.faces).length;
	if (sets && sets + (b.initial.length ? 1 : 0) > 64)
		out.push({
			severity: "error",
			line: ctx.last ?? null,
			where: { kind: "board" },
			message: "At most 64 required sets, initial counting as one.",
		});
	if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > MAX_K) err({ kind: "k" }, "k", `k needs 1 ≤ from ≤ to ≤ ${MAX_K}.`);
	const optional = b.faces.filter((f) => f.optional).length;
	if (b.subsets && !optional)
		err({ kind: "board" }, "subsets", "Subsets counts optional faces, and the board has none: mark a face optional.", "warning");
	else if (b.subsets && b.subsets[1] > optional)
		err({ kind: "board" }, "subsets", `Subsets goes up to ${b.subsets[1]}, but the board has ${optional} optional face${optional === 1 ? "" : "s"}.`, "warning");

	// warnings: a board the engine accepts but that cannot do what it seems to say
	const inFace = new Set(b.faces.flatMap((f) => f.word));
	const inVertex = new Set(b.vertices.flatMap((v) => v.word));
	const twin = twins(b);
	b.vertices.forEach((v, i) => {
		const orphan = [...new Set(v.word.filter((s) => codes.has(s) && !inFace.has(s)))];
		if (orphan.length)
			unused(
				{ kind: "vertex", index: i },
				`vertex:${i}`,
				`No face has corner ${orphan.map((s) => `“${s}”`).join(", ")}, so this vertex can never occur.`,
			);
		if (twin[i] >= 0)
			err(
				{ kind: "vertex", index: i },
				`vertex:${i}`,
				`Same vertex as vertex ${twin[i] + 1}${b.permutations ? " (same corners)" : " (turned or mirrored)"}.`,
				"warning",
			);
	});
	// each face keyed once (rotation and mirroring aside), and the first face with each key: its twins
	const faceKey = b.faces.map((f) => `${f.repeat} ${cyclicKey(expand(f))}`);
	const firstWith = new Map<string, number>();
	faceKey.forEach((k, i) => firstWith.has(k) || firstWith.set(k, i));
	b.faces.forEach((f, i) => {
		const orphan = [...new Set(f.word.filter((s) => codes.has(s) && !inVertex.has(s)))];
		if (orphan.length)
			unused(
				{ kind: "face", index: i },
				`face:${i}`,
				`No vertex uses corner ${orphan.map((s) => `“${s}”`).join(", ")}, so this face can never be placed.`,
			);
		const twin = firstWith.get(faceKey[i])!;
		if (twin < i) err({ kind: "face", index: i }, `face:${i}`, `Same face as face ${twin + 1}.`, "warning");
	});
	// a typed side glues only where its middle corner meets another, so a plain side never meets a drawn, hidden,
	// bump or bite one; faces round a vertex share sides, so no tiling holds a face of each kind. A plain side
	// is length 1, so lengths need no type for it, and a type of length 1 (an older drawing's E1) blocks it
	const isEdge = new Set(b.angles.filter((a) => a.edge).map((a) => a.sym));
	const unit = unitTypes(b);
	const blocks = new Set(b.angles.filter((a) => a.edge?.style || unit.has(a.sym)).map((a) => a.sym));
	if (b.faces.some((f) => f.word.some((c) => blocks.has(c))))
		b.faces.forEach((f, i) => {
			if (faceSize(f) !== 2 && !f.word.some((c) => isEdge.has(c)))
				unused(
					{ kind: "face", index: i },
					`face:${i}`,
					unit.size
						? `Its sides are plain and other faces' sides of length 1 carry ${[...unit].map((u) => `“${u}”`).join(", ")}, so they never meet. A side of length 1 needs no type: Quick setup takes it off.`
						: "Its sides have no edge type and other faces' sides do. A side with no type never meets a typed one, so no tiling holds this face with those.",
				);
		});
	b.angles.forEach((a, i) => {
		if (codes.has(a.sym) && !inFace.has(a.sym) && !inVertex.has(a.sym))
			unused({ kind: "angle", index: i }, `angle:${i}`, `Corner “${a.sym}” is not used by any face or vertex.`);
	});
	return out;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const expand = (f: Face) => (f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat());

/**
 * A word's key up to rotation and reflection, as the engine reads a vertex or face; as a multiset when `multiset`.
 * The least of its rotations and its mirror's, joined by spaces. Found in linear time (study plans key thousands
 * of words of 20 corners and more): comparing the corners one by one orders two rotations as their joined text
 * does, since a space sorts before every character a symbol can hold.
 */
export function cyclicKey(w: string[], multiset = false): string {
	if (multiset) return [...w].sort().join(" ");
	const least = (v: string[]) => {
		const n = v.length;
		let [i, j, k] = [0, 1, 0];
		while (i < n && j < n && k < n) {
			const a = v[(i + k) % n];
			const b = v[(j + k) % n];
			if (a === b) {
				k++;
				continue;
			}
			if (a > b) i += k + 1;
			else j += k + 1;
			if (i === j) j++;
			k = 0;
		}
		const r = Math.min(i, j);
		return [...v.slice(r), ...v.slice(0, r)];
	};
	const [x, y] = [least(w), least([...w].reverse())];
	const d = x.findIndex((c, i) => c !== y[i]);
	return (d >= 0 && y[d] < x[d] ? y : x).join(" ");
}

/**
 * Every cyclic order of the multiset `word`, one per order up to rotation and reflection. With `digons`, each
 * order also comes once for every way to put at most one digon in each gap between its corners: the vertices
 * of an edge system, where a digon in a gap marks the edge there. A vertex with exactly one marked edge is a
 * loose end, kept only with `loose` (Marek's edge systems have none). Fewest marked edges first; null when
 * the orders to try pass `budget`.
 */
export function arrangements(word: string[], digons: string[] = [], loose = false, budget = 2e6): string[][] | null {
	const count = new Map<string, number>();
	for (const s of word) count.set(s, (count.get(s) ?? 0) + 1);
	const syms = [...count.keys()].sort();
	const out = new Map<string, string[]>();
	const cur: string[] = [];
	let steps = 0;
	const marks = (order: string[]) => {
		// each gap, after corner i, holds nothing (-1) or one of the digons
		const gap = order.map(() => -1);
		const rec = (i: number, marked: number) => {
			if (++steps > budget) return;
			if (i === order.length) {
				if (marked === 1 && !loose) return;
				const w = order.flatMap((c, j) => (gap[j] < 0 ? [c] : [c, digons[gap[j]]]));
				const k = cyclicKey(w);
				if (!out.has(k)) out.set(k, w);
				return;
			}
			for (let d = -1; d < digons.length; d++) {
				gap[i] = d;
				rec(i + 1, marked + (d < 0 ? 0 : 1));
			}
		};
		rec(0, 0);
	};
	// every order starts with the first symbol, which loses no order up to rotation
	const build = () => {
		if (steps > budget) return;
		if (cur.length === word.length) return marks(cur);
		for (const s of syms)
			if (count.get(s)! > 0 && (cur.length || s === syms[0])) {
				count.set(s, count.get(s)! - 1);
				cur.push(s);
				build();
				cur.pop();
				count.set(s, count.get(s)! + 1);
			}
	};
	if (word.length) build();
	if (steps > budget) return null;
	const digonCount = (w: string[]) => w.length - word.length;
	return [...out.values()].sort((x, y) => digonCount(x) - digonCount(y));
}

/**
 * The board read with Permutations `on`, asking for the same tilings: turned off, each set of corners is spelled
 * out as the cyclic orders it stands for (so one order can be required or made initial on its own); turned on,
 * orders of one set become that set. `initial` and the required sets follow their vertices. Null when a set has
 * too many orders to spell out.
 */
export function withPermutations(b: Board, on: boolean): Board | null {
	if (b.permutations === on) return b;
	const at = new Map<string, number>();
	const vertices: Board["vertices"] = [];
	const to: number[][] = [];
	for (const v of b.vertices) {
		const words = on ? [v.word] : arrangements(v.word, [], false, 1e5);
		if (!words) return null;
		to.push(
			words.map((word, j) => {
				const k = cyclicKey(word, on);
				if (!at.has(k)) (at.set(k, vertices.length + 1), vertices.push(j ? { word } : { ...v, word }));
				return at.get(k)!;
			}),
		);
	}
	return { ...b, permutations: on, vertices, ...renumber(b, (n) => to[n - 1]) };
}

/** Equal as cyclic words up to rotation and reflection, or as multisets when `multiset`. */
export const sameCycle = (a: string[], b: string[], multiset: boolean) =>
	a.length === b.length && cyclicKey(a, multiset) === cyclicKey(b, multiset);

/** Per vertex, the first earlier vertex that is the same one, or -1: one pass, where comparing every pair
 *  took 17 s on a board of 5,000 vertices. */
export function twins(b: Board): number[] {
	const first = new Map<string, number>();
	return b.vertices.map((v, i) => {
		const k = cyclicKey(v.word, b.permutations);
		if (!first.has(k)) first.set(k, i);
		return first.get(k) === i ? -1 : first.get(k)!;
	});
}

/** "90" → 90, "360/7" → 51.43, anything else → null. */
export function angleDegrees(v: string | undefined): number | null {
	if (!v) return null;
	const m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(v);
	if (!m) return null;
	const n = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
	return Number.isFinite(n) ? n : null;
}

/** An edge length as written ("2", "3/2", "sqrt(2)", "6+4sqrt3"; readLength says what reads), or null. */
export const edgeLength = (v: string | undefined): number | null => readLength(v)?.value ?? null;

/** A length exactly: the sum of `num/den · √root` over its terms, each root squarefree (1 for the rational part). */
export type Length = { terms: { num: number; den: number; root: number }[]; value: number };

/** A sum of square roots: root → its coefficient, an exact fraction (Q, as {…} arithmetic uses). */
type Surds = Map<number, Q>;
const surdAdd = (a: Surds, b: Surds, sign = 1): Surds => {
	const out = new Map(a);
	for (const [r, x] of b) {
		const y = out.get(r) ?? { p: 0, q: 1 };
		const z = q(y.p * x.q + sign * x.p * y.q, y.q * x.q);
		if (z.p) out.set(r, z);
		else out.delete(r);
	}
	return out;
};
/** √m as s·√r, r squarefree. */
function surdRoot(m: number): [number, number] {
	let [s, r] = [1, m];
	for (let p = 2; p * p <= r; p++)
		while (r % (p * p) === 0) {
			r /= p * p;
			s *= p;
		}
	return [s, r];
}
const surdMul = (a: Surds, b: Surds): Surds => {
	let out: Surds = new Map();
	for (const [r1, x] of a)
		for (const [r2, y] of b) {
			const [s, r] = surdRoot(r1 * r2);
			out = surdAdd(out, new Map([[r, q(x.p * y.p * s, x.q * y.q)]]));
		}
	return out;
};

/**
 * A length as written, read exactly: terms joined by + and −, each a whole number, a decimal or a fraction
 * times a square root, with brackets. "2", "3/2", "sqrt(2)", "sqrt2", "2sqrt(3)", "sqrt(3)/2", "6+4sqrt3",
 * "sqrt3-1", "(1+sqrt5)/2", "phi". The atlas's palettes write their edge lengths this way
 * (tools/ctrnact-oracle/develop_tri45.py, `_len_step`); minus, fractions and brackets are added. Division
 * is by a single term. Null when unreadable or not positive.
 */
export function readLength(v: string | undefined): Length | null {
	if (v === undefined) return null;
	const s = v.replace(/\s+/g, "");
	let i = 0;
	const fail = () => {
		throw new Error();
	};
	const number = (): number => {
		const m = /^\d+/.exec(s.slice(i)) ?? fail();
		i += m![0].length;
		return Number(m![0]);
	};
	const factor = (): Surds => {
		if (s.startsWith("sqrt", i)) {
			i += 4;
			const bracket = s[i] === "(";
			if (bracket) i++;
			const [k, r] = surdRoot(number());
			if (bracket && s[i++] !== ")") fail();
			return k && r ? new Map([[r, q(k)]]) : fail();
		}
		if (s.startsWith("phi", i)) {
			i += 3;
			return new Map([
				[1, q(1, 2)],
				[5, q(1, 2)],
			]);
		}
		if (s[i] === "(") {
			i++;
			const e = sum();
			if (s[i++] !== ")") fail();
			return e;
		}
		const m = /^(\d+)(?:\.(\d+))?/.exec(s.slice(i)) ?? fail();
		i += m![0].length;
		const frac = m![2] ?? "";
		return new Map([[1, q(Number(m![1] + frac), 10 ** frac.length)]]);
	};
	const term = (): Surds => {
		let t = factor();
		for (;;) {
			if (s[i] === "*") {
				i++;
				t = surdMul(t, factor());
			} else if (s[i] === "/") {
				i++;
				const d = factor();
				if (d.size !== 1) fail();
				// over c·√r: times √r, over c·r
				const [[r, x]] = [...d];
				t = surdMul(t, new Map([[r, q(x.q, x.p * r)]]));
			} else if (i < s.length && /[\d(sp]/.test(s[i])) t = surdMul(t, factor());
			else return t;
		}
	};
	const sum = (): Surds => {
		let sign = s[i] === "-" ? -1 : 1;
		if (s[i] === "-" || s[i] === "+") i++;
		let out = surdAdd(new Map(), term(), sign);
		while (s[i] === "+" || s[i] === "-") {
			sign = s[i++] === "-" ? -1 : 1;
			out = surdAdd(out, term(), sign);
		}
		return out;
	};
	try {
		const e = sum();
		if (i !== s.length || !e.size) return null;
		const terms = [...e].map(([r, x]) => ({ num: x.p, den: x.q, root: r })).sort((a, b) => a.root - b.root);
		const value = terms.reduce((t, x) => t + (x.num / x.den) * Math.sqrt(x.root), 0);
		return Number.isFinite(value) && value > 1e-12 ? { terms, value } : null;
	} catch {
		return null;
	}
}

/** A length in one spelling, the same for every way of writing it: positive terms first, "6+4sqrt3", "sqrt3-1". */
export function printLength(l: Length): string {
	const terms = [...l.terms.filter((t) => t.num > 0), ...l.terms.filter((t) => t.num < 0)];
	return terms
		.map(({ num, den, root: r }, j) => {
			const k = Math.abs(num);
			const body = r === 1 ? `${k}` : `${k === 1 ? "" : k}sqrt${r}`;
			return `${num < 0 ? "-" : j ? "+" : ""}${body}${den === 1 ? "" : `/${den}`}`;
		})
		.join("");
}

/** Whether a length is 1, however written ("1", "2/2"): a plain unit edge, which needs no type. */
export const isUnitLength = (v: string | undefined) => {
	const l = readLength(v);
	return !!l && printLength(l) === "1";
};
/** The board's edge types of length 1 with no style: the `E1` older drawings gave a side of length 1. Such a
 *  side is a plain unit edge, so these type nothing (withoutUnitType takes them off). */
export const unitTypes = (b: Board) =>
	new Set(b.angles.flatMap((a) => (a.edge && !a.edge.style && isUnitLength(a.edge.length ?? "1") ? [a.sym] : [])));

/** Whether a corner is a point along a side: Pi, or an edge line's midpoint corner. */
export function flatOf(b: Board): (c: string) => boolean {
	const e = new Set(b.angles.flatMap((a) => (a.edge ? [a.sym] : [])));
	return (c) => c === "Pi" || e.has(c);
}

/**
 * A typed corner, `A4.Ed.Eu`: corner A4 of a face whose sides either side of it have edge types Ed and Eu
 * (written in sorted order, as a face reads the same mirrored). The name carries the sides so that a vertex
 * line spells out the edge pattern round the vertex. Null for any other symbol.
 */
export function typedCorner(b: Board, sym: string): { base: string; sides: [string, string] } | null {
	const m = /^(.+)\.([^.]+)\.([^.]+)$/.exec(sym);
	if (!m) return null;
	const edge = (t: string) => b.angles.some((a) => a.sym === t && a.edge);
	return edge(m[2]) && edge(m[3]) ? { base: m[1], sides: [m[2], m[3]] } : null;
}
export const typedName = (base: string, t1: string, t2: string) => `${base}.${[t1, t2].sort().join(".")}`;

/** The colour letters, A first. */
export const COLOR_LETTERS = "ABCDEFGH";
/** A coloured corner, `A4@B`: corner A4 of a face of colour B (index 1). Null for any other symbol. */
export function coloredCorner(sym: string): { base: string; color: number } | null {
	const m = /^(.+)@([A-H])$/.exec(sym);
	return m ? { base: m[1], color: COLOR_LETTERS.indexOf(m[2]) } : null;
}
export const coloredName = (base: string, color: number) => `${base}@${COLOR_LETTERS[color]}`;

/** The board's edge corners, by symbol: each one's length (1 unless given) and style. */
export function edgeTypes(b: Board): Map<string, { length: number; style?: EdgeStyle }> {
	return new Map(
		b.angles.flatMap((a) => (a.edge ? [[a.sym, { length: edgeLength(a.edge.length) ?? 1, style: a.edge.style }]] : [])),
	);
}

// each `require face` line's faces as cyclic keys, kept while the line is (the editor asks every render)
const requiredKeys = new WeakMap<string[][], Set<string>>();
/** Whether a `require face` line asks for exactly these faces (each up to turning and mirroring). A face's
 *  cyclic key settles that (sameCycle), so each face is keyed once and looked up, not compared pairwise:
 *  a group of hundreds of variants is otherwise seconds per check. */
export function requiresFaces(b: Board, faces: Face[]): boolean {
	const want = faces.map(faceId);
	return b.require.some((r) => {
		if (!r.faces || r.faces.length !== want.length) return false;
		let have = requiredKeys.get(r.faces);
		if (!have) requiredKeys.set(r.faces, (have = new Set(requiredFaceKeys(r))));
		return want.every((k) => have.has(k));
	});
}

/** A face up to turning and mirroring, an apeirogon marked as one: the same key for a face line and for the
 *  same face in a `require face` line. */
export const faceId = (f: Face) => `${f.repeat === "inf" ? "inf " : ""}${cyclicKey(expand(f))}`;
/** The keys of a `require face` line's faces, as faceId gives them. */
export const requiredFaceKeys = (r: Required) =>
	(r.faces ?? []).map((w, i) => `${r.infinite?.[i] ? "inf " : ""}${cyclicKey(w)}`);

/** The board with one more `require face` line: one of `faces`; unchanged when it already has that line. */
export function withRequiredFaces(b: Board, faces: Face[]): Board {
	if (!faces.length || requiresFaces(b, faces)) return b;
	return { ...b, require: [...b.require, lineOf(faces.map(itemOf), { set: [] })] };
}

// a face of a `require face` line: its word in full, whether it is an apeirogon, and the formula repeating it
type Item = { word: string[]; inf: boolean; expr?: Expr<number> };
const itemOf = (f: Face): Item => ({
	word: expand(f),
	inf: f.repeat === "inf",
	expr: repeatOf(f) === f.repeat ? undefined : f.repeatExpr,
});
const lineOf = (items: Item[], r: Required): Required => {
	const { infinite: _i, repeatExprs: _e, ...rest } = r;
	return {
		...rest,
		faces: items.map((x) => x.word),
		...(items.some((x) => x.inf) ? { infinite: items.map((x) => x.inf) } : {}),
		...(items.some((x) => x.expr) ? { repeatExprs: items.map((x) => x.expr) } : {}),
	};
};
// the `require face` lines with each face mapped by its key: to another face, to null to drop it, or kept
// (undefined); a line left with no face goes
const retarget = (rs: Required[], to: (key: string) => Face | null | undefined): Required[] =>
	rs.flatMap((r) => {
		const keys = requiredFaceKeys(r);
		if (keys.every((k) => to(k) === undefined)) return [r];
		const items = keys.flatMap((k, j): Item[] => {
			const f = to(k);
			if (f === null) return [];
			return [f ? itemOf(f) : { word: r.faces![j], inf: !!r.infinite?.[j], expr: r.repeatExprs?.[j] }];
		});
		return items.length ? [lineOf(items, r)] : [];
	});

/** The board without faces `is` (0-based), which also leave the `require face` lines that name them (unless
 *  the board keeps another copy); a line left with no face goes. */
export function withoutFaces(b: Board, is: number[]): Board {
	const faces = b.faces.filter((_, i) => !is.includes(i));
	const left = new Set(faces.map(faceId));
	const gone = new Set(is.map((i) => faceId(b.faces[i])).filter((k) => !left.has(k)));
	return { ...b, faces, require: retarget(b.require, (k) => (gone.has(k) ? null : undefined)) };
}

/** `next`, made from `prev` by changing face i in place, with the `require face` lines that named the face
 *  naming it as it is now: an edited face stays required, never leaving a line for a face the board lost. */
export function followFace(prev: Board, next: Board, i: number): Board {
	const [was, now] = [prev.faces[i], next.faces[i]];
	if (!was || !now || prev.faces.length !== next.faces.length) return next;
	const old = faceId(was);
	if (old === faceId(now) || next.faces.some((f) => faceId(f) === old)) return next;
	return { ...next, require: retarget(next.require, (k) => (k === old ? now : undefined)) };
}

// ── board → text ──

/** A face's repeat as the text writes it: its formula while the face still has the repeat it came to. */
export const repeatOf = (f: Face): number | string =>
	f.repeatExpr && f.repeat === f.repeatExpr.at ? f.repeatExpr.text : f.repeat;
/** A face line after its keyword: `A6 x 6`, `A{n} x {n}`. */
export const faceText = (f: Face) => `${f.word.join(" ")}${repeatOf(f) === 1 ? "" : ` x ${repeatOf(f)}`}`;
/** A required face as its line writes it: in full, `x inf` after an apeirogon's period, or the period and the
 *  formula that repeats it. */
function requiredText(w: string[], inf?: boolean, e?: Expr<number>): string {
	const p = e && w.length % e.at === 0 ? w.length / e.at : 0;
	return p ? `${w.slice(0, p).join(" ")} x ${e!.text}` : `${w.join(" ")}${inf ? " x inf" : ""}`;
}

export function serialize(b: Board): string {
	const out: string[] = [];
	const put = (stmt: string, n: Note | undefined) => {
		for (const c of n?.lead ?? []) out.push(c ? `# ${c}` : "#");
		out.push(n?.trail ? `${stmt}   # ${n.trail}` : stmt);
	};
	const gap = () => out.length && out[out.length - 1] !== "" && out.push("");
	for (const h of b.header) out.push(h === "" ? "" : `# ${h}`);
	if (b.header.length && b.header[b.header.length - 1] !== "") out.push("");
	put(`name ${b.name}`.trim(), b.notes.name);
	put(`k ${b.kmin} ${b.kmax}`, b.notes.k);
	// a study's parameters right under k, above the lines that use them
	const vary = (e: Extra) => /^vary\b/.test(e.text);
	for (const e of b.extra.filter(vary)) put(e.text, e);
	gap();
	for (const a of b.angles)
		put(
			a.edge
				? `edge ${a.sym}${a.edge.length !== undefined ? ` length ${a.edge.length}` : ""}${a.edge.style ? ` ${a.edge.style}` : ""}`
				: `angle ${a.sym}${a.value !== undefined ? ` ${a.valueExpr?.at === a.value ? a.valueExpr.text : a.value}` : ""}`,
			a,
		);
	gap();
	for (const f of b.faces) put(`${f.optional ? "optional" : "face"} ${faceText(f)}`, f);
	gap();
	for (const v of b.vertices) put(`vertex ${v.word.join(" ")}`, v);
	gap();
	put(`permutations ${b.permutations ? "yes" : "no"}`, b.notes.permutations);
	if (b.colorsLabeled !== undefined) out.push(`colors ${b.colorsLabeled ? "labeled" : "unlabeled"}`);
	if (b.chiral !== undefined) out.push(`chiral ${b.chiral ? "yes" : "no"}`);
	if (b.subsets) out.push(`subsets ${b.subsets[0]} ${b.subsets[1]}`);
	if (b.initial.length) put(`initial ${b.initial.join(" ")}`, b.notes.initial);
	for (const r of b.require)
		put(
			r.faces
				? `require ${r.faces.map((w, i) => `face ${requiredText(w, r.infinite?.[i], r.repeatExprs?.[i])}`).join(" | ")}`
				: `require ${r.set.join(" ")}`,
			r,
		);
	for (const e of b.extra) {
		if (vary(e)) continue;
		if (e.text) put(e.text, e);
		else for (const c of e.lead ?? []) out.push(c ? `# ${c}` : "#");
	}
	return out.join("\n") + "\n";
}

// ── edits the visual editor makes, keeping `initial` and the required sets pointed at the same vertices ──

/**
 * What the board's warnings name as dead weight: corners in no face or vertex, faces with a corner no vertex
 * uses (never placed), vertices with a corner no face has (never occur). Indices are 0-based.
 */
export function deadWeight(b: Board): { corners: string[]; faces: number[]; vertices: number[] } {
	const inFace = new Set(b.faces.flatMap((f) => f.word));
	const inVertex = new Set(b.vertices.flatMap((v) => v.word));
	return {
		corners: b.angles.filter((a) => !inFace.has(a.sym) && !inVertex.has(a.sym)).map((a) => a.sym),
		faces: b.faces.flatMap((f, i) => (f.word.some((s) => !inVertex.has(s)) ? [i] : [])),
		vertices: b.vertices.flatMap((v, i) => (v.word.some((s) => !inFace.has(s)) ? [i] : [])),
	};
}

/** `initial` and the required sets through `to` (a vertex number to its new ones: none when it is gone, more
 *  than one when it is spelled out); a set left empty goes too. */
export function renumber(b: Board, to: (n: number) => number[]): Pick<Board, "initial" | "require"> {
	const map = (ns: number[]) => [...new Set(ns.flatMap(to))].sort((x, y) => x - y);
	return {
		initial: map(b.initial),
		require: b.require.flatMap((r) => (r.faces ? [r] : map(r.set).length ? [{ ...r, set: map(r.set) }] : [])),
	};
}

/** The board without vertices `drop` (0-based); `initial` and the required sets keep their vertices. */
export function removeVertices(b: Board, drop: number[]): Board {
	const gone = new Set(drop.map((i) => i + 1));
	return {
		...b,
		vertices: b.vertices.filter((_, j) => !gone.has(j + 1)),
		...renumber(b, (n) => (gone.has(n) ? [] : [n - [...gone].filter((g) => g < n).length])),
	};
}

export function moveVertex(b: Board, from: number, to: number): Board {
	if (to < 0 || to >= b.vertices.length || from === to) return b;
	const vs = [...b.vertices];
	const [v] = vs.splice(from, 1);
	vs.splice(to, 0, v);
	const order = b.vertices.map((_, j) => j); // old index at each new position
	const [o] = order.splice(from, 1);
	order.splice(to, 0, o);
	const newNumber = new Map(order.map((old, pos) => [old + 1, pos + 1]));
	return { ...b, vertices: vs, ...renumber(b, (n) => [newNumber.get(n) ?? n]) };
}

export function renameAngle(b: Board, from: string, to: string): Board {
	const sub = (w: string[]) => w.map((s) => (s === from ? to : s));
	return {
		...b,
		angles: b.angles.map((a) => (a.sym === from ? { ...a, sym: to } : a)),
		faces: b.faces.map((f) => ({ ...f, word: sub(f.word) })),
		vertices: b.vertices.map((v) => ({ ...v, word: sub(v.word) })),
		require: b.require.map((r) => (r.faces ? { ...r, faces: r.faces.map(sub) } : r)),
	};
}

/** Corners in the face: the word times the repeat, or null for an apeirogon. */
export const faceSize = (f: Face) => (f.repeat === "inf" ? null : f.word.length * f.repeat);
