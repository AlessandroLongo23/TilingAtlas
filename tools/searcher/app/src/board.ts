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
export interface Angle extends Note {
	sym: string;
	/** As written: degrees ("90"), a fraction of degrees ("360/7") or "free". */
	value?: string;
}
export interface Face extends Note {
	word: string[];
	repeat: number | "inf";
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
	/** 1-based vertex numbers; empty means all. */
	initial: number[];
	extra: Extra[];
	notes: Partial<Record<"name" | "k" | "permutations" | "initial", Note>>;
}

export type Where =
	| { kind: "name" | "k" | "permutations" | "initial" | "board" }
	| { kind: "angle" | "face" | "vertex" | "extra"; index: number };

export interface Problem {
	severity: "error" | "warning";
	/** 1-based line in the text the board was parsed from; null for a board built in the editor. */
	line: number | null;
	where: Where;
	message: string;
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

const KEYWORDS = new Set(["name", "k", "angle", "face", "vertex", "permutations", "initial", "search", "geometry"]);
const isInt = (s: string) => /^[0-9]+$/.test(s) && String(Number(s)) === s;

export function parse(text: string): { board: Board; problems: Problem[]; lines: Map<string, number> } {
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
		const t = body.split(/[ \t]+/).filter(Boolean);
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

		if (kw === "name" && t.length === 2) {
			b.name = t[1];
			b.notes.name = note;
			lines.set("name", lineno);
		} else if (kw === "name") bad(t.length > 2 ? "The name must be one word, with no spaces." : "The name is missing.");
		else if (kw === "k" && t.length === 3) {
			const [lo, hi] = [atoi(t[1]), atoi(t[2])];
			if (lo < 1 || hi < lo) bad("k needs whole numbers with 1 ≤ from ≤ to.");
			else {
				[b.kmin, b.kmax, hasK, b.notes.k] = [lo, hi, true, note];
				lines.set("k", lineno);
			}
		} else if (kw === "angle" && (t.length === 2 || t.length === 3)) {
			b.angles.push({ sym: t[1], ...(t[2] !== undefined ? { value: t[2] } : {}), ...note });
			lines.set(`angle:${b.angles.length - 1}`, lineno);
		} else if (kw === "face" && t.length >= 2) {
			const x = t.indexOf("x");
			const end = x < 0 ? t.length : x;
			const mult = x < 0 ? "1" : x + 2 === t.length ? t[x + 1] : "";
			if (mult !== "inf" && !(isInt(mult) && Number(mult) >= 1))
				bad("The repeat count after x must be a whole number from 1 up, or inf for an apeirogon.");
			else {
				b.faces.push({ word: t.slice(1, end), repeat: mult === "inf" ? "inf" : Number(mult), ...note });
				lines.set(`face:${b.faces.length - 1}`, lineno);
			}
		} else if (kw === "vertex" && t.length >= 2) {
			b.vertices.push({ word: t.slice(1), ...note });
			lines.set(`vertex:${b.vertices.length - 1}`, lineno);
		} else if (kw === "permutations" && t.length === 2 && (t[1] === "yes" || t[1] === "no")) {
			b.permutations = t[1] === "yes";
			b.notes.permutations = note;
			lines.set("permutations", lineno);
		} else if (kw === "initial" && t.length >= 2) {
			const all = t.length === 2 && t[1] === "all";
			if (!all && t.slice(1).some((s) => !isInt(s) || Number(s) < 1))
				bad("Initial takes vertex numbers (1, 2, …) or all.");
			else {
				b.initial = all ? [] : t.slice(1).map(Number);
				b.notes.initial = note;
				lines.set("initial", lineno);
			}
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
		} else if (kw === "vertex" || kw === "face") bad(`This ${kw} has no corners.`);
		else bad(KEYWORDS.has(kw) ? `The ${kw} line is not in a form the searcher reads.` : `Unknown statement “${kw}”.`);
	});
	if (lead.length) b.extra.push({ text: "", lead });

	problems.push(...check(b, { lines, last: raw.length, hasK, hasName: b.name !== "" }));
	if (!b.name) b.name = "untitled";
	problems.sort((p, q) => (p.line ?? 1e9) - (q.line ?? 1e9));
	return { board: b, problems, lines };
}

// atoi: the engine reads k with std::atoi, so "3x" is 3. Matching it keeps the first-error lines equal.
function atoi(s: string) {
	const m = /^[+-]?\d+/.exec(s);
	return m ? Number(m[0]) : 0;
}

// ── checks: everything the engine refuses, plus warnings it does not give ──

