// Drawing the edited tiling, and the handles that make it editable.
//
// A 2-D context and not the flat WebGL path, for a reason that is about the work and not about speed:
// the shader bakes one hue per vertex into a mesh (lib/render/buildCellMesh.ts), so a paint stroke or
// a cut would mean rebuilding and re-uploading that mesh on every pointer move. What is on screen here
// is one fundamental cell, tens of tiles, stamped a few hundred times: `drawPolygons` handles it inside
// a frame, and the overlays that matter most (handles, snap dots, the cut being drawn, a hover
// highlight) are exactly the things a 2-D context is good at and the mesh path has no room for.
//
// The fill pass is `drawPolygons` from lib/utils/renderTiling.ts, unchanged apart from the one `fill`
// override added for the palette. That is deliberate: it already resolves the by-side-count ramp, the
// star ramp and the ink sentinel, so an unpainted tile in the editor is the SAME colour it is on the
// catalogue canvas, and entering the editor does not restyle the tiling.
//
// STROKES ARE A SEPARATE PASS over the surviving edges, not per tile. That is the whole rendering of a
// merge: the faces of a merged tile are filled in one colour and the edge between them is simply not
// stroked, so the tile reads as one shape with no outline ever being computed. Holes and pinch points
// come out right for free, which a boundary-walk would have to handle case by case.

import { isIdentityDeform, type Mat2 } from "@/lib/render/flatView";
import { screenToWorld, worldToScreen } from "@/lib/utils/canvasPick";
import { drawPolygons, polygonFillHue, TILE_FILL_ALPHA, tileFill, type RawPolygon } from "@/lib/utils/renderTiling";
import { arcInterior, flipChord } from "./bow";
import { componentOutline } from "./classify";
import { slotFill } from "./palette";
import { faceRing } from "./snap";
import { canonicalEdge, halfEdgeKey, ringKey } from "@/lib/freedraw/topology";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { ColorChoice } from "@/lib/colors/render";
import type { ConstructionPoint, Curve4, Lift, Pt, StudioPatch, StudioTool } from "./types";

/** Cap on lattice copies per frame. A few hundred covers any zoom at which tiles are distinguishable,
 *  and past that the picture is texture, not tiling. The same instinct as MAX_FILL_INSTANCES. */
const MAX_COPIES = 4000;

/** Below this on-screen period-cell area (px²) the group's axes and centres are texture, not a map, so
 *  they are left out whole. A count cap was the old answer and it lied: copies arrive in raster order,
 *  so the budget ran out in one corner and the overlay showed a fraction of the group as if it were all. */
const MIN_STRUCTURE_CELL_PX2 = 40 * 40;

/**
 * The view, in exactly the terms the catalogue canvas already uses.
 *
 * Not a `FreedrawView` (a world centre plus a scale), and that is the point: entering the editor must
 * not move the picture by a pixel, so it reads the very same `configuration.controls` the flat canvas
 * and the p5 layer read, and projects through the very same `worldToScreen`. Two spellings of one view
 * is how the zoom came to jump on the way in.
 */
export interface StudioView {
	/** Centred-screen offset, in px. `controls.offset`. */
	offset: { x: number; y: number };
	zoom: number;
	/** Live view angle, RADIANS. `controls.rotation` is degrees. */
	rot: number;
	deform: Mat2;
}

export interface StudioStyle {
	dark: boolean;
	/** Edge stroke in CSS px, the same store field the catalogue canvas's Line stroke slider drives. */
	lineWidth: number;
	hueOffsetDeg: number;
	palette: readonly ColorChoice[];
	/** Component id -> palette slot, already resolved from the doc's class keys by the caller. */
	fills: ReadonlyMap<number, number>;
	/** Outline the fundamental cell and dash its translates. */
	showLattice: boolean;
	/**
	 * What an edit repeats under, which decides what the overlay DRAWS.
	 *
	 * `lattice` draws the period parallelogram and its translates, because translations are the whole
	 * group an edit is carried through. `wallpaper` draws the group's own structure on top: the
	 * fundamental domain, its copies tiling the cell, the mirror and glide axes and the rotation centres.
	 * Showing the period alone under Wallpaper mode would be a lie about what a click is going to do.
	 */
	periodMode: "lattice" | "wallpaper";
	/** The tiling's wallpaper group, when one was computed. Null on a star tiling and on curved tiles,
	 *  which is also when Wallpaper mode is unavailable. */
	symmetry: SymmetryData | null;
	/** Dot the construction points a cut can snap to. */
	showPoints: boolean;
	/** Undirected quotient edge key -> its bow, already resolved from the doc by the caller. */
	bows: ReadonlyMap<string, Curve4>;
}

