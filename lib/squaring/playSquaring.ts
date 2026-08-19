// The /play side of the squared-torus construction: one catalogue record in, one squared torus out.
//
// The maths is all in torusMap.ts / torusSquaring.ts / torusSqDomains.ts and none of it is repeated
// here. What this file owns is the two questions /play asks that the theory page never has to:
//
//   1. CAN this record be squared at all? The Options tab needs that answer for every selection, to
//      decide whether the toggle is live or disabled-with-a-reason, and it needs it cheaply.
//   2. WHICH cell does the construction read? Not the live one. See below.
//
// THE CELL IS THE RECORD'S, NOT THE CANVAS'S. A parametric family draws from `paramCell` evaluated at
// the live sliders, and feeding that here would be wrong in a way that is easy to miss. What the
// construction reads is the quotient GRAPH — unit conductance on every edge, geometry nowhere — so
// within one fixed map the squaring does not move at all: 40 uniform α samples of period-k2-044 at a
// fixed class gave one squaring with no jumps (measured 2026-08-19). What DOES move is the map. Two
// things change it as the sliders travel:
//
//   - The labelling. A vertex sitting on the cell boundary reduces into a different representative at a
//     different α, which flips some `vshift`. Same V/E/F, same adjacency, different basis of H₁ — so the
//     label (m, n) names a different member of the same family and the picture jumps under a still hand.
//   - The map itself. Flex far enough and incidences genuinely change; lib/squaring/playSquaring.test.ts
//     shows two positions of a five-parameter family whose squarings do not agree even up to a change of
//     basis in [-4, 4]. That is a different tiling, so a different family is the correct answer.
//
// Reading `renderCell` — the record's own default-α evaluation — fixes both once. The squaring on screen
// is then a function of the catalogue entry and nothing else, which is the only reading under which the
// class the reader picked keeps meaning what it meant when they picked it.

import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";
import { sizeHue } from "@/lib/utils/paramCell";
import { surfaceOf } from "@/lib/services/shelfRegistry";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { buildTorusMap, halfTurn, type TorusCell, type TorusMap } from "./torusMap";
import { squareTorus, type TorusSquaring } from "./torusSquaring";
import {
	sqSectors,
	squareTorusAt,
	torusFrame,
	torusSqDomains,
	type SqDomains,
	type SqSector,
	type TorusFrame,
} from "./torusSqDomains";

/** Largest |m| and n the dial snaps to, matching the sweep in scripts/build-torus-shelf.ts. */
export const CLASS_LIMIT = 6;

/**
 * Why a record cannot be squared. Each is shown to the reader verbatim, so each has to name a cause a
 * reader can act on — "unavailable" would be the one answer that helps nobody.
 */
export type SquaringRefusal = "geometry" | "no-cell" | "quotient";

export const REFUSAL_TEXT: Record<SquaringRefusal, string> = {
	geometry:
		"This one is not squared here. The construction needs a torus, so it wants a Euclidean tiling with a period lattice: at genus 2 and up Gauss–Bonnet forces cone points and the result is a translation surface, not a plane tiling. The hyperbolic analogue is the squared cylinder, on /theory/perfect-rectangles. Euclidean shelves that draw on their own canvas — the colorings, the edge systems, the freedraw boards — do have quotient graphs and simply are not wired to this yet.",
	"no-cell":
		"This record's translation cell has no closed tiles to read a quotient graph off. Nothing is wrong with the tiling; the shelf stores it in a form this construction does not take.",
	quotient:
		"This record's translation cell does not close into a consistent quotient of the torus — some edge finds no partner across the gluing. That is a defect in the cell, not a property of the tiling, and it is worth reporting.",
};

/** Everything the construction needs for one tiling, and none of it moves when the class does. */
export interface SquaringSupport {
	map: TorusMap;
	/** The two exact solves that span the family; every class is a blend of them. */
	frame: TorusFrame;
	/** Walls (a square dies), ties (two squares agree), silent edges, locked pairs. */
	domains: SqDomains;
	sectors: SqSector[];
	/** True when a half-turn acts on the quotient, which locks every orbit it moves. */
	halfTurn: boolean;
}

export type SquaringAvailability = { ok: true; support: SquaringSupport } | { ok: false; reason: SquaringRefusal };

/** Read a record's shipped cell into the shape buildTorusMap wants, or null if it holds no closed tiles. */
function torusCellOf(t: CatalogueTiling): TorusCell | null {
	const base = parseBaseCell(t.renderCell);
	if (!base) return null;
	const polygons: [number, number][][] = [];
	for (const p of base.polys) {
		// An open polyline is a drawn stroke and not a face, so a cell carrying one is not a tiling.
		//
		// STAR TILES ARE NOT EXCLUDED, and an earlier version of this that excluded them was wrong. The
		// `star` flag out of parseBaseCell covers two different things: a genuinely self-intersecting {n/d}
		// face, which has no interior for a quotient to see, and an ordinary simple polygon whose outline
		// happens to be star-SHAPED, which tiles like any other tile. The mixed shelves are full of the
		// second kind and their cells build clean quotients. Nothing here needs to tell them apart, because
		// buildTorusMap already does: a self-intersecting face leaves darts with no partner, and a cell
		// whose faces overlap cannot come out at V − E + F = 0. Let the certificate decide.
		if (p.open) return null;
		if (p.vertices.length < 3) return null;
		polygons.push(p.vertices.map((v) => [v.x, v.y] as [number, number]));
	}
	return polygons.length > 0 ? { polygons, basis: base.basis } : null;
}

