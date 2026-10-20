"use client";

// The article figure kit: the bordered box every interactive piece in an article sits in, with its
// caption under it, and an SVG stage that fits a set of polygons. The frames article set the look;
// every article's figures use these, so a figure reads the same on every shelf.

import type { ReactNode } from "react";
import type { RawPolygon } from "@/lib/utils/renderTiling";
import { PATCH_LIGHT, PATCH_SAT } from "@/lib/hooks/usePatchCanvas";
import { cn } from "@/lib/utils/cn";

export function Figure({
	caption,
	children,
	className,
}: {
	caption?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<figure className={cn("not-prose my-8 border border-line bg-surface p-4 max-md:-mx-1 max-md:p-3", className)}>
			{children}
			{caption && <figcaption className="mt-3 text-sm leading-snug text-fg-muted">{caption}</figcaption>}
		</figure>
	);
}

export function FigureLoading({ what = "figure" }: { what?: string }) {
	return <div className="flex h-48 items-center justify-center text-sm text-fg-muted">Loading the {what}…</div>;
}

/** A tile's fill, the patch canvas's own colour for its hue. */
export const tileFill = (p: RawPolygon) => `hsl(${p.hue} ${PATCH_SAT * 100}% ${PATCH_LIGHT}%)`;
/** A coordinate rounded to 1e-6: server and browser can differ in the last bit of a sine, and an
 *  SVG attribute that differs by one bit is a hydration mismatch. */
export const tidy = (x: number) => Math.round(x * 1e6) / 1e6;
const xy = (v: { x: number; y: number }) => `${tidy(v.x)},${tidy(v.y)}`;
export const svgPoints = (p: { vertices: { x: number; y: number }[] }) => p.vertices.map(xy).join(" ");
export const svgPath = (ps: { vertices: { x: number; y: number }[] }[]) =>
	ps.map((p) => `M${p.vertices.map(xy).join("L")}Z`).join("");

/** Outline props: the canvases' black edge at a fixed screen width, whatever the figure's scale. */
export const OUTLINE = {
	stroke: "#000",
	strokeWidth: 1.25,
	vectorEffect: "non-scaling-stroke" as const,
	strokeLinejoin: "round" as const,
};

/** An SVG in world coordinates, y up, fitted to `fit` with a margin. */
export function Stage({
	fit,
	children,
	className,
}: {
	fit: { vertices: { x: number; y: number }[] }[];
	children: ReactNode;
	className?: string;
}) {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -Infinity,
		y1 = -Infinity;
	for (const p of fit)
		for (const v of p.vertices) {
			x0 = Math.min(x0, v.x);
			x1 = Math.max(x1, v.x);
			y0 = Math.min(y0, v.y);
			y1 = Math.max(y1, v.y);
		}
	const m = 0.06 * Math.max(x1 - x0, y1 - y0, 1);
	return (
		<svg
			viewBox={[x0 - m, -y1 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m].map(tidy).join(" ")}
			className={cn("mx-auto block max-h-[340px] w-full", className)}
			role="img"
		>
			<g transform="scale(1,-1)">{children}</g>
		</svg>
	);
}