export interface StudioOverlay {
	tool: StudioTool;
	points: readonly ConstructionPoint[];
	/** The tile under the cursor. */
	hoverFace: { face: number; off: Lift } | null;
	/**
	 * Every component the pending edit would touch, which under Wallpaper mode is more than the one
	 * under the cursor. Computed by the caller through lib/studio/symmetry.ts, because deciding what an
	 * edit reaches is a question about the period mode and not about drawing.
	 */
	affected: ReadonlySet<number>;
	hoverEdge: { index: number; off: Lift } | null;
	hoverVertex: { vi: number; off: Lift } | null;
	/** The cut being drawn, already resolved to world positions, plus the cursor as its open end. */
	cutPath: readonly Pt[];
	cursor: Pt | null;
	/**
	 * The construction point a click would take, or null when the cursor is out of snapping range.
	 *
	 * Drawn as a ring around the point, because "am I close enough" is otherwise unanswerable until
	 * after the click, and a cut that snapped somewhere unintended is hard to undo mentally even when
	 * it is one keystroke to undo on screen.
	 */
	snap: ConstructionPoint | null;
	/**
	 * Why the last gesture was refused, drawn near the cursor.
	 *
	 * The editor blocks bad edits instead of flagging them, so a refusal is the only signal the gesture
	 * did anything at all. It was going to the cell inspector, which is no longer mounted, and a block
	 * with no explanation is indistinguishable from the tool being broken.
	 */
	notice: string | null;
}

const OK_STROKE = (dark: boolean) => (dark ? "rgba(235,235,240,0.92)" : "rgba(20,20,26,0.92)");
const HOVER_FILL = "rgba(255,196,64,0.28)";
const HANDLE = "rgba(255,196,64,0.95)";
const CUT_INK = "rgba(228,72,72,0.95)";

/** World to canvas px. `worldToScreen` is the tested inverse pair the catalogue canvas's click-to-centre
 *  runs on, so reusing it is what guarantees the two views agree and not merely resemble. */
function projector(width: number, height: number, view: StudioView) {
	return (x: number, y: number): Pt => {
		const s = worldToScreen(x, y, view.offset, view.zoom, view.rot, view.deform);
		return [width / 2 + s.x, height / 2 + s.y];
	};
}

/**
 * Which lattice copies the viewport can see.
 *
 * Invert the basis at the corners of the rotated extent and take the integer bounding box of the
 * result, padded by the cell's own diameter so a copy whose anchor is offscreen but whose tiles are not
 * still gets drawn. Under a deform the corners are un-deformed first, because the instance grid lives
 * in undeformed world space where the lattice is still a lattice.
 */
export function visibleCopies(
	width: number,
	height: number,
	view: StudioView,
	patch: StudioPatch,
): Lift[] {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const det = t1x * t2y - t1y * t2x;
	if (Math.abs(det) < 1e-12) return [[0, 0]];
	let aLo = Infinity;
	let aHi = -Infinity;
	let bLo = Infinity;
	let bHi = -Infinity;
	// The four canvas corners, carried back to world through the same inverse the hit-tests use. Doing
	// it this way means a rotation or a shear needs no separate reasoning: whatever the transform is,
	// these are the world points at the corners of what is on screen.
	for (const [sx, sy] of [
		[-width / 2, -height / 2],
		[width / 2, -height / 2],
		[-width / 2, height / 2],
		[width / 2, height / 2],
	] as const) {
		const w = screenToWorld(sx, sy, view.offset, view.zoom, view.rot, view.deform);
		const wx = w.x;
		const wy = w.y;
		const a = (wx * t2y - wy * t2x) / det;
		const b = (wy * t1x - wx * t1y) / det;
		if (a < aLo) aLo = a;
		if (a > aHi) aHi = a;
		if (b < bLo) bLo = b;
		if (b > bHi) bHi = b;
	}
	// One cell of padding on every side: the cell's contents need not sit inside the parallelogram its
	// basis spans, so an anchor just offscreen can still own tiles that are not.
	const i0 = Math.floor(aLo) - 1;
	const i1 = Math.ceil(aHi) + 1;
	const j0 = Math.floor(bLo) - 1;
	const j1 = Math.ceil(bHi) + 1;
	const out: Lift[] = [];
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j1; j++) {
			out.push([i, j]);
			if (out.length >= MAX_COPIES) return out;
		}
	}
	return out;
}

/**
 * One face's outline, with any bowed edge flattened into it.
 *
 * `corners` records which points are TRUE corners, which is the contract `RawPolygon.corners` exists
 * for: without it a bowed hexagon would measure as a 96-sided polygon and every consumer that reads a
 * side count (the colour ramp, the median edge, the point dots) would be wrong about it.
 *
 * A ring traverses some of its edges against the canonical direction the bow is stored in, so those get
 * `flipChord`. That flip is the only thing standing between "both tiles draw the same curve" and a
 * visible seam, and it is why the bow is looked up by canonical key and not by ring order.
 */
