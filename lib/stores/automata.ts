// Simulation configuration for /automata. The BOARD itself lives in an AutomatonEngine instance owned by
// the canvas (it is a megabyte of typed arrays mutated sixty times a second, which has no business in a
// React store); this holds only the knobs that decide what that engine is.

import { create } from "zustand";
import type { Neighborhood, RuleSemantics } from "@/lib/automata/rule";
import type { TopologyId } from "@/lib/automata/topology";

/** Flat plane, or the board drawn as the surface it is (cylinder, torus, Möbius band, Klein bottle). */
export type ViewMode = "plane" | "surface3d";

/**
 * Which immersion draws the Klein bottle. Neither is more correct — the surface does not embed in ℝ³ at
 * all — so this is a choice between being recognisable and being readable.
 */
export type KleinShape = "bottle" | "bagel";

export interface AutomataState {
	/** Reference-atlas id of the tiling being simulated. */
	tilingId: string | null;
	rule: string;
	/** Per side count, for the perShape reading. Keys are polygon side counts. */
	perShapeRules: Record<number, string>;
	semantics: RuleSemantics;
	neighborhood: Neighborhood;
	/** Graph distance the neighbourhood reaches (Larger-than-Life). */
	range: number;
	/** Which of the five flat surfaces the board is. */
	topology: TopologyId;
	/** Board period along v₁ and v₂, in fundamental cells. Ignored on an open axis. */
	boardW: number;
	boardH: number;
	view: ViewMode;
	/** Which Klein immersion the 3D view draws. */
	kleinShape: KleinShape;

	running: boolean;
	/** Generations per second. */
	speed: number;
	/** Fraction of cells seeded live. */
	density: number;
	seed: number;
	/** Lattice cells per axis seeded with soup in unbounded mode. */
	soupSize: number;

	/** Draw tile outlines. */
	showEdges: boolean;
	/** Tint dead cells with the tiling's own colouring so the geometry stays readable. */
	tintDead: boolean;
	/** Dashed lines showing where the fundamental cell repeats. */
	showLattice: boolean;
	/** The board's boundary with gluing arrows — red for the v₁ pair, blue for the v₂ pair. */
	showSeams: boolean;

	/** Bumped to ask the canvas to reseed; the canvas watches it rather than being called imperatively. */
	resetNonce: number;
	/** Bumped to ask the canvas to advance exactly one generation while paused. */
	stepNonce: number;

	set: <K extends keyof AutomataState>(key: K, value: AutomataState[K]) => void;
	setPerShape: (sides: number, rule: string) => void;
	reseed: (seed?: number) => void;
	stepOnce: () => void;
	toggleRunning: () => void;
}

export const useAutomata = create<AutomataState>((set) => ({
	tilingId: null,
	rule: "B3/S23",
	perShapeRules: {},
	semantics: "absolute",
	neighborhood: "moore",
	range: 1,
	topology: "plane",
	boardW: 16,
	boardH: 16,
	view: "plane",
	kleinShape: "bottle",

	running: false,
	speed: 12,
	density: 0.38,
	seed: 1,
	soupSize: 24,

	showEdges: true,
	tintDead: true,
	showLattice: false,
	showSeams: true,

	resetNonce: 0,
	stepNonce: 0,

	set: (key, value) => set({ [key]: value } as Partial<AutomataState>),
	setPerShape: (sides, rule) =>
		set((s) => ({ perShapeRules: { ...s.perShapeRules, [sides]: rule } })),
	reseed: (seed) =>
		set((s) => ({
			seed: seed ?? Math.floor(Math.random() * 0x7fffffff),
			resetNonce: s.resetNonce + 1,
		})),
	stepOnce: () => set((s) => ({ stepNonce: s.stepNonce + 1, running: false })),
	toggleRunning: () => set((s) => ({ running: !s.running })),
}));

// Dev-only: expose the store on window so the Playwright visual-inspection tool (see CLAUDE.md) and
// manual debugging can drive any knob, e.g.
//   window.__stores.automata.setState({ tilingId: "t1001", rule: "B2/S34", running: true })
// Stripped from production builds by the NODE_ENV guard.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	((window as any).__stores ??= {}).automata = useAutomata;
}
