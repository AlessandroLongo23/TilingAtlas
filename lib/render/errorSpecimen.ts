import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import {
	inversionMap,
	periodicCellToSvg,
	spiralMapForward,
	type PeriodicSvgOptions,
} from "@/lib/render/periodicSvg";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// What the error and 404 walls draw, and how a tiling becomes one.
//
// Two sources feed the wall, for one reason: the screen has to paint when everything else has failed,
// and it also has to show more than a handful of pictures.
//
//   the SEED   lib/render/errorSpecimens.ts, generated at build time by
//              scripts/build-error-specimens.ts — finished path data, inlined, no fetch. It covers the
//              decoration classes (colourings, edge patterns, hollow tilings) whose shelves are too
//              large to reach from here, and it is what the wall shows if the network is gone.
//   LIVE       /hero-index.json + /hero-cells/<id>.json, the same two files the landing hero rotator
//              lazy-loads (components/landing/hero-rotator.tsx). The index is every drawable Euclidean
//              tiling in the atlas — 4593 of them at ~3 kB a cell — so the wall can pick from the whole
//              catalogue instead of from whatever a build script happened to bake.
//
// A live pick is rendered here, in the browser, by the same code the seed was baked with
// (lib/render/periodicSvg.ts). Rendering a patch is a few milliseconds of pure arithmetic — no canvas,
// no WebGL, nothing to wait on — which is what makes it safe to do on a screen that is already the
// consequence of something breaking.

export interface ErrorSpecimenPath {
	d: string;
	fill?: string;
	fillOpacity?: number;
	fillRule?: "evenodd";
	stroke?: string;
	strokeOpacity?: number;
	strokeWidth?: number;
}

export interface ErrorSpecimen {
	id: string;
	/**
	 * Which shelf the picture came from. Only the seed sets it, and only so the wall can reserve slots
	 * for the classes the live path cannot reach: the hero index is tilings, so a wall filled purely
	 * from it would never show a colouring, an edge pattern or a hollow tiling again.
	 */
	klass?: "tiling" | "coloring" | "edges" | "hollow";
	/** Hover caption. The wall mixes several classes, so it names the decoration, not just the tiling. */
	label: string;
	href: string;
	viewBox: string;
	/** What the picture averages to — the backdrop under a lens's unreachable centre. */
	background: string;
	paths: ErrorSpecimenPath[];
}

export const HERO_INDEX_URL = "/hero-index.json";
export const heroCellUrl = (id: string) => `/hero-cells/${id}.json`;

/** One entry of /hero-cells/<id>.json. */
export interface HeroCell {
	id: string;
	/** The tiling's vertex configuration, already compacted by scripts/gen-landing-data.ts. */
	label: string;
	k: number;
	cell: TranslationalCellData;
}

/**
 * The Islamic construction is excluded by directive, and its ids are the only ones in the index that
 * carry it: the `isl-*` shelf is the historical strapwork transcription.
 */
export const isExcludedHeroId = (id: string) => id.startsWith("isl-");

/** How a live pick is shown. The two lenses are /play's own, run forwards — see periodicSvg.ts. */
export type Presentation = "plain" | "spiral" | "inversion";

/**
 * Which presentation a slot gets. Mostly plain, because a lens is a strong effect and a wall of eight
 * of them reads as a screensaver; roughly one cell in four bends.
 */
export function pickPresentation(rand: () => number): Presentation {
	const r = rand();
	if (r < 0.14) return "spiral";
	if (r < 0.28) return "inversion";
	return "plain";
}

// Roughly the aspect of one cell of a 3 × 3 wall on a desktop viewport. Only a hint: the SVG is drawn
// with preserveAspectRatio="…slice", so a mismatch crops and never gaps.
const ASPECT = 1.5;
/** Tiles across the frame, measured in `feature` — the cell's median √area per tile. */
const TILES_ACROSS = 8;
/** Lattice periods across the frame. `feature` is a MEDIAN, so on a tiling whose tiles differ wildly
 *  in size — the scaled and composable shelves, where a big triangle sits beside four small ones — it
 *  tracks the small ones and eight of those is two of the big ones filling the cell. The period is the
 *  scale at which the picture repeats, so it never undersells one; the frame takes whichever is wider. */
const PERIODS_ACROSS = 2.6;
/** …and the ceiling on that, because the same argument runs the other way: a k = 10 cell is a hundred
 *  tiles, so two repeats of it is a texture rather than a tiling. */
const MAX_TILES_ACROSS = 20;

/** The frame width for a plain patch: about eight tiles, widened to hold 2.6 repeats, capped at twenty. */
function plainWidth(v1: [number, number], v2: [number, number], feature: number): number {
	const period = Math.max(Math.hypot(v1[0], v1[1]), Math.hypot(v2[0], v2[1]));
	const wanted = Math.max(TILES_ACROSS * feature, PERIODS_ACROSS * period);
	return Math.min(wanted, MAX_TILES_ACROSS * feature);
}
const LENS_VIEW: [number, number, number, number] = [-ASPECT, -1, 2 * ASPECT, 2];
/** Half the diagonal of LENS_VIEW: the output radius a picture has to reach to fill the frame. */
const LENS_REACH = Math.hypot(ASPECT, 1);