function faceOutline(
	patch: StudioPatch,
	f: number,
	cell: Lift,
	bows: ReadonlyMap<string, Curve4>,
): { pts: Pt[]; corners: number[] } {
	const ring = patch.rings[f];
	const world = faceRing(patch, f, cell);
	const pts: Pt[] = [];
	const corners: number[] = [];
	for (let i = 0; i < ring.length; i++) {
		const j = (i + 1) % ring.length;
		corners.push(pts.length);
		pts.push(world[i]);
		const [va, ax, ay] = ring[i];
		const [vb, bx, by] = ring[j];
		const canon = canonicalEdge(va, vb, bx - ax, by - ay);
		const bow = bows.get(canon.key);
		if (!bow) continue;
		for (const q of arcInterior(world[i], world[j], canon.flipped ? flipChord(bow) : bow)) {
			pts.push(q);
		}
	}
	return { pts, corners };
}

/**
 * The hue a tile takes from its own SHAPE, keyed on the patch so it is computed once per rebuild.
 *
 * The atlas colours a polygon by its corner count, drifted down the wheel by how far it departs from
 * regular (`polygonFillHue`). Feeding that same function the tile's CORNER-REDUCED outline gives three
 * things: a merged tile takes one colour instead of the several its faces had, congruent tiles take the
 * same colour wherever they are, and (the reason this applies to every component and not only to
 * merged ones) a tile is immune to collinear vertices.
 *
 * That last one was a visible bug. A cut ending at a midpoint splits the edge, and the split is felt by
 * BOTH faces sharing it, so a square next to a cut gained a collinear fifth vertex. `drawPolygons` reads
 * the raw ring, counted five sides, and recoloured the square for no reason a user could see. The
 * corner-reduced outline still has four.
 *
 * `srcAttrs` still wins for a single unedited face, so a star keeps its own ramp and entering the editor
 * repaints nothing. For an unedited face the outline IS its vertex ring, so the two agree anyway.
 */
const shapeHueCache = new WeakMap<StudioPatch, Map<number, number | null>>();

function shapeHue(patch: StudioPatch, comp: number): number | null {
	let byComp = shapeHueCache.get(patch);
	if (!byComp) {
		byComp = new Map();
		shapeHueCache.set(patch, byComp);
	}
	const hit = byComp.get(comp);
	if (hit !== undefined) return hit;
	const outline = componentOutline(patch, comp);
	const out =
		outline && outline.length >= 3
			? polygonFillHue(outline.map((p) => ({ x: p[0], y: p[1] })))
			: null;
	byComp.set(comp, out);
	return out;
}

/**
 * Which quotient edges are INTERIOR to a tile: both their faces belong to one component.
 *
 * Such an edge must not be stroked whatever its `drawn` bit says. It arises the moment a merge drag
 * closes a loop: the drag walks face to face dropping the edge between each pair, and a third edge
 * between two faces it has already joined is left drawn while sitting inside the finished tile. AL hit
 * exactly that as "the last edge inside the block I cannot remove", and it is not removable by the
 * drag, because the drag advances between COMPONENTS and those two faces are already one. Deciding it
 * here is the honest fix: the line is gone because the tile has no inside edges, not because someone
 * found and clicked it.
 */
function interiorEdges(patch: StudioPatch): Set<number> {
	const out = new Set<number>();
	for (let i = 0; i < patch.edges.length; i++) {
		const [vi, vj, dx, dy] = patch.edges[i];
		const a = patch.half.get(halfEdgeKey(vi, vj, dx, dy));
		const b = patch.half.get(halfEdgeKey(vj, vi, -dx, -dy));
		if (!a || !b || a.length === 0 || b.length === 0) continue;
		if (patch.polyComp[a[0].p] === patch.polyComp[b[0].p]) out.add(i);
	}
	return out;
}

/**
 * Single-face tiles, as `RawPolygon`s ready for `drawPolygons`.
 *
 * Merged tiles are NOT here: they are filled by `drawMergedTiles` as one path each. Filling their faces
 * separately, even in one colour, leaves a faint anti-aliasing seam along every shared edge, and a seam
 * is indistinguishable from the edge the merge just removed. One path, nonzero winding, no seams.
 */