export function check(
	b: Board,
	ctx: { lines?: Map<string, number>; last?: number; hasK?: boolean; hasName?: boolean } = {},
): Problem[] {
	const out: Problem[] = [];
	const at = (key: string) => ctx.lines?.get(key) ?? null;
	const err = (where: Where, key: string, message: string, severity: Problem["severity"] = "error") =>
		out.push({ severity, line: at(key), where, message });

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

	if (!(ctx.hasName ?? b.name !== "") || !(ctx.hasK ?? true) || !b.faces.length || !b.vertices.length) {
		const missing = [
			!(ctx.hasName ?? b.name !== "") && "a name",
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
	if (b.kmin < 1 || b.kmax < b.kmin) err({ kind: "k" }, "k", "k needs 1 ≤ from ≤ to.");

	// warnings: a board the engine accepts but that cannot do what it seems to say
	const inFace = new Set(b.faces.flatMap((f) => f.word));
	const inVertex = new Set(b.vertices.flatMap((v) => v.word));
	b.vertices.forEach((v, i) => {
		const orphan = [...new Set(v.word.filter((s) => codes.has(s) && !inFace.has(s)))];
		if (orphan.length)
			err(
				{ kind: "vertex", index: i },
				`vertex:${i}`,
				`No face has corner ${orphan.map((s) => `“${s}”`).join(", ")}, so this vertex can never occur.`,
				"warning",
			);
		const twin = b.vertices.findIndex((w, j) => j < i && sameCycle(v.word, w.word, b.permutations));
		if (twin >= 0)
			err(
				{ kind: "vertex", index: i },
				`vertex:${i}`,
				`Same vertex as vertex ${twin + 1}${b.permutations ? " (same corners)" : " (turned or mirrored)"}.`,
				"warning",
			);
	});
	b.faces.forEach((f, i) => {
		const orphan = [...new Set(f.word.filter((s) => codes.has(s) && !inVertex.has(s)))];
		if (orphan.length)
			err(
				{ kind: "face", index: i },
				`face:${i}`,
				`No vertex uses corner ${orphan.map((s) => `“${s}”`).join(", ")}, so this face can never be placed.`,
				"warning",
			);
		const twin = b.faces.findIndex((g, j) => j < i && g.repeat === f.repeat && sameCycle(expand(g), expand(f), false));
		if (twin >= 0) err({ kind: "face", index: i }, `face:${i}`, `Same face as face ${twin + 1}.`, "warning");
	});
	b.angles.forEach((a, i) => {
		if (codes.has(a.sym) && !inFace.has(a.sym) && !inVertex.has(a.sym))
			err({ kind: "angle", index: i }, `angle:${i}`, `Corner “${a.sym}” is not used by any face or vertex.`, "warning");
	});
	return out;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const expand = (f: Face) => (f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat());

/** Equal as cyclic words up to rotation and reflection, or as multisets when `multiset`. */
export function sameCycle(a: string[], b: string[], multiset: boolean): boolean {
	if (a.length !== b.length) return false;
	if (multiset) return [...a].sort().join(" ") === [...b].sort().join(" ");
	const key = (w: string[]) => w.join("\u0000");
	const target = key(b);
	for (const w of [a, [...a].reverse()])
		for (let r = 0; r < w.length; r++) if (key([...w.slice(r), ...w.slice(0, r)]) === target) return true;
	return false;
}

/** "90" → 90, "360/7" → 51.43, anything else → null. */
export function angleDegrees(v: string | undefined): number | null {
	if (!v) return null;
	const m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(v);
	if (!m) return null;
	const n = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
	return Number.isFinite(n) ? n : null;
}

// ── board → text ──

export function serialize(b: Board): string {
	const out: string[] = [];
	const put = (stmt: string, n: Note | undefined) => {
		for (const c of n?.lead ?? []) out.push(c ? `# ${c}` : "#");
		out.push(n?.trail ? `${stmt}   # ${n.trail}` : stmt);
	};
	const gap = () => out.length && out[out.length - 1] !== "" && out.push("");
	for (const h of b.header) out.push(h === "" ? "" : `# ${h}`);
	if (b.header.length && b.header[b.header.length - 1] !== "") out.push("");
	put(`name ${b.name}`, b.notes.name);
	put(`k ${b.kmin} ${b.kmax}`, b.notes.k);
	gap();
	for (const a of b.angles) put(`angle ${a.sym}${a.value !== undefined ? ` ${a.value}` : ""}`, a);
	gap();
	for (const f of b.faces) put(`face ${f.word.join(" ")}${f.repeat === 1 ? "" : ` x ${f.repeat}`}`, f);
	gap();
	for (const v of b.vertices) put(`vertex ${v.word.join(" ")}`, v);
	gap();
	put(`permutations ${b.permutations ? "yes" : "no"}`, b.notes.permutations);
	if (b.initial.length) put(`initial ${b.initial.join(" ")}`, b.notes.initial);
	for (const e of b.extra) {
		if (e.text) put(e.text, e);
		else for (const c of e.lead ?? []) out.push(c ? `# ${c}` : "#");
	}
	return out.join("\n") + "\n";
}

// ── edits the visual editor makes, keeping `initial` pointed at the same vertices ──

export function removeVertex(b: Board, i: number): Board {
	const n = i + 1;
	return {
		...b,
		vertices: b.vertices.filter((_, j) => j !== i),
		initial: b.initial.filter((v) => v !== n).map((v) => (v > n ? v - 1 : v)),
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
	return { ...b, vertices: vs, initial: b.initial.map((v) => newNumber.get(v) ?? v).sort((x, y) => x - y) };
}

export function renameAngle(b: Board, from: string, to: string): Board {
	const sub = (w: string[]) => w.map((s) => (s === from ? to : s));
	return {
		...b,
		angles: b.angles.map((a) => (a.sym === from ? { ...a, sym: to } : a)),
		faces: b.faces.map((f) => ({ ...f, word: sub(f.word) })),
		vertices: b.vertices.map((v) => ({ ...v, word: sub(v.word) })),
	};
}

/** Corners in the face: the word times the repeat, or null for an apeirogon. */
export const faceSize = (f: Face) => (f.repeat === "inf" ? null : f.word.length * f.repeat);
