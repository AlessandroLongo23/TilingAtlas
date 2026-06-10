/**
 * Declarative figure manifest. Gallery entries are GENERATED from the snapshot + oracle map (92
 * hand-written subfloats would rot); hand-authored TikZ in tex/hand/ is picked up by the build
 * directly. Per-tiling tweaks go in OVERRIDES — never edit generated .tex.
 */
import type { ColorStrategy } from './style/palette';
import type { FigureSnapshot } from './snapshot';
import type { OrbitCache } from './tiling/orbits';

export type OracleMap = {
	matched: Record<string, string>; // canonicalKey → tCode
	unmatchedOurs: string[];
	unmatchedOracle: string[];
};

export type TilingFigureEntry = {
	id: string; // file stem, e.g. "t2013"
	canonicalKey: string;
	k: number;
	tCode: string | null;
	vcLabel: string; // "3.4.6.4; 3.3.4.3.4" (expanded dot notation, per-orbit — contact sheet/grep)
	vcLabelTex: string; // "$3.4.6.4$; $3^{2}.4.3.4$" (compact literature notation, math mode — thesis)
	strategy: ColorStrategy;
	windowMm: number;
	edgeMm: number;
};

/** Per-tiling overrides keyed by t-code (or canonicalKey for unmatched), applied last. */
export const OVERRIDES: Record<string, Partial<Pick<TilingFigureEntry, 'strategy' | 'windowMm' | 'edgeMm'>>> = {};

export const GALLERY_WINDOW_MM = 34;
export const GALLERY_EDGE_MM = 3.8;

const dotNotation = (vc: string): string => vc.split(',').join('.');

/**
 * Compact literature notation (Grünbaum–Shephard / Galebach / Wikipedia): exponents compress
 * ADJACENT runs in the canonical cyclic order ONLY — never sort first ("3,3,4,3,4" → 3².4.3.4,
 * which is a different vertex type from 3³.4²) and no parenthesized grouping (3.6.3.6 stays).
 * Math-mode LaTeX; the expanded comma form remains the identifier in all data artifacts.
 */
export const compactVcTex = (vc: string): string => {
	const ns = vc.split(',');
	const parts: string[] = [];
	for (let i = 0; i < ns.length; ) {
		let j = i;
		while (j < ns.length && ns[j] === ns[i]) j++;
		parts.push(j - i > 1 ? `${ns[i]}^{${j - i}}` : ns[i]);
		i = j;
	}
	return `$${parts.join('.')}$`;
};

export function galleryEntries(
	snap: FigureSnapshot,
	orbits: OrbitCache,
	oracleMap: OracleMap
): TilingFigureEntry[] {
	const entries = snap.tilings.map((t, i) => {
		const tCode = oracleMap.matched[t.canonicalKey] ?? null;
		const id = tCode ?? `nomatch-k${t.k}-${i}`;
		const entry: TilingFigureEntry = {
			id,
			canonicalKey: t.canonicalKey,
			k: t.k,
			tCode,
			vcLabel: orbits[t.canonicalKey].vcOfOrbit.map(dotNotation).join('; '),
			vcLabelTex: orbits[t.canonicalKey].vcOfOrbit.map(compactVcTex).join('; '),
			strategy: 'byNGon',
			windowMm: GALLERY_WINDOW_MM,
			edgeMm: GALLERY_EDGE_MM,
		};
		return { ...entry, ...(OVERRIDES[tCode ?? t.canonicalKey] ?? {}) };
	});
	// gallery order: by k, then t-code (unmatched last)
	return entries.sort((a, b) => a.k - b.k || (a.tCode ?? '~').localeCompare(b.tCode ?? '~'));
}
