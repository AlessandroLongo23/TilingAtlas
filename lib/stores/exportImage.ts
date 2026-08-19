import { create } from "zustand";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { ParametricCellData } from "@/lib/utils/paramCell";

/** What the export dialog needs to know about whatever /play is currently drawing. */
export interface ExportImageTarget {
	/** Names the downloaded file. */
	rulestring: string;
	/** The element the canvases fill. Supplies the on-screen box, and with it the "Screen" aspect ratio
	 *  and the 1x output size. Read at capture time, not at open time, so a fullscreen toggle keeps up. */
	host: HTMLElement | null;
	/**
	 * The translational cell, on the shelves that have one (flat Euclidean and its decorations). Two
	 * things depend on it and are hidden without it: the SVG format, which renders from the cell rather
	 * than from pixels, and the zoom control, whose readout counts tile edges across the frame and whose
	 * value is `controls.zoom` — a store field the hyperbolic and spherical canvases do not read.
	 */
	cell: TranslationalCellData | null;
	/**
	 * The parametric family, where the selection is one.
	 *
	 * `cell` is the ALPHA-INDEPENDENT base cell: the canvases derive the live shape from this plus the
	 * familyAlphas store inside their own draw loops, so nothing alpha-dependent reaches React (see the
	 * comment on baseRenderCell in the play client). The pixel export is unaffected — it reads back the
	 * frame the shader drew — but the SVG renders from the cell, so without this it would export the
	 * family at its default parameter while the screen shows another.
	 */
	paramCell: ParametricCellData | null;
}

interface ExportImageState {
	isOpen: boolean;
	target: ExportImageTarget | null;
	open: (target: ExportImageTarget) => void;
	close: () => void;
}

export const useExportImage = create<ExportImageState>()((set) => ({
	isOpen: false,
	target: null,
	open: (target) => set({ isOpen: true, target }),
	close: () => set({ isOpen: false, target: null }),
}));