/**
 * Options for one live tiling, sized off the cell's own feature length.
 *
 * Nothing here is per-tiling: a random draw from 4593 entries cannot be hand-tuned, so every number is
 * a ratio to `feature` and the geometry does the rest.
 */
function optionsFor(
	presentation: Presentation,
	cellV1: [number, number],
	cellV2: [number, number],
	feature: number,
	rand: () => number,
): PeriodicSvgOptions {
	if (presentation === "plain") {
		const w = plainWidth(cellV1, cellV2, feature);
		return {
			view: [-w / 2, -w / (2 * ASPECT), w, w / ASPECT],
			world: [-w / 2, -w / (2 * ASPECT), w / 2, w / (2 * ASPECT)],
			flipY: true,
			strokeWidth: w / 220,
		};
	}

	if (presentation === "inversion") {
		// A tile at cell-radius R comes out at output radius r²/R and output size feature·r²/R², so
		// across the picture a tile at output radius ρ is RIM_TILE·(ρ/reach)² wide. Two consequences fix
		// the numbers below. The lens radius r follows from choosing that rim size. And the blank middle
		// — the disc where tiles have fallen under `minSize`, which the shader fills with the average
		// too — has radius reach·√(minSize / RIM_TILE), so it shrinks by making the rim tiles BIGGER,
		// not smaller. At a rim tile a fifth of the frame the blank swallowed half the picture; at four
		// fifths it is a rosette, which is what an inversion is supposed to look like.
		const RIM_TILE = 0.8;
		const minSize = 0.04;
		const r = LENS_REACH * Math.sqrt(feature / RIM_TILE);
		const worldR = r * Math.sqrt(feature / minSize);
		return {
			view: LENS_VIEW,
			world: [-worldR, -worldR, worldR, worldR],
			flipY: true,
			map: inversionMap(r),
			samples: 4,
			detail: 0.08,
			// Output space, not cell space: the shader's stroke is in CSS pixels, so a tile the lens has
			// magnified keeps a hairline instead of growing a black band around itself.
			strokeWidth: 0.006,
			strokeSpace: "output",
			minSize,
			maxPieces: 1200,
		};
	}

	// Spiral.
	const n = spiralArms(cellV1, cellV2, feature);
	const seam: [number, number] = [
		n * (cellV1[0] + cellV2[0]),
		// flipY has already negated y by the time geometry is placed, so the seam follows it.
		-n * (cellV1[1] + cellV2[1]),
	];
	return {
		view: LENS_VIEW,
		// The preimage of the frame is a band across the plane, not a disc — the exponential wraps one
		// seam of it onto every turn. Bounding it here is blunt; the lens's own outer radius does the work.
		world: [-60 * feature, -60 * feature, 60 * feature, 60 * feature],
		flipY: true,
		map: spiralMapForward(seam, 0.05 * (0.8 + 0.4 * rand()), LENS_REACH * 1.35),
		samples: 4,
		detail: 0.1,
		strokeWidth: 0.006,
		strokeSpace: "output",
		minSize: 0.09,
		maxPieces: 1200,
	};
}

/**
 * The spiral's arms (a, b) = (n, n).
 *
 * One turn of the image advances the preimage by the seam a·v₁ + b·v₂, so the seam's length in tiles
 * IS the number of tiles per turn — and the radius grows by e^(2π) across that same width. A seam of
 * one lattice step gives about five tiles a turn and a hundredfold jump between rings, which is a
 * doughnut, not a spiral. So n is chosen to make the seam roughly eighteen tiles long, capped at the 6
 * /play's own control allows so the link reproduces the picture.
 */
function spiralArms(v1: [number, number], v2: [number, number], feature: number): number {
	const diag = Math.hypot(v1[0] + v2[0], v1[1] + v2[1]);
	return Math.max(1, Math.min(6, Math.round((18 * feature) / Math.max(diag, 1e-6))));
}

/** The /play link for a live pick, carrying the lens in /play's own query grammar. */
function hrefFor(id: string, presentation: Presentation, arms: number): string {
	const base = `/play?source=reference&tiling=${encodeURIComponent(id)}`;
	if (presentation === "plain") return base;
	if (presentation === "inversion") return `${base}&v=1&vmode=inversion`;
	return `${base}&v=1&vmode=spiral&varma=${arms}&varmb=${arms}`;
}

/** A live pick as a drawable specimen, or `null` if its cell is degenerate — a caller keeps its seed. */
export function liveSpecimen(
	entry: HeroCell,
	presentation: Presentation,
	rand: () => number,
): ErrorSpecimen | null {
	const cell = tilingPeriodicCell(entry.cell);
	if (!cell) return null;
	const opts = optionsFor(presentation, cell.v1, cell.v2, cell.feature, rand);
	const svg = periodicCellToSvg(cell, opts);
	if (!svg) return null;
	const suffix = presentation === "plain" ? "" : ` · ${presentation} lens`;
	return {
		id: `${entry.id}-${presentation}`,
		label: `${entry.label}${suffix}`,
		href: hrefFor(entry.id, presentation, spiralArms(cell.v1, cell.v2, cell.feature)),
		viewBox: svg.viewBox,
		background: svg.background,
		paths: svg.paths,
	};
}
