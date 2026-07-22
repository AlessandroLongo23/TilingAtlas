// Catalogue filter for the freedraw patterns. Marek, on Discord (2026-07-22): "Seeing that you can
// know the exact number and kinds of cells, that would be pretty important for filtering these
// patterns on higher k… or filter out infinite cells." AL: "you could, for example, filter for
// tetrominos only. Or pentominos."
//
// Each of the three face ranks — plus holes — is a three-state toggle rather than one chip out of a
// list, so the classes combine: "unbounded yes, strips irrelevant, every finite tile a tetromino" is
// one selection instead of an impossible one. Spec:
// docs/superpowers/specs/2026-07-22-freedraw-tile-filter-design.md
//
// Pure functions over a FaceSummary. No React, no DOM — the tests run on the real catalogue files.

import type { FaceSummary } from "./faces";
import type { FreedrawGrid } from "./pattern";
import { REGULAR_KINDS, type RegularInfo, type RegularKind } from "./regular";

/** require = the pattern contains at least one such face; exclude = it contains none. */
export type Tri = "any" | "require" | "exclude";

export type SizeMode = "all" | "any";

export interface FreedrawFilter {
	grid: FreedrawGrid;
	/** 0 = every k. */
	k: number;
	unbounded: Tri;
	strip: Tri;
	finite: Tri;
	/** At least one finite face with a hole. */
	holes: Tri;
	/** Allowed finite-tile areas. Empty = unrestricted. Only consulted when `finite` is "require". */
	sizes: number[];
	/** "all" = every finite tile is one of `sizes`; "any" = at least one is. */
	sizeMode: SizeMode;
	/**
	 * Per regular polygon (3, 4, 6, 12): require = the pattern has at least one such tile; exclude =
	 * it has none. A tile counts here whether it is edge-to-edge or a dilation (side > 1). The octagon
	 * is absent by design — 135° has no triangle/square dissection.
	 */
	polygons: Record<RegularKind, Tri>;
	/**
	 * "any" ignores whether the WHOLE pattern is a tiling by regular polygons; "unit" keeps only the
	 * edge-to-edge ones (the classical k-uniform tilings); "regular" also admits dilations (side > 1).
	 */
	regularity: "any" | "regular" | "unit";
}

const anyPolygons = (): Record<RegularKind, Tri> =>
	Object.fromEntries(REGULAR_KINDS.map((n) => [n, "any"])) as Record<RegularKind, Tri>;

export const DEFAULT_FILTER: FreedrawFilter = {
	grid: "square",
	k: 0,
	unbounded: "any",
	strip: "any",
	finite: "any",
	holes: "any",
	sizes: [],
	sizeMode: "all",
	polygons: anyPolygons(),
	regularity: "any",
};

/**
 * The size chips only mean anything against a set of finite tiles, and "no finite tiles at all, OR
 * every finite tile a tetromino" is a question nobody asked. So the sub-filter is live exactly when
 * the finite class is required — the UI greys it out otherwise and `matches` ignores it.
 */
export const sizesActive = (f: FreedrawFilter) => f.finite === "require" && f.sizes.length > 0;

/** Does the filter consult the regular-polygon classification at all? Cheap gate before computing it. */
export const regularActive = (f: FreedrawFilter) =>
	f.regularity !== "any" || REGULAR_KINDS.some((n) => f.polygons[n] !== "any");

const tri = (state: Tri, present: number) =>
	state === "any" || (state === "require" ? present > 0 : present === 0);

/**
 * Does one pattern pass? Excluding all three ranks legitimately matches nothing (every pattern has at
 * least one face) — a valid selection, not a case to special-case. Pass `reg` (from classifyRegular)
 * only when the polygon axes are in use; the summary-only signature stays valid for every other
 * caller, and `regularActive(f)` says when it is needed.
 */
export function matches(s: FaceSummary, f: FreedrawFilter, reg?: RegularInfo): boolean {
	if (!tri(f.unbounded, s.unbounded)) return false;
	if (!tri(f.strip, s.strips)) return false;
	if (!tri(f.finite, s.finite)) return false;
	if (!tri(f.holes, s.withHoles)) return false;
	if (sizesActive(f)) {
		const allowed = new Set(f.sizes);
		const ok = f.sizeMode === "all"
			? s.sizes.every((n) => allowed.has(n))
			: s.sizes.some((n) => allowed.has(n));
		if (!ok) return false;
	}
	if (!regularActive(f)) return true;
	// A pattern with no RegularInfo supplied cannot satisfy any regular-polygon constraint.
	if (!reg) return false;
	if (f.regularity === "unit" && !reg.allUnit) return false;
	if (f.regularity === "regular" && !reg.allRegular) return false;
	for (const n of REGULAR_KINDS) {
		const state = f.polygons[n];
		if (state === "any") continue;
		const has = reg.kinds.has(n);
		if (state === "require" ? !has : has) return false;
	}
	return true;
}

