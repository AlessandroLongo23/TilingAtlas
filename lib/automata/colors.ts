"use client";

// The automata canvas palette, read from CSS custom properties so both views follow the theme and the
// design tokens stay the single source of truth.
//
// The tokens are plain space-separated RGB triples in 0–1 rather than the oklch() the rest of the system
// uses, because these values go straight into a WebGL uniform and a three.js buffer — neither can parse a
// CSS colour function. See app/styles/tokens/themed.css.

export type Rgb = [number, number, number];

export interface AutomataPalette {
	live: Rgb;
	dead: Rgb;
	decay: Rgb;
	/** Overlay guides — the lattice dashes. */
	guide: Rgb;
}

const FALLBACK: AutomataPalette = {
	live: [0.07, 0.07, 0.09],
	dead: [0.97, 0.97, 0.97],
	decay: [0.62, 0.62, 0.66],
	guide: [0.45, 0.45, 0.5],
};

function readRgb(name: string, fallback: Rgb): Rgb {
	if (typeof window === "undefined") return fallback;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const parts = raw.split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
	if (parts.length < 3) return fallback;
	const [r, g, b] = parts;
	// Accept both 0–1 and 0–255 authoring.
	return r <= 1.001 && g <= 1.001 && b <= 1.001 ? [r, g, b] : [r / 255, g / 255, b / 255];
}

export function automataPalette(): AutomataPalette {
	return {
		live: readRgb("--automata-live", FALLBACK.live),
		dead: readRgb("--automata-dead", FALLBACK.dead),
		decay: readRgb("--automata-decay", FALLBACK.decay),
		guide: readRgb("--automata-guide", FALLBACK.guide),
	};
}

/** The colour a cell in `state` should take, given the rule's total state count. */
export function stateColor(state: number, states: number, p: AutomataPalette): Rgb {
	if (state <= 0) return p.dead;
	if (state === 1) return p.live;
	const t = Math.min(1, (state - 1) / Math.max(1, states - 2));
	return [
		p.live[0] + (p.decay[0] - p.live[0]) * t,
		p.live[1] + (p.decay[1] - p.live[1]) * t,
		p.live[2] + (p.decay[2] - p.live[2]) * t,
	];
}

/** An Rgb triple as a CSS colour, for the 2D overlay context. */
export function cssOf(c: Rgb, alpha = 1): string {
	const b = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
	return `rgba(${b(c[0])}, ${b(c[1])}, ${b(c[2])}, ${alpha})`;
}

/** HSB → RGB, matching the tiling fill shader so the dead-cell tint agrees with the flat renderer. */
export function hsbToRgb(h: number, s: number, b: number): Rgb {
	const k = (n: number) => (n + h / 60) % 6;
	const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
	return [f(5), f(3), f(1)];
}
