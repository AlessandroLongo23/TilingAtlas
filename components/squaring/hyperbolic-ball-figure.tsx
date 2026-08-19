"use client";

import { useMemo } from "react";
import { geodesicThroughPoints } from "@/lib/render/hyperbolic";
import type { CylinderLayerData } from "@/lib/squaring/shelf";
import { voltageColor } from "./stage-shared";

// Stages 1 and 2 of the hyperbolic pipeline: the ball, and the harmonic potential on it.
//
// Edges are drawn as GEODESICS, the circular arcs orthogonal to the unit circle, not as chords. At
// {3,7} and beyond the difference is not cosmetic: chords make the triangles bulge outward and the
// tiling stops looking like the thing it is. The repo already carries the conic form of a geodesic in
// lib/render/hyperbolic.ts, so this is a conversion to an SVG arc, not new geometry.
//
// The wired sink has no position, because it stands for the entire boundary. That is the honest picture:
// the unit circle IS the sink, and every boundary vertex connects straight to it.

interface Props {
	layer: CylinderLayerData;
	mode: "plain" | "flow";
	/**
	 * Hyperbolic records draw their edges as geodesic arcs; the Euclidean {3,6} draws straight lines and
	 * has no boundary at infinity to converge on, only a wired ring at finite distance. Drawing it with
	 * the hyperbolic kernel produces nonsense, which is how this prop came to exist.
	 */
	geometry: "hyperbolic" | "euclidean";
	hovered: number | null;
	onHover: (edge: number | null) => void;
}

const SIZE = 1000;
const R = 470;

/** SVG path for the geodesic between two disk points, as an arc of the orthogonal circle. */
function geodesicPath(a: [number, number], b: [number, number], straight: boolean): string {
	const to = (p: [number, number]) => [SIZE / 2 + p[0] * R, SIZE / 2 - p[1] * R] as const;
	const A = to(a);
	const B = to(b);
	if (straight) return `M${A[0].toFixed(2)},${A[1].toFixed(2)}L${B[0].toFixed(2)},${B[1].toFixed(2)}`;
	const g = geodesicThroughPoints({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
	if (Math.abs(g.c0) < 1e-9) return `M${A[0].toFixed(2)},${A[1].toFixed(2)}L${B[0].toFixed(2)},${B[1].toFixed(2)}`;
	const cx = -g.c1 / (2 * g.c0);
	const cy = -g.c2 / (2 * g.c0);
	const rr = cx * cx + cy * cy - 1;
	if (rr <= 1e-12) return `M${A[0].toFixed(2)},${A[1].toFixed(2)}L${B[0].toFixed(2)},${B[1].toFixed(2)}`;
	const rad = Math.sqrt(rr) * R;
	// Two points inside the disk are always joined by the MINOR arc, so large-arc is 0; the sweep
	// follows the sign of the cross product in screen coordinates, where y points down.
	const C = to([cx, cy]);
	const cross = (A[0] - C[0]) * (B[1] - C[1]) - (A[1] - C[1]) * (B[0] - C[0]);
	const sweep = cross > 0 ? 1 : 0;
	return `M${A[0].toFixed(2)},${A[1].toFixed(2)}A${rad.toFixed(2)},${rad.toFixed(2)} 0 0 ${sweep} ${B[0].toFixed(2)},${B[1].toFixed(2)}`;
}

export function HyperbolicBallFigure({ layer, mode, geometry, hovered, onHover }: Props) {
	const straight = geometry === "euclidean";
	const { paths, sides, maxSide, dots, rimR } = useMemo(() => {
		const s = new Array<number>(layer.edges.length).fill(0);
		for (const q of layer.squares) s[q.edge] = q.side;
		const p = layer.edges.map(([u, v], i) => {
			const a = layer.positions[u];
			const b = layer.positions[v];
			// An edge with the sink runs to the rim: draw it as a short radial stub from its real end.
			if (!a || !b) {
				const real = a ?? b;
				if (!real) return null;
				const len = Math.hypot(real[0], real[1]) || 1;
				const reach = straight ? len : 0.995;
				const out: [number, number] = [(real[0] / len) * reach, (real[1] / len) * reach];
				return { d: geodesicPath(real as [number, number], out, straight), edge: i, rim: true };
			}
			return { d: geodesicPath(a as [number, number], b as [number, number], straight), edge: i, rim: false };
		});
		const d = layer.positions
			.map((pos, v) => (pos ? { x: pos[0], y: pos[1], v } : null))
			.filter((x): x is { x: number; y: number; v: number } => x !== null);
		let far = 0;
		for (const q of d) far = Math.max(far, Math.hypot(q.x, q.y));
		return { paths: p, sides: s, maxSide: Math.max(...s, 1e-9), dots: d, rimR: straight ? far : 1 };
	}, [layer, straight]);

	const flow = mode === "flow";
	const toX = (x: number) => SIZE / 2 + x * R;
	const toY = (y: number) => SIZE / 2 - y * R;

	return (
		<svg
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			className="h-full w-full"
			onPointerLeave={() => onHover(null)}
			role="img"
			aria-label={flow ? "The harmonic potential on the hyperbolic ball" : "A ball in the hyperbolic tiling"}
		>
			{/* The boundary at infinity. Shorting every outer vertex to it is what makes this a cylinder. */}
			<circle
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R * rimR}
				fill="var(--color-surface-overlay)"
				fillOpacity={0.3}
				stroke="var(--color-fg)"
				strokeWidth={3}
				strokeDasharray="10 8"
				opacity={0.8}
			/>
			{paths.map((p) =>
				p === null ? null : (
					<g key={p.edge} onPointerEnter={() => onHover(p.edge)} style={{ cursor: "pointer" }}>
						<path d={p.d} fill="none" stroke="transparent" strokeWidth={12} />
						<path
							d={p.d}
							fill="none"
							stroke={
								p.edge === hovered
									? "var(--color-fg)"
									: flow
										? voltageColor(1 - sides[p.edge] / maxSide)
										: "var(--color-fg-muted)"
							}
							strokeWidth={
								p.edge === hovered
									? (flow ? 2 + 14 * (sides[p.edge] / maxSide) : 2) + 4
									: flow
										? 2 + 14 * (sides[p.edge] / maxSide)
										: 2
							}
							strokeLinecap="round"
							opacity={p.rim ? 0.35 : 1}
						/>
					</g>
				),
			)}
			{flow
				? dots.map((d) => (
						<circle
							key={d.v}
							cx={toX(d.x)}
							cy={toY(d.y)}
							r={dots.length > 120 ? 4 : 7}
							fill={voltageColor(layer.potential[d.v])}
							stroke="var(--color-bg)"
							strokeWidth={1.2}
						/>
					))
				: null}
		</svg>
	);
}
