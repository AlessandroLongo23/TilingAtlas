"use client";

import { useCallback, useRef } from "react";
import {
	ALPHA_STEP_DEG,
	clampToRegion,
	resolveAlphaDegsRaw,
	type ParametricCellData,
} from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";

/**
 * The 2-D explorer for a COUPLED two-parameter family.
 *
 * Two sliders would be a lie here. The family has two free angles, but its valid region is a polygon, not a
 * rectangle: how far one angle can move depends on where the other one is, because a third angle is
 * determined by the pair and has to stay positive. A pair of independent box-ranged sliders would let you
 * drag into the corner the bounding box adds, where the "tiling" is not one. So the region is drawn as it
 * actually is and the family is explored by dragging a point inside it — the shape of the polygon IS the
 * shape of the family's deformation space, which is worth seeing.
 *
 * Coordinates are δ-units (1 unit = 15°) because that is what the region is expressed in; the readout
 * converts to each axis's absolute angle. See docs/DEVELOPMENT_NOTES.md §103.
 */
const PAD = 0.6; // δ-units of margin around the polygon inside the viewBox

export function ParamRegionPad({ paramCell }: { paramCell: ParametricCellData }) {
	const familyAlphas = useFamilyAlphas((s) => s.values);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const verts = paramCell.regionVertices ?? [];
	const alphas = resolveAlphaDegsRaw(paramCell, familyAlphas);
	const params = paramCell.params;

	const toUnits = (a: number[]): [number, number] => [
		(a[0] - params[0].alpha0Deg) / 15,
		(a[1] - params[1].alpha0Deg) / 15,
	];
	const toAlpha = (u: number, v: number): number[] => [
		params[0].alpha0Deg + u * 15,
		params[1].alpha0Deg + v * 15,
	];

	const xs = verts.map((p) => p[0]);
	const ys = verts.map((p) => p[1]);
	const minX = Math.min(...xs) - PAD;
	const maxX = Math.max(...xs) + PAD;
	const minY = Math.min(...ys) - PAD;
	const maxY = Math.max(...ys) + PAD;
	const [ux, uy] = toUnits(alphas);

	// y is flipped so the second angle grows upward, the way a plot reads
	const vb = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`;
	const poly = verts.map(([x, y]) => `${x},${-y}`).join(" ");
	// Stroke and handle are in δ-units like everything else in the viewBox, and the regions differ in scale
	// by an order of magnitude (a 12×20 polygon here, a 6×12 one there), so a fixed radius is a dot on one
	// family and a blob on the next. Size both from the span.
	const span = Math.max(maxX - minX, maxY - minY);
	const dot = span / 22;

	const setFromEvent = useCallback(
		(e: { clientX: number; clientY: number }) => {
			const svg = svgRef.current;
			if (!svg) return;
			const r = svg.getBoundingClientRect();
			const u = minX + ((e.clientX - r.left) / r.width) * (maxX - minX);
			const v = maxY - ((e.clientY - r.top) / r.height) * (maxY - minY);
			// clamp with the SAME projection the evaluator uses, so the handle can never sit somewhere the
			// renderer would refuse to draw
			useFamilyAlphas.getState().set(clampToRegion(paramCell, toAlpha(u, v)));
		},
		[paramCell, minX, maxX, minY, maxY],
	);

	const nudge = (du: number, dv: number): void => {
		const step = ALPHA_STEP_DEG / 15;
		useFamilyAlphas.getState().set(clampToRegion(paramCell, toAlpha(ux + du * step, uy + dv * step)));
	};

	return (
		<div className="flex items-center gap-3">
			<div className="flex flex-col gap-0.5 text-xs font-medium text-accent whitespace-nowrap">
				{params.map((p, j) => (
					<span key={j}>
						{j === 0 ? "α" : "β"} = {alphas[j].toFixed(1)}°
						<span className="ml-1 text-[10px] text-fg-muted font-normal">{p.tile ?? ""}</span>
					</span>
				))}
			</div>
			<svg
				ref={svgRef}
				viewBox={vb}
				className="h-24 w-32 cursor-crosshair touch-none rounded border border-line bg-surface"
				role="application"
				tabIndex={0}
				aria-label={`two-angle region for ${params.map((p) => p.tile ?? "?").join(" and ")}; arrow keys adjust`}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					setFromEvent(e);
				}}
				onPointerMove={(e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromEvent(e);
				}}
				onKeyDown={(e) => {
					const map: Record<string, [number, number]> = {
						ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1],
					};
					const d = map[e.key];
					if (!d) return;
					e.preventDefault();
					nudge(d[0] * (e.shiftKey ? 10 : 1), d[1] * (e.shiftKey ? 10 : 1));
				}}
			>
				<polygon points={poly} className="fill-accent/15 stroke-accent/60" strokeWidth={span / 200} />
				<circle cx={ux} cy={-uy} r={dot} className="fill-accent" />
			</svg>
			<div className="text-[10px] leading-tight text-fg-muted max-w-[9rem]">
				drag inside the region — its shape is the family&apos;s deformation space
			</div>
		</div>
	);
}