function tilePolygons(patch: StudioPatch, copies: readonly Lift[], style: StudioStyle): RawPolygon[] {
	const out: RawPolygon[] = [];
	const fillOf = new Map<number, string>();
	for (const [comp, slot] of style.fills) fillOf.set(comp, slotFill(style.palette, slot, style.dark));
	const curved = style.bows.size > 0;
	for (const cell of copies) {
		for (let f = 0; f < patch.rings.length; f++) {
			const comp = patch.polyComp[f];
			if (patch.compCells[comp] > 1) continue; // drawn as one path by drawMergedTiles
			const fill = fillOf.get(comp);
			// The catalogue's own ramp for an untouched single face, so entering the editor repaints
			// nothing and a star keeps its ramp; anything else takes the hue of its own SHAPE.
			const merged = patch.compCells[comp] > 1;
			const known = merged ? undefined : patch.srcAttrs?.get(ringKey(patch.rings[f]));
			const h = known ? null : shapeHue(patch, comp);
			const src = known ?? (h !== null ? { hue: h } : undefined);
			if (!curved) {
				const ring = faceRing(patch, f, cell);
				if (ring.length < 3) continue;
				out.push({
					n: ring.length,
					vertices: ring.map((p) => ({ x: p[0], y: p[1] })),
					...src,
					...(fill ? { fill } : {}),
				});
				continue;
			}
			const o = faceOutline(patch, f, cell, style.bows);
			if (o.corners.length < 3) continue;
			out.push({
				n: o.corners.length,
				vertices: o.pts.map((p) => ({ x: p[0], y: p[1] })),
				corners: o.corners,
				...src,
				...(fill ? { fill } : {}),
			});
		}
	}
	return out;
}

/**
 * Merged tiles, one path each, in world coordinates under the caller's transform.
 *
 * Every constituent face of the tile becomes a subpath of one `fill()`, so the nonzero winding rule
 * covers their union in a single flat colour with nothing along the edges between them. The colour is
 * the palette slot when the tile is painted and otherwise the tile's own SHAPE hue (`mergedHue`), which
 * is what makes a house pentagon read as a house pentagon and not as the square and triangle it was.
 */
function drawMergedTiles(
	ctx: CanvasRenderingContext2D,
	patch: StudioPatch,
	copies: readonly Lift[],
	style: StudioStyle,
): void {
	const byComp = new Map<number, number[]>();
	for (let f = 0; f < patch.rings.length; f++) {
		const c = patch.polyComp[f];
		if (patch.compCells[c] <= 1) continue;
		const at = byComp.get(c);
		if (at) at.push(f);
		else byComp.set(c, [f]);
	}
	if (byComp.size === 0) return;
	const curved = style.bows.size > 0;
	for (const [comp, faces] of byComp) {
		const slot = style.fills.get(comp);
		const h = shapeHue(patch, comp);
		ctx.fillStyle =
			slot !== undefined
				? slotFill(style.palette, slot, style.dark)
				: h !== null
					? tileFill(h + style.hueOffsetDeg, TILE_FILL_ALPHA)
					: style.dark
						? "rgba(120,120,130,1)"
						: "rgba(200,200,210,1)";
		ctx.beginPath();
		for (const cell of copies) {
			for (const f of faces) {
				const pts = curved
					? faceOutline(patch, f, cell, style.bows).pts
					: faceRing(patch, f, cell);
				if (pts.length < 3) continue;
				ctx.moveTo(pts[0][0], pts[0][1]);
				for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
				ctx.closePath();
			}
		}
		ctx.fill();
	}
}

