import { create } from "zustand";
import { Vector } from "@/classes/Vector";
import type { IcoMode } from "@/lib/render/icoFreedraw";
import { IDENTITY_DEFORM, type Mat2 } from "@/lib/render/flatView";

export interface SelectedTiling {
	name: string;
	rulestring: string;
	cr: string;
	dualname: string;
}

export interface Controls {
	zoom: number;
	targetZoom: number;
	offset: Vector;
	targetOffset: Vector;
	// Live CURRENT rotation (degrees) that every render path reads. It eases toward the top-level
	// `rotation` target (the slider value; the wheel advances it in 5° detents) along the shortest arc,
	// so wheel/slider changes glide in like a flywheel settling into a notch. Mutated in place (no
	// per-frame setState); kept continuous (not wrapped) so consumers only ever see small per-frame deltas.
	rotation: number;
	dampening: number;
}

export interface ColorParams {
	a: number;
	b: number;
}

export interface ConfigurationState {
	// Selected tiling + view state
	selectedTiling: SelectedTiling;
	isDual: boolean;

	// Canvas controls (read in p5 draw loops)
	controls: Controls;
	lineWidth: number;
	// Global hue rotation (degrees, 0–359) applied to every TILE FILL at draw time — all render paths
	// (flat p5 + WebGL, hyperbolic disk, inversive, Islamic fills) and the catalogue thumbnails shift
	// together, preserving the pairwise hue distances between tiles. Overlays (orbit dots, symmetry
	// elements, parity two-tone) keep their own colors. Set by the hue ring (components/ui/hue-ring.tsx).
	hueOffset: number;
	speed: number;
	parameter: number;
	transformSteps: number;
	rotation: number;
	// The view DEFORMATION: a 2x2 linear map applied to world coordinates before the camera
	// (world -> deform -> zoom*rotate*flip -> +pan), driven by the basis pad in the Options tab.
	// Column-major, [a, b, c, d]: (a, b) is the image of (1, 0) — the pad's red vector — and (c, d) the
	// image of (0, 1), blue. Identity is [1, 0, 0, 1] and means "no deformation".
	//
	// It lives here rather than in a canvas because five renderers have to agree on it: the flat WebGL
	// pipeline (components/euclidean-canvas.tsx), the two Islamic ones (islamic-canvas, strap-canvas),
	// the inversive lens (which applies its INVERSE per fragment) and the Truchet 2D overlay. All five
	// read it imperatively each frame; the math is in lib/render/flatView.ts (Mat2, applyMat2, ...).
	//
	// Only wired for those renderers — see deformApplies() below. The p5-owned modes (circle packing,
	// symmetry elements, colors, hollow) hide the control instead of ignoring it.
	deform: [number, number, number, number];
	/** Is the deformation drawer open — i.e. is `deform` actually applied? Off means the identity, and
	 *  the matrix is REMEMBERED, so closing the drawer restores the undeformed picture without throwing
	 *  away the shape that was dialled in. Same on/off shape as `isIslamic` and `inversive`. */
	deformOn: boolean;

	// Display toggles
	showDualConnections: boolean;
	showPolygonFill: boolean;
	showPolygonPoints: boolean;
	/** LENGTH families only: colour each tile by its own SIZE rather than by the by-side-count ramp.
	 *  The two-square tiling has both tiles at n = 4, so the ramp gives them one colour whatever the
	 *  sliders say; size-hue separates them and moves as the sliders move. Off = the fixed scheme. */
	lengthSizeHue: boolean;
	showConstructionPoints: boolean;
	showWallpaperGroup: boolean;
	showSymmetryElements: boolean;
	showFundamentalDomain: boolean;
	showVertexOrbits: boolean;
	// Draw the tiling's MIRROR image. A chiral tiling and its mirror are ONE catalogue entry (the
	// A068599 convention — see lib/services/chirality.ts), so the second hand has nowhere to live except
	// as a view of the first. Render-only: it reflects float geometry and never touches a count or an id.
	mirrorFlip: boolean;
	debugView: boolean;
	// Flat view: draw the plain coloured-tile fill/stroke with the WebGL2 renderer
	// (components/euclidean-canvas.tsx) instead of p5 immediate mode. Dev flag until parity is reached.
	euclideanShader: boolean;

	// Radial wave transition on a tiling change: the old tiling collapses into its centroids from the
	// canvas centre outward, then the new one grows back out the same way. See lib/utils/tilingTransition.ts.
	tilingTransition: boolean;

