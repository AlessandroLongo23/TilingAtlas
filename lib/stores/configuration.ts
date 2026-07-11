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
	islamicAngle: 30, // θ from the edge normal (0 ⇒ meet at centroid, 90 ⇒ meet at vertices); ~30 shows a clear star

	islamicAnimate: false,
	circlePacking: false,
	isTilingRegularOnly: false,

	colorParams: { a: 180, b: 0 },

	set: (patch) => set(patch),
}));
