/**
 * Geometry for the isohedral shelf: parameters and edge curves in, drawable polygons out.
 *
 * Pure and DOM-free so it can be unit tested directly. The only thing it borrows from the app is
 * `polygonHue`, so an isohedral tile is tinted on the same by-side-count ramp as every other tile in
 * the atlas.
 *
 * How Tactile works, since the arithmetic below assumes it: the parameter vector is augmented with a
 * trailing 1, and every tiling vertex, lattice translation and aspect matrix is a dot product of that
 * vector with its own coefficient slice. So changing a parameter is cheap, and every tile in the
 * plane is an affine image of ONE prototile. We exploit that: the outline is built once in tile-local
 * coordinates and then pushed through each tile's 2x3 matrix, so a patch costs one matrix-vector
 * product per vertex and no curve evaluation at all.
 */

import { EdgeShape, IsohedralTiling, mul } from "./vendor/tactile";
import type { TactileMatrix, TactilePoint } from "./vendor/tactile";
import { polygonHue, type RawPolygon } from "@/lib/utils/renderTiling";
import type { CellMesh } from "@/lib/render/buildCellMesh";
import { cubicAt, cubicFlatness, cubicSegmentCount, flattenCubicOpen, type Cubic } from "@/lib/render/cubic";
import { buildIsohedralCellMesh } from "./cellMesh";
import { buildMarkedCell } from "./marked";
import { isohedralType, kindOf, type EdgeKind } from "./catalogue";

/**
 * Cubic Bézier control points for one edge shape, in Tactile's canonical frame: the edge runs from
 * (0,0) to (1,0) and these are the two interior control points. Null for an I edge, which is forced
 * straight and has no freedom at all.
 */
export interface EdgeCurve {
	a: TactilePoint;
	b: TactilePoint;
}

/** One entry per DISTINCT edge shape (`numEdgeShapes`), not per boundary edge. */
export type EdgeCurves = (EdgeCurve | null)[];

/**
 * The single control the sidebar exposes per edge shape: how far the edge bows off its chord. Kept to
 * one number because the constraint, not the freedom, is the thing worth showing — see `curveFromBulge`.
 */
export const BULGE = { min: -0.5, max: 0.5, step: 0.01, def: 0 } as const;

/**
 * How many lattice periods fill the short side of the view at home.
 *
 * A constant, not a control. The tiling is instanced over its lattice in the shader and has no edge,
 * so this only decides where the view STARTS: the zoom you land on when you pick a type, and the one
 * right-click returns to. The wheel owns zoom from there.
 *
 * It was briefly a slider, which was worse than useless: it duplicated the wheel, and because changing
 * it refits the view, dragging it teleported the camera back to home after you had zoomed somewhere.
 * `buildCell` still takes `periods` so the framing stays testable.
 */
export const HOME_PERIODS = 8;

/**
 * Flattening budget for the edge curves.
 *
 * The fill has to reach the GPU as triangles — FlatCellRenderer has no curve primitive — so a curved
 * edge is always a polyline, and lib/render/cubic.ts is the closed form saying how fine that polyline
 * has to be. What is decided HERE is the target it is held to.
 *
 * The target is in SCREEN pixels, so the count also follows the zoom. That is the part a fixed count
 * cannot do: the mesh is uploaded once and instanced at any magnification, so a world-space budget is
 * one that eventually gets zoomed past — which is exactly the faceting AL saw.
 */
export const FLATNESS_TOL_PX = 0.25;

/**
 * Hard cap per tiling edge.
 *
 * Measured over all 81 types with every edge bowed to the slider's limit and the cap forced on every
 * edge — worst-case cell rebuild, and worst-case buffers:
 *
 *     cap   32 → 1.9 ms,  2.0 MB
 *     cap   64 → 1.3 ms,  3.9 MB
 *     cap  128 → 2.9 ms,  7.9 MB
 *     cap  256 → 8.2 ms, 15.8 MB
 *
 * 128 is the last rung before the cost bends: it holds a quarter-pixel error out past 100× the home
 * zoom, and the 2.9 ms is only paid when you are both that deep AND dragging a slider — at home the
 * adaptive rule asks for 10 to 26 segments and the cap never binds.
 *
 * Those numbers are only affordable because lib/isohedral/cellMesh.ts triangulates the prototile once
 * and reuses the index list across the cell; per polygon, cap 256 costs 218 ms instead of 8.
 */
