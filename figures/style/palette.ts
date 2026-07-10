/**
 * Single source of truth for figure styling. Both emitters resolve every element's `styleRef`
 * through `resolveStyle`, and all colors live in the named `COLORS` table — TikZ gets them as
 * \definecolor lines (`emitTexColors`), SVG as hex — so the backends cannot drift.
 *
 * Palette: Okabe–Ito (colorblind-safe). Tile fills are white-mixed tints (no PDF transparency —
 * print-safe); markers/overlays use full-strength colors. Light background, thin dark edges —
 * Grünbaum–Shephard-style line art.
 *
 * Coloring strategies (per figure, chosen by what it must communicate):
 *  - byOrbit : near-neutral tiles + vertex markers colored by ORBIT class — k-uniformity IS
 *              vertex-orbit counting, so this is the thesis's native view.
 *  - byNGon  : tile fills by polygon type (the familiar gallery/Wikipedia view).
 *  - lineArt : no fills (maximum print safety).
 */

import { polygonHue } from '@/lib/utils/renderTiling';

export type ColorStrategy = 'byOrbit' | 'byNGon' | 'lineArt';

// Okabe–Ito (markers/overlays — colorblind-safe, full strength).
const OI = {
	orange: 'E69F00',
	skyBlue: '56B4E9',
	green: '009E73',
	yellow: 'F0E442',
	blue: '0072B2',
	vermillion: 'D55E00',
	purple: 'CC79A7',
	black: '000000',
} as const;

/** HSB → hex, matching the app's hsbToHsla (lib/utils/renderTiling.ts) color model. */
function hsbToHex(h: number, s: number, b: number): string {
	const S = s / 100;
	const V = b / 100;
	const C = V * S;
	const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = V - C;
	const [r, g, bl] =
		h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
	return [r, g, bl]
		.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase())
		.join('');
}

/** Tile fill for an n-gon = the APP's hue (polygonHue, S=40 B=100) — web↔thesis consistency. */
const TILE_NS = [3, 4, 6, 8, 12] as const;
const appTileHex = (n: number): string => hsbToHex(polygonHue(n), 40, 100);

/** Named colors (hex without '#'). TikZ names == these keys (see emitTexColors). */
export const COLORS: Record<string, string> = {
	figBg: 'FFFFFF',
	figEdge: '2B2B2B',
	figFaint: '9A9A9A',
	tileNeutral: 'F4F4F2',
	// full-strength Okabe–Ito (markers, overlays, basis vectors)
	oiOrange: OI.orange,
	oiSkyBlue: OI.skyBlue,
	oiGreen: OI.green,
	oiYellow: OI.yellow,
	oiBlue: OI.blue,
	oiVermillion: OI.vermillion,
	oiPurple: OI.purple,
	// tile fills, app-consistent (tileN3 = triangles, … tileN12 = 12-gons)
	...Object.fromEntries(TILE_NS.map((n) => [`tileN${n}`, appTileHex(n)])),
};

/** Orbit id → full-strength marker color (first three maximally distinct; k≤6 covered, then cycles). */
const ORBIT_COLORS = ['oiBlue', 'oiVermillion', 'oiGreen', 'oiPurple', 'oiOrange', 'oiSkyBlue', 'oiYellow'];

/** Polygon n → tile fill (app hues; extend TILE_NS when star/other families land). */
const NGON_FILL: Record<number, string> = Object.fromEntries(TILE_NS.map((n) => [n, `tileN${n}`]));

// Physical conventions (mm).
export const LINE_W = { edge: 0.25, hairline: 0.12, overlay: 0.4 } as const;
export const MARKER_R_MM = 0.9;

export type ResolvedStyle = {
	fill?: string; // key into COLORS
	stroke?: string; // key into COLORS
	lineWidthMm?: number;
	radiusMm?: number; // markers
	text?: string; // text color, key into COLORS
	/** 0..100: percent of the color kept, remainder mixed toward figBg (white). Fade = mixing,
	 *  NOT opacity — identical on the white page, but print-safe (no PDF transparency). */
	strength?: number;
	/** Like `strength` but FILL ONLY (stroke stays full) — fill→white at 0 IS the wireframe. */
	fillStrength?: number;
};

