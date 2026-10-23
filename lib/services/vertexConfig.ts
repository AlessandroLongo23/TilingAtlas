import { canonicalizeVertexFigure } from "@/lib/utils/vertexFigureHue";

// Vertex configurations as the library queries them: one canonical spelling per vertex figure, so a
// figure typed as "4.6.3.6", "3,6,4,6", "(3,6,4,6)" or "3.6.4.6" is the same chip and matches the same
// tilings. Canonical = the least rotation or reflection, tokens joined by dots. A token is a polygon
// size with an optional star mark and suffix ("6", "12*", "4*p1"); tokens order by size, then a
// regular polygon before a star of the same size.

const SUPERSCRIPT: Record<string, string> = {
	"²": "2",
	"³": "3",
	"⁴": "4",
	"⁵": "5",
	"⁶": "6",
	"⁷": "7",
	"⁸": "8",
	"⁹": "9",
};
const TOKEN = /^\d+(\*[a-z0-9]*)?$/i;

const compareToken = (a: string, b: string) => parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : a > b ? 1 : 0);

/** The canonical spelling of a vertex figure given as its tokens in cyclic order. */
export function canonicalVC(tokens: readonly string[]): string {
	return canonicalizeVertexFigure([...tokens], compareToken).join(".");
}

/**
 * Read one vertex figure from any notation the literature and the solvers use: dots or commas, an
 * optional bracket and trailing symmetry flag ("(3,6,4,6)A"), and exponents for repeats ("3^4.6",
 * "3⁴.6"). Null when it is not a figure (fewer than three corners, or a token that is not a polygon).
 */
export function parseVC(input: string): string | null {
	const s = input
		.trim()
		.replace(/[²³⁴⁵⁶⁷⁸⁹]/g, (c) => `^${SUPERSCRIPT[c]}`)
		.replace(/^[[(]+/, "")
		.replace(/[\])]+[A-Z0-9]*$/i, "");
	const tokens: string[] = [];
	for (const part of s.split(/[.,\s]+/).filter(Boolean)) {
		const [tok, exp] = part.split("^");
		if (!TOKEN.test(tok)) return null;
		const n = exp === undefined ? 1 : Number(exp);
		if (!Number.isInteger(n) || n < 1 || n > 12) return null;
		for (let i = 0; i < n; i++) tokens.push(tok);
	}
	return tokens.length >= 3 ? canonicalVC(tokens) : null;
}

/** "3.3.3.4.4" → "3³.4²": the compact spelling for display. The canonical string stays the key. */
export function compactVC(vc: string): string {
	const sup = ["", "", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
	const out: string[] = [];
	const toks = vc.split(".");
	for (let i = 0; i < toks.length; ) {
		let j = i;
		while (j < toks.length && toks[j] === toks[i]) j++;
		out.push(toks[i] + (j - i > 1 ? (sup[j - i] ?? `^${j - i}`) : ""));
		i = j;
	}
	return out.join(".");
}

// The hyperbolic shelf spells its figures in `family` ("3.12.6*.12*.12 + 3.6*.12*"); parsing is cached by
// that string because tens of thousands of rows share a few thousand of them.
const familyCache = new Map<string, readonly string[] | null>();

/**
 * A tiling's distinct vertex configurations, canonical, or null when its source carries none (the
 * decoration shelves, the irregular-tile shelves). Euclidean rows ship them as `vcs` (enrich step);
 * hyperbolic rows are read off `family`.
 */
export function vcsOf(t: { vcs?: readonly string[]; source?: string; family: string }): readonly string[] | null {
	if (t.vcs) return t.vcs;
	if (t.source !== "hyperbolic") return null;
	let v = familyCache.get(t.family);
	if (v === undefined) {
		const parts = t.family.split(/\s*[+;]\s*/).map(parseVC);
		v = parts.every((p): p is string => p !== null) ? [...new Set(parts)] : null;
		familyCache.set(t.family, v);
	}
	return v;
}

/** How a configuration query combines: contains every chip, contains at least one, or is exactly them. */
export type VcMode = "all" | "any" | "exact";

export function matchesVcs(have: readonly string[] | null, want: readonly string[], mode: VcMode): boolean {
	if (!want.length) return true;
	if (!have) return false;
	if (mode === "any") return want.some((w) => have.includes(w));
	if (mode === "exact" && have.length !== want.length) return false;
	return want.every((w) => have.includes(w));
}