export const MAX_EDGE_SEGMENTS = 128;

/** Segments per curved edge for the self-overlap check, which does not need the drawing resolution. */
const DEGENERACY_SEGMENTS = 8;

/** Hue steps between the three colour classes `getColour` hands out, in degrees. */
const COLOUR_OFFSETS = [0, 40, 80];

const EPS = 1e-9;

const P0: TactilePoint = { x: 0, y: 0 };
const P1: TactilePoint = { x: 1, y: 0 };

/**
 * An edge's state: WHAT shape it has, and HOW FAR it bows.
 *
 * The split exists so the slider round-trips. The obvious design — one slider that rebuilds the
 * control points from scratch — silently destroys a randomized edge the first time you touch it,
 * because Randomize varies the control points' x as well as their y and a single number cannot carry
 * that back. Nudging a slider and returning it then landed on a different tiling than it started on.
 *
 * Here the slider only scales `base`'s y values, so the shape is preserved exactly and moving the
 * control away and back is an identity. Scaling y is also symmetry-safe: S's b = (1−a.x, −a.y) and U's
 * b = (1−a.x, a.y) both survive multiplying every y by the same number.
 */
export interface EdgeShapeState {
	kind: EdgeKind;
	/**
	 * Unit-amplitude control points, y normalised so the dominant one is exactly +1 — signed, so which
	 * way the edge bows is `amount`'s business and the template only holds the shape. Null for an I
	 * edge, which is forced straight and has no shape to hold.
	 */
	base: EdgeCurve | null;
	/**
	 * What the slider sets, sign included. The drawn curve is `base` with both y values multiplied by
	 * this, so a negative amplitude is the same shape bowing the other way.
	 */
	amount: number;
}

/**
 * The canonical symmetric bow, each family inside its own constraint so dragging the slider
 * demonstrates the constraint instead of violating it:
 *
 *   S — 180° about the midpoint, so b = (1 − a.x, −a.y): the edge bows one way then the other.
 *   U — mirror across the perpendicular bisector, so b = (1 − a.x, a.y): a symmetric bow.
 *   J — unconstrained, so the symmetric bow is legal here too. `randomEdgeStates` is what shows J's
 *       actual freedom; one number cannot.
 *   I — forced straight. No control points exist to return.
 */
export function canonicalBase(kind: EdgeKind): EdgeCurve | null {
	if (kind === "I") return null;
	if (kind === "S") return { a: { x: 0.25, y: 1 }, b: { x: 0.75, y: -1 } };
	return { a: { x: 0.25, y: 1 }, b: { x: 0.75, y: 1 } };
}

/**
 * Snap an amplitude onto the slider's step grid.
 *
 * Anything that sets an amplitude from outside the slider has to go through this, or the control shows
 * a rounded value while the state holds an unrounded one, and the first drag writes the rounded value
 * back — a jump the reader did not ask for, before the thumb has moved.
 */
export function quantizeAmount(amount: number): number {
	// Round the product too. `Math.round(0.3137 / 0.01) * 0.01` is 0.31000000000000005, which is a
	// different double from the 0.31 the DOM parses out of the input's value string, so the mismatch
	// this function exists to remove would survive it.
	return Number((Math.round(amount / BULGE.step) * BULGE.step).toFixed(4));
}

/** Every edge straight: the canonical shape at zero amplitude. */
export function defaultEdgeStates(edgeShapes: EdgeKind[]): EdgeShapeState[] {
	return edgeShapes.map((kind) => ({ kind, base: canonicalBase(kind), amount: 0 }));
}

