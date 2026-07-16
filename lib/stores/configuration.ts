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
	islamicAnimate: boolean;
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
	// seam (spiralArmA·v₁ + spiralArmB·v₂) becomes the 2π wrap; pitch leans the rings into logarithmic
	// spirals; spiralDouble adds the second pole (Droste). See lib/render/spiralMap.ts.
	spiralArmA: number; // integer seam component along v₁
	spiralArmB: number; // integer seam component along v₂
	spiralPitch: number; // spiral lean, degrees (0 ⇒ concentric rings)
	spiralDouble: boolean; // false ⇒ one center, true ⇒ two centers (Droste)

	// Hyperbolic view: set true by /play when a {p,q} hyperbolic tiling is selected. Swaps the flat p5
	// render for the Poincaré-disk WebGL renderer (components/hyperbolic-canvas.tsx). While on, the p5
	// canvas draws nothing (kept only as the pan input layer) and the mouse wheel is inert (pan, no zoom).
	hyperbolic: boolean;
	hyperbolicShading: "tiles" | "parity"; // coloured tiles + edges, or two-tone reflection parity
	// Edge stroke width: "geometry" scales with the tiles (thick near the centre, thinner toward the rim),
	// "constant" holds a fixed screen width everywhere.
	hyperbolicLineMode: "geometry" | "constant";
	// Transient input signals from the p5 input layer to the Poincaré-disk overlay (consumed + cleared by
	// it). A click (centred CSS px) requests centring the clicked tile; the reset flag returns to identity.
	hyperbolicClick: { x: number; y: number } | null;
	hyperbolicResetView: boolean;

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

	tilingTransition: false,

	screenshotButtonHover: false,
	takeScreenshot: false,
	exportGraphButtonHover: false,
	exportGraph: false,

	isIslamic: false,
	// Ray tilt from the tile edge, degrees: 0 ⇒ parallel to the edge (original tiling), 90 ⇒ along the
	// perpendicular (dual tiling); 45 is the mid star. Mapped to the contact angle in islamicTipsAngleFromSlider.
	islamicAngle: 45,

	islamicAnimate: false,
	circlePacking: false,
	isTilingRegularOnly: false,

	inversive: false,
	inversiveMode: "inversion",
	inversiveRadiusFrac: 0.42,
	mobiusTwist: 60,
	spiralArmA: 1,
	spiralArmB: 0,
	spiralPitch: 30,
	spiralDouble: false,

	hyperbolic: false,
	hyperbolicShading: "tiles",
	hyperbolicLineMode: "geometry",
	hyperbolicClick: null,
	hyperbolicResetView: false,

	colorParams: { a: 180, b: 0 },

	set: (patch) => set(patch),
}));
