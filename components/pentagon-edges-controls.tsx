"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { solveEdgeBoard, type PentEdgeParams } from "@/lib/pentagon/edge-board";
import { useConfiguration } from "@/stores/configuration";

// The parametric-pentagon shelf's shape controls, as their own overlay rather than part of its canvas.
//
// They have to outlive the canvas: turn the conformal lens on and the flat pentagon view is replaced by
// the lens, but the family it is drawing is still this one, and the sliders still have to reach it. That
// is also why the parameter point lives in the store (`pentParams`) and not in a component.
//
// A, B and D are the free angles; C = 180 - B is Kershner type 1's constraint and E is what is left of
// the 540 degree sum, so neither gets a slider. `b` is free because the two b-edges are antiparallel
// (lib/pentagon/edge-board.ts), and `t` runs along the one degree of freedom the closure equations leave
// for c, d and e.

const SLIDERS: { key: keyof PentEdgeParams; label: string; min: number; max: number; step: number }[] = [
	{ key: "A", label: "A", min: 70, max: 170, step: 0.5 },
	{ key: "B", label: "B", min: 25, max: 155, step: 0.5 },
	{ key: "D", label: "D", min: 60, max: 160, step: 0.5 },
	{ key: "b", label: "side b", min: 0.1, max: 3, step: 0.01 },
	{ key: "t", label: "c : d : e", min: 0, max: 1, step: 0.005 },
];

export function PentagonEdgesControls() {
	const params = useConfiguration((s) => s.pentParams);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const setParam = useCallback(
		(key: keyof PentEdgeParams, value: number) =>
			useConfiguration.getState().set({ pentParams: { ...useConfiguration.getState().pentParams, [key]: value } }),
		[],
	);
	const setScaffold = useCallback(
		(v: boolean) => useConfiguration.getState().set({ freedrawScaffold: v }),
		[],
	);

	const solved = solveEdgeBoard(params);
	const angles = solved.ok ? solved.board.angles : null;

	return (
		<div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1 rounded-md bg-surface-overlay/95 p-3 text-xs backdrop-blur">
			{SLIDERS.map((s) => (
				<label key={s.key} className="flex items-center gap-2">
					<span className="w-14 text-fg-secondary">{s.label}</span>
					<input
						type="range"
						min={s.min}
						max={s.max}
						step={s.step}
						value={params[s.key]}
						onChange={(e) => setParam(s.key, Number(e.target.value))}
					/>
					<span className="w-12 text-right font-mono text-fg">
						{s.key === "t" ? params.t.toFixed(2) : params[s.key].toFixed(s.key === "b" ? 2 : 1)}
					</span>
				</label>
			))}
			{angles ? (
				// C and E are pinned, so they are reported and not offered.
				<span className="pt-1 text-fg-muted">
					C = {angles.C.toFixed(1)}° · E = {angles.E.toFixed(1)}° (pinned)
				</span>
			) : (
				<span className="pt-1 text-danger">not a pentagon here</span>
			)}
			{/* The same store field the Options tab's "Grid scaffold" checkbox and the G shortcut drive —
			    repeated here because this view's controls are already on the canvas, and a toggle you have
			    to go looking for in another tab may as well not exist. */}
			<Checkbox
				id="pentScaffold"
				label="Underlying grid"
				shortcut="G"
				checked={showScaffold}
				onCheckedChange={setScaffold}
			/>
		</div>
	);
}
