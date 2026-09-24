// The tile palette: the one place the atlas decides what a tile fill looks like.
//
// Every filled tile in every geometry is ONE hue at ONE fill amount. Hue carries the polygon (polygonHue
// / starHue / an identity hue); the amount belongs to the MEDIUM. That is why a hexagon is the same colour
// on the play canvas, in a catalogue thumbnail, on a polyhedron, in the Poincaré disk and in an SVG
// export. Every surface goes through `tileHueRgb01` (TS) or `tileFillAt` (GLSL), and both are built from
// the constants below, so they cannot drift.
//
// The colour is OKLCH, not HSB (2026-09-24). HSB at a fixed S/V gives every hue the same NUMBERS but not
// the same look: at the old S 48 / V 100 the hexagon's green glared and the 12-gon's blue sank. In OKLCH
// every hue sits at one perceived lightness and one chroma, so no polygon shouts over another. The atlas's
// hue numbers (polygonHue & co.) still mean what they did: HUE_ANCHORS maps each HSB primary onto its own
// OKLCH hue, so a triangle stays red-ish, a hexagon green-ish and a dodecagon blue-ish.
//
// The /play Fill slider (`fillAmount`, 0–1) still speaks in "saturation percent" for its callers
// (`fillAmountToSatPct`, `satPct` arguments, `uTileSat`): 0 is outline only, FILL_MAX_SAT_PCT is the
// top. `amount = satPct / FILL_MAX_SAT_PCT` then drives chroma up and lightness down together.

export const FILL_AMOUNT_MIN = 0;
export const FILL_AMOUNT_MAX = 1;
export const FILL_AMOUNT_STEP = 0.01;
export const FILL_MAX_SAT_PCT = 60;

/** Where the slider sits untouched (AL, 2026-09-21) — and so the whole atlas's default saturation. */
export const DEFAULT_FILL_AMOUNT = 0.8;

/** The palette default, in the slider's percent units (0.8 · 60 = 48). Derived, so it cannot disagree
 *  with the slider's resting position. */
export const TILE_SAT_PCT = DEFAULT_FILL_AMOUNT * FILL_MAX_SAT_PCT;
/** The same on the 0–1 scale the GLSL and three.js paths take. */
export const TILE_SAT = TILE_SAT_PCT / 100;

/**
 * Slider amount → the saturation to paint with. 0 is the slider's OFF, and this maps it to 0, which is a
 * WHITE fill: every caller gates on `amount > 0` and skips the fill entirely there, exactly as the
 * Polygon-fill checkbox this replaced did.
 */
export function fillAmountToSatPct(amount: number): number {
	return Math.max(0, Math.min(1, amount)) * FILL_MAX_SAT_PCT;
}

/** Wrap any angle in degrees onto [0, 360). */
const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

// The OKLCH ramp. At amount a (0–1): lightness L_TOP − L_DROP·a, chroma C_TOP·a. The default (a = 0.8) is
// L 0.845 / C 0.088, a light, evenly lit pastel that keeps a near-black stroke legible; the slider's top
// is L 0.815 / C 0.11. A few blues at the top of the dial fall just outside sRGB and are clipped per
// channel, which shifts them by a degree or two of hue and nothing worse.
const L_TOP = 0.965;
const L_DROP = 0.15;
const C_TOP = 0.11;
/** The outline beside a fill (`tileLine`): the same hue, dark enough to read as a line. */
const LINE_L = 0.52;
const LINE_C = 0.12;
/** OKLCH hue of each HSB primary (red, yellow, green, cyan, blue, magenta, red again), 60° apart. */
const HUE_ANCHORS = [29.2, 109.8, 142.5, 194.8, 264.1, 328.4, 389.2];

/** Atlas hue (HSB degrees) → OKLCH hue in degrees, piecewise linear between the primaries. */
function oklchHue(hueDeg: number): number {
	const h = wrap360(hueDeg) / 60;
	const i = Math.floor(h);
	return HUE_ANCHORS[i] + (h - i) * (HUE_ANCHORS[i + 1] - HUE_ANCHORS[i]);
}

