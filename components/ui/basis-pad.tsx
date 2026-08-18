"use client";

import { Fragment, memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
	IDENTITY_VECTORS,
	PAD_GRID,
	PAD_RANGE,
	cross,
	deformFromVectors,
	padToWorld,
	resolveDrag,
	vectorsFromDeform,
	worldToPad,
	type PadGeom,
	type PadVec,
} from "@/lib/render/basisPad";
import type { Mat2 } from "@/lib/render/flatView";

// A 2x2 linear map, edited the way it is actually understood: as the two vectors the unit basis lands on.
// Red is D·(1,0), blue is D·(0,1) — literally the matrix's two columns — so dragging one IS editing two
// numbers, and the parallelogram they span is the determinant, drawn instead of described.
//
// Everything is in CSS pixels (viewBox = the element's own size) so the rules stay hairlines and the tick
// text keeps its weight, the same discipline as components/param-region-pad.tsx. Only the DATA is in
// world units, and both axes share one scale — a plot that distorted the matrix it is showing would be
// its own bug.
//
// OFF THE REACT HOT PATH, and that is why the value arrives as read/write/subscribe instead of as a
// `value` prop: a changing prop would re-render ~280 SVG nodes on every pointer move. The chrome — box,
// 0.25 rules, axes, labels — renders once and never again; the four things that move (two arrows, the
// parallelogram, the determinant readout) are mutated through refs by `paint`. A drag is about a dozen
// attribute writes.

const PLOT = 136; // px, the side of the [-2, 2]² square
const M = { l: 10, r: 10, t: 10, b: 16 };
const W = M.l + PLOT + M.r;
const H = M.t + PLOT + M.b;
const GEOM: PadGeom = { ox: M.l + PLOT / 2, oy: M.t + PLOT / 2, scale: PLOT / (2 * PAD_RANGE) };
const HEAD = 5; // arrowhead half-width, px
const GRAB_R = 9; // invisible grab radius around each arrow tip, px

const RED = "hsl(354 74% 56%)";
const BLUE = "hsl(214 78% 56%)";

/** The arrowhead as a filled triangle at the tip, pointing along the vector. Empty at zero length. */
function head(tip: PadVec, origin: PadVec): string {
	const dx = tip.x - origin.x, dy = tip.y - origin.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return "";
	const ux = dx / len, uy = dy / len;
	const bx = tip.x - ux * HEAD * 2, by = tip.y - uy * HEAD * 2;
	return `M ${tip.x} ${tip.y} L ${bx - uy * HEAD} ${by + ux * HEAD} L ${bx + uy * HEAD} ${by - ux * HEAD} Z`;
}

interface BasisPadProps {
	/** The current matrix, read imperatively — never a prop, see the note above. */
	read: () => Mat2;
	write: (m: Mat2) => void;
	/** Call `cb` whenever the matrix changes from anywhere; return the unsubscribe. Must be stable. */
	subscribe: (cb: () => void) => () => void;
	label?: string;
}