/**
 * The sizes to offer as chips: exactly those present in the given slice of the catalogue, ascending.
 * Callers pass the grid + k slice ONLY, never the rank/size-filtered rows — otherwise picking a size
 * would reshuffle the chip row under the cursor. The sizes are sparse and grid-dependent (square k=4
 * has 2..8 then 12..14; the triangle grid reaches 24), so a hardcoded range would hide real answers.
 */
export function sizeOptions(summaries: readonly FaceSummary[]): number[] {
	const seen = new Set<number>();
	for (const s of summaries) for (const n of s.sizes) seen.add(n);
	return [...seen].sort((a, b) => a - b);
}

// ── URL codec ─────────────────────────────────────────────────────────────────────────────────────
// Same contract as lib/services/playUrlState.ts: short stable keys, only non-defaults emitted (so an
// untouched view is a bare /freedraw), and anything unparseable falls back to the default rather than
// being injected into state. Keys are public once a link is shared — renaming one breaks it.
//
// Deliberately absent: the page number, the selected pattern, and the view controls (fill mode,
// scaffold, lattice, orbits). The link carries WHAT is shown, not how it is drawn.

const TRI_KEYS = { u: "unbounded", s: "strip", f: "finite", o: "holes" } as const;
const TRI_CODE: Record<Tri, string> = { any: "", require: "r", exclude: "x" };

const readTri = (raw: string | null): Tri =>
	raw === "r" ? "require" : raw === "x" ? "exclude" : "any";

// Exhaustive by construction: a new member of FreedrawGrid fails to compile here rather than silently
// becoming an unshareable link.
const GRIDS: Record<FreedrawGrid, true> = { square: true, triangle: true, ts: true };
const isGrid = (raw: string | null): raw is FreedrawGrid =>
	raw !== null && Object.hasOwn(GRIDS, raw);

export function parseFilter(sp: URLSearchParams): FreedrawFilter {
	const out: FreedrawFilter = { ...DEFAULT_FILTER, sizes: [] };

	const grid = sp.get("g");
	if (isGrid(grid)) out.grid = grid;

	const k = Number(sp.get("k"));
	if (Number.isInteger(k) && k > 0 && k < 100) out.k = k;

	for (const [key, field] of Object.entries(TRI_KEYS)) out[field] = readTri(sp.get(key));

	const sizes = (sp.get("sz") ?? "")
		.split(",")
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0);
	out.sizes = [...new Set(sizes)].sort((a, b) => a - b);

	if (sp.get("m") === "any") out.sizeMode = "any";

	// Polygons: "reqcodes.xcodes", each code a polygon digit. e.g. "3.4" = require a triangle, exclude
	// a square. Digits not in REGULAR_KINDS are dropped rather than trusted.
	out.polygons = anyPolygons();
	const [reqRaw = "", excRaw = ""] = (sp.get("pg") ?? "").split(".");
	const asKind = (ch: string): RegularKind | null => {
		const n = ch === "c" ? 12 : Number(ch);
		return (REGULAR_KINDS as readonly number[]).includes(n) ? (n as RegularKind) : null;
	};
	for (const ch of reqRaw) {
		const n = asKind(ch);
		if (n) out.polygons[n] = "require";
	}
	for (const ch of excRaw) {
		const n = asKind(ch);
		if (n) out.polygons[n] = "exclude";
	}

	const reg = sp.get("rg");
	if (reg === "regular" || reg === "unit") out.regularity = reg;

	return out;
}

// 12 does not fit in one digit, so the dodecagon is coded "c" in the URL (matching the regular
// palette's famchar). Every other kind is its own digit.
const kindCode = (n: RegularKind): string => (n === 12 ? "c" : String(n));

export function serializeFilter(f: FreedrawFilter): string {
	const p = new URLSearchParams();
	if (f.grid !== DEFAULT_FILTER.grid) p.set("g", f.grid);
	if (f.k) p.set("k", String(f.k));
	for (const [key, field] of Object.entries(TRI_KEYS)) {
		const code = TRI_CODE[f[field]];
		if (code) p.set(key, code);
	}
	if (f.sizes.length) p.set("sz", [...f.sizes].sort((a, b) => a - b).join(","));
	if (f.sizeMode !== DEFAULT_FILTER.sizeMode) p.set("m", f.sizeMode);

	const req = REGULAR_KINDS.filter((n) => f.polygons[n] === "require").map(kindCode).join("");
	const exc = REGULAR_KINDS.filter((n) => f.polygons[n] === "exclude").map(kindCode).join("");
	if (req || exc) p.set("pg", exc ? `${req}.${exc}` : req);
	if (f.regularity !== DEFAULT_FILTER.regularity) p.set("rg", f.regularity);
	return p.toString();
}
