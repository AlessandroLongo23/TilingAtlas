"use client";

// <ku-octagon caption="…"> — why one octagon decides the whole tiling, in four steps that each add only
// what the step before forced. Geometry is the truncated square tiling at unit edge: octagons on a
// square lattice of spacing 1 + √2 with their sides on the axes, squares on the half-offsets.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { polygonHue } from "@/lib/utils/renderTiling";

const S = 1 + Math.SQRT2;
const OCT_R = 1 / (2 * Math.sin(Math.PI / 8));

type Poly = { n: number; hue: number; vertices: { x: number; y: number }[] };

const regular = (n: number, cx: number, cy: number, r: number, phase: number): Poly => ({
	n,
	hue: polygonHue(n),
	vertices: Array.from({ length: n }, (_, k) => {
		const a = phase + (2 * Math.PI * k) / n;
		// Rounded, so server and browser render the same digits.
		return { x: Math.round((cx + r * Math.cos(a)) * 1e4) / 1e4, y: Math.round((cy + r * Math.sin(a)) * 1e4) / 1e4 };
	}),
});
const octagon = (i: number, j: number) => regular(8, i * S, j * S, OCT_R, Math.PI / 8);
const square = (i: number, j: number) => regular(4, (i + 0.5) * S, (j + 0.5) * S, Math.SQRT1_2, 0);

/** The vertex the argument starts at: the octagon's corner at 22.5°. */
const V = { x: 1.2071, y: 0.5 };

const STEPS: { tiles: () => Poly[]; text: string }[] = [
	{
		tiles: () => [octagon(0, 0)],
		text: "One octagon. Its corner is 135°, which leaves 225° at the marked vertex for the other tiles.",
	},
	{
		tiles: () => [octagon(0, 0), square(0, 0), octagon(1, 0)],
		text: "225° splits as 90 + 135 or as 60 + 165. The second is 3.8.24, which occurs in no tiling, so the vertex is 4.8.8.",
	},
	{
		tiles: () => [
			octagon(0, 0),
			...[
				[0, 0],
				[-1, 0],
				[-1, -1],
				[0, -1],
			].map(([i, j]) => square(i, j)),
			...[
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			].map(([i, j]) => octagon(i, j)),
		],
		text: "Every corner of the octagon is 4.8.8, so its eight sides go to squares and octagons alternately. Nothing was chosen.",
	},
	{
		tiles: () => {
			const out: Poly[] = [];
			for (let i = -2; i <= 2; i++)
				for (let j = -2; j <= 2; j++) {
					out.push(octagon(i, j));
					if (i < 2 && j < 2) out.push(square(i, j));
				}
			return out;
		},
		text: "Each new octagon is in the same position as the first, so the step repeats without end: the tiling is 4.8.8.",
	},
];

export function KuOctagon({ caption }: { caption?: string }) {
	const [step, setStep] = useState(0);
	const tiles = useMemo(() => STEPS[step].tiles(), [step]);
	// The frame is the corona's, so the first steps do not zoom in on one tile.
	const frame = useMemo(() => STEPS[2].tiles(), []);
	return (
		<Figure caption={caption}>
			<Stage fit={step === 3 ? tiles : frame}>
				{tiles.map((p, i) => (
					<polygon key={i} points={svgPoints(p)} fill={tileFill(p)} {...OUTLINE} />
				))}
				{step < 3 && <circle cx={V.x} cy={V.y} r={0.13} fill="rgb(220 38 38)" />}
			</Stage>
			<div className="mt-3 flex items-center justify-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronLeft}
					aria-label="Previous step"
					onClick={() => setStep(Math.max(0, step - 1))}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronRight}
					aria-label="Next step"
					onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
				/>
				<span className="ml-2 font-mono text-xs text-fg-muted tabular-nums">
					step {step + 1} of {STEPS.length}
				</span>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">{STEPS[step].text}</p>
		</Figure>
	);
}