	// Screenshot / export
	exportGraphButtonHover: boolean;
	exportGraph: boolean;

	// Islamic / rendering variants
	isIslamic: boolean;
	islamicAngle: number;
	islamicEdgeOffset: number;        // % of the half-edge the ray origins slide outward (0 = midpoint)
	islamicIntersectionCount: number; // ray stops at the N-th crossing (1 = first contact, max 3)
	islamicAnimate: boolean;
	// Decoration style for the Islamic construction. 'plain' = colored cells + border lines (the classic
	// look); 'interlace' = woven over/under bands. ('outline'/'checkerboard' are reserved for later slices.)
	islamicStyle: 'plain' | 'interlace' | 'outline' | 'emboss' | 'checkerboard';
	islamicBandWidth: number;         // interlace strap width, as a fraction of the median segment length
	// Strap border ring, grown OUTWARD from the band, on the same ruler as islamicBandWidth (a fraction of
	// the median segment length) — so the two are directly comparable and their ratio holds at any zoom.
	// It is band geometry, not a stroke: dragging it rebuilds the mesh. 0 = no border.
	islamicOutlineWidth: number;
	islamicChirality: boolean;        // flips which strand rides over at every crossing (the two chiralities)
	// Region fills are hue-only — saturation/lightness are locked to the tile palette (HSL 100%/80% ≡
	// HSB 0.40/1.0), like the hue-shift ring — so a fill is always a tile-palette colour, never off-palette.
	islamicCheckerHueA: number;       // checkerboard field A: hue° (0–360)
	islamicCheckerHueB: number;       // checkerboard field B: hue°
	// Plain-fill A/B/C: star bodies (A) keep their tile hue; the two background classes take these shared
	// hues. B = the side fields, C = the small edge-centre diamonds (only present once Edge Offset > 0).
	islamicFillHueB: number;          // A/B/C fill: side-field hue°
	islamicFillHueC: number;          // A/B/C fill: edge-centre diamond hue°
	circlePacking: boolean;
	isTilingRegularOnly: boolean;

	// Squared torus (Brooks–Smith–Stone–Tutte one genus up): the selected tiling's quotient graph carries
	// a harmonic form for every class in H¹(T;ℝ) ≅ ℝ², and each one turns every edge into a square. The
	// result is a Euclidean periodic tiling in its own right, drawn in a floating panel over the canvas
	// (components/squaring/squaring-inset.tsx) so the main view stays on the tiling it came from. Offered
	// only where lib/squaring/playSquaring.ts certifies the record's cell; the toggle is disabled with a
	// reason everywhere else. The four-stage account of the construction is /theory/perfect-rectangles.
	squaring: boolean;
	/** The class (m, n). Integral values take the exact solve and may print their sides; every other
	 *  direction is a real class blended from the frame, where "these two sides are equal" is undecidable
	 *  and so is never claimed. Only the DIRECTION matters — scaling a class scales the tiling. */
	squaringClass: [number, number];
	/** Does the dial stick to integral classes? Off means the whole circle of real directions is reachable. */
	squaringSnap: boolean;
	/** Print each square's side inside it. Ignored off the integer lattice, where the sides are irrational. */
	squaringNumbers: boolean;
	/** One ink for every tile instead of the size-ranked ramp, so the sizes read from the drawing alone. */
	squaringMono: boolean;
	/** Outline one fundamental domain of the image lattice, the parallelogram the two periods span. */
	squaringLattice: boolean;

	// Inversive view (experimental): swaps the affine p5 render for a WebGL conformal-map render of the
	// same tiling. Lens fixed at screen centre; panning slides the world under it. See components/
	// inversive-canvas.tsx and lib/render/inversiveCell.ts.
	inversive: boolean;
	inversiveMode: "inversion" | "mobius" | "spiral";
	inversiveRadiusFrac: number; // lens radius as a fraction of min(w,h)/2 (spiral+double ⇒ pole separation)
	mobiusTwist: number; // loxodromic spiral angle, degrees (0 ⇒ pure source/sink flow)
	// Spiral lens (inversiveMode "spiral"): the complex-exponential map of Kaplan's spiral tilings. The
	// seam (spiralArmA·v₁ + spiralArmB·v₂) becomes the 2π wrap via a SIMILARITY, so the lean and ring
	// spacing are intrinsic to (a,b) — no pitch knob, matching Kaplan's tool. spiralDouble adds the
	// second pole (Droste). See lib/render/spiralMap.ts.
	spiralArmA: number; // integer seam component along v₁
	spiralArmB: number; // integer seam component along v₂
	spiralDouble: boolean; // false ⇒ one center, true ⇒ two centers (Droste)
	// Velocity pad (components/spiral-velocity-pad.tsx): a persistent strip-space velocity (dV/dt,
	// strip-units/s; x = dolly ⇒ zoom, y = spin ⇒ rotation) written by the pad on drag, and the drift
	// it integrates. The drift is mutated IN PLACE by the InversiveCanvas render loop (the `controls`
	// pattern — no per-frame setState) and wrapped modulo the strip lattice so it stays bounded; see
	// wrapStripDrift in lib/render/spiralMap.ts.
	spiralVel: { x: number; y: number };
	spiralDrift: { x: number; y: number };