export const BasisPad = memo(function BasisPad({ read, write: commit, subscribe, label }: BasisPadProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	// Which vector the pointer grabbed, and the last value it was ACCEPTED at — the determinant rule needs
	// to know where the drag came from to pick which side of the constraint to slide along.
	const dragRef = useRef<{ which: "red" | "blue"; prev: PadVec } | null>(null);
	const [keyFocus, setKeyFocus] = useState(false);

	// The markup is seeded from the IDENTITY, not from the current value, and `paint` corrects it in the
	// effect below. Seeding from the store instead produced a hydration mismatch: /play rehydrates its
	// view from the query string, so the client's first render can hold a matrix the server never saw.
	const live = useRef<{
		red: SVGLineElement | null;
		redHead: SVGPathElement | null;
		blue: SVGLineElement | null;
		blueHead: SVGPathElement | null;
		redGrab: SVGCircleElement | null;
		blueGrab: SVGCircleElement | null;
		cell: SVGPolygonElement | null;
		out: HTMLSpanElement | null;
	}>({ red: null, redHead: null, blue: null, blueHead: null, redGrab: null, blueGrab: null, cell: null, out: null });

	const paint = useCallback(() => {
		const { red, blue } = vectorsFromDeform(read());
		const o = worldToPad({ x: 0, y: 0 }, GEOM);
		const r = worldToPad(red, GEOM);
		const b = worldToPad(blue, GEOM);
		const L = live.current;
		L.red?.setAttribute("x2", String(r.x));
		L.red?.setAttribute("y2", String(r.y));
		L.blue?.setAttribute("x2", String(b.x));
		L.blue?.setAttribute("y2", String(b.y));
		L.redHead?.setAttribute("d", head(r, o));
		L.blueHead?.setAttribute("d", head(b, o));
		L.redGrab?.setAttribute("cx", String(r.x));
		L.redGrab?.setAttribute("cy", String(r.y));
		L.blueGrab?.setAttribute("cx", String(b.x));
		L.blueGrab?.setAttribute("cy", String(b.y));
		L.cell?.setAttribute(
			"points",
			`${o.x},${o.y} ${r.x},${r.y} ${r.x + b.x - o.x},${r.y + b.y - o.y} ${b.x},${b.y}`,
		);
		if (L.out) L.out.textContent = cross(red, blue).toFixed(2);
	}, [read]);

	// One subscription is the ONLY way the picture updates: the drag, the arrow keys and a reset from
	// anywhere else all reach it the same way, so the pad cannot disagree with the tiling.
	useEffect(() => {
		paint();
		return subscribe(paint);
	}, [paint, subscribe]);

	const set = useCallback(
		(which: "red" | "blue", raw: PadVec, prev: PadVec, snap: boolean) => {
			const cur = vectorsFromDeform(read());
			const other = which === "red" ? cur.blue : cur.red;
			const next = resolveDrag(raw, other, prev, { snap });
			commit(which === "red" ? deformFromVectors(next, cur.blue) : deformFromVectors(cur.red, next));
		},
		[read, commit],
	);

	const pointAt = (e: { clientX: number; clientY: number }): PadVec | null => {
		const svg = svgRef.current;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		// Laid out at exactly W×H CSS px, but honour any scaling anyway.
		return padToWorld(
			((e.clientX - rect.left) * W) / rect.width,
			((e.clientY - rect.top) * H) / rect.height,
			GEOM,
		);
	};

	const grabFor = (which: "red" | "blue") => ({
		onPointerDown: (e: ReactPointerEvent<SVGElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			const cur = vectorsFromDeform(read());
			dragRef.current = { which, prev: which === "red" ? cur.red : cur.blue };
			const p = pointAt(e);
			if (p) set(which, p, dragRef.current.prev, e.shiftKey);
		},
		onPointerMove: (e: ReactPointerEvent<SVGElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			const d = dragRef.current;
			const p = pointAt(e);
			if (!d || !p) return;
			set(d.which, p, d.prev, e.shiftKey);
			// Carry forward the value that was ACCEPTED, so a drag running into the determinant wall keeps
			// sliding along the side it arrived from instead of flipping across it.
			const cur = vectorsFromDeform(read());
			d.prev = d.which === "red" ? cur.red : cur.blue;
		},
		onPointerUp: () => { dragRef.current = null; },
		onPointerCancel: () => { dragRef.current = null; },
	});

	const nudge = (which: "red" | "blue", dx: number, dy: number, big: boolean) => {
		const p = which === "red" ? vectorsFromDeform(read()).red : vectorsFromDeform(read()).blue;
		const step = big ? PAD_GRID : 0.05;
		set(which, { x: p.x + dx * step, y: p.y + dy * step }, p, false);
	};

	const reset = () => commit(deformFromVectors(IDENTITY_VECTORS.red, IDENTITY_VECTORS.blue));

	// Static chrome, built once and never reconciled again.
	const rules: number[] = [];
	for (let t = -PAD_RANGE; t <= PAD_RANGE + 1e-9; t += PAD_GRID) rules.push(Number(t.toFixed(4)));
	const o = worldToPad({ x: 0, y: 0 }, GEOM);
	const r0 = worldToPad(IDENTITY_VECTORS.red, GEOM);
	const b0 = worldToPad(IDENTITY_VECTORS.blue, GEOM);

	return (
		<div className="grid w-full gap-2">
			{/* The readout row is unconditional: `label` is optional (inside a drawer whose own checkbox
			    already names it), but the determinant is not — it is the quantity the drag is constrained
			    by, so the wall a drag hits always has a number attached to it. */}
			<div className="flex flex-row items-center justify-between">
				{label ? <span className="text-sm font-medium text-fg-secondary">{label}</span> : <span />}
				<span className="text-xs font-medium text-accent">
					det <span ref={(el) => { live.current.out = el; }} className="tabular-nums">1.00</span>
				</span>
			</div>
			<svg
				ref={svgRef}
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				className="touch-none overflow-visible outline-none"
				// role="application" is load-bearing: /play's global key handler bails out inside one, which
				// is what stops an arrow key from both nudging a vector and stepping the catalogue.
				role="application"
				aria-label="Basis vectors of the view deformation"
				tabIndex={0}
				onFocus={() => setKeyFocus(true)}
				onBlur={() => setKeyFocus(false)}
				onDoubleClick={reset}
				onKeyDown={(e) => {
					// Alt aims the keyboard at the blue vector; without it, red. Shift steps a whole 0.25 rule.
					const which = e.altKey ? "blue" : "red";
					const d: Record<string, [number, number]> = {
						ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
					};
					if (d[e.key]) {
						e.preventDefault();
						nudge(which, d[e.key][0], d[e.key][1], e.shiftKey);
					} else if (e.key === "0" || e.key === "Escape") {
						e.preventDefault();
						reset();
					}
				}}
			>
				<defs>
					{/* The parallelogram's fourth corner is red + blue, which can land outside the box even when
					    both vectors are inside it. Clip it, or a thin determinant paints a spike across the
					    controls beside the pad (the svg is overflow-visible for the caption). */}
					<clipPath id="basis-pad-clip">
						<rect x={M.l} y={M.t} width={PLOT} height={PLOT} />
					</clipPath>
				</defs>
				{/* No opaque plot ground — the pad sits on the sidebar's own surface, like the region pad. */}
				<rect
					x={M.l} y={M.t} width={PLOT} height={PLOT}
					fill="none"
					className={keyFocus ? "stroke-line-focus" : "stroke-line"}
					strokeWidth={keyFocus ? 1.5 : 1}
					shapeRendering="crispEdges"
				/>
				{/* The 0.25 rules, integers a shade heavier so the unit square stays readable among them. */}
				<g className="stroke-fg-muted/15" strokeWidth={0.5} shapeRendering="crispEdges">
					{rules.filter((t) => Math.abs(t - Math.round(t)) >= 1e-9).map((t) => {
						const p = worldToPad({ x: t, y: t }, GEOM);
						return (
							<Fragment key={t}>
								<line x1={p.x} y1={M.t} x2={p.x} y2={M.t + PLOT} />
								<line x1={M.l} y1={p.y} x2={M.l + PLOT} y2={p.y} />
							</Fragment>
						);
					})}
				</g>
				<g className="stroke-fg-muted/35" strokeWidth={0.5} shapeRendering="crispEdges">
					{rules.filter((t) => Math.abs(t - Math.round(t)) < 1e-9 && t !== 0).map((t) => {
						const p = worldToPad({ x: t, y: t }, GEOM);
						return (
							<Fragment key={t}>
								<line x1={p.x} y1={M.t} x2={p.x} y2={M.t + PLOT} />
								<line x1={M.l} y1={p.y} x2={M.l + PLOT} y2={p.y} />
							</Fragment>
						);
					})}
				</g>
				<g className="stroke-fg-muted/60" strokeWidth={1} shapeRendering="crispEdges">
					<line x1={M.l} y1={o.y} x2={M.l + PLOT} y2={o.y} />
					<line x1={o.x} y1={M.t} x2={o.x} y2={M.t + PLOT} />
				</g>

				{/* The image of the unit square. Its area IS the determinant, so the floor that stops a drag
				    has a visible meaning instead of being a number that mysteriously refuses to move. */}
				<polygon
					ref={(el) => { live.current.cell = el; }}
					points=""
					className="fill-accent/15"
					stroke="none"
					pointerEvents="none"
					clipPath="url(#basis-pad-clip)"
				/>

				<line ref={(el) => { live.current.red = el; }}
					x1={o.x} y1={o.y} x2={r0.x} y2={r0.y} stroke={RED} strokeWidth={2} pointerEvents="none" />
				<path ref={(el) => { live.current.redHead = el; }} d={head(r0, o)} fill={RED} pointerEvents="none" />
				<line ref={(el) => { live.current.blue = el; }}
					x1={o.x} y1={o.y} x2={b0.x} y2={b0.y} stroke={BLUE} strokeWidth={2} pointerEvents="none" />
				<path ref={(el) => { live.current.blueHead = el; }} d={head(b0, o)} fill={BLUE} pointerEvents="none" />

				{/* Grab targets, comfortably larger than the arrowheads they sit on. Blue is last so it wins
				    where the two tips overlap. */}
				<circle ref={(el) => { live.current.redGrab = el; }}
					cx={r0.x} cy={r0.y} r={GRAB_R} fill="transparent" className="cursor-grab" {...grabFor("red")} />
				<circle ref={(el) => { live.current.blueGrab = el; }}
					cx={b0.x} cy={b0.y} r={GRAB_R} fill="transparent" className="cursor-grab" {...grabFor("blue")} />

				{/* Short enough to sit inside the plot's own width — the svg is overflow-visible, so a longer
				    caption spills into the controls beside it. */}
				<text x={M.l} y={M.t + PLOT + 11} className="fill-fg-muted" fontSize={8}>
					shift snaps · double-click resets
				</text>
			</svg>
		</div>
	);
});
