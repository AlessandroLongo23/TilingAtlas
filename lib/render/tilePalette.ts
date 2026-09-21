// The tile palette: the one place the atlas decides what a tile fill looks like.
//
// Every filled tile in every geometry is ONE hue at ONE saturation and value — HSB(h, sat, TILE_VAL).
// Hue carries the polygon (polygonHue / starHue / an identity hue); saturation and value belong to the
// MEDIUM. That is why a hexagon is the same colour on the play canvas, in a catalogue thumbnail, on a
// polyhedron, in the Poincaré disk and in an SVG export. Both channels had been spelled out by hand at
// about fifty call sites across p5, three.js, canvas2d, SVG and nine GLSL programs, which is how
// lib/render/sphPoly.ts came to sit at 0.50/0.98 while every other shelf was at 0.40/1.00.
//
// Saturation is now the /play sidebar's Fill slider (`fillAmount`, 0–1), which replaced the old
// Polygon-fill checkbox: 0 is that checkbox's off state — no fill at all, outline only — and every value
// above it maps onto a real saturation through `fillAmountToSatPct`. TILE_SAT_PCT is where the slider
// sits untouched, and the value every surface the slider does not reach (figures, the spherical shelves,
// orbit dots) keeps using.
//
// Read what the number actually does before changing it. With V pinned at 1.0 the fill is ALREADY fully
// saturated in HSL terms — HSB(h, s, 1.0) ≡ HSL(h, 100%, 100·(1 − s/2)%) for every s — so saturation
// moves lightness and nothing else. Raising it deepens the colour by darkening it, and the limit is
// wherever the fill stops separating from the near-black tile stroke and INK_FILL
// (lib/utils/renderTiling.ts). 40, 55 and 65 were compared on /play at the same tiling on 2026-09-21:
// all three keep the stroke legible, and 65 is where yellow starts reading as amber.
//
// Caveat this parameterisation cannot fix: at a fixed HSB S/V, perceived colourfulness still varies a
// lot with hue (yellow reads far lighter than blue). Evening that out means a perceptual space, OKLCH,
// and a different ramp for polygonHue — a separate job, not a tweak to this constant.

// THE SLIDER'S NUMBERS ARE THE CANONICAL ONES, and the palette's saturation is derived from them, so the
// default can only ever be one value: what the surfaces the slider does not reach paint IS where the
// slider sits untouched, by construction, not by two constants being kept in step by hand.
//
// Keep the arithmetic in this direction too. An earlier draft had the 0–1 form as the constant and the
// percent form as `TILE_SAT * 100`, which put 55.00000000000001 into p5 fill() calls and CSS strings.
// This way the DEFAULT is exact (0.8 · 60 = 48), which is what matters, because it is the number the
// rest of the atlas is compared against. A dragged slider position still carries ordinary float noise
// (0.03 · 60 = 1.7999999999999998) and that is harmless: p5 normalises its own arguments, and every CSS
// colour this module builds goes through toFixed(1).
//
// The dial is a 0–1 AMOUNT, not a percentage, and 1 is FILL_MAX_SAT_PCT — 60, not 100. Two reasons the
// top of it is not a fully saturated tile: past about 60 the fill stops separating from the near-black
// tile stroke and from INK_FILL, and it closes on the tileLine pair (below) that the figure cards draw
// beside a fill at HSL lightness 45. Capping the dial means every position on it is a usable tiling, so
// there is no wrong end to drag to.
export const FILL_AMOUNT_MIN = 0;
export const FILL_AMOUNT_MAX = 1;
export const FILL_AMOUNT_STEP = 0.01;
export const FILL_MAX_SAT_PCT = 60;

/** Where the slider sits untouched (AL, 2026-09-21) — and so the whole atlas's default saturation. */
export const DEFAULT_FILL_AMOUNT = 0.8;

/** The palette default: HSB saturation 48, HSL lightness 76. Derived, so it cannot disagree with the
 *  slider's resting position. */
export const TILE_SAT_PCT = DEFAULT_FILL_AMOUNT * FILL_MAX_SAT_PCT;
export const TILE_VAL_PCT = 100;

/** The same pair on the 0–1 scale the GLSL and three.js paths take. */
export const TILE_SAT = TILE_SAT_PCT / 100;
export const TILE_VAL = TILE_VAL_PCT / 100;

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

/** HSB (0–360, 0–100, 0–100) → HSL, same units. The conversion is exact, not an approximation. */
export function hsbToHsl(h: number, s: number, b: number): { h: number; s: number; l: number } {
	const sf = s / 100;
	const bf = b / 100;
	const l = bf * (1 - sf / 2);
	const sl = l === 0 || l === 1 ? 0 : (bf - l) / Math.min(l, 1 - l);
	return { h, s: sl * 100, l: l * 100 };
}

/** HSB (0–360, 0–100, 0–100) + alpha → a CSS `hsla()` string. */
export function hsbToHsla(h: number, s: number, b: number, a: number): string {
	const hsl = hsbToHsl(h, s, b);
	return `hsla(${h.toFixed(1)}, ${hsl.s.toFixed(1)}%, ${hsl.l.toFixed(1)}%, ${a})`;
}

