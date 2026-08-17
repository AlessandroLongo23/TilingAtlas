// Rebuild a tiling's float render cell from its EXACT cell, instead of shipping both.
//
// WHY THIS EXISTS. `renderCell` is a projection of `exactSource`: the same cell, with the cyclotomic
// coordinates evaluated to floats. Shipping both put the derived copy in the payload at 4-5x the size
// of the thing it was derived from — measured 2026-08-15, renderCell is 79% of reference-atlas-k9.json
// (70.7 of 89.1 MB) against 12 MB of exactSource. The browser already reconstructs the exact cell for
// the vertex-orbit overlay (orbitsFromExactSource), so the machinery was present and only the last
// projection step lived on the build side.
//
// It is SYNCHRONOUS, which is what makes this cheap to adopt: no consumer has to become async, they
// just ask for the cell at the point they draw it. Measured on this corpus: median 1.7 ms per tiling,
// p95 ~27 ms, over a page of 25 thumbnails 98-160 ms total in node. Thumbnails already mount lazily as
// they scroll into view, so that cost lands a few ms at a time, and `renderCellOf` caches per record.
//
// The projection below must stay IDENTICAL to scripts/build-reference-atlas.ts `cellToRenderData`,
// which is the function it was lifted from — that is what lets the same code serve records that ship a
// renderCell (older shelves, and the handful with no exactSource) and records that do not.

import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { deserializeCell } from "@/classes/algorithm/cellCodec";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { starCellFromExact } from "@/lib/services/starExactCell";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/** The exact cell behind a record, or null when it cannot be reconstructed. */
function cellFrom(ring: CyclotomicRing, id: string, source: ExactCellSource): PeriodCell | null {
	if (source.kind === "startiles") {
		const built = starCellFromExact(ring, source.exact);
		return built ? (built as unknown as PeriodCell) : null;
	}
	if (source.kind === "seed") {
		const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
		return "error" in rec ? null : rec.cell;
	}
	return deserializeCell(ring, source.cell);
}

/**
 * Float cell for the renderers, projected from the exact one.
 *
 * Byte-for-byte the transform `cellToRenderData` applies at build time. Returns null when the exact
 * source will not reconstruct, and the caller then has nothing to draw — the same contract
 * orbitsFromExactSource already has.
 */
export function renderCellFromExactSource(
	ring: CyclotomicRing,
	id: string,
	source: ExactCellSource,
): TranslationalCellData | null {
	const cell = cellFrom(ring, id, source);
	if (!cell) return null;
	const u = cell.basisExact[0].toVector();
	const v = cell.basisExact[1].toVector();
	return {
		cellPolygons: cell.cellPolygons.map((p) => ({
			n: p.n,
			vertices: p.vertices.map((vec) => [vec.x, vec.y] as [number, number]),
			...((p as { isStar?: boolean }).isStar === true ? { star: true } : {}),
		})),
		basis: [
			[u.x, u.y],
			[v.x, v.y],
		],
	} as TranslationalCellData;
}

// --- The strip gate: which records can safely ship WITHOUT a renderCell -----------------------------

const Q = (x: number) => Math.round(x * 1e6) / 1e6 + 0; // +0 folds -0 into 0
const vk = (v: readonly number[]) => `${Q(v[0])},${Q(v[1])}`;

/**
 * The parts of a render cell this comparison reads.
 *
 * `TranslationalCellData` types `cellPolygons` as `unknown[]` (it is the loose shape several renderers
 * share), so the gate names what it actually needs instead of casting its way through.
 */
export interface CellShape {
	basis?: number[][];
	cellPolygons?: { n: number; star?: boolean; vertices: number[][] }[];
}

/** Is `b` the same cycle as `a`, allowing a rotated start and either direction? */
function sameRing(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const twice = a.concat(a).join(">");
	return twice.includes(b.join(">")) || twice.includes([...b].reverse().join(">"));
}

/**
 * Does the derived cell reproduce the shipped one?
 *
 * GEOMETRIC, not textual, and deliberately so. `reconstructOracleCell` chooses its own polygon order
 * and its own starting vertex, so 3,410 of the 6,193 base records come back written differently from
 * how they were shipped. Measured 2026-08-15: every one of those is the same multiset of polygons with
 * each polygon a cyclic rotation or a reversal of the shipped ring, zero arbitrary permutations, and
 * the two render pixel-identically (reversal only flips winding, and a simple polygon fills the same
 * either way under the nonzero rule the canvas uses). So the test is: same basis, same polygons up to
 * rotation and direction.
 */