/** Mix a COLORS hex toward white, keeping `pct`% — the SVG-side twin of TikZ's `name!pct!figBg`. */
export function mixHexToWhite(hex: string, pct: number): string {
	const c = (i: number) => parseInt(hex.slice(i, i + 2), 16);
	const m = (v: number) => Math.round((v * pct + 255 * (100 - pct)) / 100);
	return [c(0), c(2), c(4)]
		.map((v) => m(v).toString(16).padStart(2, '0').toUpperCase())
		.join('');
}

/**
 * Resolve a styleRef. Unknown refs THROW — a typo must never render as a default.
 * Fade suffixes: `@<pct>` fades fill+stroke; `@f<pct>` fades the FILL ONLY (stroke stays full,
 * so `@f0` is the wireframe limit of a filled tile).
 */
export function resolveStyle(fullRef: string): ResolvedStyle {
	const at = fullRef.lastIndexOf('@');
	const ref = at >= 0 ? fullRef.slice(0, at) : fullRef;
	const st = resolveBase(ref);
	if (at < 0) return st;
	const suffix = fullRef.slice(at + 1);
	const fillOnly = suffix.startsWith('f');
	const pct = Number(fillOnly ? suffix.slice(1) : suffix);
	if (!(Number.isFinite(pct) && pct >= 0 && pct <= 100)) {
		throw new Error(`palette: bad fade strength in '${fullRef}'`);
	}
	if (pct >= 100) return st;
	return fillOnly ? { ...st, fillStrength: pct } : { ...st, strength: pct };
}

function resolveBase(ref: string): ResolvedStyle {
	if (ref === 'tile:flat') return { fill: 'tileNeutral', stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	if (ref === 'tile:none') return { fill: 'figBg', stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	if (ref.startsWith('tile:n:')) {
		const n = Number(ref.slice('tile:n:'.length));
		const fill = NGON_FILL[n];
		if (!fill) throw new Error(`palette: no tile fill for n=${n} (ref ${ref})`);
		return { fill, stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	}
	if (ref.startsWith('orbit:')) {
		const i = Number(ref.slice('orbit:'.length));
		if (!Number.isInteger(i) || i < 0) throw new Error(`palette: bad orbit ref ${ref}`);
		return { fill: ORBIT_COLORS[i % ORBIT_COLORS.length], radiusMm: MARKER_R_MM };
	}
	if (ref === 'edge') return { stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	if (ref === 'hairline') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'basis') return { stroke: 'oiBlue', lineWidthMm: LINE_W.overlay };
	if (ref === 'lattice') return { fill: 'oiBlue', radiusMm: 0.7 };
	if (ref === 'label') return { text: 'figEdge' };
	if (ref === 'label:basis') return { text: 'oiBlue' };
	// Trace-walkthrough figures (Plan B): node boxes, tree edges, verdict-colored branch stubs, vectors.
	if (ref === 'tree:box') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'tree:edge') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'tree:pathedge') return { stroke: 'figEdge', lineWidthMm: LINE_W.edge };
	if (ref === 'tree:prune') return { stroke: 'oiVermillion', lineWidthMm: LINE_W.edge };
	if (ref === 'tree:success') return { stroke: 'oiGreen', lineWidthMm: LINE_W.edge };
	if (ref === 'vec:pool') return { stroke: 'figFaint', lineWidthMm: LINE_W.hairline };
	if (ref === 'vec:winner') return { stroke: 'oiVermillion', lineWidthMm: LINE_W.overlay };
	throw new Error(`palette: unknown styleRef '${ref}'`);
}

export function hexOf(colorName: string): string {
	const hex = COLORS[colorName];
	if (!hex) throw new Error(`palette: unknown color '${colorName}'`);
	return '#' + hex;
}

/** \definecolor lines for ALL named colors — inlined in generated .tex, input by hand figures. */
export function emitTexColors(): string {
	return Object.entries(COLORS)
		.map(([name, hex]) => `\\definecolor{${name}}{HTML}{${hex}}`)
		.join('\n');
}

/** Tile fill styleRef for a placed polygon under a strategy. */
export function tileStyleRef(strategy: ColorStrategy, n: number): string {
	if (strategy === 'byNGon') return `tile:n:${n}`;
	if (strategy === 'byOrbit') return 'tile:flat';
	return 'tile:none';
}
