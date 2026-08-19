"use client";

import { useMemo } from "react";
import type { TorusMap } from "@/lib/squaring/torusMap";
import type { TorusSquaring } from "@/lib/squaring/torusSquaring";
import { voltageColor } from "./stage-shared";
import { buildPatch, num, torusFills, viewFit } from "./torus-shared";

// Stages 1 and 2 of the squared-torus pipeline.
//
// "plain" draws the periodic tiling with one translation cell outlined: the object, and the lattice
// that turns it into a torus. "flow" draws the same patch carrying the harmonic 1-form — vertices
// coloured by potential, edges thickened by current — which is the genus-1 replacement for the
// polyhedron page's spring embedding.
//
// The potential is QUASI-periodic, not periodic, and the drawing has to show that or the whole idea is
// lost: crossing the cell once adds m to it, crossing the other way adds n. So the colour ramp climbs
// steadily across the patch instead of repeating, and that climb is the homology class made visible.

interface Props {
	map: TorusMap;
	squaring: TorusSquaring;
	mode: "plain" | "flow";
	hovered: number | null;
	onHover: (edge: number | null) => void;
	onPick?: (edge: number) => void;
	radius?: number;
}

const SIZE = 1000;

export function TorusTilingFigure({ map, squaring, mode, hovered, onHover, onPick, radius = 1 }: Props) {
	const { patch, project, fills, sides, maxSide, potAt, potRange } = useMemo(() => {
		const p = buildPatch(map, radius);
		const proj = viewFit(p.bounds, SIZE, 40);
		const f = torusFills(squaring, map.E);
		const s = new Array<number>(map.E).fill(0);
		for (const sq of squaring.squares) s[sq.edge] = num(sq.side);
		const ly1 = num(squaring.lattice[0][1]);
		const ly2 = num(squaring.lattice[1][1]);
		const base = squaring.potential.map(num);
		const at = (v: number, i: number, j: number): number => base[v] + i * ly1 + j * ly2;
		let lo = Infinity;
		let hi = -Infinity;
		for (let i = -radius; i <= radius; i++) {
			for (let j = -radius; j <= radius; j++) {
				for (let v = 0; v < base.length; v++) {
					lo = Math.min(lo, at(v, i, j));
					hi = Math.max(hi, at(v, i, j));
				}
			}
		}
		return { patch: p, project: proj, fills: f, sides: s, maxSide: Math.max(...s, 1), potAt: at, potRange: [lo, hi] as const };
	}, [map, squaring, radius]);

	const cell = patch.cell.map(project);
	const flow = mode === "flow";

	return (
		<svg
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			className="h-full w-full"
			onPointerLeave={() => onHover(null)}
			role="img"
			aria-label={flow ? "The harmonic flow on the tiling" : "The periodic tiling and one translation cell"}
		>
			{patch.faces.map((f, i) => {
				const pts = f.points.map(project);
				return (
					<polygon
						key={`f${i}`}
						points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
						fill="var(--color-surface-overlay)"
						fillOpacity={flow ? 0.2 : 0.85}
						stroke="none"
					/>
				);
			})}

			{patch.segments.map((s, i) => {
				const a = project(s.a);
				const b = project(s.b);
				const isHovered = s.edge === hovered;
				const w = flow ? 2 + 16 * (sides[s.edge] / maxSide) : 2.5;
				return (
					<g key={`s${i}`} onPointerEnter={() => onHover(s.edge)} onClick={() => onPick?.(s.edge)} style={{ cursor: onPick ? "pointer" : "default" }}>
						{/* A fat invisible line so a 2px edge is still easy to point at. */}
						<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={14} />
						<line
							x1={a[0]}
							y1={a[1]}
							x2={b[0]}
							y2={b[1]}
							stroke={isHovered ? "var(--color-fg)" : flow ? fills[s.edge] : "var(--color-fg-muted)"}
							strokeWidth={isHovered ? w + 4 : w}
							strokeLinecap="round"
							opacity={flow && sides[s.edge] === 0 ? 0.28 : 1}
						/>
					</g>
				);
			})}

			{flow
				? Array.from({ length: (2 * radius + 1) ** 2 }, (_, n) => {
						const i = (n % (2 * radius + 1)) - radius;
						const j = Math.floor(n / (2 * radius + 1)) - radius;
						const [a1, a2] = map.basis;
						return map.vertices.map((v, vi) => {
							const p = project([v[0] + i * a1[0] + j * a2[0], v[1] + i * a1[1] + j * a2[1]]);
							const t = (potAt(vi, i, j) - potRange[0]) / (potRange[1] - potRange[0] || 1);
							return (
								<circle
									key={`v${n}-${vi}`}
									cx={p[0]}
									cy={p[1]}
									r={7}
									fill={voltageColor(t)}
									stroke="var(--color-bg)"
									strokeWidth={1.5}
								/>
							);
						});
					})
				: null}

			{/* One translation cell. Gluing its opposite sides is what makes the torus. */}
			<polygon
				points={cell.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}
				fill="none"
				stroke="var(--color-fg)"
				strokeWidth={3}
				strokeDasharray="10 7"
				opacity={0.75}
			/>
		</svg>
	);
}