/**
 * THE tile fill as a CSS colour: `hue` at the palette's saturation. Anything that paints a tile, a
 * region fill, a legend swatch or a hue-ring segment goes through this, so none of them can drift.
 *
 * `satPct` is for the surfaces the /play Fill slider reaches; everything else takes the default. It is
 * a saturation, never the slider's 0: a caller that can be at 0 must skip the fill entirely instead of
 * painting `tileFill(h, a, 0)`, which is white.
 */
export function tileFill(hueDeg: number, alpha: number = 1, satPct: number = TILE_SAT_PCT): string {
	return hsbToHsla(wrap360(hueDeg), satPct, TILE_VAL_PCT, alpha);
}

/**
 * The palette expressed in HSL, for the two aperiodic shaders that take saturation and lightness as
 * uniforms instead of building a colour string (lib/render/subrosaGL.ts `sat`/`light`). Derived, never
 * typed out: at the default saturation this is 100% / 76%, and it tracks the constant if that moves.
 * These two boards are not under the Fill slider, so the default is the only value they need.
 */
const tileHsl = hsbToHsl(0, TILE_SAT_PCT, TILE_VAL_PCT);
export const TILE_HSL_SAT_01 = tileHsl.s / 100;
export const TILE_HSL_LIGHT_PCT = tileHsl.l;

/**
 * The tile's own hue as a LINE beside its fill: the same hue taken darker and a bit more saturated, so
 * an outline separates from the fill it borders instead of vibrating against it. The figure cards on
 * /theory and the pipeline diagrams all draw this pair, and it had been spelled out as a bare
 * `hsbToHsla(h, 55, 62, 1)` at eleven of them.
 *
 * It does NOT move with the fill, which is the thing to watch: the fill sits at HSL lightness
 * 100 − 50·sat and this sits at 45, so the gap is 31 points at the default and 25 at the slider's top.
 * Deepening the fill closes the gap from one side only, and the two would meet around saturation 110 —
 * which is one of the reasons FILL_MAX_SAT_PCT stops at 60. These cards are not under the Fill slider,
 * so only the default matters here.
 */
export const TILE_LINE_SAT_PCT = 55;
export const TILE_LINE_VAL_PCT = 62;

export function tileLine(hueDeg: number, alpha: number = 1): string {
	return hsbToHsla(wrap360(hueDeg), TILE_LINE_SAT_PCT, TILE_LINE_VAL_PCT, alpha);
}

/** HSB with hue in DEGREES, s and v in 0–1 → RGB, each channel 0–1. */
export function hsbDegToRgb01(hueDeg: number, s: number, v: number): [number, number, number] {
	const h = wrap360(hueDeg) / 360;
	const k = (o: number) => {
		const x = (((h * 6 + o) % 6) + 6) % 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	const m = (kk: number) => v * (1 - s) + v * s * kk;
	return [m(k(0)), m(k(4)), m(k(2))];
}

/** The tile fill as RGB (each channel 0–1) — the `tileFill` colour for a WebGL/three.js uniform. */
export function tileHueRgb01(hueDeg: number, satPct: number = TILE_SAT_PCT): [number, number, number] {
	return hsbDegToRgb01(hueDeg, satPct / 100, TILE_VAL);
}

/** A GLSL float literal that always carries a decimal point (`1` is an int in GLSL and will not compile). */
const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const TILE_SAT_GLSL = glslFloat(TILE_SAT);
export const TILE_VAL_GLSL = glslFloat(TILE_VAL);

/**
 * The palette as a GLSL chunk: paste it into a shader and call `tileFill(hueDegrees)`, or
 * `tileFillAt(hueDegrees, sat)` where the /play Fill slider reaches the program.
 *
 * Interpolate it into the shader source (`${TILE_PALETTE_GLSL}`) instead of copying `hsb2rgb` again —
 * eight programs had their own identical copy, each with the S/V pair written out beside it. Declares
 * the bare names `hsb2rgb`, `tileFill` and `tileFillAt`, so a shader INJECTED INTO A THREE.JS MATERIAL
 * must use the prefixed form and the `TILE_*_GLSL` literals instead (lib/render/sphericalTilingShader.ts).
 *
 * The slider arrives as a uniform the PROGRAM declares and sets, never as one declared here: a uniform
 * in this chunk would silently read 0 — a white fill — in any of the nine programs that forgot to set
 * it, and `tileFill`'s default keeps that failure impossible for the programs the slider never reaches.
 */
export const TILE_PALETTE_GLSL = /* glsl */ `
const float TILE_SAT = ${TILE_SAT_GLSL};
const float TILE_VAL = ${TILE_VAL_GLSL};
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}
// The tile fill at a hue in DEGREES (wraps, so a hue-ring offset can be added raw), at a given
// saturation in 0..1 — the Fill slider's value for the boards it drives.
vec3 tileFillAt(float hueDeg, float sat) {
	return hsb2rgb(mod(hueDeg, 360.0) / 360.0, sat, TILE_VAL);
}
// The same at the palette's default saturation, for the marks and boards the slider does not touch.
vec3 tileFill(float hueDeg) { return tileFillAt(hueDeg, TILE_SAT); }`;
