"use client";

// The floating cell editor for the Tegula shelf: a window onto the tiling with a handle on each edge
// class that is allowed to bend. Dragging a handle reshapes every edge of that class at once, on the
// canvas behind, and only in the ways that edge's own symmetry permits (lib/tilings/tegula.ts), so
// whatever the reader draws is still a picture of the same topological type.
//
// It exists because a type has no shape of its own. The shipped bends are one choice; this hands the
// choice over, the way Tegula's own fundamental-domain panel does.
//
// SVG for the reason the isohedral prototile is: a few outlines and handles, themed, redrawn on a drag.

import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
	bendTegula,
	handleFromPoint,
	sphereHandleFromPoint,
	sphereHandles,
	sphereRings,
	tegulaHandles,
	tegulaHue,
	type TegulaCell,
} from "@/lib/tilings/tegula";
import type { SphPolyPattern } from "@/lib/tilings/sph-poly";
import { useTegulaShapes } from "@/stores/tegulaShapes";
import { tileFill } from "@/lib/render/tilePalette";

const KIND_HINT: Record<string, string> = {
	J: "free",
	U: "mirrored about its midpoint",
	S: "half-turn about its midpoint",
};

type P2 = number[];
type V3 = [number, number, number];

/** What the panel draws, whichever surface the type lives on: outlines, one handle per class with its
 *  dashed chord, the box they sit in, and how a pointer position becomes a handle. */
interface View {
	box: [number, number, number, number];
	polys: { points: P2[]; hue: number }[];
	handles: { cls: number; kind: string; from: P2; to: P2; at: P2 }[];
	read: (cls: number, p: P2) => [number, number];
	disc?: boolean;
}

function planeView(cell: TegulaCell, shape: number[][]): View {
	const hs = tegulaHandles(cell, shape);
	const bent = bendTegula(cell, shape).cellPolygons as { vertices: number[][]; hue: number }[];
	// Frame the straight tiles with room for a full-height bend, so the box does not rescale mid-drag.
	const xs = cell.polys.flatMap((p) => p.v.map((q) => q[0]));
	const ys = cell.polys.flatMap((p) => p.v.map((q) => q[1]));
	const pad = 0.3;
	const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
	const [w, h] = [Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0];
	// The cell's tiles are one representative each, wherever the developer's walk left them, so drawn
	// alone they are scattered pieces with gaps between. Repeat them over the lattice and let the
	// viewBox clip: the panel then shows a filled window of the tiling. The reach is whatever covers
	// the box, measured in lattice coordinates from its four corners.
	const [[ax, ay], [bx, by]] = cell.basis;
	const det = ax * by - ay * bx;
	const lat = [
		[x0, y0],
		[x0 + w, y0],
		[x0, y0 + h],
		[x0 + w, y0 + h],
	].map(([x, y]) => [(x * by - y * bx) / det, (ax * y - ay * x) / det]);
	const span = (k: number) => [
		Math.floor(Math.min(...lat.map((q) => q[k]))) - 1,
		Math.ceil(Math.max(...lat.map((q) => q[k]))) + 1,
	];
	const [[i0, i1], [j0, j1]] = [span(0), span(1)];
	const polys: View["polys"] = [];
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j1; j++) {
			const [sx, sy] = [i * ax + j * bx, i * ay + j * by];
			for (const p of bent) polys.push({ points: p.vertices.map(([x, y]) => [x + sx, y + sy]), hue: p.hue });
		}
	}
	return {
		box: [x0, y0, w, h],
		polys,
		handles: hs.map((q) => ({ cls: q.cls, kind: q.kind, from: q.a, to: [q.a[0] + q.d[0], q.a[1] + q.d[1]], at: q.at })),
		read: (cls, p) => handleFromPoint(hs.find((q) => q.cls === cls)!, p),
	};
}