export function reproducesRenderCell(
	shipped: CellShape | undefined,
	derived: CellShape | undefined,
): boolean {
	if (!shipped?.basis || !shipped.cellPolygons) return false;
	if (!derived?.basis || !derived.cellPolygons) return false;
	for (let i = 0; i < 2; i++)
		for (let j = 0; j < 2; j++)
			if (Math.abs(shipped.basis[i][j] - derived.basis[i][j]) > 1e-9) return false;
	if (shipped.cellPolygons.length !== derived.cellPolygons.length) return false;
	const pool = derived.cellPolygons.map((p) => ({ p, seq: p.vertices.map(vk) }));
	const used = new Set<number>();
	for (const sp of shipped.cellPolygons) {
		const seq = sp.vertices.map(vk);
		let hit = -1;
		for (let i = 0; i < pool.length; i++) {
			if (used.has(i)) continue;
			const c = pool[i];
			if (c.p.n !== sp.n || !!c.p.star !== !!sp.star) continue;
			if (!sameRing(seq, c.seq)) continue;
			hit = i;
			break;
		}
		if (hit < 0) return false;
		used.add(hit);
	}
	return true;
}

/**
 * Delete `renderCell` from every record whose `exactSource` reproduces it, in place.
 *
 * The builders call this before writing, so a rebuild cannot quietly restore 200 MB of derived
 * geometry (and push reference-atlas-k9.json back over GitHub's blob limit). A record that fails the
 * gate keeps its cell: that is the 9-fold and 5-fold star tilings, whose ζ₁₈/ζ₂₀ geometry has no ζ₂₄
 * reconstruction at all, and the handful with no exactSource to begin with.
 */
export function stripDerivableRenderCells<T extends Derivable>(
	records: T[],
): { stripped: number; kept: number } {
	const ring = activeRing24();
	let stripped = 0;
	let kept = 0;
	for (const t of records) {
		if (!t?.exactSource || t.renderCell === undefined) {
			kept++;
			continue;
		}
		let derived: TranslationalCellData | null = null;
		try {
			derived = renderCellFromExactSource(ring, t.id, t.exactSource);
		} catch {
			derived = null;
		}
		// `TranslationalCellData` keeps cellPolygons as `unknown[]`; the gate needs the stricter view.
		if (derived && reproducesRenderCell(t.renderCell as CellShape, derived as CellShape)) {
			delete t.renderCell;
			stripped++;
		} else kept++;
	}
	return { stripped, kept };
}

/** The ζ₂₄ ring every oracle record reconstructs in, built once. Mirrors symmetryCache's setup. */
let ring24: CyclotomicRing | null = null;
function activeRing24(): CyclotomicRing {
	if (!ring24) ring24 = CyclotomicRing.create(24);
	setActiveRing(ring24);
	return ring24;
}

/** What a record whose exact source will not reconstruct falls back to: nothing to draw. */
const NOTHING_TO_DRAW = { cellPolygons: [], basis: [[1, 0], [0, 1]] } as unknown as TranslationalCellData;

interface Derivable {
	id: string;
	renderCell?: TranslationalCellData;
	exactSource?: ExactCellSource;
}

/**
 * Give every record that ships WITHOUT a renderCell a lazy one, derived on first read.
 *
 * WHY A GETTER. `renderCell` is read at 72 sites across 39 files — canvases, thumbnails, /play, the
 * theory and defense pages, and two dozen tests. Making it optional would push a null check into every
 * one of them. Installing a lazy accessor instead means each of those sites keeps reading a plain
 * `t.renderCell` and getting a cell, synchronously, exactly as before.
 *
 * LAZY, not eager: deriving the whole base atlas up front is ~6,200 x 1.7 ms and would stall the load
 * for ten seconds. The getter replaces itself with the computed value on first access, so a tiling
 * costs its derivation once and only if something actually draws it. Thumbnails already mount as they
 * scroll into view, which is what spreads that cost out.
 *
 * Records that already carry a renderCell are left completely alone — that covers the shelves with no
 * exact source at all, and the handful of out-of-ring star tilings (9-fold and 5-fold need ζ₁₈/ζ₂₀,
 * not ζ₂₄) whose builder therefore could not strip them.
 */
export function hydrateRenderCells<T extends Derivable>(records: T[]): T[] {
	for (const rec of records) {
		if (!rec || rec.renderCell !== undefined || !rec.exactSource) continue;
		Object.defineProperty(rec, "renderCell", {
			configurable: true,
			enumerable: true,
			get(this: T) {
				const cell =
					renderCellFromExactSource(activeRing24(), this.id, this.exactSource!) ?? NOTHING_TO_DRAW;
				// Collapse to a plain property so the second read is free and `{...t}` behaves normally.
				Object.defineProperty(this, "renderCell", {
					value: cell,
					writable: true,
					enumerable: true,
					configurable: true,
				});
				return cell;
			},
		});
	}
	return records;
}