/**
 * Random control points that respect each edge's symmetry, following `demo/minimaldemo.js`, then split
 * into template and amplitude. Unlike the slider this gives J edges two independent control points,
 * which is the only place the page shows what J being unconstrained actually buys.
 *
 * The normalisation is exact: `base` times `amount` reproduces the control points drawn here, so
 * Randomize's result is what you see and the slider then starts from it.
 */
export function randomEdgeStates(
	edgeShapes: EdgeKind[],
	rnd: () => number = Math.random,
): EdgeShapeState[] {
	return edgeShapes.map((kind) => {
		if (kind === "I") return { kind, base: null, amount: 0 };

		const a = { x: rnd() * 0.6, y: rnd() - 0.5 };
		let curve: EdgeCurve;
		if (kind === "J") curve = { a, b: { x: rnd() * 0.6 + 0.4, y: rnd() - 0.5 } };
		else if (kind === "S") curve = { a, b: { x: 1 - a.x, y: -a.y } };
		else curve = { a, b: { x: 1 - a.x, y: a.y } }; // U

		// Divide by the dominant y WITH its sign, not by its magnitude. Normalising by |y| left every
		// amplitude positive: the bow's direction went into the template, so Randomize could only ever
		// park a thumb in the right half of a track that runs [-0.5, 0.5], and half the control looked
		// unreachable. The drawn curve is identical either way — this is about what the slider reads.
		const lead = Math.abs(curve.a.y) >= Math.abs(curve.b.y) ? curve.a.y : curve.b.y;
		// A curve that came out flat has no direction to normalise; fall back to the canonical template
		// so the slider still has something to scale.
		if (Math.abs(lead) < EPS) return { kind, base: canonicalBase(kind), amount: 0 };

		return {
			kind,
			base: {
				a: { x: curve.a.x, y: curve.a.y / lead },
				b: { x: curve.b.x, y: curve.b.y / lead },
			},
			// Quantized onto the slider's own grid, and never below one step in magnitude.
			//
			// Without this the amplitude is a full-precision random number the slider cannot represent:
			// the control shows the rounded value, and the first drag writes that rounded value back,
			// so touching the slider at all nudged the tiling before it moved. Randomize now lands on a
			// value the slider can hold exactly, and picking it up changes nothing until it moves.
			amount: Math.sign(lead) * Math.max(BULGE.step, Math.abs(quantizeAmount(lead))),
		};
	});
}

/** Set one edge's amplitude, leaving its shape and every other edge alone. */
export function setEdgeAmount(
	states: EdgeShapeState[],
	index: number,
	amount: number,
): EdgeShapeState[] {
	return states.map((s, i) => (i === index ? { ...s, amount } : s));
}

/** The control points the outline builder consumes. */
export function curvesOf(states: EdgeShapeState[]): EdgeCurves {
	return states.map((s) =>
		s.base === null
			? null
			: {
					a: { x: s.base.a.x, y: s.base.a.y * s.amount },
					b: { x: s.base.b.x, y: s.base.b.y * s.amount },
				},
	);
}

export function straightCurves(edgeShapes: EdgeKind[]): EdgeCurves {
	return curvesOf(defaultEdgeStates(edgeShapes));
}

/**
 * max|Δ²P| over the cubic's two second differences, in units of the edge's chord.
 *
 * The canonical edge runs (0,0) → (1,0), so this is dimensionless and scales with whatever chord the
 * edge is mapped onto. Zero exactly when the control points sit on the chord at the thirds, which is
 * the straight line.
 */
export function flatness(curve: EdgeCurve): number {
	return cubicFlatness([P0, curve.a, curve.b, P1]);
}

/**
 * Segments needed to hold the flattening error under `tolPx` on screen.
 *
 * `chordPx` is the edge's chord length in screen pixels, which is what turns the dimensionless
 * canonical-frame flatness into a pixel one — the `scale` argument the shared rule takes.
 */