// The near half of the solid, seen straight on from above the first bendable edge: a disc. Every edge
// class has a copy on that half, so every handle is in reach without turning anything.
function sphereView(p: SphPolyPattern, shape: number[][]): View {
	const b = p.bend!;
	let axis: V3 = [0, 0, 1];
	find: for (let f = 0; f < p.faces.length; f++) {
		for (let i = 0; i < p.faces[f].length; i++) {
			const tag = b.sides[f][i];
			if ((tag & 3) !== 0 || b.kinds[tag >> 2] === "I") continue;
			const u = p.vertices[p.faces[f][i]],
				v = p.vertices[p.faces[f][(i + 1) % p.faces[f].length]];
			const l = Math.hypot(u[0] + v[0], u[1] + v[1], u[2] + v[2]) || 1;
			axis = [(u[0] + v[0]) / l, (u[1] + v[1]) / l, (u[2] + v[2]) / l];
			break find;
		}
	}
	const seed: V3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
	const norm = (q: number[]): V3 => {
		const l = Math.hypot(q[0], q[1], q[2]) || 1;
		return [q[0] / l, q[1] / l, q[2] / l];
	};
	const ex = norm([
		seed[1] * axis[2] - seed[2] * axis[1],
		seed[2] * axis[0] - seed[0] * axis[2],
		seed[0] * axis[1] - seed[1] * axis[0],
	]);
	const ey: V3 = [
		axis[1] * ex[2] - axis[2] * ex[1],
		axis[2] * ex[0] - axis[0] * ex[2],
		axis[0] * ex[1] - axis[1] * ex[0],
	];
	const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
	const flat = (q: number[]): P2 => [dot(q, ex), dot(q, ey)];
	const hs = sphereHandles(p, shape, axis);
	return {
		box: [-1.06, -1.06, 2.12, 2.12],
		disc: true,
		polys: sphereRings(p, shape).flatMap((ring, f) =>
			dot(b.centers[f], axis) > 0 ? [{ points: ring.map(flat), hue: tegulaHue(p.fillGroup?.[f] ?? 0) }] : [],
		),
		handles: hs.map((q) => ({ cls: q.cls, kind: q.kind, from: flat(q.a), to: flat(q.b), at: flat(q.at) })),
		read: (cls, [x, y]) => {
			const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
			return sphereHandleFromPoint(hs.find((q) => q.cls === cls)!, [
				x * ex[0] + y * ey[0] + z * axis[0],
				x * ex[1] + y * ey[1] + z * axis[1],
				x * ex[2] + y * ey[2] + z * axis[2],
			]);
		},
	};
}

export function TegulaCellEditor({ id, cell, sphere }: { id: string; cell?: TegulaCell; sphere?: SphPolyPattern }) {
	const custom = useTegulaShapes((s) => s.byId[id]);
	const shape = custom ?? cell?.shape ?? sphere?.bend?.shape ?? [];
	const svgRef = useRef<SVGSVGElement>(null);
	const drag = useRef<number | null>(null);

	const view = cell ? planeView(cell, shape) : sphere?.bend ? sphereView(sphere, shape) : null;
	if (!view) return null;
	const { handles, polys } = view;
	const [x0, y0, w, h] = view.box;
	const unit = Math.max(w, h) / 100;

	const move = (e: React.PointerEvent) => {
		const svg = svgRef.current;
		const m = svg?.getScreenCTM();
		if (!svg || drag.current === null || !m) return;
		// The y axis is flipped for display (mathematical up), so flip the pointer back.
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
		const next = shape.map((q) => [...q]);
		next[drag.current] = view.read(drag.current, [p.x, -p.y]);
		useTegulaShapes.getState().set(id, next);
	};

	if (handles.length === 0) return null;
	return (
		<div className="rounded-xl bg-surface-raised/95 p-2.5 shadow-lg ring-1 ring-line-subtle backdrop-blur-sm">
			<div className="mb-1.5 flex items-center justify-between text-[11px] text-fg-secondary">
				<span>Cell shape</span>
				<button
					type="button"
					aria-label="Reset the cell shape"
					title="Reset"
					disabled={!custom}
					onClick={() => useTegulaShapes.getState().reset(id)}
					className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"
				>
					<RotateCcw size={12} />
				</button>
			</div>
			<svg
				ref={svgRef}
				viewBox={`${x0} ${-(y0 + h)} ${w} ${h}`}
				className="block w-full touch-none rounded bg-surface select-none"
				onPointerMove={(e) => drag.current !== null && move(e)}
				onPointerUp={() => (drag.current = null)}
				onPointerLeave={() => (drag.current = null)}
			>
				{view.disc ? (
					<circle cx={0} cy={0} r={1} fill="none" stroke="currentColor" strokeWidth={unit * 0.6} opacity={0.4} />
				) : null}
				{polys.map((p, i) => (
					<polygon
						key={i}
						points={p.points.map(([x, y]) => `${x},${-y}`).join(" ")}
						fill={p.hue < 0 ? "currentColor" : tileFill(p.hue, 0.85)}
						stroke="currentColor"
						strokeWidth={unit * 0.6}
						strokeLinejoin="round"
					/>
				))}
				{handles.map((hd) => (
					<g key={hd.cls}>
						<line
							x1={hd.from[0]}
							y1={-hd.from[1]}
							x2={hd.to[0]}
							y2={-hd.to[1]}
							stroke="currentColor"
							strokeWidth={unit * 0.5}
							strokeDasharray={`${unit * 1.5} ${unit * 1.5}`}
							opacity={0.5}
						/>
						<circle
							cx={hd.at[0]}
							cy={-hd.at[1]}
							r={unit * 3.2}
							className="cursor-grab fill-surface-raised stroke-fg active:cursor-grabbing"
							strokeWidth={unit}
							onPointerDown={(e) => {
								drag.current = hd.cls;
								(e.target as Element).setPointerCapture?.(e.pointerId);
							}}
						>
							<title>{`Edge class ${hd.cls + 1}: ${KIND_HINT[hd.kind]}`}</title>
						</circle>
					</g>
				))}
			</svg>
			<p className="mt-1.5 text-[10px] leading-snug text-fg-muted">
				Drag a handle to bend every edge of its class. Each moves only as its symmetry allows.
			</p>
		</div>
	);
}