// Keyed on canonicalKey, capped so a long browsing session cannot grow it without bound. The whole
// support object for one tiling is a few hundred kB at the top end and most records are far smaller.
const supportCache = new Map<string, SquaringAvailability>();
const SUPPORT_CACHE_MAX = 48;

/**
 * Can this record be squared, and if so with what.
 *
 * Costs one `buildTorusMap` (about 0.3 ms) plus the two solves of the frame and the O(E²) BigInt sweep
 * of `torusSqDomains`. That is well under a millisecond for the E ≤ 60 that covers most of the atlas
 * and about 75 ms for the largest cell in it (E = 240, `ctrnact-mixed-family-k4-02`), which is why the
 * result is cached per record and never recomputed while the class moves.
 */
export function squaringAvailability(t: CatalogueTiling | null | undefined): SquaringAvailability {
	if (!t) return { ok: false, reason: "geometry" };
	// The registry answers "which renderer owns this canvas" for the whole app; "flat" is the plain
	// Euclidean tiling and is the only surface with a period lattice AND real tile bodies. Hollow draws
	// on its own canvas from self-intersecting faces, and every disk/sphere surface is the wrong genus.
	if (surfaceOf(t) !== "flat") return { ok: false, reason: "geometry" };

	const key = t.canonicalKey;
	const hit = supportCache.get(key);
	if (hit) return hit;

	const answer = ((): SquaringAvailability => {
		let cell: TorusCell | null;
		try {
			cell = torusCellOf(t);
		} catch {
			cell = null;
		}
		if (!cell) return { ok: false, reason: "no-cell" };
		const built = buildTorusMap(cell);
		if (!built.ok) return { ok: false, reason: "quotient" };
		const frame = torusFrame(built.map);
		const domains = frame ? torusSqDomains(built.map) : null;
		if (!frame || !domains) return { ok: false, reason: "quotient" };
		return {
			ok: true,
			support: {
				map: built.map,
				frame,
				domains,
				sectors: sqSectors(domains.walls),
				halfTurn: halfTurn(built.map).present,
			},
		};
	})();

	if (supportCache.size >= SUPPORT_CACHE_MAX) supportCache.delete(supportCache.keys().next().value as string);
	supportCache.set(key, answer);
	return answer;
}

/**
 * The squaring at one class, blended from the frame.
 *
 * Cheap enough to run on every pointer move of the dial: a dot product per edge, no solve. The sides
 * are reals normalised to a largest side of 1000, and the result is marked `approx`, so nothing built
 * on it may claim two sides are equal.
 */
export function blendedSquaring(support: SquaringSupport, cls: [number, number]): TorusSquaring | null {
	return squareTorusAt(support.frame, cls[0], cls[1]);
}

/**
 * The exact squaring at an integral class, or null if the class is not integral.
 *
 * This is the expensive one — a BigInt Bareiss elimination, measured at 0.1–0.4 ms up to E = 60, 2.6 ms
 * at E = 96 and 75 ms at E = 240 — and it is the only one whose numbers are integers, so it is the only
 * one allowed to print sides or to claim a squaring is perfect. Callers run it off a deferred class so
 * a drag stays on the blend and the exact answer lands when the pointer stops.
 */
export function exactSquaring(support: SquaringSupport, cls: [number, number]): TorusSquaring | null {
	if (!Number.isInteger(cls[0]) || !Number.isInteger(cls[1])) return null;
	const r = squareTorus(support.map, cls[0], cls[1]);
	return r.ok ? r.squaring : null;
}

/**
 * The integral class worth opening on: the one whose squaring has the most different sizes in it.
 *
 * Ranked on the blend, never on the exact solve — ranking 48 classes exactly would cost 3.6 s on the
 * largest cell in the atlas and the ordering is the same either way, since both read the same sides.
 * Ties go to the simpler class, which is what `torusClasses` order already gives.
 */
export function bestClass(support: SquaringSupport, limit = CLASS_LIMIT): [number, number] {
	let best: [number, number] = [1, 0];
	let bestScore = -1;
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	for (let n = 0; n <= limit; n++) {
		for (let m = -limit; m <= limit; m++) {
			if (m === 0 && n === 0) continue;
			if (n === 0 && m < 0) continue;
			if (gcd(Math.abs(m), n) !== 1) continue;
			const s = squareTorusAt(support.frame, m, n);
			if (!s) continue;
			// Distinct sizes first, then order: a squaring with more tiles at the same variety is the
			// richer picture, and a degenerate class loses tiles rather than gaining them.
			const score = s.distinct * 1000 + s.order;
			if (score > bestScore) {
				bestScore = score;
				best = [m, n];
			}
		}
	}
	return best;
}