export function segmentsForEdge(
	curve: EdgeCurve,
	chordPx: number,
	tolPx: number = FLATNESS_TOL_PX,
	max: number = MAX_EDGE_SEGMENTS,
): number {
	return cubicSegmentCount(flatness(curve), chordPx, tolPx, max);
}

/**
 * How finely to flatten the edge curves.
 *
 * `pxPerWorld` is the view's zoom (screen px per world unit); with it, each edge's own chord length
 * decides its own segment count, so a short edge and a long one on the same tile are held to the same
 * on-screen error instead of the same segment count.
 *
 * Omit `pxPerWorld` and every curved edge gets `segments` (default 8) — what the degeneracy check and
 * the tests want, since neither is drawing anything.
 */
export interface OutlineOptions {
	pxPerWorld?: number;
	tolPx?: number;
	maxSegments?: number;
	/** Fixed count per curved edge, used when `pxPerWorld` is absent. */
	segments?: number;
}

/**
 * The prototile boundary in tile-local coordinates, walked edge by edge.
 *
 * Each edge emits its start point and, when curved, the points along the way, but never its endpoint:
 * the next edge's start IS that endpoint, so the outline closes with no duplicate vertex. That matters
 * for the ear clipper, which treats a repeated vertex as a zero-area ear.
 *
 * `rev` is applied AFTER the edge transform, as Tactile's own demos do — reversing the control points
 * first and then transforming gives a different curve.
 */
export function prototileOutline(
	tiling: IsohedralTiling,
	curves: EdgeCurves,
	opts: OutlineOptions = {},
): TactilePoint[] {
	const out: TactilePoint[] = [];
	const verts = tiling.vertices();
	const nv = verts.length;
	const fixed = Math.max(1, opts.segments ?? DEGENERACY_SEGMENTS);

	let idx = 0;
	for (const edge of tiling.shape()) {
		const curve = edge.shape === EdgeShape.I ? null : (curves[edge.id] ?? null);
		const flat = !curve || (Math.abs(curve.a.y) < EPS && Math.abs(curve.b.y) < EPS);

		const seg: TactilePoint[] = flat
			? [mul(edge.T, P0), mul(edge.T, P1)]
			: [mul(edge.T, P0), mul(edge.T, curve.a), mul(edge.T, curve.b), mul(edge.T, P1)];

		if (edge.rev) seg.reverse();

		if (seg.length === 2) {
			out.push(seg[0]);
		} else {
			// matchSeg maps the unit-length canonical edge onto this chord, so the chord length IS the
			// scale the flattening bound needs.
			const p = verts[idx];
			const q = verts[(idx + 1) % nv];
			const n =
				opts.pxPerWorld && opts.pxPerWorld > 0
					? segmentsForEdge(
							curve!,
							Math.hypot(q.x - p.x, q.y - p.y) * opts.pxPerWorld,
							opts.tolPx,
							opts.maxSegments,
						)
					: fixed;
			flattenCubicOpen(seg as unknown as Cubic, n, out);
		}
		idx++;
	}

	return out;
}

/**
 * One boundary edge of the prototile, in `tilingVertices` order: edge i runs from vertex i to i+1.
 *
 * This is what a preview needs and `prototileOutline` throws away — the outline is one flat point list,
 * so nothing downstream can say which stretch of it is edge `b`. Cheap to keep: at most six entries.
 */
export interface PrototileEdge {
	/** Which of the type's distinct curves draws this edge; `edgeShapes[id]` is its kind. */
	id: number;
	kind: EdgeKind;
	/** True when the curve is traversed backwards here — the uppercase letters of `edgeWord`. */
	rev: boolean;
	/** The chord: tiling vertex `i` and vertex `i+1`. */
	from: TactilePoint;
	to: TactilePoint;
	/** A point ON the drawn edge, at the curve's parameter midpoint. Where a label or a mark goes. */
	mid: TactilePoint;
}

/**
 * The boundary edges of the prototile, named and located, in the same order as `tiling.vertices()`.
 *
 * `rev` is not applied to `mid`: a Bézier is symmetric under reversing its control points, so t = 0.5
 * lands on the same point either way.
 */
