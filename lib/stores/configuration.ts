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
	debugView: boolean;

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
	inversiveMode: "inversion" | "mobius";
	inversiveRadiusFrac: number; // lens radius as a fraction of min(w,h)/2
	mobiusTwist: number; // loxodromic spiral angle, degrees (0 ⇒ pure source/sink flow)

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
	debugView: false,

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

	colorParams: { a: 180, b: 0 },

	set: (patch) => set(patch),
}));