	// Hyperbolic view: set true by /play when a {p,q} hyperbolic tiling is selected. Swaps the flat p5
	// render for the Poincaré-disk WebGL renderer (components/hyperbolic-developed-canvas.tsx). While on, the
	// p5 canvas draws nothing (kept only as the pan input layer) and the mouse wheel is inert (pan, no zoom).
	hyperbolic: boolean;
	// Edge stroke width: "geometry" scales with the tiles (thick near the centre, thinner toward the rim),
	// "constant" holds a fixed screen width everywhere.
	hyperbolicLineMode: "geometry" | "constant";
	// Transient input signals from the p5 input layer to the Poincaré-disk overlay (consumed + cleared by
	// it). A click (centred CSS px) requests centring the clicked tile; the reset flag returns to identity.
	hyperbolicClick: { x: number; y: number } | null;
	hyperbolicResetView: boolean;

	// Spherical view: set true by /play when a Platonic {p,q} tiling is selected. Swaps the flat p5 render
	// for the three.js sphere renderer (components/spherical-canvas.tsx), which owns its own pointer input
	// (ArcballControls free rotation + zoom). While on, the p5 canvas draws nothing (blanked like hyperbolic).
	spherical: boolean;
	// Spherical wireframe mode: drop the solid textured sphere and render ONLY the tiling edges as 3D
	// tubes — a hollow skeleton. `section` picks the cross-section (round tube vs rectangular bar);
	// `thickness` is the line width (tube radius / bar width along the surface); `height` is the bar's
	// radial depth (rectangular section only). See components/spherical-canvas.tsx + lib/render/sphericalWireframe.ts.
	sphericalWireframe: boolean;
	sphericalWireSection: "tube" | "rect";
	sphericalWireThickness: number;
	sphericalWireHeight: number;
	sphericalWireBevel: number; // rectangular section only: chamfer size as a fraction (0 = sharp corners)
	// Spherical "realistic" mode: keep the solid textured sphere, but shade it like the tiling lines were
	// CARVED into the surface — faces raised, edges sunk into a smooth SDF-fillet groove, lit as matte stone.
	// Driven live from the same edge-distance field the texture baker uses. Solid sphere only (no effect in
	// wireframe / Islamic modes). See lib/render/sphericalCarvedMaterial.ts.
	sphericalRealistic: boolean;
	// Spherical "polyhedron" mode: replace the round tiling sphere with the TRUE flat-faced solid — real
	// facets, corners and edges — lit by the scene so each face reads as 3D, keeping the per-polygon hue.
	// Solid Fill only (mutually exclusive with Realistic; no effect in wireframe / Islamic modes).
	// See lib/render/sphericalPolyhedron.ts.
	sphericalPolyhedron: boolean;
	// Spherical camera projection: false = perspective (foreshortened, the default), true = orthographic
	// (parallel projection — no perspective distortion, the "isometric" solid look). See spherical-canvas.tsx.
	sphericalOrthographic: boolean;
	// Interlace + Wireframe (solid 3D ribbons): false = the woven over/under relief (ribbons ride out/in at
	// crossings); true = flat ribbons, still 3D solids but coplanar on the sphere (no over/under undulation).
	sphericalWeaveFlat: boolean;

