import { create } from "zustand";
import { GOLRuleType } from "@/classes/GameOfLifeRule";
import { Vector } from "@/classes/Vector";

export enum ActiveTab {
	TILINGS = "Tilings",
	GAME_OF_LIFE = "Game of Life",
	THEORY = "Theory",
}

export interface SelectedTiling {
	name: string;
	rulestring: string;
	cr: string;
	dualname: string;
	golRules: { standard: string[]; dual: string[] };
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
	// GOL
	golRule: string;
	golRules: Record<string, unknown>;
	ruleType: GOLRuleType;

	// Selected tiling + view state
	selectedTiling: SelectedTiling;
	isDual: boolean;
	activeTab: ActiveTab;

	// Canvas controls (read in p5 draw loops)
	controls: Controls;
	lineWidth: number;
	speed: number;
	parameter: number;
	transformSteps: number;

	// Display toggles
	showDualConnections: boolean;
	showPolygonPoints: boolean;
	showConstructionPoints: boolean;
	showWallpaperGroup: boolean;
	showChart: boolean;
	liveChartMode: string;
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
	golRule: "B3/S23",
	golRules: {},
	ruleType: GOLRuleType.SINGLE,

	selectedTiling: {
		name: "square",
		rulestring: "4-4-0,4/r90/r(v2)",
		cr: "4^4",
		dualname: "square",
		golRules: { standard: [], dual: [] },
	},
	isDual: false,
	activeTab: ActiveTab.TILINGS,

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

	showDualConnections: false,
	showPolygonPoints: false,
	showConstructionPoints: false,
	showWallpaperGroup: false,
	showChart: false,
	liveChartMode: "count",
	debugView: false,

	screenshotButtonHover: false,
	takeScreenshot: false,
	exportGraphButtonHover: false,
	exportGraph: false,

	isIslamic: false,
	islamicAngle: 90,
	islamicAnimate: false,
	circlePacking: false,
	isTilingRegularOnly: false,

	colorParams: { a: 180, b: 0 },

	set: (patch) => set(patch),
}));
