"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { BULGE } from "@/lib/isohedral/build";
import { ISOHEDRAL_TYPES } from "@/lib/isohedral/catalogue";
import { solveIhBoardFor } from "@/lib/isohedral/edge-board";
import { useConfiguration } from "@/stores/configuration";

// The isohedral edge shelf's shape controls, as their own overlay instead of part of its canvas.
//
// They have to outlive the canvas, exactly as the pentagon shelf's do: turn the conformal lens on and
// the flat view is replaced by the lens, but the family it is drawing is still this one and the sliders
// still have to reach it. That is why the parameter point lives in the store (`ihEdgeParams`).
//
// Labels and ranges match /isohedral's own parameter sliders — `v0`…`vn` over [0, 2] — because they
// drive the same Tactile vector, and two pages disagreeing about what "v1 = 0.4" means would be worse
// than no labels at all. Tactile ships defaults but no ranges; [0, 2] is what the reference editor at
// isohedral.ca uses for every parameter of every type.

const MIN = 0;
const MAX = 2;
const STEP = 0.001;

export function IsohedralEdgesControls({ ih }: { ih: number }) {
	const stored = useConfiguration((s) => s.ihEdgeParams);
	const storedBulge = useConfiguration((s) => s.ihEdgeBulge);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);

	const info = ISOHEDRAL_TYPES.find((t) => t.ih === ih);
	// A stored vector of the wrong length belongs to another type; fall back to this one's defaults.
	const params = stored?.length === info?.numParams ? stored : (info?.defaultParams ?? []);
	const bulge =
		storedBulge?.length === info?.numEdgeShapes
			? storedBulge
			: (info?.edgeShapes.map(() => BULGE.def) ?? []);

	const setParam = useCallback(
		(i: number, value: number) =>
			useConfiguration.getState().set({ ihEdgeParams: params.map((p, j) => (j === i ? value : p)) }),
		[params],
	);
	const setBulge = useCallback(
		(i: number, value: number) =>
			useConfiguration.getState().set({ ihEdgeBulge: bulge.map((p, j) => (j === i ? value : p)) }),
		[bulge],
	);
	const reset = useCallback(
		() => useConfiguration.getState().set({ ihEdgeParams: null, ihEdgeBulge: null }),
		[],
	);
	const setScaffold = useCallback(
		(v: boolean) => useConfiguration.getState().set({ freedrawScaffold: v }),
		[],
	);

	const solved = solveIhBoardFor(ih, stored, storedBulge);

	return (
		<div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1 rounded-md bg-surface-overlay/95 p-3 text-xs backdrop-blur">
			<div className="flex items-center justify-between gap-4 pb-1">
				<span className="font-mono text-fg-secondary">{info?.label ?? `IH${ih}`}</span>
				<button type="button" onClick={reset} className="text-fg-muted underline hover:text-fg">
					reset
				</button>
			</div>
			{params.map((p, i) => (
				<label key={i} className="flex items-center gap-2">
					<span className="w-14 text-fg-secondary">v{i}</span>
					<input
						type="range"
						min={MIN}
						max={MAX}
						step={STEP}
						value={p}
						onChange={(e) => setParam(i, Number(e.target.value))}
					/>
					<span className="w-12 text-right font-mono text-fg">{p.toFixed(3)}</span>
				</label>
			))}
			{/* Edge curvature, one slider per DISTINCT edge shape — the same control /isohedral carries, so
			    the same number means the same bow on both pages. Straight at zero, and zero is the default:
			    an edge system is about which edges are DRAWN, and a bowed edge makes drawn and undrawn
			    harder to tell apart. IH01's three shapes are all kind J, so all three bow freely. */}
			{bulge.map((v, i) => (
				<label key={`bulge-${i}`} className="flex items-center gap-2">
					<span className="w-14 text-fg-secondary">bow {String.fromCharCode(97 + i)}</span>
					<input
						type="range"
						min={BULGE.min}
						max={BULGE.max}
						step={BULGE.step}
						value={v}
						onChange={(e) => setBulge(i, Number(e.target.value))}
					/>
					<span className="w-12 text-right font-mono text-fg">{v.toFixed(2)}</span>
				</label>
			))}
			{solved.ok ? (
				// The three edge-class lengths are what the certificate's digon letters name, so reporting
				// them makes the link between the sliders and the record legible while you drag.
				<span className="pt-1 font-mono text-fg-muted">
					{solved.board.spec.classes
						.map((c, i) => `${c} = ${solved.board.classLengths[i].toFixed(2)}`)
						.join(" · ")}
				</span>
			) : (
				<span className="pt-1 text-danger">
					{solved.error === "degenerate" ? "the tile degenerates here" : "no tile here"}
				</span>
			)}
			{/* The same store field the Options tab's "Grid scaffold" checkbox and the G shortcut drive —
			    repeated here because this view's controls are already on the canvas, and a toggle you have
			    to go looking for in another tab may as well not exist. */}
			<Checkbox
				id="ihScaffold"
				label="Underlying tiling"
				shortcut="G"
				checked={showScaffold}
				onCheckedChange={setScaffold}
			/>
		</div>
	);
}