	// Freedraw view: set true by /play when a freedraw pattern is selected. Swaps the flat p5 render for the
	// 2D grid renderer (components/freedraw-play-canvas.tsx), which owns its own pan/zoom. While on, the p5
	// canvas draws nothing (blanked like hyperbolic/spherical). A freedraw pattern has no polygon cell, so
	// none of the flat overlays — symmetry, fundamental domain, orbits, Islamic, inversive — apply.
	freedraw: boolean;
	/** A hollow tiling ({n/d} star polygons) is selected: its own 2D canvas owns the view, blank the flat layer. */
	hollow: boolean;
	// Freedraw cell fill, coarse to fine — see FillMode in lib/freedraw/render.ts. "none" leaves the line
	// art bare; "rank" colours by tile KIND (finite / strip / unbounded); "shape" by congruence class,
	// counting rotations and mirrors as one shape; "pose" splits those by orientation; "orbit" is finest,
	// one hue per face orbit of the period lattice.
	freedrawFill: "none" | "rank" | "shape" | "pose" | "orbit";
	freedrawScaffold: boolean; // thin lines for the whole grid, including the edges that are NOT drawn
	freedrawVertices: boolean; // dots at grid points coloured by orbit — makes the k-uniformity visible
	// Period-lattice overlay: tints the fundamental cell and outlines its translates, so the pattern reads
	// as that one cell stamped out across the plane. See lib/freedraw/render.ts drawLattice.
	freedrawLattice: boolean;
	/**
	 * TILE MODE (lib/freedraw/arcs.ts): read the same edge bits as connected / not and fill a black
	 * region on each TILE, entering through the middle third of every connected edge — Carlson's
	 * multi-scale Truchet construction, generalised off the square. Turns the cell fill off while it is
	 * up (the renderer enforces that, not the UI).
	 *
	 * `freedrawArcWiring` picks which bijection on the connected edges the region follows: "ribbons"
	 * pairs neighbours into constant-width bands, "junction" runs one region through all of them,
	 * "caps" caps each port where it stands. `freedrawArcTwist` mirrors the ribbon pairing — a genuine
	 * choice, since no turn of a square carries one pairing of four connected edges onto the other.
	 *
	 * Spelled out and not imported, like every other union here, so the store keeps no dependency on a
	 * shelf; lib/freedraw/arcs.ts holds the same three names.
	 */
	freedrawArcs: boolean;
	freedrawArcWiring: "ribbons" | "junction" | "caps";
	freedrawArcTwist: boolean;
	/**
	 * TRUCHET SEED. On a plain tiling there is no edge state to read, so every edge counts as connected
	 * and the drawing is the only freedom left — c! of them per tile (lib/render/truchetTiling.ts). This
	 * seeds the per-tile draw; the Reshuffle button rolls it. 0 means "not shuffled": every tile takes
	 * the named wiring above instead, which is the comparison the shuffle is against.
	 */
	truchetSeed: number;
	/**
	 * The Truchet overlay is actually up over a plain tiling. A transient signal, not a setting: it is
	 * derived in _play-client (which knows whether a pattern could be built at all) and read by
	 * canvas.tsx, which blanks the flat layer while it is true. The figures ARE the picture — a tiling
	 * drawn under them is a second picture, and one that trails a frame behind on a drag, since the two
	 * layers ease on separate loops. Out of the URL, like every other derived signal.
	 */
	truchetActive: boolean;
	/**
	 * Where the parametric-pentagon shelf is standing in its family: the three free angles, the free side
	 * b, and t along the one remaining side ratio (lib/pentagon/edge-board.ts).
	 *
	 * Store state and not canvas state, and for the reason every other view option is: more than one
	 * renderer has to agree on it. The conformal lens builds the same period from the same numbers, so a
	 * parameter point held inside the flat canvas would leave the lens drawing a different pentagon from
	 * the one under the sliders.
	 */
	pentParams: { A: number; B: number; D: number; b: number; t: number };

	/**
	 * Where the isohedral edge shelf is standing in its type's family: Tactile's own parameter vector,
	 * whose length is the type's `numParams`. Null means "wherever the type says", which is the only
	 * sane default when the vector's LENGTH depends on which type is selected — IH01 takes four numbers
	 * and IH04 takes six, so one shared array of fixed length would be wrong for all but one board.
	 */
	ihEdgeParams: number[] | null;

	/**
	 * How far each of the isohedral tile's edge classes bows off its chord, one entry per DISTINCT edge
	 * shape (IH01 has three). Same control and same range as /isohedral's edge sliders (BULGE, ±0.5).
	 *
	 * Null means straight, and straight is the default deliberately: an edge SYSTEM is about which edges
	 * are drawn, and a bowed edge makes drawn and undrawn harder to tell apart, so curvature is opt-in.
	 */
	ihEdgeBulge: number[] | null;

