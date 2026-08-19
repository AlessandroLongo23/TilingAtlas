"use client";

import { useMemo, useRef } from "react";
import { orientClass, sqClassInSector, type SqDomains, type SqSector } from "@/lib/squaring/torusSqDomains";

// The parameter plane of the squared torus, drawn.
//
// Only the DIRECTION of the class matters, because scaling (m, n) scales the whole tiling and nothing
// else, so the real parameter space is a circle of directions in which opposite points are the same
// tiling reflected. That is why the picture is centrally symmetric and why every wall is drawn as a
// full diameter: a wall and its antipode are one line, and the two wedges of a sector are one sector.
//
// Three things are on it. The DIAMETERS are the Sq-domain walls of Dutour Sikirić, "Torus square
// tilings" (AAECC 23, 2012), §4: one square shrinks to nothing on each, so crossing one changes the
// arrangement. The WEDGES between them are the sectors, on which the combinatorics is constant. The
// TICKS around the rim are directions where two squares come out the same size, so a perfect squared
// torus is a class that misses every tick, which is what perfection is: a condition on the parameter,
// not luck.

interface Props {
	domains: SqDomains;
	sectors: SqSector[];
	cls: [number, number];
	/** Index of the sector the class sits in, or −1 when it sits exactly on a wall. */
	active: number;
	/** The largest |m| and n the steppers offer; narrow sectors can hold no reachable class. */
	limit: number;
	onPick: (cls: [number, number]) => void;
	/** Raw pointer direction during a drag, in radians. The parent decides whether it snaps. */
	onAngle: (angle: number) => void;
	hovered: number | null;
	onHover: (edge: number | null) => void;
	/** Colour per quotient edge, shared with the four stages so a wall matches its square. */
	fills: string[];
}

const SIZE = 560;
const C = SIZE / 2;
const R = 205;
const RIM = 16;

const pt = (a: number, r: number): [string, string] => [(C + r * Math.cos(a)).toFixed(2), (C - r * Math.sin(a)).toFixed(2)];

function wedgePath(from: number, to: number): string {
	const A = pt(from, R);
	const B = pt(to, R);
	// SVG's y axis points down, so a counterclockwise arc in the maths is sweep-flag 0 on screen.
	const large = to - from > Math.PI ? 1 : 0;
	return `M${C},${C} L${A[0]},${A[1]} A${R},${R} 0 ${large} 0 ${B[0]},${B[1]} Z`;
}