/**
 * The squared torus as a translation cell the flat canvas can draw.
 *
 * This is the whole reason the squaring can live on /play's main canvas instead of in a figure of its
 * own: a squared torus IS a periodic Euclidean tiling, so once it is written as polygons plus a basis
 * every existing behaviour comes with it — zoom, drag, rotate, the wrap-around fill, the deform pad, the
 * image export. Nothing here re-implements any of that.
 *
 * SCALE. The solve fixes the tiling only up to similarity (scaling a class scales the tiling and changes
 * nothing else), and the exact and blended solves normalise differently — one clears a gcd, the other
 * puts the largest side at 1000. Either would drop the drawing at an arbitrary zoom. So the cell is
 * scaled to the AREA of the tiling it came from, which is both a stable ruler and a true statement: the
 * torus is the same torus, and Σ side² is its area.
 *
 * COLOUR. Squares carry an explicit per-tile `hue`, the same override the polyomino and length families
 * use, because the by-side-count ramp cannot help here — every tile is a quadrilateral, so it would paint
 * the whole tiling one colour. The ramp is `sizeHue`, shared with the length families, so "bigger tile,
 * warmer" means the same thing across the page. Two squares of equal size therefore come out the same
 * colour, which is what gives an imperfect squaring away before any number is read.
 */
function squaringScale(support: SquaringSupport, squaring: TorusSquaring): number | null {
	const [b1, b2] = support.map.basis;
	const sourceArea = Math.abs(b1[0] * b2[1] - b1[1] * b2[0]);
	const ownArea = Math.abs(Number(squaring.covolume));
	if (!(sourceArea > 0) || !(ownArea > 0)) return null;
	return Math.sqrt(sourceArea / ownArea);
}

export function squaringCell(
	support: SquaringSupport,
	squaring: TorusSquaring,
	mono: boolean,
): TranslationalCellData | null {
	const sides = squaring.squares.map((s) => Number(s.side));
	if (sides.length === 0) return null;
	const k = squaringScale(support, squaring);
	if (k === null) return null;

	const lo = Math.min(...sides);
	const hi = Math.max(...sides);
	const cellPolygons = squaring.squares.map((sq, i) => {
		const x = Number(sq.x) * k;
		const y = Number(sq.y) * k;
		const s = sides[i] * k;
		const v: [number, number][] = [
			[x, y],
			[x + s, y],
			[x + s, y + s],
			[x, y + s],
		];
		return { n: 4, v, hue: mono ? MONO_HUE : sizeHue(v, lo * k, hi * k) };
	});

	return {
		cellPolygons,
		basis: [
			[Number(squaring.lattice[0][0]) * k, Number(squaring.lattice[0][1]) * k],
			[Number(squaring.lattice[1][0]) * k, Number(squaring.lattice[1][1]) * k],
		],
	};
}

/** The one hue the monochrome mode paints with: `sizeHue`'s own cold end, so it is not a new colour. */
const MONO_HUE = 210;

/** One square's label, in the same world coordinates `squaringCell` writes its polygons in. */
export interface SquaringLabel {
	cx: number;
	cy: number;
	/** Side in world units, so the drawing can decide whether the text fits inside the tile. */
	side: number;
	text: string;
}

/**
 * Where the sizes go, and the lattice they repeat by.
 *
 * Split out of `squaringCell` because the two are drawn by different layers: the polygons go to the flat
 * renderer as an ordinary translation cell, and the numbers and the cell outline go on a 2-D overlay
 * above it (components/squaring/squaring-overlay.tsx), for the same reason the Truchet figures do — the
 * flat pipeline draws tiles, not type.
 *
 * Returns null for a squaring whose sides are not integers. Off the integer lattice a side is a real
 * number in the ℚ-span of the class, printing it would be printing a rounding, and "these two are the
 * same size" is not decidable there — so there is nothing honest to label with.
 */
export function squaringLabels(
	support: SquaringSupport,
	squaring: TorusSquaring,
): { labels: SquaringLabel[]; basis: [[number, number], [number, number]] } | null {
	if (squaring.approx) return null;
	const k = squaringScale(support, squaring);
	if (k === null) return null;
	return {
		labels: squaring.squares.map((s) => {
			const side = Number(s.side) * k;
			return {
				cx: Number(s.x) * k + side / 2,
				cy: Number(s.y) * k + side / 2,
				side,
				text: s.side,
			};
		}),
		basis: [
			[Number(squaring.lattice[0][0]) * k, Number(squaring.lattice[0][1]) * k],
			[Number(squaring.lattice[1][0]) * k, Number(squaring.lattice[1][1]) * k],
		],
	};
}