	// Colored-tiling view: set true by /play when a colored square pattern is selected. Same contract as
	// `freedraw` above — swaps the flat p5 render for the colors renderer (components/colors-play-canvas.tsx),
	// which owns its own pan/zoom; while on, the p5 canvas draws nothing. The three overlays mirror the
	// freedraw trio: tile edges / period lattice / colored-vertex orbit dots.
	colors: boolean;
	colorsEdges: boolean; // stroke the grid lines — every one is a real tile boundary in this class
	colorsVertices: boolean; // dots at vertices coloured by colored-vertex orbit — makes k visible
	colorsLattice: boolean; // period-lattice overlay: fundamental cell tinted, translates dashed
	// One entry per tile color: a hue (degrees) or the two specials no hue reaches — "cream" (the warm
	// near-white) and "dark" (its almost-black complement). An array so a 3+-color catalogue only grows
	// it. See lib/colors/render.ts ColorChoice/cellFill.
	colorsPalette: (number | "cream" | "dark")[];

	// Spherical freedraw (Platonic-solid freedraw on /play): the two Display controls the /freedraw spherical
	// arm exposes. `mode` swaps the flat-faced polyhedron for the round sphere (curved patches + arc edges);
	// `grid` draws the solid's full edge grid faintly under the pattern. See components/freedraw/ico-freedraw-canvas.tsx.
	sphericalFreedrawMode: IcoMode;
	sphericalFreedrawGrid: boolean;

	// Color params
	colorParams: ColorParams;

	// Bulk setter
	set: (patch: Partial<ConfigurationState>) => void;
}

/**
 * Where the view DEFORMATION (`deform`, the sidebar's basis pad) is actually wired.
 *
 * The flat WebGL renderer, the two Islamic ones, the inversive lens and the Truchet overlay all apply
 * it. The p5-owned modes do not: p5's strokeWeight is carried by the context transform, so a sheared
 * applyMatrix would draw elliptical strokes, and deforming those paths honestly means emitting deformed
 * vertices through every one of them (circle packing would need its ellipses rebuilt as polygons).
 * Until that is done the Options tab HIDES the drawer there — a control that silently does nothing is
 * worse than an absent one.
 *
 * One predicate, so the sidebar's visibility and each renderer's "do I deform this frame" cannot drift.
 * Takes a structural argument rather than the whole state so the canvases can call it with what they have.
 */
export function deformApplies(cfg: {
	hyperbolic: boolean; spherical: boolean; freedraw: boolean; hollow?: boolean;
	colors: boolean; circlePacking: boolean; showSymmetryElements: boolean;
}): boolean {
	return !cfg.hyperbolic && !cfg.spherical && !cfg.freedraw && !cfg.hollow &&
		!cfg.colors && !cfg.circlePacking && !cfg.showSymmetryElements;
}

/**
 * The deformation a renderer should use THIS FRAME: the stored matrix when the drawer is open and the
 * mode honours it, the identity otherwise. Every canvas reads it through here, so "is the picture
 * deformed" has exactly one answer and a mode that cannot apply D can never be handed one.
 */
export function resolveDeform(cfg: {
	deform: [number, number, number, number]; deformOn: boolean;
	hyperbolic: boolean; spherical: boolean; freedraw: boolean; hollow?: boolean;
	colors: boolean; circlePacking: boolean; showSymmetryElements: boolean;
}): Mat2 {
	return cfg.deformOn && deformApplies(cfg) ? (cfg.deform as unknown as Mat2) : IDENTITY_DEFORM;
}

