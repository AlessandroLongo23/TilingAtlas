"use client";

// Helpers shared by the isohedral, pentagon and aperiodic article figures: a shelf canvas made live the
// way every article card is, rounded SVG coordinates, and labels that stay upright inside the kit's
// y-up Stage.

import { useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { LiveFigure } from "@/components/about/figure";
import { useParametricTilingCanvas, type ParametricCell } from "@/lib/hooks/useParametricTilingCanvas";
import { cn } from "@/lib/utils/cn";

type Pt = { x: number; y: number };

/**
 * Coordinates rounded to a thousandth. The figures render on the server too, and Node's and Chromium's
 * trigonometry can differ in the last bit; a rounded attribute hydrates identically.
 */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const pts = (p: { vertices: Pt[] }) => p.vertices.map((v) => `${r3(v.x)},${r3(v.y)}`).join(" ");
export const pathOf = (ps: { vertices: Pt[] }[]) =>
	ps.map((p) => `M${p.vertices.map((v) => `${r3(v.x)},${r3(v.y)}`).join("L")}Z`).join("");

/**
 * A shelf canvas (useParametricTilingCanvas, usePatchCanvas) inside LiveFigure. Until the reader clicks,
 * the canvas takes no pointer or wheel input at all, so the page scrolls over it; once live, the view's
 * own handlers pan, zoom and turn it as on the shelf, and right-click resets it. `children` sits over
 * the canvas (an overlay that follows the view).
 */
export function LiveCanvas({
	label,
	canvasRef,
	handlers,
	className,
	children,
	...host
}: {
	label: string;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	handlers: HTMLAttributes<HTMLCanvasElement>;
	className?: string;
	children?: ReactNode;
} & Pick<HTMLAttributes<HTMLDivElement>, "onPointerMove" | "onPointerDown" | "onPointerLeave">) {
	return (
		<div {...host} className={cn("relative w-full border border-line", className)}>
			<LiveFigure label={label} className="h-full w-full">
				{({ interactive }) => (
					<canvas
						ref={canvasRef}
						className={cn(
							"block h-full w-full",
							interactive ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none",
						)}
						{...handlers}
					/>
				)}
			</LiveFigure>
			{children}
		</div>
	);
}

/**
 * A periodic tiling on the /isohedral and /pentagons canvas: the same renderer and mesh as the shelf,
 * unbounded in every direction. A new `framing` snaps the view home; a new cell under the same framing
 * (a slider moving) keeps wherever the reader has zoomed to.
 */
export function ParametricLive({
	cell,
	framing,
	label,
	className = "aspect-square",
}: {
	cell: ParametricCell | null;
	framing: string;
	label: string;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { view } = useParametricTilingCanvas({
		canvasRef,
		cell,
		strokeWidth: 1.25,
		strokeRgb: [0, 0, 0],
		strokeCss: "#000",
		framingKey: framing,
		fallbackMaxRadius: 60,
	});
	return <LiveCanvas label={label} canvasRef={canvasRef} handlers={view.handlers} className={className} />;
}

/** Text at world (x, y) inside a Stage, flipped back upright. `size` is in world units. */
export function Label({
	x,
	y,
	size,
	children,
	className = "fill-fg-muted",
	italic,
	bold,
}: {
	x: number;
	y: number;
	size: number;
	children: ReactNode;
	className?: string;
	italic?: boolean;
	bold?: boolean;
}) {
	return (
		<text
			transform={`translate(${r3(x)} ${r3(y)}) scale(1 -1)`}
			textAnchor="middle"
			dominantBaseline="central"
			className={`font-sans ${className}`}
			style={{ fontSize: r3(size), fontStyle: italic ? "italic" : undefined, fontWeight: bold ? 600 : undefined }}
		>
			{children}
		</text>
	);
}

/** The extent of a point set: the larger side of its bounding box. */
export function extent(ps: Pt[]) {
	const xs = ps.map((p) => p.x),
		ys = ps.map((p) => p.y);
	return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
}

export function centroid(ps: Pt[]) {
	return {
		x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
		y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
	};
}