export function SqDomainFigure({ domains, sectors, cls, active, limit, onPick, onAngle, hovered, onHover, fills }: Props) {
	const { wedges, wallOfEdge } = useMemo(() => {
		const w = sectors.map((s, i) => ({
			i,
			mid: s.mid,
			d: [wedgePath(s.from, s.to), wedgePath(s.from + Math.PI, s.to + Math.PI)],
			pick: sqClassInSector(s, limit),
		}));
		const owner = new Map<number, number>();
		domains.walls.forEach((wall, i) => {
			for (const e of wall.edges) owner.set(e, i);
		});
		return { wedges: w, wallOfEdge: owner };
	}, [sectors, limit, domains.walls]);

	const theta = Math.atan2(cls[1], cls[0]);
	const litWall = hovered === null ? -1 : (wallOfEdge.get(hovered) ?? -1);
	// A tiling with twenty-odd edges can have two hundred tie directions, and at full weight those close
	// into a solid ring. Thinning them keeps the comb readable as separate lines for as long as it can.
	const dense = domains.ties.length > 60;
	const tip = pt(theta, R);
	const anti = pt(theta + Math.PI, R);

	// A drag starts only once the pointer has actually moved, so a plain click still reaches the wedge
	// under it and jumps to that sector's representative class. Capturing on the svg also means the wall
	// hovers stop firing mid-drag, which is what you want: the pointer is setting a class, not pointing.
	const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
	const svg = useRef<SVGSVGElement | null>(null);
	const angleAt = (clientX: number, clientY: number): number | null => {
		const el = svg.current;
		if (!el) return null;
		const b = el.getBoundingClientRect();
		const x = ((clientX - b.left) / b.width) * SIZE - C;
		const y = C - ((clientY - b.top) / b.height) * SIZE;
		// The direction is undefined at the centre, so there is a dead zone instead of a wild swing.
		return Math.hypot(x, y) < 14 ? null : Math.atan2(y, x);
	};

	return (
		<svg
			ref={svg}
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			className="h-auto w-full cursor-grab touch-none active:cursor-grabbing"
			onPointerLeave={() => onHover(null)}
			onPointerDown={(e) => {
				drag.current = { x: e.clientX, y: e.clientY, moved: false };
			}}
			onPointerMove={(e) => {
				const d = drag.current;
				if (!d) return;
				if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
				if (!d.moved) {
					d.moved = true;
					// Captured on the first real MOVE, never on the press. Capturing on pointerdown would
					// retarget the pointerup to the svg, so the click event would land on their common
					// ancestor and the wedge under the cursor would never see it: press-and-release would
					// stop jumping to a sector.
					e.currentTarget.setPointerCapture(e.pointerId);
				}
				const a = angleAt(e.clientX, e.clientY);
				if (a !== null) onAngle(a);
			}}
			onPointerUp={(e) => {
				if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				drag.current = null;
			}}
			onPointerCancel={() => {
				drag.current = null;
			}}
			role="img"
			aria-label="The parameter plane: sector walls, and the directions where two squares tie"
		>
			{/* The theme's accent is monochrome, so the live sector is marked by weight and by an outline,
			    not by hue: at 0.16 of a near-black accent it would read as one more shade of grey. */}
			{wedges.map((w) => (
				<g key={w.i}>
					{w.d.map((d, half) => (
						<path
							key={half}
							d={d}
							fill="var(--color-fg)"
							fillOpacity={w.i === active ? 0.16 : w.pick === null ? 0.02 : w.i % 2 === 0 ? 0.035 : 0.075}
							style={{ cursor: w.pick ? "pointer" : "default" }}
							onClick={() => {
								// Each sector is drawn as two antipodal wedges, so a click has to give the class on
								// THAT side. Handing back the canonical one jumps the marker across the disk and
								// point-reflects all four stages, which is the same defect as an unoriented snap.
								if (w.pick) onPick(orientClass(w.pick, half === 0 ? w.mid : w.mid + Math.PI));
							}}
						/>
					))}
					{w.i === active
						? w.d.map((d, half) => (
								<path
									key={`o${half}`}
									d={d}
									fill="none"
									stroke="var(--color-fg)"
									strokeWidth={1.6}
									strokeDasharray="7 5"
									opacity={0.7}
									pointerEvents="none"
								/>
							))
						: null}
				</g>
			))}

			{/* The two coordinate directions, so it is clear which way m and n run. */}
			<line x1={C - R} y1={C} x2={C + R} y2={C} stroke="var(--color-fg-muted)" strokeWidth={1} strokeDasharray="3 5" opacity={0.5} />
			<line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--color-fg-muted)" strokeWidth={1} strokeDasharray="3 5" opacity={0.5} />

			{/* Tie directions: two squares come out equal on each, so perfection means missing them all. */}
			{domains.ties.map((t, i) => (
				<g key={`t${i}`}>
					{[t.angle, t.angle + Math.PI].map((a, half) => {
						const p = pt(a, R + 2);
						const q = pt(a, R + RIM);
						return (
							<line
								key={half}
								x1={p[0]}
								y1={p[1]}
								x2={q[0]}
								y2={q[1]}
								stroke="var(--color-fg)"
								strokeWidth={dense ? 1 : 1.4}
								opacity={dense ? 0.3 : 0.42}
							/>
						);
					})}
				</g>
			))}

			<circle cx={C} cy={C} r={R} fill="none" stroke="var(--color-line)" strokeWidth={1.5} />

			{/* The walls. A square vanishes on each, so each is drawn in that square's own colour. */}
			{domains.walls.map((wall, i) => {
				const a = pt(wall.angle, R);
				const b = pt(wall.angle + Math.PI, R);
				const lit = i === litWall;
				return (
					<g key={`w${i}`} onPointerEnter={() => onHover(wall.edges[0])} style={{ cursor: "pointer" }}>
						<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={14} />
						<line
							x1={a[0]}
							y1={a[1]}
							x2={b[0]}
							y2={b[1]}
							stroke={lit ? "var(--color-fg)" : (fills[wall.edges[0]] ?? "var(--color-fg-muted)")}
							strokeWidth={lit ? 4.5 : 2.5}
							opacity={lit ? 1 : 0.85}
						/>
					</g>
				);
			})}

			{/* The class itself, and its antipode: the same tiling, reflected. */}
			<line x1={C} y1={C} x2={tip[0]} y2={tip[1]} stroke="var(--color-accent)" strokeWidth={2} />
			<circle cx={anti[0]} cy={anti[1]} r={5} fill="var(--color-accent)" opacity={0.35} />
			<circle cx={tip[0]} cy={tip[1]} r={7.5} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} />
			<circle cx={C} cy={C} r={3.5} fill="var(--color-fg)" />

			<text x={C + R + RIM + 6} y={C + 4} className="fill-fg-muted font-mono" fontSize={15}>
				m
			</text>
			<text x={C + 6} y={C - R - RIM - 6} className="fill-fg-muted font-mono" fontSize={15}>
				n
			</text>
		</svg>
	);
}
