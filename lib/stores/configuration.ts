import { create } from "zustand";
import { Vector } from "@/classes/Vector";

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

	// Display toggles
	showDualConnections: boolean;
	showPolygonFill: boolean;
	showPolygonPoints: boolean;
	showConstructionPoints: boolean;
	showWallpaperGroup: boolean;
	showSymmetryElements: boolean;
	showFundamentalDomain: boolean;
	showVertexOrbits: boolean;
	debugView: boolean;
	// Flat view: draw the plain coloured-tile fill/stroke with the WebGL2 renderer
	// (components/euclidean-canvas.tsx) instead of p5 immediate mode. Dev flag until parity is reached.
	euclideanShader: boolean;

	// Radial wave transition on a tiling change: the old tiling collapses into its centroids from the
	// canvas centre outward, then the new one grows back out the same way. See lib/utils/tilingTransition.ts.
	tilingTransition: boolean;

	// Screenshot / export
	screenshotButtonHover: boolean;
	takeScreenshot: boolean;
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
	islamicOutlineWidth: number;      // interlace strap border stroke, in screen px (0 = no border)
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

	// Color params
	colorParams: ColorParams;

	// Bulk setter
	set: (patch: Partial<ConfigurationState>) => void;
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
	lineWidth: 1,
	hueOffset: 0,
	speed: 20,
	parameter: 45,
	transformSteps: 5,
	rotation: 0,

	showDualConnections: false,
	showPolygonFill: true,
	showPolygonPoints: false,
	showConstructionPoints: false,
	showWallpaperGroup: false,
	showSymmetryElements: false,
	showFundamentalDomain: false,
	showVertexOrbits: false,
	debugView: false,
	// On by default: the flat plain-tile view renders through the WebGL2 renderer (M1 fill+stroke, M1b
	// points). Verified at parity with the p5 path across regular/star/parametric/dense/dark tilings
	// (docs/superpowers/specs/2026-07-19-euclidean-gpu-port-roadmap.md). p5 stays the fallback for every
	// other mode (islamic/circle-packing/symmetry) and as the input/overlay layer.
	euclideanShader: true,

	tilingTransition: false,

	screenshotButtonHover: false,
	takeScreenshot: false,
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
	islamicBandWidth: 0.25,
	islamicOutlineWidth: 1.5,
	islamicChirality: false,
	islamicCheckerHueA: 45,   // pastel yellow — the hue of the former '#e7dcc0' default at the locked S/L
	islamicCheckerHueB: 200,  // pastel sky-blue — the hue of the former '#3a4a52' default
	islamicFillHueB: 45,
	islamicFillHueC: 200,
	circlePacking: false,
	isTilingRegularOnly: false,

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