export function prototileEdges(tiling: IsohedralTiling, curves: EdgeCurves): PrototileEdge[] {
	const verts = tiling.vertices();
	const nv = verts.length;
	const out: PrototileEdge[] = [];

	let idx = 0;
	for (const edge of tiling.shape()) {
		const curve = edge.shape === EdgeShape.I ? null : (curves[edge.id] ?? null);
		const flat = !curve || (Math.abs(curve.a.y) < EPS && Math.abs(curve.b.y) < EPS);
		const from = verts[idx];
		const to = verts[(idx + 1) % nv];
		out.push({
			id: edge.id,
			kind: kindOf(edge.shape),
			rev: edge.rev,
			from,
			to,
			mid: flat
				? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
				: cubicAt(
						[mul(edge.T, P0), mul(edge.T, curve.a), mul(edge.T, curve.b), mul(edge.T, P1)] as Cubic,
						0.5,
					),
		});
		idx++;
	}

	return out;
}

/** Apply a Tactile 2x3 matrix to every point of an outline. The hot loop of `buildPatch`. */
function transformOutline(T: TactileMatrix, outline: TactilePoint[]): TactilePoint[] {
	const [a, b, c, d, e, f] = T;
	const out = new Array<TactilePoint>(outline.length);
	for (let i = 0; i < outline.length; ++i) {
		const p = outline[i];
		out[i] = { x: a * p.x + b * p.y + c, y: d * p.x + e * p.y + f };
	}
	return out;
}

function segmentsCross(
	p1: TactilePoint,
	p2: TactilePoint,
	p3: TactilePoint,
	p4: TactilePoint,
): boolean {
	const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
	if (Math.abs(d) < 1e-12) return false; // parallel or degenerate: not a transversal crossing
	const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
	const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
	const lo = 1e-9;
	const hi = 1 - 1e-9;
	return t > lo && t < hi && u > lo && u < hi;
}

/**
 * Whether an outline is a simple polygon. Tactile ships defaults but no parameter ranges, and the
 * reference editor lets every parameter run over [0, 2] with no validity check, so a slider CAN be
 * dragged into a self-overlapping tile. Ear clipping produces nonsense there without crashing, so
 * this is a readout for the sidebar and not a gate on drawing.
 *
 * O(n²) over at most 6 × EDGE_SAMPLES points, which is nothing next to building the patch.
 */
export function isSimple(outline: TactilePoint[]): boolean {
	const n = outline.length;
	if (n < 4) return true;
	for (let i = 0; i < n; ++i) {
		const a1 = outline[i];
		const a2 = outline[(i + 1) % n];
		for (let j = i + 1; j < n; ++j) {
			// Skip adjacent segments: they legitimately share an endpoint.
			if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue;
			if (segmentsCross(a1, a2, outline[j], outline[(j + 1) % n])) return false;
		}
	}
	return true;
}

export interface CellRequest {
	ih: number;
	/** Length must equal the type's `numParameters()`. */
	params: number[];
	/** Length must equal the type's `numEdgeShapes()`. */
	curves: EdgeCurves;
	periods?: number;
	/**
	 * Screen pixels per world unit, i.e. the view's zoom. Drives how finely the edge curves are
	 * flattened, per edge, from each one's own chord length. Omit it and the outline falls back to a
	 * fixed low count — right for a test or a headless build, wrong for anything on screen.
	 */
	pxPerWorld?: number;
	/** Overrides for the flattening budget; see FLATNESS_TOL_PX and MAX_EDGE_SEGMENTS. */
	tolPx?: number;
	maxSegments?: number;
}