/** One frame. The caller owns the device-pixel-ratio transform and the canvas size. */
export function drawStudio(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	patch: StudioPatch,
	view: StudioView,
	style: StudioStyle,
	overlay: StudioOverlay,
): void {
	ctx.clearRect(0, 0, width, height);
	const copies = visibleCopies(width, height, view, patch);
	const P = projector(width, height, view);
	ctx.save();

	// --- tiles ---
	// The context carries centre/scale/flip so `drawPolygons` can work in world coordinates, which is
	// the convention every other caller of it uses (renderTilingToContext). Strokes are off here and
	// done per EDGE below, because a merged tile must not be outlined along the edge it merged across.
	// The matrix form of worldToScreen: screen = centre + offset + zoom * R * D * world, with
	// R = [[cos, sin], [sin, -cos]] carrying both the view angle and the y flip. Written as one
	// transform so `drawPolygons` can work in world coordinates the way its other callers do.
	ctx.save();
	const cos = Math.cos(view.rot);
	const sin = Math.sin(view.rot);
	const z = view.zoom;
	ctx.transform(z * cos, z * sin, z * sin, -z * cos, width / 2 + view.offset.x, height / 2 + view.offset.y);
	if (!isIdentityDeform(view.deform)) {
		const [a, b, c, d] = view.deform as Mat2;
		ctx.transform(a, b, c, d, 0, 0);
	}
	drawMergedTiles(ctx, patch, copies, style);
	drawPolygons(ctx, tilePolygons(patch, copies, style), view.zoom, style.hueOffsetDeg, false);
	ctx.restore();

	// --- surviving edges ---
	if (style.lineWidth > 0) {
		const interior = interiorEdges(patch);
		ctx.lineWidth = style.lineWidth;
		// Round caps and joins, not butt. Every edge goes through this one stroke at this one width, so a
		// chord is already the same weight as a tile edge; what butt caps did was leave each segment's
		// ENDS unfilled, and a short diagonal chord is mostly ends, so it read lighter than the long
		// edges around it. Rounding also closes the hairline gap where a split edge's two halves meet.
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.strokeStyle = OK_STROKE(style.dark);
		ctx.beginPath();
		for (const cell of copies) {
			for (let e = 0; e < patch.edges.length; e++) {
				const [vi, vj, dx, dy, drawn] = patch.edges[e];
				// Merged across, or interior to a tile that closed around it: either way the two faces are
				// one tile and a line between them would be a line inside a single shape.
				if (drawn === 0 || interior.has(e)) continue;
				const A = vertexWorld(patch, vi, [cell[0], cell[1]]);
				const B = vertexWorld(patch, vj, [dx + cell[0], dy + cell[1]]);
				const a = P(A[0], A[1]);
				ctx.moveTo(a[0], a[1]);
				// The edges list is already in canonical orientation, so the bow needs no flip here; only
				// a RING traversing it backwards does.
				const bow = style.bows.get(patch.edgeKeys[e]);
				if (bow) {
					for (const q of arcInterior(A, B, bow)) {
						const s = P(q[0], q[1]);
						ctx.lineTo(s[0], s[1]);
					}
				}
				const b = P(B[0], B[1]);
				ctx.lineTo(b[0], b[1]);
			}
		}
		ctx.stroke();
	}

	// --- the period: which one depends on the mode, and one toggle governs both ---
	// Mutually exclusive on purpose. The two overlays are two readings of the same period, and the
	// mode already says which reading is the one an edit repeats under; drawing the basis cell under
	// the group's axes put both answers on screen and neither read as authoritative.
	if (style.showLattice) {
		if (style.periodMode === "wallpaper" && style.symmetry) {
			drawGroupStructure(ctx, patch, copies, P, style.symmetry, style.dark);
		} else {
			drawLatticeCell(ctx, patch, copies, P, style.symmetry, style.dark);
		}
	}

	// --- overlays ---
	if (overlay.hoverFace) {
		// EVERY copy the edit would touch, not just the one under the cursor. An edit is recorded against
		// the quotient, so it lands on every lattice translate at once; showing one of them would promise
		// something narrower than what the click does. AL asked for the preview to say what will change.
		const affected = overlay.affected.size > 0
			? overlay.affected
			: new Set([patch.polyComp[overlay.hoverFace.face]]);
		ctx.fillStyle = HOVER_FILL;
		ctx.beginPath();
		for (const cell of copies) {
			for (let f = 0; f < patch.rings.length; f++) {
				if (!affected.has(patch.polyComp[f])) continue;
				const r = faceRing(patch, f, cell);
				if (r.length < 3) continue;
				const p0 = P(r[0][0], r[0][1]);
				ctx.moveTo(p0[0], p0[1]);
				for (let i = 1; i < r.length; i++) {
					const q = P(r[i][0], r[i][1]);
					ctx.lineTo(q[0], q[1]);
				}
				ctx.closePath();
			}
		}
		ctx.fill();
	}

	if (overlay.hoverEdge) {
		const [vi, vj, dx, dy] = patch.edges[overlay.hoverEdge.index] ?? [];
		if (vi !== undefined) {
			const off = overlay.hoverEdge.off;
			const A = vertexWorld(patch, vi, [off[0], off[1]]);
			const B = vertexWorld(patch, vj, [dx + off[0], dy + off[1]]);
			const a = P(A[0], A[1]);
			const b = P(B[0], B[1]);
			ctx.strokeStyle = HANDLE;
			ctx.lineWidth = Math.max(2.5, style.lineWidth * 2.5);
			ctx.beginPath();
			ctx.moveTo(a[0], a[1]);
			ctx.lineTo(b[0], b[1]);
			ctx.stroke();
		}
	}

	if (style.showPoints || overlay.tool === "cut") {
		drawSnapPoints(ctx, patch, copies, overlay.points, P, style.dark);
	}

	if (overlay.tool === "move") drawVertexHandles(ctx, patch, copies, P, overlay.hoverVertex);

	if (overlay.cutPath.length > 0) drawCutPath(ctx, overlay, P);
	if (overlay.snap) drawSnapTarget(ctx, overlay.snap, P, style.dark);
	if (overlay.notice && overlay.cursor) {
		drawNotice(ctx, overlay.notice, P(overlay.cursor[0], overlay.cursor[1]), width, style.dark);
	}

	ctx.restore();
}

