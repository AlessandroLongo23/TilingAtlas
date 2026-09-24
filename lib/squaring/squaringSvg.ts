// A squaring as inline SVG, on the model of lib/render/tilingSvg.ts: no canvas, no effect to wait on,
// so the figure exists in the server-rendered HTML of the /theory article and paints with the first
// byte. The /theory route is force-static, so every one of these is drawn once at build time.
//
// This is the ONLY place exact sides become floating point, and it happens after the layout is fixed:
// coordinates are divided by the rectangle's width, which is a ratio in [0,1] whatever the numerator
// was. That matters because the sides in this corpus reach twenty-seven digits — arithmetic on them as
// doubles would decide two distinct tiles were the same size — but a tile's POSITION on a 1000-unit
// canvas only ever needs three or four significant figures.
//
// Colour runs a hue ramp by rank of size, smallest to largest, through the atlas's own hsbToHsla. In a
// perfect squaring every tile therefore gets its own hue and the picture reads as a gradient; in an
// imperfect one, equal tiles share a colour and the repeats are visible at a glance. That is the
// distinction the whole subject turns on, so it should be the thing the eye sees first.

import { hsbToHsla, TILE_FILL_ALPHA } from "@/lib/utils/renderTiling";
import type { SquaringRecord } from "./shelf";

export interface SquaringSvgRect {
	x: number;
	y: number;
	size: number;
	fill: string;
	/** The exact side, as the decimal string it was computed as — for labels and titles. */
	label: string;
}

export interface SquaringSvg {
	viewBox: string;
	/** Canvas width in viewBox units; height follows the rectangle's true aspect. */
	width: number;
	height: number;
	rects: SquaringSvgRect[];
}

const num = (v: number) => {
	const s = v.toFixed(2).replace(/\.?0+$/, "");
	return s === "-0" || s === "" ? "0" : s;
};

/**
 * One fill per tile, parallel to `record.squares`, ranked by size smallest to largest.
 *
 * Exported because the Smith diagram paints each wire in its own square's colour, and colour is what
 * carries the correspondence between the two stages: a reader matches the green wedge to the green
 * tile without being told to. If the two stages computed their palettes separately they would drift
 * apart the moment either ramp changed, so there is one ramp and both read it.
 */
export function squareFills(record: SquaringRecord, hueSpan = 300): string[] {
	const sizes = [...new Set(record.squares.map((s) => s.side))].sort((a, b) => {
		const x = BigInt(a);
		const y = BigInt(b);
		return x < y ? -1 : x > y ? 1 : 0;
	});
	const rank = new Map(sizes.map((s, i) => [s, i]));
	const span = Math.max(sizes.length - 1, 1);
	return record.squares.map((s) =>
		hsbToHsla(((rank.get(s.side) as number) / span) * hueSpan, 38, 100, TILE_FILL_ALPHA),
	);
}

/**
 * @param record the squaring to draw
 * @param canvas the viewBox width; the height follows from the rectangle's aspect ratio
 * @param hueSpan how far around the colour wheel the size ramp travels, in degrees
 */
export function squaringToSvg(record: SquaringRecord, canvas = 1000, hueSpan = 300): SquaringSvg {
	const width = BigInt(record.width);
	const height = BigInt(record.height);
	if (width <= 0n || height <= 0n) {
		return { viewBox: `0 0 ${canvas} ${canvas}`, width: canvas, height: canvas, rects: [] };
	}

	// One shared scale for both axes, so squares stay square. Ratios are taken in BigInt and only then
	// divided, which keeps full precision through the division that follows.
	const PRECISION = 1_000_000n;
	const ratio = (v: bigint) => Number((v * PRECISION) / width) / Number(PRECISION);
	const canvasHeight = ratio(height) * canvas;

	// Rank distinct sizes ascending; equal sizes necessarily land on the same hue.
	const fills = squareFills(record, hueSpan);

	const rects = record.squares.map((s, i) => {
		const x = ratio(BigInt(s.x)) * canvas;
		const size = ratio(BigInt(s.side)) * canvas;
		// SVG's y axis points down; the squaring's origin is its bottom-left corner.
		const y = canvasHeight - ratio(BigInt(s.y)) * canvas - size;
		return {
			x: Number(num(x)),
			y: Number(num(y)),
			size: Number(num(size)),
			fill: fills[i],
			label: s.side,
		};
	});

	return {
		viewBox: `0 0 ${num(canvas)} ${num(canvasHeight)}`,
		width: canvas,
		height: canvasHeight,
		rects,
	};
}

/**
 * Should a tile carry its side length as text? Only when the tile is big enough for the digits to fit,
 * which for the twenty-seven-digit cases means almost never — those are drawn as pure colour, and the
 * numbers live in the Bouwkamp code underneath instead.
 */
export function labelFits(rect: SquaringSvgRect, fontSize: number): boolean {
	// ~0.6em per digit in a typical sans, plus a little padding.
	return rect.size > rect.label.length * fontSize * 0.62 + fontSize * 0.6;
}