export interface IsohedralCell {
	/** The translational unit cell's tiles, in world coordinates. Repeats under `v1`, `v2`. */
	polygons: RawPolygon[];
	/** Triangulated and ready for FlatCellRenderer.uploadMesh. */
	mesh: CellMesh;
	/** The cell's own lattice, which is `numColours` times Tactile's — see `buildCell`. */
	v1: [number, number];
	v2: [number, number];
	/** The prototile outline in tile-local coordinates, for previews. */
	prototile: TactilePoint[];
	/** The 3 to 6 tiling vertices, before any edge curvature. */
	tilingVertices: TactilePoint[];
	/** The boundary edges, named and located, in `tilingVertices` order. For previews. */
	edges: PrototileEdge[];
	/** Tactile's own translations, which is what the sidebar should report. */
	t1: TactilePoint;
	t2: TactilePoint;
	/** √|det(T1, T2)|: the linear size of one lattice cell, the unit `periods` counts. */
	period: number;
	/**
	 * The box the view frames at home, centred on the origin. Only sets the starting zoom; the tiling
	 * itself is unbounded. Derived from the request and not from the tiles, so it holds still while a
	 * parameter slider moves.
	 */
	home: { cx: number; cy: number; width: number; height: number };
	/** Tiles in the unit cell: `numColours²` lattice cells times `numAspects`. */
	tilesPerCell: number;
	/** True when the parameters fold the prototile over itself. */
	degenerate: boolean;
}

/**
 * Build the tiling instance for a type, validating parameter length.
 *
 * Upstream `setParameters` silently ignores a wrong-length array and leaves the previous geometry in
 * place, which turns an off-by-one into a plausible-looking wrong picture. Throw instead.
 */
export function makeTiling(ih: number, params: number[]): IsohedralTiling {
	const tiling = new IsohedralTiling(ih);
	const expected = tiling.numParameters();
	if (params.length !== expected) {
		throw new Error(`IH${ih} takes ${expected} parameters, got ${params.length}`);
	}
	if (expected > 0) tiling.setParameters(params);
	return tiling;
}

/**
 * Build the translational unit cell of an isohedral tiling, ready to be instanced over its lattice.
 *
 * The cell is `nc × nc` of Tactile's lattice cells, not one, where `nc` is the type's colour count.
 * Tactile's own repeat unit is a single lattice cell carrying one copy of each aspect, but the
 * three-colouring is NOT that periodic: `getColour(a, b, aspect)` reduces a and b mod nc, so the
 * colours only repeat every nc steps in each direction. A one-cell mesh would therefore tile the plane
 * correctly and colour it wrong, with the same colour on tiles that share an edge. Taking the nc × nc
 * supercell and the lattice `nc·T1, nc·T2` makes the mesh exactly periodic in geometry AND colour, at
 * a cost of at most 9 × 12 = 108 tiles in the cell.
 *
 * A period is measured as √|det(T1, T2)|, the linear size of one lattice cell. Sizing off the
 * translation vectors' lengths instead would make "eight periods" frame wildly different amounts of a
 * skewed lattice than of a square one.
 *
 * Returns null for the twelve marked types, which have no boundary geometry to build.
 */