/** World position of vertex class `vi` in lattice cell `off`. Local twin of `snap.vertexAt`, kept here
 *  so the draw loop does not pay a cross-module call per edge per copy. */
function vertexWorld(patch: StudioPatch, vi: number, off: Lift): Pt {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const v = patch.verts[vi];
	return [v[0] + off[0] * t1x + off[1] * t2x, v[1] + off[0] * t1y + off[1] * t2y];
}

/** The fundamental cell solid, its translates dashed. Same reading as the freedraw and Colorings
 *  period-lattice overlays: this one cell, stamped out. */
function drawLatticeCell(
	ctx: CanvasRenderingContext2D,
	patch: StudioPatch,
	copies: readonly Lift[],
	P: (x: number, y: number) => Pt,
	sym: SymmetryData | null,
	dark: boolean,
): void {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	// A CORNER on the group's own anchor. `SymmetryData.cellOrigin` is the fundamental domain's
	// kaleidoscope point, so putting a cell corner there puts every lattice vertex on a rotation centre,
	// which is the point of the tiling the period is legible from. Drawn off the patch origin, the
	// corners landed half a period away, between two triangles: measured on ctrnact-star-k5-n0082, the
	// anchored cell's three horizontal lines all fall on group mirrors and all three cut through a star
	// interior, while the unanchored position touched no star at all. A whole-lattice part of the offset
	// never shows, since the overlay is stamped across every visible copy anyway.
	const ax = sym ? sym.cellOrigin.x : 0;
	const ay = sym ? sym.cellOrigin.y : 0;
	const corners: Pt[] = [
		[ax, ay],
		[ax + t1x, ay + t1y],
		[ax + t1x + t2x, ay + t1y + t2y],
		[ax + t2x, ay + t2y],
	];
	ctx.save();
	for (const [i, j] of copies) {
		const ox = i * t1x + j * t2x;
		const oy = i * t1y + j * t2y;
		const home = i === 0 && j === 0;
		ctx.setLineDash(home ? [] : [5, 4]);
		ctx.lineWidth = home ? 1.75 : 1;
		ctx.strokeStyle = dark ? "rgba(255,120,150,0.75)" : "rgba(190,30,70,0.6)";
		ctx.beginPath();
		const p0 = P(corners[0][0] + ox, corners[0][1] + oy);
		ctx.moveTo(p0[0], p0[1]);
		for (let k = 1; k < 4; k++) {
			const p = P(corners[k][0] + ox, corners[k][1] + oy);
			ctx.lineTo(p[0], p[1]);
		}
		ctx.closePath();
		ctx.stroke();
		if (home) {
			ctx.fillStyle = dark ? "rgba(255,120,150,0.10)" : "rgba(190,30,70,0.07)";
			ctx.fill();
		}
	}
	ctx.restore();
}

/**
 * The wallpaper group's own structure: the mirror and glide axes, the rotation centres, and the
 * fundamental domain's subdivision of the home cell.
 *
 * `SymmetryData` already carries all of it, computed by `analyzeSymmetry`. Redrawn here instead of
 * reused because lib/render/symmetryOverlay.ts is a p5 path and this is a 2-D context, and because
 * under this mode the structure is not decoration: it is the map of what one edit is about to change.
 *
 * EVERYTHING IS DEDUPED BY LINE, and that is the whole difficulty. `sym.axes` already describes the
 * group's axes, so replicating each one across every visible lattice copy redraws the SAME infinite
 * line dozens of times and buries the tiling under a mesh (measured: unreadable at four copies a side).
 * An axis is keyed by its direction folded to a half turn plus its signed distance from the origin, so
 * each distinct line is stroked once however many copies land on it. `drawSymmetryElements` dedupes and
 * caps for the same reason.
 */