export const useConfiguration = create<ConfigurationState>()((set) => ({
	selectedTiling: {
		name: "square",
		rulestring: "4-4-0,4/r90/r(v2)",
		cr: "4^4",
		dualname: "square",
	},
	isDual: false,

	controls: {
		zoom: 50,
		targetZoom: 50,
		offset: new Vector(0, 0),
		targetOffset: new Vector(0, 0),
		rotation: 0,
		dampening: 0.2,
	},
	lineWidth: 1.5,
	hueOffset: 0,
	speed: 20,
	parameter: 45,
	transformSteps: 5,
	rotation: 0,
	deform: [1, 0, 0, 1],
	deformOn: false,

	showDualConnections: false,
	showPolygonFill: true,
	showPolygonPoints: false,
	lengthSizeHue: true,
	showConstructionPoints: false,
	showWallpaperGroup: false,
	showSymmetryElements: false,
	showFundamentalDomain: false,
	showVertexOrbits: false,
	mirrorFlip: false,
	debugView: false,
	// On by default: the flat plain-tile view renders through the WebGL2 renderer (M1 fill+stroke, M1b
	// points). Verified at parity with the p5 path across regular/star/parametric/dense/dark tilings
	// (docs/superpowers/specs/2026-07-19-euclidean-gpu-port-roadmap.md). p5 stays the fallback for every
	// other mode (islamic/circle-packing/symmetry) and as the input/overlay layer.
	euclideanShader: true,

	tilingTransition: false,

	exportGraphButtonHover: false,
	exportGraph: false,

	isIslamic: false,
	// Ray tilt from the tile edge, degrees: 0 ⇒ parallel to the edge (original tiling — toggling Islamic here
	// is a no-op), 90 ⇒ along the perpendicular (dual tiling); 45 is the mid star. Every geometry honours this:
	// the tips/fold/spherical paths via islamicTipsAngleFromSlider, the segment paths (flat + hyperbolic mesh)
	// via islamicNormalAngleFromSlider (the from-normal complement, 90° − slider).
	islamicAngle: 45,
	islamicEdgeOffset: 0,
	islamicIntersectionCount: 1,

	islamicAnimate: false,
	islamicStyle: 'plain',
	islamicBandWidth: 0.3,
	islamicOutlineWidth: 0.1,
	islamicChirality: false,
	islamicCheckerHueA: 45,   // pastel yellow — the hue of the former '#e7dcc0' default at the locked S/L
	islamicCheckerHueB: 200,  // pastel sky-blue — the hue of the former '#3a4a52' default
	islamicFillHueB: 45,
	islamicFillHueC: 200,
	circlePacking: false,
	isTilingRegularOnly: false,

	squaring: false,
	// (1, 0): the potential climbs by one across the first period and not at all across the second. Every
	// certified quotient has a squaring there, and it is the simplest class to read off the dial.
	squaringClass: [1, 0],
	squaringSnap: true,
	squaringNumbers: true,
	squaringMono: false,
	squaringLattice: true,

	inversive: false,
	inversiveMode: "inversion",
	inversiveRadiusFrac: 0.42,
	mobiusTwist: 60,
	spiralArmA: 1,
	spiralArmB: 0,
	spiralDouble: false,
	spiralVel: { x: 0, y: 0 },
	spiralDrift: { x: 0, y: 0 },

	hyperbolic: false,
	hyperbolicLineMode: "geometry",
	hyperbolicClick: null,
	hyperbolicResetView: false,

	spherical: false,
	sphericalWireframe: false,
	sphericalWireSection: "tube",
	sphericalWireThickness: 0.025,
	sphericalWireHeight: 0.025,
	sphericalWireBevel: 0.25,
	sphericalRealistic: false,
	sphericalPolyhedron: false,
	sphericalOrthographic: false,
	sphericalWeaveFlat: false,

	freedraw: false,
	hollow: false,
	freedrawFill: "rank",
	freedrawScaffold: false,
	freedrawVertices: false,
	freedrawLattice: false,
	freedrawArcs: false,
	freedrawArcWiring: "ribbons",
	freedrawArcTwist: false,
	truchetSeed: 0,
	truchetActive: false,
	// Mirrors PENT_EDGE_DEFAULTS; spelled out rather than imported so the store keeps no dependency on a
	// shelf. lib/pentagon/edge-board.test.ts holds the two to each other.
	pentParams: { A: 120, B: 100, D: 110, b: 0.8, t: 0.5 },
	ihEdgeParams: null,
	ihEdgeBulge: null,

	colors: false,
	colorsEdges: true,
	colorsVertices: false,
	colorsLattice: false,
	colorsPalette: ["cream", 215, 15],

	sphericalFreedrawMode: "polyhedron",
	sphericalFreedrawGrid: false,

	colorParams: { a: 180, b: 0 },

	set: (patch) => set(patch),
}));

// Dev-only: expose the store on window so a headless browser (the Playwright visual-inspection tool —
// see CLAUDE.md) and manual debugging can read or drive any flag, e.g.
//   window.__stores.configuration.setState({ euclideanShader: true, showPolygonPoints: true })
// Stripped from production builds by the NODE_ENV guard.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	((window as any).__stores ??= {}).configuration = useConfiguration;
}