export function buildCell(req: CellRequest): IsohedralCell | null {
	const info = isohedralType(req.ih);
	if (!info || !info.available) return null;

	const periods = req.periods ?? HOME_PERIODS;
	const tiling = makeTiling(req.ih, req.params);
	const outline = prototileOutline(tiling, req.curves, {
		pxPerWorld: req.pxPerWorld,
		tolPx: req.tolPx,
		maxSegments: req.maxSegments,
	});
	// Whether the prototile folds over itself is a property of the shape, not of how finely it is drawn,
	// so the O(n²) check runs on a coarse outline instead of a 400-vertex drawing one.
	const coarse = prototileOutline(tiling, req.curves, { segments: DEGENERACY_SEGMENTS });

	const t1 = tiling.getT1();
	const t2 = tiling.getT2();
	const period = Math.sqrt(Math.abs(t1.x * t2.y - t1.y * t2.x));

	const nc = info.numColours;
	const baseHue = polygonHue(info.numVertices);
	const n = outline.length;
	const na = tiling.numAspects();

	const polygons: RawPolygon[] = [];
	for (let i = 0; i < nc; ++i) {
		for (let j = 0; j < nc; ++j) {
			const ox = i * t1.x + j * t2.x;
			const oy = i * t1.y + j * t2.y;
			for (let asp = 0; asp < na; ++asp) {
				// The placed-tile transform Tactile's own fill loop builds: the aspect matrix with the
				// lattice offset added into its translation column.
				const T = tiling.getAspectTransform(asp);
				T[2] += ox;
				T[5] += oy;
				const colour = tiling.getColour(i, j, asp);
				polygons.push({
					n,
					vertices: transformOutline(T, outline),
					hue: (baseHue + COLOUR_OFFSETS[colour % COLOUR_OFFSETS.length]) % 360,
				});
			}
		}
	}

	const v1: [number, number] = [nc * t1.x, nc * t1.y];
	const v2: [number, number] = [nc * t2.x, nc * t2.y];
	const mesh = buildIsohedralCellMesh(polygons, v1, v2);
	if (!mesh) return null;

	const span = periods * period;

	return {
		polygons,
		mesh,
		v1,
		v2,
		prototile: outline,
		tilingVertices: tiling.vertices(),
		edges: prototileEdges(tiling, req.curves),
		t1,
		t2,
		period,
		// Square: the renderer instances to the viewport's edges whatever its aspect, so the frame only
		// has to fix the scale. `periods` then reads as "periods across the short side".
		home: { cx: 0, cy: 0, width: span, height: span },
		tilesPerCell: polygons.length,
		degenerate: !isSimple(coarse),
	};
}

/**
 * The same cell, for one of the twelve types that exist only with interior markings.
 *
 * Separate entry point because nothing Tactile-shaped applies: there is no parameter vector to feed an
 * aspect matrix, no edge curve to flatten, and the tile boundary is not what distinguishes the type.
 * What comes back is the SAME `IsohedralCell`, so the renderer, the lens, the 2-D fallback and the
 * prototile inspector all take it unchanged.
 *
 * The polygon list is the cell's tiles followed by its marks. Order is paint order — the flat renderer
 * draws the triangle buffer front to back with no depth test — so the marks land on top of the tiles
 * they sit in.
 *
 * `param` is the rectangles' height-to-width ratio and is ignored by the nine rigid types. Every edge
 * reports as an I edge, which is exactly the constraint that put these twelve out of Tactile's reach.
 */
export function buildMarked(ih: number, param?: number, periods = HOME_PERIODS): IsohedralCell | null {
	const info = isohedralType(ih);
	if (!info || !info.marked || !info.gs) return null;

	const cell = buildMarkedCell(ih, param);
	if (!cell) return null;

	const mesh = buildIsohedralCellMesh(cell.polygons, cell.v1, cell.v2);
	if (!mesh) return null;

	const verts = cell.tile;
	const nv = verts.length;
	const letters = [...new Set(info.edgeWord.toLowerCase())].sort();
	const edges: PrototileEdge[] = verts.map((from, i) => {
		const to = verts[(i + 1) % nv];
		const w = info.edgeWord[i] ?? "a";
		return {
			id: Math.max(0, letters.indexOf(w.toLowerCase())),
			kind: "I" as EdgeKind,
			rev: w === w.toUpperCase(),
			from,
			to,
			mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
		};
	});

	const span = periods * cell.period;

	return {
		polygons: cell.polygons,
		mesh,
		v1: cell.v1,
		v2: cell.v2,
		prototile: verts,
		tilingVertices: verts,
		edges,
		t1: { x: cell.v1[0], y: cell.v1[1] },
		t2: { x: cell.v2[0], y: cell.v2[1] },
		period: cell.period,
		home: { cx: 0, cy: 0, width: span, height: span },
		// Tiles, not polygons: the marks are decoration on those tiles, not more of them.
		tilesPerCell: cell.tiles.length,
		degenerate: false,
	};
}

/** Re-export so views can name edge kinds without reaching into the vendor module. */
export { kindOf };
export type { EdgeKind };
