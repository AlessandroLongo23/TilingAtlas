"use client";

import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
	ALPHA_STEP_DEG,
	nearestInRegionDeg,
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
 * The polygon is the ONLY thing that takes a pointer: there is no enclosing rectangle to click, because a
 * click in the corner the bounding box adds has no honest answer (it used to be projected inward, which
 * read as the handle jumping somewhere unrelated). A drag that leaves the region slides along the boundary
 * instead — nearestInRegionDeg, not clampToRegion's walk-back toward the default.
 *
 * Everything is drawn in CSS pixels (viewBox = the element's own size) so tick text and hairlines keep a
 * fixed weight; only the DATA is in δ-units (1 unit = 15°, the coordinate the region is expressed in), and
 * both axes share one scale so the polygon's shape is not distorted. See docs/DEVELOPMENT_NOTES.md §103.
 *
 * OFF THE REACT HOT PATH, the same way the canvases are (see lib/stores/familyAlphas.ts). React renders the
 * chrome — axes, ticks, grid, polygon, corner dots — once per family and never again: the component is
 * memo'd and does NOT subscribe to the store, so a drag cannot re-render it. The five things that actually
 * move (two readout numbers, two guide lines, the handle) are mutated through refs from a store
 * subscription. Reconciling ~50 SVG nodes per pointer move cost 1.3ms of an 8.3ms frame; this costs a
 * dozen attribute writes. Anything added here that depends on the ANGLES belongs in `paint`, not in JSX.
 */
const PLOT = 124; // px, the square the region is fitted into
const M = { l: 30, r: 13, t: 14, b: 17 }; // px of margin for the axis ticks, their labels and the glyphs
const W = M.l + PLOT + M.r;
const H = M.t + PLOT + M.b;
const GRID_DEG = 30; // grid/tick spacing in absolute degrees, on both axes
const GREEK = ["α", "β"];

/** Absolute angles (degrees) that are multiples of GRID_DEG and fall strictly inside an axis's span. */
function gridAngles(lo: number, hi: number): number[] {
	const out: number[] = [];
	for (let a = Math.ceil(lo / GRID_DEG) * GRID_DEG; a <= hi + 1e-9; a += GRID_DEG) {
		if (a > lo + 1e-9 && a < hi - 1e-9) out.push(a);
	}
	return out;
}

/**
 * Which labels actually fit. The two ENDS are the axis's extremes and always print; a grid label prints
 * only where it clears everything already placed by `gap` px. Grid LINES are unaffected — a 12-unit axis
 * still gets its seven 30° rules, it just does not try to print seven numbers into 124px.
 */
function fitLabels(
	ends: { p: number; t: string }[],
	grid: { p: number; t: string }[],
	gap: number,
): { p: number; t: string; end: boolean }[] {
	const out = ends.map((e) => ({ ...e, end: true }));
	for (const g of grid) {
		if (out.every((q) => Math.abs(q.p - g.p) >= gap)) out.push({ ...g, end: false });
	}
	return out;
}

export const ParamRegionPad = memo(function ParamRegionPad({ paramCell }: { paramCell: ParametricCellData }) {
	// Deliberately getState(), not the hook: subscribing would re-render on every tick, which is the cost
	// this component is built to avoid. The initial values seed the markup; `paint` keeps it current.
	const alphas = resolveAlphaDegsRaw(paramCell, useFamilyAlphas.getState().values);
	const svgRef = useRef<SVGSVGElement | null>(null);
	// Keyboard focus thickens the REGION's outline instead of drawing the browser's focus rectangle — that
	// rectangle is precisely the bounding box this pad exists to not have.
	const [keyFocus, setKeyFocus] = useState(false);
	const verts = paramCell.regionVertices ?? [];
	const params = paramCell.params;

	// δ-unit extent of the region, and the single (isotropic) px-per-unit scale that fits it in PLOT².
	const xs = verts.map((p) => p[0]);
	const ys = verts.map((p) => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs);
	const minY = Math.min(...ys), maxY = Math.max(...ys);
	const spanX = Math.max(maxX - minX, 1e-6);
	const spanY = Math.max(maxY - minY, 1e-6);
	const s = Math.min(PLOT / spanX, PLOT / spanY);
	const drawW = spanX * s, drawH = spanY * s;
	const ox = M.l + (PLOT - drawW) / 2;
	const oyBottom = M.t + (PLOT + drawH) / 2;

	const px = (u: number) => ox + (u - minX) * s;
	const py = (v: number) => oyBottom - (v - minY) * s;
	const toUnits = (a: number[]): [number, number] => [
		(a[0] - params[0].alpha0Deg) / 15,
		(a[1] - params[1].alpha0Deg) / 15,
	];
	const toAlpha = (u: number, v: number): number[] => [
		params[0].alpha0Deg + u * 15,
		params[1].alpha0Deg + v * 15,
	];

	// Each axis's absolute-angle span, for the tick labels and the end caps.
	const spanDeg: [number, number][] = [
		[params[0].alpha0Deg + minX * 15, params[0].alpha0Deg + maxX * 15],
		[params[1].alpha0Deg + minY * 15, params[1].alpha0Deg + maxY * 15],
	];
	const ticksX = gridAngles(spanDeg[0][0], spanDeg[0][1]);
	const ticksY = gridAngles(spanDeg[1][0], spanDeg[1][1]);
	const uOfDeg = (a: number, j: number) => (a - params[j].alpha0Deg) / 15;
	const fmt = (a: number) => (Math.abs(a - Math.round(a)) < 0.05 ? String(Math.round(a)) : a.toFixed(1));
	const labelsX = fitLabels(
		[
			{ p: ox, t: fmt(spanDeg[0][0]) },
			{ p: ox + drawW, t: fmt(spanDeg[0][1]) },
		],
		ticksX.map((a) => ({ p: px(uOfDeg(a, 0)), t: fmt(a) })),
		23,
	);
	const labelsY = fitLabels(
		[
			{ p: oyBottom, t: fmt(spanDeg[1][0]) },
			{ p: oyBottom - drawH, t: fmt(spanDeg[1][1]) },
		],
		ticksY.map((a) => ({ p: py(uOfDeg(a, 1)), t: fmt(a) })),
		16,
	);

	const [ux, uy] = toUnits(alphas);
	const hx = px(ux), hy = py(uy);
	const poly = verts.map(([x, y]) => `${px(x)},${py(y)}`).join(" ");

	// The moving parts, addressed directly. `paint` is the single writer — the drag, the arrow keys and the
	// Command-scrub all reach it through the store subscription below, so there is one way for the handle to
	// move and it cannot disagree with the tiling.
	const live = useRef<{
		dot: SVGCircleElement | null;
		grab: SVGCircleElement | null;
		gx: SVGLineElement | null;
		gy: SVGLineElement | null;
		out: (HTMLSpanElement | null)[];
	}>({ dot: null, grab: null, gx: null, gy: null, out: [] });

	const paint = useCallback(
		(a: number[]) => {
			const l = live.current;
			const x = ox + ((a[0] - params[0].alpha0Deg) / 15 - minX) * s;
			const y = oyBottom - ((a[1] - params[1].alpha0Deg) / 15 - minY) * s;
			l.dot?.setAttribute("cx", String(x));
			l.dot?.setAttribute("cy", String(y));
			l.grab?.setAttribute("cx", String(x));
			l.grab?.setAttribute("cy", String(y));
			// horizontal guide runs from the y-axis spine across to the handle, vertical up from the x-axis
			l.gx?.setAttribute("x2", String(x));
			l.gx?.setAttribute("y1", String(y));
			l.gx?.setAttribute("y2", String(y));
			l.gy?.setAttribute("x1", String(x));
			l.gy?.setAttribute("x2", String(x));
			l.gy?.setAttribute("y2", String(y));
			for (let j = 0; j < l.out.length; j++) {
				const t = `${a[j].toFixed(1)}°`;
				if (l.out[j] && l.out[j]!.textContent !== t) l.out[j]!.textContent = t;
			}
		},
		[params, ox, oyBottom, minX, minY, s],
	);

	// One subscription, no re-render. Repaints on mount too, so a family switch (which DOES re-render, the
	// geometry having changed) lands on the store's current tuple instead of on stale markup.
	useEffect(() => {
		paint(resolveAlphaDegsRaw(paramCell, useFamilyAlphas.getState().values));
		return useFamilyAlphas.subscribe((st, prevSt) => {
			if (st.values !== prevSt.values) paint(resolveAlphaDegsRaw(paramCell, st.values));
		});
	}, [paramCell, paint]);

	const write = useCallback(
		(u: number, v: number) => {
			useFamilyAlphas.getState().set(nearestInRegionDeg(paramCell, toAlpha(u, v)));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[paramCell],
	);

	const setFromEvent = useCallback(
		(e: { clientX: number; clientY: number }) => {
			const svg = svgRef.current;
			if (!svg) return;
			const r = svg.getBoundingClientRect();
			// The element is laid out at exactly W×H CSS px, but honour any scaling anyway.
			const cx = ((e.clientX - r.left) * W) / r.width;
			const cy = ((e.clientY - r.top) * H) / r.height;
			write(minX + (cx - ox) / s, minY + (oyBottom - cy) / s);
		},
		[write, minX, minY, ox, oyBottom, s],
	);

	const nudge = (du: number, dv: number): void => {
		const step = ALPHA_STEP_DEG / 15;
		const cur = resolveAlphaDegsRaw(paramCell, useFamilyAlphas.getState().values);
		write((cur[0] - params[0].alpha0Deg) / 15 + du * step, (cur[1] - params[1].alpha0Deg) / 15 + dv * step);
	};

	const grab = {
		onPointerDown: (e: ReactPointerEvent<SVGElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			setFromEvent(e);
		},
		onPointerMove: (e: ReactPointerEvent<SVGElement>) => {
			if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromEvent(e);
		},
	};

	return (
		<div className="flex items-center gap-3">
			{/* Fixed width, tabular figures: the number's own width must not change as it is dragged, or the
			    panel (centred with -translate-x-1/2) shifts under the cursor and the drag fights itself. */}
			<div className="flex w-[9rem] shrink-0 flex-col gap-1 text-xs font-medium text-accent">
				{params.map((p, j) => (
					<span key={j} className="flex items-baseline gap-1">
						<span className="w-2">{GREEK[j]}</span>
						<span
							ref={(el) => { live.current.out[j] = el; }}
							className="w-[3.4rem] text-right tabular-nums"
						>{alphas[j].toFixed(1)}°</span>
						<span className="truncate text-[10px] font-normal text-fg-muted">{p.tile ?? ""}</span>
					</span>
				))}
			</div>
			<svg
				ref={svgRef}
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				className="touch-none overflow-visible outline-none"
				role="application"
				tabIndex={0}
				onFocus={(e) => setKeyFocus(e.currentTarget.matches(":focus-visible"))}
				onBlur={() => setKeyFocus(false)}
				aria-label={`two-angle region for ${params.map((p) => p.tile ?? "?").join(" and ")}; arrow keys adjust`}
				onKeyDown={(e) => {
					const map: Record<string, [number, number]> = {
						ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1],
					};
					const d = map[e.key];
					if (!d) return;
					e.preventDefault();
					e.stopPropagation(); // belt to the /play global handler's role="application" brace
					nudge(d[0] * (e.shiftKey ? 10 : 1), d[1] * (e.shiftKey ? 10 : 1));
				}}
			>
				<defs>
					<clipPath id="param-region-clip">
						<polygon points={poly} />
					</clipPath>
				</defs>

				{/* Axis spines, spanning exactly the region's extent — their ends ARE the extremes. */}
				<g className="stroke-fg-muted/50" strokeWidth={1} shapeRendering="crispEdges">
					<line x1={ox - 5} y1={oyBottom + 5} x2={ox + drawW} y2={oyBottom + 5} />
					<line x1={ox - 5} y1={oyBottom + 5} x2={ox - 5} y2={oyBottom - drawH} />
				</g>

				{/* Tick marks every 30° of absolute angle; numbers where they fit, the axis's two extremes
				    always. A position can then be read off the axis, not only out of the numeric readout. */}
				<g className="stroke-fg-muted/50" strokeWidth={1} shapeRendering="crispEdges">
					{ticksX.map((a) => (
						<line key={`tx${a}`}
							x1={px(uOfDeg(a, 0))} y1={oyBottom + 5} x2={px(uOfDeg(a, 0))} y2={oyBottom + 8} />
					))}
					{ticksY.map((a) => (
						<line key={`ty${a}`}
							x1={ox - 8} y1={py(uOfDeg(a, 1))} x2={ox - 5} y2={py(uOfDeg(a, 1))} />
					))}
				</g>
				<g className="fill-fg-muted tabular-nums" style={{ fontSize: 8 }}>
					{labelsX.map((l, i) => (
						<text key={`lx${i}`} x={l.p} y={H - 3} textAnchor="middle"
							className={l.end ? "fill-fg-secondary" : undefined}>{l.t}</text>
					))}
					{labelsY.map((l, i) => (
						<text key={`ly${i}`} x={ox - 10} y={l.p + 3} textAnchor="end"
							className={l.end ? "fill-fg-secondary" : undefined}>{l.t}</text>
					))}
				</g>

				{/* Which axis is which angle. */}
				<g className="fill-accent" style={{ fontSize: 9 }}>
					<text x={ox + drawW + 4} y={oyBottom + 2}>{GREEK[0]}</text>
					<text x={ox - 5} y={oyBottom - drawH - 5} textAnchor="middle">{GREEK[1]}</text>
				</g>

				{/* 30° grid, clipped to the region: a ruler for how far a drag has actually travelled. */}
				<g clipPath="url(#param-region-clip)" className="stroke-accent/25" strokeWidth={1}>
					{ticksX.map((a) => (
						<line key={`gx${a}`} x1={px(uOfDeg(a, 0))} y1={M.t} x2={px(uOfDeg(a, 0))} y2={M.t + PLOT} />
					))}
					{ticksY.map((a) => (
						<line key={`gy${a}`} x1={M.l} y1={py(uOfDeg(a, 1))} x2={M.l + PLOT} y2={py(uOfDeg(a, 1))} />
					))}
				</g>

				{/* The region. This polygon is the whole interactive surface — pointer events live here and
				    nowhere else, so there is no invisible rectangle around it to click into. */}
				<polygon
					points={poly}
					className={`cursor-crosshair fill-accent/15 ${keyFocus ? "stroke-accent" : "stroke-accent/70"}`}
					strokeWidth={keyFocus ? 2 : 1}
					{...grab}
				/>

				{/* Corners of the region: where an edge changes slope, i.e. where one tile hits zero angle and
				    a different constraint takes over. Hover for the pair. */}
				<g className="fill-accent/70 pointer-events-none">
					{verts.map(([x, y], i) => (
						<circle key={i} cx={px(x)} cy={py(y)} r={1.8}>
							<title>
								{GREEK[0]} {(params[0].alpha0Deg + x * 15).toFixed(1)}°, {GREEK[1]}{" "}
								{(params[1].alpha0Deg + y * 15).toFixed(1)}°
							</title>
						</circle>
					))}
				</g>

				{/* Where we are, read against the axes. */}
				<g className="pointer-events-none stroke-accent/45" strokeWidth={1} strokeDasharray="2 2">
					<line ref={(el) => { live.current.gx = el; }} x1={ox - 5} y1={hy} x2={hx} y2={hy} />
					<line ref={(el) => { live.current.gy = el; }} x1={hx} y1={oyBottom + 5} x2={hx} y2={hy} />
				</g>
				<circle
					ref={(el) => { live.current.dot = el; }}
					cx={hx} cy={hy} r={4} className="pointer-events-none fill-accent"
				/>
				{/* Slightly larger transparent target so the handle is still grabbable when it sits on an edge,
				    where the visible dot is half outside the polygon and would miss its hit area. */}
				<circle
					ref={(el) => { live.current.grab = el; }}
					cx={hx} cy={hy} r={7} fill="transparent" className="cursor-crosshair" {...grab}
				/>
			</svg>
		</div>
	);
});
