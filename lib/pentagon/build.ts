/**
 * Parameters in, a drawable translational cell out. Pure and DOM-free, so it unit tests directly.
 *
 * These tilings are PERIODIC, so they belong on the atlas' flat Euclidean renderer, the one /play and
 * /isohedral use: hand `FlatCellRenderer` one translational cell and the vertex shader instances it
 * across the visible lattice every frame (lib/render/flatTilingGL.ts, lib/render/flatView.ts). The
 * tiling is then genuinely unbounded, with no patch edge to run into, and a frame costs two instanced
 * draw calls at any zoom with no geometry rebuilt.
 *
 * It also makes the sliders cheap in the way that matters. A parameter change rebuilds the unit, which
 * is between 2 and 12 pentagons, and nothing else. A finite-patch builder would re-triangulate and
 * re-upload thousands of tiles for the same visual result.
 *
 * The mesh comes from lib/render/buildCellMesh.ts, the shared builder, NOT from the ear-clipping
 * variant lib/isohedral/cellMesh.ts. That one exists because the isohedral page's edge-curvature
 * sliders can produce a tile that is not star-shaped about its centroid, which breaks the centroid fan.
 * A convex pentagon cannot do that, so the shared builder is correct here.
 *
 * Colour is assigned per tile by its index in the unit, not by the by-side-count ramp. Every tile on
 * this page is a pentagon, so the ramp would paint the whole tiling one flat colour; colouring by
 * position in the unit is what makes the repeating block legible, which is the page's subject.
 */

import { buildCellMesh, type CellMesh } from "@/lib/render/buildCellMesh";
import type { RawPolygon, TranslationalCellData } from "@/lib/utils/renderTiling";
import { ASSEMBLIES, assembleUnit } from "./assembly";
import { ERROR_TEXT, solvePentagon, type Angles, type Point, type Sides } from "./solve";
import { pentagonType, type PentagonType } from "./types";

/** Hue per tile within the unit. Spread around the wheel so neighbours in a 12-tile unit stay apart. */
const UNIT_HUES = [205, 35, 145, 315, 265, 95, 15, 175, 240, 60, 290, 120];

/**
 * Lattice cells across the short side of the view at home.
 *
 * A constant, not a control. The tiling is instanced over its lattice in the shader and has no edge,
 * so this only decides where the view STARTS: the zoom you land on when you pick a type, and the one
 * right-click returns to. The wheel owns zoom from there.
 *
 * It was briefly a "Patch" slider, which was worse than useless on two counts: it duplicated the
 * wheel, and because changing the framing refits, dragging it teleported the camera back to home after
 * you had zoomed somewhere. The name also claimed an extent the tiling does not have. `buildCell`
 * still takes `periods` so the framing stays testable.
 */
export const HOME_PERIODS = 4;

export interface PentagonCell {
	/** The translational unit's tiles, in world coordinates. Repeats under `v1`, `v2`. */
	polygons: RawPolygon[];
	/** Triangulated and ready for FlatCellRenderer.uploadMesh. */
	mesh: CellMesh;
	v1: [number, number];
	v2: [number, number];
	/** The prototile's five corners, for the sidebar inspector. */
	prototile: Point[];
	angles: Angles;
	sides: Sides;
	/** √|det(v1, v2)|: the linear size of one cell, the unit `periods` counts. */
	period: number;
	/**
	 * The box the view frames at home, centred on the origin. Sets the starting zoom only; the tiling
	 * itself is unbounded. Derived from the request and not from the tiles, so it holds still while a
	 * parameter slider moves.
	 */
	home: { cx: number; cy: number; width: number; height: number };
	tilesPerCell: number;
}

export interface CellRequest {
	id: number;
	/** Angle sliders, in the type's `angleParams` order. */
	angles?: number[];
	/** Side sliders, in the type's `sideParams` order. */
	sides?: number[];
	periods?: number;
}

export type BuildResult =
	| { ok: true; cell: PentagonCell; reason?: undefined }
	| { ok: false; cell?: undefined; reason: string };

