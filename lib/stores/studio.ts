import { create } from "zustand";
import type { ColorChoice } from "@/lib/colors/render";
import { STUDIO_PALETTE } from "@/lib/studio/palette";
import {
	isEmptyDoc,
	type PaintScope,
	type PeriodMode,
	type PointRef,
	type Rejection,
	type StudioDoc,
	type StudioTool,
} from "@/lib/studio/types";

// State for the tiling editor. Its own slice, following lib/stores/parquet.ts and automata.ts, because
// the editor's state is large, changes on every pointer move, and would otherwise re-render every
// consumer of the configuration store. Only `studioActive` lives over there, because that flag gates
// which renderer owns the canvas and the canvases already read it.
//
// HISTORY IS SNAPSHOTS, not commands. A `StudioDoc` is a small plain object (five collections of keys),
// so keeping thirty of them costs less than keeping one WebGL buffer, and undo becomes "take the
// previous one" with no inverse to implement per tool. The alternative, a command stack, would need an
// un-cut and an un-merge for every edit the editor learns to make; this needs nothing.

/** Snapshots kept. Thirty edits back is further than anyone reaches, and the whole stack is a few
 *  kilobytes. */
const HISTORY_LIMIT = 30;

export interface StudioState {
	tool: StudioTool;
	/** What an edit repeats under. `wallpaper` needs SymmetryData and falls back when it is absent. */
	periodMode: PeriodMode;
	/** Which tiles one paint click repaints. */
	paintScope: PaintScope;
	/** The palette slot the paint tool applies. */
	slot: number;
	palette: readonly ColorChoice[];

	doc: StudioDoc;
	past: StudioDoc[];
	future: StudioDoc[];

	/**
	 * The cut being drawn. Transient and deliberately NOT in the doc: an uncommitted path is not an
	 * edit, so it must not enter history and must not survive a tool change. It commits into
	 * `doc.cuts` only once both ends sit on a face boundary (see `canCommitCut`).
	 */
	cutPath: PointRef[];

	/** Why the last gesture was refused, or null. The editor blocks gestures instead of flagging bad
	 *  results, so this is the only place a user learns what happened. */
	rejection: Rejection | null;

	/**
	 * Which cell the doc was built against, or null before the editor has opened on one.
	 *
	 * THE DOC IS STAMPED because its keys are only meaningful against one cell. `dropped`, `cuts`,
	 * `moved` and `edges` name edges, rings and vertices by CONTENT key, and a key built on one tiling
	 * either fails to resolve on another or, worse, resolves onto an unrelated edge: a silent wrong
	 * answer, which is what AL saw when an edit followed the selection to the next tiling "with a
	 * mapping that doesn't make sense". There is no honest mapping between two tilings' cells, so a host
	 * that finds a different cell starts a new session instead of reinterpreting the old one.
	 */
	cellId: string | null;

	/** Is the cell inspector expanded. It is minimizable, not closable: collapsed it is still the
	 *  affordance that brings it back. */
	inspectorOpen: boolean;
	/**
	 * Outline the fundamental cell and dash its translates.
	 *
	 * OFF by default (AL, 2026-09-21). It was on, on the argument that an edit repeats under the period
	 * so the cell is worth seeing; in use the dashed translates are lines across every tile and the
	 * thing being edited is harder to see, not easier. The toggle is in the tool bar. The freedraw and
	 * Colorings views spell the same overlay `freedrawLattice` / `colorsLattice`, both also off by
	 * default; this is the third, and it takes a general 2x2 basis where those two take an HNF grid.
	 */
	showLattice: boolean;

	set: (patch: Partial<StudioState>) => void;
	/** Record an edit. Pushes the current doc onto the past and clears the redo stack, which is the
	 *  standard contract: editing after an undo abandons the branch that was undone. */
	commit: (next: StudioDoc) => void;
	/** Record an edit derived from the current doc. Saves callers the read-modify-write. */
	edit: (mutate: (draft: StudioDoc) => StudioDoc) => void;
	undo: () => void;
	redo: () => void;
	/** Back to the catalogued tiling, in one step that is itself undoable. */
	reset: () => void;
	reject: (r: Rejection | null) => void;
	/** Drop the whole session, for leaving the editor or switching tiling. Not undoable. */
	clear: () => void;
	/**
	 * Open a session on `cellId`.
	 *
	 * A DIFFERENT cell drops the doc and the history; the SAME cell is a no-op, so leaving the editor
	 * and coming back keeps the work. Call it on every cell change, including while the editor is down:
	 * a doc that outlives its cell is the bug this exists to prevent, and the editor being closed at the
	 * moment of the switch is exactly how one gets there.
	 */
	openOn: (cellId: string | null) => void;
}

const freshDoc = (): StudioDoc => ({
	dropped: [],
	cuts: [],
	moved: {},
	paint: {},
	edges: {},
});

/** No edit, no history, no gesture in flight. What both `clear` and a new cell start from. */
const emptySession = () => ({
	doc: freshDoc(),
	past: [] as StudioDoc[],
	future: [] as StudioDoc[],
	cutPath: [] as PointRef[],
	rejection: null,
});

export const useStudio = create<StudioState>()((set, get) => ({
	tool: "select",
	periodMode: "lattice",
	paintScope: "shape",
	slot: 1,
	palette: STUDIO_PALETTE,

	doc: freshDoc(),
	past: [],
	future: [],
	cutPath: [],
	rejection: null,
	cellId: null,
	inspectorOpen: true,
	showLattice: false,

	set: (patch) => set(patch),

	commit: (next) =>
		set((s) => ({
			doc: next,
			past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
			future: [],
			rejection: null,
		})),

	edit: (mutate) => get().commit(mutate(get().doc)),

	undo: () =>
		set((s) => {
			if (s.past.length === 0) return s;
			const prev = s.past[s.past.length - 1];
			return {
				doc: prev,
				past: s.past.slice(0, -1),
				future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
				// An uncommitted cut path refers to geometry the undone doc may not have, so it goes.
				cutPath: [],
				rejection: null,
			};
		}),

	redo: () =>
		set((s) => {
			if (s.future.length === 0) return s;
			return {
				doc: s.future[0],
				past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
				future: s.future.slice(1),
				cutPath: [],
				rejection: null,
			};
		}),

	reset: () =>
		set((s) =>
			isEmptyDoc(s.doc)
				? s
				: {
						doc: freshDoc(),
						past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
						future: [],
						cutPath: [],
						rejection: null,
					},
		),

	reject: (r) => set({ rejection: r }),

	clear: () => set(emptySession()),

	openOn: (cellId) => set((s) => (s.cellId === cellId ? s : { ...emptySession(), cellId })),
}));

/** Is there anything to undo / redo / reset. Selectors so a button can subscribe to one boolean
 *  instead of to the whole history. */
export const canUndo = (s: StudioState) => s.past.length > 0;
export const canRedo = (s: StudioState) => s.future.length > 0;
export const canReset = (s: StudioState) => !isEmptyDoc(s.doc);

// Dev hook, so Playwright can drive the editor with no UI — the same affordance
// lib/stores/configuration.ts attaches for the same reason.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
	const w = window as unknown as { __stores?: Record<string, unknown> };
	w.__stores = { ...(w.__stores ?? {}), studio: useStudio };
}