function drawGroupStructure(
	ctx: CanvasRenderingContext2D,
	patch: StudioPatch,
	copies: readonly Lift[],
	P: (x: number, y: number) => Pt,
	sym: SymmetryData,
	dark: boolean,
): void {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const ink = dark ? "rgba(150,205,255,0.55)" : "rgba(30,95,185,0.5)";
	const tol = Math.max(1e-9, patch.medianEdge * 1e-3);
	ctx.save();

	// The subdivision, on the HOME cell only. It says how the point group cuts one period, which is the
	// thing worth seeing; tiling it across the view adds no information and a great deal of ink.
	if (sym.subdivision && sym.subdivision.length > 1) {
		ctx.strokeStyle = dark ? "rgba(150,205,255,0.5)" : "rgba(30,95,185,0.45)";
		ctx.lineWidth = 1;
		for (const copy of sym.subdivision) {
			if (copy.length < 3) continue;
			ctx.beginPath();
			const p0 = P(copy[0].x, copy[0].y);
			ctx.moveTo(p0[0], p0[1]);
			for (let k = 1; k < copy.length; k++) {
				const q = P(copy[k].x, copy[k].y);
				ctx.lineTo(q[0], q[1]);
			}
			ctx.closePath();
			ctx.stroke();
		}
	}

	// Too small a cell on screen and every line and dot below merges into a mesh: stop at the subdivision.
	const o = P(0, 0);
	const e1 = P(t1x, t1y);
	const e2 = P(t2x, t2y);
	const cellPx2 = Math.abs((e1[0] - o[0]) * (e2[1] - o[1]) - (e1[1] - o[1]) * (e2[0] - o[0]));
	if (cellPx2 < MIN_STRUCTURE_CELL_PX2) {
		ctx.restore();
		return;
	}

	// Axes: one stroke per DISTINCT line, across the whole visible extent, because a mirror does not
	// stop at a cell boundary and drawing it as a segment would misread the group. Every anchor lies in
	// the copy grid, so the grid's own diameter reaches past the far edge from any of them.
	let iLo = Infinity, iHi = -Infinity, jLo = Infinity, jHi = -Infinity;
	for (const [i, j] of copies) {
		if (i < iLo) iLo = i;
		if (i > iHi) iHi = i;
		if (j < jLo) jLo = j;
		if (j > jHi) jHi = j;
	}
	const span = Math.hypot(t1x, t1y) * (iHi - iLo + 2) + Math.hypot(t2x, t2y) * (jHi - jLo + 2);
	const seen = new Set<string>();
	ctx.lineWidth = 1;
	for (const axis of sym.axes ?? []) {
		const len = Math.hypot(axis.d.x, axis.d.y) || 1;
		let ux = axis.d.x / len;
		let uy = axis.d.y / len;
		// Fold the direction to a half turn so a line and its reverse key alike.
		if (uy < -tol || (Math.abs(uy) <= tol && ux < 0)) {
			ux = -ux;
			uy = -uy;
		}
		ctx.strokeStyle = ink;
		ctx.setLineDash(axis.kind === "glide" ? [5, 4] : []);
		for (const [i, j] of copies) {
			const ox = axis.p.x + i * t1x + j * t2x;
			const oy = axis.p.y + i * t1y + j * t2y;
			// Signed distance from the origin along the normal: the line's identity, given the direction.
			const dist = ox * -uy + oy * ux;
			const key = `${axis.kind}:${ux.toFixed(4)},${uy.toFixed(4)},${(dist / tol).toFixed(0)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const a = P(ox - ux * span, oy - uy * span);
			const b = P(ox + ux * span, oy + uy * span);
			ctx.beginPath();
			ctx.moveTo(a[0], a[1]);
			ctx.lineTo(b[0], b[1]);
			ctx.stroke();
		}
	}
	ctx.setLineDash([]);

	// Rotation centres, sized by order so a 6-fold reads as more than a 2-fold, deduped by position.
	ctx.fillStyle = ink;
	const dots = new Set<string>();
	for (const c of sym.centers ?? []) {
		const r = 1.5 + c.order * 0.45;
		for (const [i, j] of copies) {
			const x = c.z.x + i * t1x + j * t2x;
			const y = c.z.y + i * t1y + j * t2y;
			const key = `${(x / tol).toFixed(0)},${(y / tol).toFixed(0)}`;
			if (dots.has(key)) continue;
			dots.add(key);
			const p = P(x, y);
			ctx.beginPath();
			ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();
}

/** Construction-point dots, in the red / green / blue convention `showPolygonPoints` uses for
 *  centroid / midpoint / vertex, so the same point family reads the same colour in both places. */
function drawSnapPoints(
	ctx: CanvasRenderingContext2D,
	patch: StudioPatch,
	copies: readonly Lift[],
	points: readonly ConstructionPoint[],
	P: (x: number, y: number) => Pt,
	dark: boolean,
): void {
	const [t1x, t1y] = patch.T1;
	const [t2x, t2y] = patch.T2;
	const colour = { centroid: "#e04848", midpoint: "#3fa84b", vertex: "#3f6fe0" } as const;
	ctx.save();
	ctx.lineWidth = 1;
	ctx.strokeStyle = dark ? "rgba(10,10,14,0.8)" : "rgba(255,255,255,0.85)";
	for (const [i, j] of copies) {
		const ox = i * t1x + j * t2x;
		const oy = i * t1y + j * t2y;
		for (const pt of points) {
			const s = P(pt.at[0] + ox, pt.at[1] + oy);
			ctx.fillStyle = colour[pt.kind];
			ctx.beginPath();
			ctx.arc(s[0], s[1], 2.6, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
	}
	ctx.restore();
}

/** Grab handles on every vertex, with the one under the cursor enlarged. */
function drawVertexHandles(
	ctx: CanvasRenderingContext2D,
	patch: StudioPatch,
	copies: readonly Lift[],
	P: (x: number, y: number) => Pt,
	hover: { vi: number; off: Lift } | null,
): void {
	ctx.save();
	ctx.strokeStyle = "rgba(20,20,26,0.9)";
	ctx.lineWidth = 1;
	for (const [i, j] of copies) {
		for (let vi = 0; vi < patch.verts.length; vi++) {
			const w = vertexWorld(patch, vi, [i, j]);
			const s = P(w[0], w[1]);
			const on = hover && hover.vi === vi;
			ctx.fillStyle = on ? HANDLE : "rgba(255,255,255,0.85)";
			ctx.beginPath();
			ctx.arc(s[0], s[1], on ? 5 : 3.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
	}
	ctx.restore();
}

/**
 * The point a click would snap to: a filled dot in its family's colour inside a bright ring.
 *
 * The ring is the whole indicator, and it carries "close enough": it appears the moment the cursor
 * enters snapping range and sits on the point that will be taken, not on the cursor. No label: the
 * `c` / `h` / `v` name answers a question nobody asked while drawing, and reads as clutter over the
 * tiling (AL, 2026-09-21).
 */
function drawSnapTarget(
	ctx: CanvasRenderingContext2D,
	snap: ConstructionPoint,
	P: (x: number, y: number) => Pt,
	dark: boolean,
): void {
	const colour = { centroid: "#e04848", midpoint: "#3fa84b", vertex: "#3f6fe0" } as const;
	const s = P(snap.at[0], snap.at[1]);
	ctx.save();
	ctx.beginPath();
	ctx.arc(s[0], s[1], 8, 0, Math.PI * 2);
	ctx.strokeStyle = HANDLE;
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(s[0], s[1], 4, 0, Math.PI * 2);
	ctx.fillStyle = colour[snap.kind];
	ctx.fill();
	ctx.strokeStyle = dark ? "rgba(10,10,14,0.9)" : "rgba(255,255,255,0.95)";
	ctx.lineWidth = 1.25;
	ctx.stroke();
	ctx.restore();
}

/** A refusal, beside the cursor: a rounded plate with the reason on it, clamped to stay on canvas. */
function drawNotice(
	ctx: CanvasRenderingContext2D,
	text: string,
	at: Pt,
	width: number,
	dark: boolean,
): void {
	ctx.save();
	ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
	ctx.textBaseline = "middle";
	const padX = 8;
	const w = ctx.measureText(text).width + padX * 2;
	const h = 22;
	const x = Math.max(6, Math.min(width - w - 6, at[0] + 14));
	const y = at[1] - 24;
	ctx.fillStyle = dark ? "rgba(70,20,24,0.94)" : "rgba(180,40,44,0.94)";
	ctx.beginPath();
	// A hand-rolled rounded rect: roundRect is not in every engine this renders on.
	const r = 5;
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "rgba(255,244,244,1)";
	ctx.fillText(text, x + padX, y + h / 2);
	ctx.restore();
}

/** The cut being drawn: the committed points solid, the segment to the cursor dashed, because that
 *  last leg is a proposal and has not been accepted by `canExtendCut` yet. */
function drawCutPath(
	ctx: CanvasRenderingContext2D,
	overlay: StudioOverlay,
	P: (x: number, y: number) => Pt,
): void {
	ctx.save();
	ctx.strokeStyle = CUT_INK;
	ctx.lineWidth = 2;
	ctx.beginPath();
	const first = P(overlay.cutPath[0][0], overlay.cutPath[0][1]);
	ctx.moveTo(first[0], first[1]);
	for (let i = 1; i < overlay.cutPath.length; i++) {
		const p = P(overlay.cutPath[i][0], overlay.cutPath[i][1]);
		ctx.lineTo(p[0], p[1]);
	}
	ctx.stroke();
	if (overlay.cursor) {
		const last = overlay.cutPath[overlay.cutPath.length - 1];
		const a = P(last[0], last[1]);
		const b = P(overlay.cursor[0], overlay.cursor[1]);
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}
	ctx.restore();
}