/** Whether a type has a derived assembly yet. The page says so instead of drawing nothing. */
export function hasAssembly(id: number): boolean {
	return ASSEMBLIES[id] !== undefined;
}

/**
 * The translational cell for a type at a parameter tuple.
 *
 * Fails loudly rather than drawing something plausible: an unsolvable tuple, a missing assembly and a
 * recipe that does not replay are three different problems and the sidebar names which one it is.
 */
export function buildCell(req: CellRequest): BuildResult {
	const t: PentagonType | null = pentagonType(req.id);
	if (!t) return { ok: false, reason: `no type ${req.id}` };

	const solved = solvePentagon(t, req.angles, req.sides);
	if (!solved.ok) return { ok: false, reason: ERROR_TEXT[solved.error] };
	const { angles, sides, corners } = solved.pentagon;

	const asm = ASSEMBLIES[t.id];
	if (!asm) return { ok: false, reason: "unit not derived yet" };

	const built = assembleUnit(corners as unknown as Point[], asm);
	if (!built) return { ok: false, reason: "the unit does not assemble here" };

	// Scale to unit tile area, so moving a slider changes the SHAPE and not the apparent zoom.
	//
	// `solvePentagon` normalises a = 1, which is the right contract for reading side ratios and the one
	// the constraint readouts use. It is the wrong contract for drawing. These types classify pentagons
	// up to SIMILARITY, so size is not part of the classification and pinning one named side is an
	// arbitrary choice — on Type 7 it pins the odd side out, and running E from 95° to 145° then takes
	// the other four from 0.4148 to 1.5139 and the tile's area up by an order of magnitude. The tiling
	// appears to zoom while the camera has not moved, which is an artefact of the normalisation and says
	// nothing about the family.
	//
	// Area is the invariant to hold, not edge length: see characteristicTileSize in
	// app/(app)/aperiodic/_patch-view.tsx, which settled the same question for the aperiodic patches
	// ("a hat has shorter edges than a Penrose rhombus while being 2.07× the tile"). Every tile in the
	// unit is congruent, so the cell's area over the tile count is that one tile's area.
	//
	// A side effect worth having: the lattice determinant becomes exactly `unit.length`, so `home` is
	// parameter-independent and even a refit lands on the same scale. Shapes stay fully visible — only
	// the arbitrary overall size is fixed, and the exact side ratios are still reported in the sidebar.
	const rawDet = Math.abs(built.t1.x * built.t2.y - built.t1.y * built.t2.x);
	const tileArea = rawDet / built.unit.length;
	if (!(tileArea > 1e-12)) return { ok: false, reason: "the tile collapses here" };
	const k = 1 / Math.sqrt(tileArea);

	const polygons: RawPolygon[] = built.unit.map((pts, i) => ({
		n: 5,
		vertices: pts.map((p) => ({ x: p.x * k, y: p.y * k })),
		hue: UNIT_HUES[i % UNIT_HUES.length],
	}));

	const v1: [number, number] = [built.t1.x * k, built.t1.y * k];
	const v2: [number, number] = [built.t2.x * k, built.t2.y * k];

	const cellData: TranslationalCellData = { cellPolygons: polygons, basis: [v1, v2] };
	const mesh = buildCellMesh(cellData);
	if (!mesh) return { ok: false, reason: "the lattice is degenerate here" };

	const det = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]);
	const period = Math.sqrt(det);
	const span = (req.periods ?? HOME_PERIODS) * period;

	return {
		ok: true,
		cell: {
			polygons,
			mesh,
			v1,
			v2,
			// Same world scale as `polygons`, so the field means one thing. The inspector contain-fits it
			// anyway, so this is invisible there; `sides` below stays normalised to a = 1, which is what
			// the constraint readouts quote.
			prototile: (corners as unknown as Point[]).map((p) => ({ x: p.x * k, y: p.y * k })),
			angles,
			sides,
			period,
			// Square: the renderer instances out to the viewport's edges whatever its aspect, so the frame
			// only has to fix the scale. `periods` then reads as "periods across the short side".
			home: { cx: 0, cy: 0, width: span, height: span },
			tilesPerCell: polygons.length,
		},
	};
}
