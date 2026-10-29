// The vertex filter on the board page: a small boolean language over a board's vertices.
//
//   A3              the vertex has corner A3
//   A3>=2           it has at least two (also =, >, <, <=)
//   corners>=6      it has at least six corners in all
//   face:2          it has a corner of face 2 (numbered as in the Faces list)
//   initial         it is an initial vertex
//   unplaceable     no face has one of its corners, so it can never occur
//   duplicate       it is the same vertex as an earlier one
//   star            it has a corner of a star face (a star whose point is Free counts); star>=2 counts them.
//                   Likewise regular, convex (an isotoxal face under 180° all round), apeirogon and digon.
//                   Pi, a point along a side, belongs to no kind.
//
// joined by AND, OR, NOT (or &, |, !) and parentheses; terms side by side are ANDed, NOT binds tightest,
// then AND, then OR. Keywords are matched before corner names, case aside.
import { deadWeight, flatOf, twins, type Board, type Face } from "./board";
import { dentOf, specOf } from "./corners";

const KINDS = ["star", "convex", "regular", "apeirogon", "digon"] as const;
type Kind = (typeof KINDS)[number];

/** What kind of face `f` is, or null for a face of no shape the editor names. */
function kindOf(b: Board, f: Face): Kind | null {
	const s = specOf(b, f);
	if (!s) return null;
	if (s.n === null) return "apeirogon";
	if (s.free) return "star";
	if (s.point !== undefined) return dentOf(s.n, s.point) > 180 ? "star" : "convex";
	return s.n === 2 ? "digon" : "regular";
}

export type VertexTest = (i: number) => boolean;

const OPS: Record<string, (a: number, b: number) => boolean> = {
	">=": (a, b) => a >= b,
	"<=": (a, b) => a <= b,
	"=": (a, b) => a === b,
	">": (a, b) => a > b,
	"<": (a, b) => a < b,
};

/** `text` as a test of vertex i of `b`, or the reason it cannot be read. An empty query matches every vertex. */
export function vertexQuery(b: Board, text: string): { test: VertexTest } | { error: string } {
	const tokens = text.match(/[()&|!]|[^\s()&|!]+/g) ?? [];
	if (!tokens.length) return { test: () => true };
	const syms = new Set(b.angles.map((a) => a.sym));
	const dead = new Set(deadWeight(b).vertices);
	const count = (i: number, s: string) => b.vertices[i].word.filter((c) => c === s).length;
	// per corner, the kinds of the faces it is a corner of
	const kinds = new Map<string, Set<Kind>>();
	const flat = flatOf(b);
	for (const f of b.faces) {
		const k = kindOf(b, f);
		if (k) for (const c of f.word) if (!flat(c)) kinds.set(c, (kinds.get(c) ?? new Set()).add(k));
	}
	let at = 0;
	const peek = () => tokens[at]?.toUpperCase();
	const fail = (why: string): never => {
		throw new Error(why);
	};

	const term = (t: string): VertexTest => {
		const low = t.toLowerCase();
		if (low === "initial") return (i) => b.initial.includes(i + 1);
		if (low === "unplaceable") return (i) => dead.has(i);
		if (low === "duplicate") {
			const twin = twins(b);
			return (i) => twin[i] >= 0;
		}
		const face = /^face:(\d+)$/i.exec(t);
		if (face) {
			const f = b.faces[Number(face[1]) - 1];
			if (!f) fail(`There is no face ${face[1]}: the board has ${b.faces.length}.`);
			const has = new Set(f.word);
			return (i) => b.vertices[i].word.some((c) => has.has(c));
		}
		const cmp = /^(.+?)(>=|<=|=|>|<)(\d+)$/.exec(t);
		const [sym, op, n] = cmp ? [cmp[1], cmp[2], Number(cmp[3])] : [t, ">=", 1];
		if (sym.toLowerCase() === "corners") return (i) => OPS[op](b.vertices[i].word.length, n);
		const kind = KINDS.find((k) => k === sym.toLowerCase());
		if (kind) return (i) => OPS[op](b.vertices[i].word.filter((c) => kinds.get(c)?.has(kind)).length, n);
		if (!syms.has(sym)) fail(`No corner is named “${sym}”.`);
		return (i) => OPS[op](count(i, sym), n);
	};
	const atom = (): VertexTest => {
		const t = tokens[at++];
		if (t === undefined) return fail("The query ends too soon.");
		if (t === "(") {
			const inner = or();
			if (tokens[at++] !== ")") fail("A bracket is not closed.");
			return inner;
		}
		if (t === ")" || ["AND", "OR", "&", "|"].includes(t.toUpperCase())) fail(`“${t}” has nothing before it.`);
		return term(t);
	};
	const not = (): VertexTest => {
		if (peek() === "NOT" || peek() === "!") {
			at++;
			const inner = not();
			return (i) => !inner(i);
		}
		return atom();
	};
	const and = (): VertexTest => {
		let left = not();
		for (;;) {
			const t = peek();
			if (t === undefined || t === ")" || t === "OR" || t === "|") return left;
			if (t === "AND" || t === "&") at++;
			const l = left;
			const right = not();
			left = (i) => l(i) && right(i);
		}
	};
	const or = (): VertexTest => {
		let left = and();
		while (peek() === "OR" || peek() === "|") {
			at++;
			const l = left;
			const right = and();
			left = (i) => l(i) || right(i);
		}
		return left;
	};

	try {
		const test = or();
		if (at < tokens.length) fail(`“${tokens[at]}” has no bracket to close.`);
		return { test };
	} catch (e) {
		return { error: (e as Error).message };
	}
}
