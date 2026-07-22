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
}

export const DEFAULT_FILTER: FreedrawFilter = {
	grid: "square",
	k: 0,
	unbounded: "any",
	strip: "any",
	finite: "any",
	holes: "any",
	sizes: [],
	sizeMode: "all",
};

/**
 * The size chips only mean anything against a set of finite tiles, and "no finite tiles at all, OR
 * every finite tile a tetromino" is a question nobody asked. So the sub-filter is live exactly when
 * the finite class is required — the UI greys it out otherwise and `matches` ignores it.
 */
export const sizesActive = (f: FreedrawFilter) => f.finite === "require" && f.sizes.length > 0;

const tri = (state: Tri, present: number) =>
	state === "any" || (state === "require" ? present > 0 : present === 0);

/**
 * Does one pattern pass? Excluding all three ranks legitimately matches nothing (every pattern has at
 * least one face) — a valid selection, not a case to special-case.
 */
export function matches(s: FaceSummary, f: FreedrawFilter): boolean {
	if (!tri(f.unbounded, s.unbounded)) return false;
	if (!tri(f.strip, s.strips)) return false;
	if (!tri(f.finite, s.finite)) return false;
	if (!tri(f.holes, s.withHoles)) return false;
	if (!sizesActive(f)) return true;
	const allowed = new Set(f.sizes);
	return f.sizeMode === "all"
		? s.sizes.every((n) => allowed.has(n))
		: s.sizes.some((n) => allowed.has(n));
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

	return out;
}

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
	return p.toString();
}