/** OKLCH → display sRGB, each channel clipped to 0–1 (Björn Ottosson's matrices, 2020). */
function oklchToRgb01(L: number, C: number, hDeg: number): [number, number, number] {
	const a = C * Math.cos((hDeg * Math.PI) / 180);
	const b = C * Math.sin((hDeg * Math.PI) / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const enc = (x: number) => {
		const c = Math.max(0, Math.min(1, x));
		return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
	};
	return [
		enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}

/** The tile fill as RGB (each channel 0–1), for a WebGL/three.js uniform or a vertex colour. */
export function tileHueRgb01(hueDeg: number, satPct: number = TILE_SAT_PCT): [number, number, number] {
	const amt = Math.max(0, Math.min(1, satPct / FILL_MAX_SAT_PCT));
	return oklchToRgb01(L_TOP - L_DROP * amt, C_TOP * amt, oklchHue(hueDeg));
}

const rgba = ([r, g, b]: [number, number, number], alpha: number): string =>
	`rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;

/**
 * THE tile fill as a CSS colour: `hue` at the palette's fill amount. Anything that paints a tile, a
 * region fill, a legend swatch or a hue-ring segment goes through this, so none of them can drift.
 *
 * `satPct` is for the surfaces the /play Fill slider reaches; everything else takes the default. A caller
 * that can be at the slider's 0 must skip the fill entirely instead of painting `tileFill(h, a, 0)`,
 * which is near-white.
 */
export function tileFill(hueDeg: number, alpha: number = 1, satPct: number = TILE_SAT_PCT): string {
	// Memoised: the p5 paths call this once per tile per frame, and a canvas holds few distinct hues.
	const key = `${hueDeg.toFixed(2)}|${alpha}|${satPct}`;
	let css = fillCache.get(key);
	if (css === undefined) {
		if (fillCache.size > 4096) fillCache.clear();
		fillCache.set(key, (css = rgba(tileHueRgb01(hueDeg, satPct), alpha)));
	}
	return css;
}
const fillCache = new Map<string, string>();

/**
 * The tile's own hue as a LINE beside its fill, for the figure cards on /theory and the pipeline
 * diagrams: same hue, much darker, a little more chroma, so an outline separates from its fill instead
 * of vibrating against it. Not under the Fill slider.
 */
export function tileLine(hueDeg: number, alpha: number = 1): string {
	return rgba(oklchToRgb01(LINE_L, LINE_C, oklchHue(hueDeg)), alpha);
}

/**
 * The default fill in HSL terms, for the aperiodic patch views, whose shader takes one saturation and
 * one lightness as uniforms and builds hsl(h, s, l) itself (lib/render/subrosaGL.ts `sat`/`light`).
 * HSL cannot hold an even OKLCH ramp, so this is the triangle's fill read back as HSL: the right
 * lightness and roughly the right strength, applied to every hue.
 */
const [hr, hg, hb] = tileHueRgb01(0);
const hMax = Math.max(hr, hg, hb);
const hMin = Math.min(hr, hg, hb);
export const TILE_HSL_LIGHT_PCT = ((hMax + hMin) / 2) * 100;
export const TILE_HSL_SAT_01 = (hMax - hMin) / (1 - Math.abs(hMax + hMin - 1));

/** HSB (0–360, 0–100, 0–100) + alpha → a CSS `hsla()` string. For diagram marks, NOT tile fills. */
export function hsbToHsla(h: number, s: number, b: number, a: number): string {
	const l = (b / 100) * (1 - s / 200);
	const sl = l === 0 || l === 1 ? 0 : (b / 100 - l) / Math.min(l, 1 - l);
	return `hsla(${h.toFixed(1)}, ${(sl * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`;
}

/** HSB with hue in DEGREES, s and v in 0–1 → RGB, each channel 0–1. For non-tile colours (straps). */
export function hsbDegToRgb01(hueDeg: number, s: number, v: number): [number, number, number] {
	const h = wrap360(hueDeg) / 360;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}

/** A GLSL float literal that always carries a decimal point (`1` is an int in GLSL and will not compile). */
const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/**
 * The palette as a GLSL chunk, the same arithmetic as `tileHueRgb01`: call `tileFill(hueDegrees)`, or
 * `tileFillAt(hueDegrees, sat)` where the /play Fill slider reaches the program (`sat` = satPct / 100).
 *
 * Interpolate it into the shader source (`${TILE_PALETTE_GLSL}`) instead of copying the conversion. A
 * shader INJECTED INTO A THREE.JS MATERIAL takes `tilePaletteGlsl("sph_")`, whose names are prefixed so
 * they cannot collide with three's own code (lib/render/sphericalTilingShader.ts).
 *
 * The slider arrives as a uniform the PROGRAM declares and sets, never as one declared here: a uniform
 * in this chunk would silently read 0 (a near-white fill) in any program that forgot to set it.
 */
export function tilePaletteGlsl(prefix = ""): string {
	const f = glslFloat;
	const pick = (off: number) =>
		HUE_ANCHORS.slice(off, off + 6)
			.map((v, i) => (i < 5 ? `i < ${f(i + 0.5)} ? ${f(v)} : ` : f(v)))
			.join("");
	return /* glsl */ `
vec3 ${prefix}tileFillAt(float hueDeg, float sat) {
	float h = mod(hueDeg, 360.0) / 60.0;
	float i = floor(h);
	float oh = radians(mix(${pick(0)}, ${pick(1)}, h - i));
	float amt = clamp(sat / ${f(FILL_MAX_SAT_PCT / 100)}, 0.0, 1.0);
	float L = ${f(L_TOP)} - ${f(L_DROP)} * amt;
	float C = ${f(C_TOP)} * amt;
	float A = C * cos(oh), B = C * sin(oh);
	float l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3.0);
	float m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3.0);
	float s = pow(L - 0.0894841775 * A - 1.2914855480 * B, 3.0);
	vec3 lin = clamp(vec3(
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0, 1.0);
	return mix(12.92 * lin, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}
vec3 ${prefix}tileFill(float hueDeg) { return ${prefix}tileFillAt(hueDeg, ${f(TILE_SAT)}); }`;
}

export const TILE_PALETTE_GLSL = tilePaletteGlsl();
