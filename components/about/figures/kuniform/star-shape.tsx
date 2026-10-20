"use client";

// <ku-star-shape caption="…"> — the one polygon behind the star and isotoxal shelves: 2n equal sides,
// corners alternating between α (the points) and β = (2n − 2)·180°/n − α (the dents). A slider moves α
// from a sharp star, through the regular n-gon (β = 180°) and the convex isotoxal 2n-gon, to the
// regular 2n-gon (α = β).

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { polygonFillHue, starHue } from "@/lib/utils/renderTiling";

const NS = [3, 4, 6, 8, 12];

function shape(n: number, alpha: number) {
	const beta = (360 * (n - 1)) / n - alpha;
	const vertices: { x: number; y: number }[] = [];
	let x = 0,
		y = 0,
		dir = 0;
	for (let i = 0; i < 2 * n; i++) {
		vertices.push({ x, y });
		x += Math.cos(dir);
		y += Math.sin(dir);
		// Turn by the exterior angle of the corner we arrive at: a dent (reflex) turns the other way.
		const corner = i % 2 === 0 ? beta : alpha;
		dir += ((180 - corner) * Math.PI) / 180;
	}
	const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
	const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
	return {
		beta,
		vertices: vertices.map((v) => ({ x: Math.round((v.x - cx) * 1e4) / 1e4, y: Math.round((v.y - cy) * 1e4) / 1e4 })),
	};
}

function regime(n: number, alpha: number, beta: number) {
	const eps = 0.25;
	if (Math.abs(beta - 180) < eps) return `the regular ${n}-gon, with a flat corner at each side's midpoint`;
	if (Math.abs(alpha - beta) < eps) return `the regular ${2 * n}-gon`;
	if (beta > 180) return `a star: ${n} points of ${alpha.toFixed(0)}° and ${n} dents of ${beta.toFixed(0)}°`;
	return `a convex isotoxal ${2 * n}-gon: corners alternate ${alpha.toFixed(0)}° and ${beta.toFixed(0)}°`;
}

export function KuStarShape({ caption }: { caption?: string }) {
	const [n, setN] = useState(6);
	const [alpha, setAlpha] = useState(30);
	const top = (180 * (n - 1)) / n;
	const a = Math.min(alpha, top);
	const { beta, vertices } = useMemo(() => shape(n, a), [n, a]);
	const star = beta > 180;
	const poly = { n: 2 * n, vertices, hue: star ? starHue(n, a) : polygonFillHue(vertices) };
	// A fixed frame per n, so the shape breathes inside it instead of being refitted every step.
	const frame = useMemo(() => [shape(n, top).vertices, shape(n, 2).vertices].map((v) => ({ vertices: v })), [n, top]);
	return (
		<Figure caption={caption}>
			<Stage fit={frame} className="max-h-[280px]">
				<polygon points={svgPoints(poly)} fill={tileFill(poly)} {...OUTLINE} />
			</Stage>
			<p className="mt-2 text-center text-xs text-fg-muted">
				<span className="font-mono text-fg-secondary">
					{star ? `${n}*` : `${2 * n}-gon`}, α = {a.toFixed(0)}°
				</span>
				: {regime(n, a, beta)}.
			</p>
			<div className="mx-auto mt-3 flex max-w-md flex-col gap-3">
				<Slider label="Point angle α" unit="°" min={2} max={top} step={0.5} value={a} onChange={setAlpha} />
				<Segmented
					options={NS.map((m) => ({ v: String(m), label: `n = ${m}` }))}
					value={String(n)}
					onChange={(v) => setN(Number(v))}
					cols={NS.length}
				/>
			</div>
		</Figure>
	);
}
