"use client";

// The parquet article's figures, built with the /parquet generator (lib/render/parquetTiling.ts):
//   <hcp-parquet-strip caption>   a strip whose base tiling, edge profile, D(x) and amount the reader sets;
//   <hcp-parquet-edge caption>    two squares and the edge they share: one curve for both, or one each;
//   <hcp-parquet-turn caption>    the fully deformed square grid, live, beside one tile and its quarter turn.

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import type { EdgeProfile, Pt } from "@/lib/render/parquetStrip";
import { STRAIGHT_EDGE } from "@/lib/render/parquetStrip";
import { D_PROFILES, PARQUET_PRESETS, type DProfileId, type ParquetPresetId } from "@/lib/render/parquetPresets";
import {
	buildDeformedTiling,
	keyframeExtremes,
	TILINGS,
	type TilingId,
	type TilingInstance,
} from "@/lib/render/parquetTiling";

const poly = (o: Pt[]) => ({ vertices: o.map(([x, y]) => ({ x, y })) });
/** A tile's fill: the patch canvases' colour, its hue walking from blue to amber as the deformation grows. */
const fillAt = (t: number) => tileFill({ hue: 205 - 160 * t, n: 0, vertices: [] });

const EDGES = (["pinwheel", "wavy", "fret"] as ParquetPresetId[]).map((id) => ({
	v: id,
	label: PARQUET_PRESETS[id].label,
}));
const BASES: { v: TilingId; label: string }[] = [
	{ v: "square", label: "Squares" },
	{ v: "hexagon", label: "Hexagons" },
	{ v: "triangle", label: "Triangles" },
];
const SIZE: Record<TilingId, [number, number]> = { square: [16, 4], hexagon: [14, 4], triangle: [16, 4] };

export function ParquetStripFigure({ caption }: { caption?: string }) {
	const [base, setBase] = useState<TilingId>("square");
	const [edge, setEdge] = useState<ParquetPresetId>("pinwheel");
	const [d, setD] = useState<DProfileId>("ramp");
	const [amount, setAmount] = useState(80);
	const instance = useMemo(() => TILINGS[base].build(...SIZE[base]), [base]);
	const keys = useMemo<EdgeProfile[]>(() => [STRAIGHT_EDGE, PARQUET_PRESETS[edge].edge], [edge]);
	const fit = useMemo(
		() => [...instance.faces, ...keyframeExtremes(instance, keys).flat()].map(poly),
		[instance, keys],
	);
	const tiles = useMemo(
		() => buildDeformedTiling(instance, { from: keys[0], to: keys[1], amount: amount / 100, d: D_PROFILES[d] }),
		[instance, keys, amount, d],
	);
	const tAt = (o: Pt[]) => D_PROFILES[d](o.reduce((s, p) => s + p[0], 0) / o.length / instance.width);
	return (
		<Figure caption={caption}>
			<Stage fit={fit} className="max-h-[260px]">
				{tiles.map((t, i) => (
					<polygon key={i} points={svgPoints(poly(t.outline))} fill={fillAt(tAt(t.outline))} {...OUTLINE} />
				))}
			</Stage>
			<div className="mx-auto mt-3 grid max-w-lg gap-2">
				<Segmented options={BASES} value={base} onChange={(v) => setBase(v as TilingId)} cols={3} />
				<Segmented options={EDGES} value={edge} onChange={(v) => setEdge(v as ParquetPresetId)} cols={3} />
				<Segmented
					options={[
						{ v: "ramp", label: "Ramp", sub: "straight to full" },
						{ v: "tent", label: "Tent", sub: "there and back" },
					]}
					value={d}
					onChange={(v) => setD(v as DProfileId)}
				/>
				<Slider label="Amount" value={amount} onChange={setAmount} min={0} max={100} unit="%" />
			</div>
		</Figure>
	);
}

/** Sample an edge profile at s (piecewise linear between its control points). */
function offset(profile: EdgeProfile, s: number) {
	for (let i = 1; i < profile.length; i++)
		if (s <= profile[i].s) {
			const a = profile[i - 1],
				b = profile[i];
			return b.s - a.s < 1e-12 ? b.d : a.d + ((b.d - a.d) * (s - a.s)) / (b.s - a.s);
		}
	return 0;
}

/** Each tile bends its own edges, walking its own boundary with the bump inward: no shared curve. */
function alone(faces: Pt[][], profile: EdgeProfile, amount: number): Pt[][] {
	const ss = Array.from({ length: 41 }, (_, i) => i / 40);
	return faces.map((f) =>
		f.flatMap((A, k) => {
			const B = f[(k + 1) % f.length];
			const dx = B[0] - A[0],
				dy = B[1] - A[1];
			return ss.slice(0, -1).map((s): Pt => {
				const o = amount * offset(profile, s);
				return [A[0] + s * dx - o * dy, A[1] + s * dy + o * dx];
			});
		}),
	);
}

const PAIR: TilingInstance = {
	faces: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		],
		[
			[1, 0],
			[2, 0],
			[2, 1],
			[1, 1],
		],
	],
	coreCount: 2,
	width: 2,
	height: 1,
	period: { x: 1, y: 1 },
};

export function ParquetEdgeFigure({ caption }: { caption?: string }) {
	const [edge, setEdge] = useState<ParquetPresetId>("wavy");
	const [mode, setMode] = useState("shared");
	const [amount, setAmount] = useState(100);
	const profile = PARQUET_PRESETS[edge].edge;
	const outlines = useMemo(
		() =>
			mode === "shared"
				? buildDeformedTiling(PAIR, { keyframes: [profile], amount: amount / 100, weights: () => [1] }).map(
						(t) => t.outline,
					)
				: alone(PAIR.faces, profile, amount / 100),
		[mode, profile, amount],
	);
	const fit = useMemo(
		() => [...PAIR.faces, ...keyframeExtremes(PAIR, [profile]).flat(), ...alone(PAIR.faces, profile, 1)].map(poly),
		[profile],
	);
	return (
		<Figure caption={caption}>
			<Stage fit={fit} className="max-h-[240px]">
				{outlines.map((o, i) => (
					<polygon
						key={i}
						points={svgPoints(poly(o))}
						fill={tileFill({ hue: i ? 45 : 205, n: 0, vertices: [] })}
						fillOpacity={0.8}
						{...OUTLINE}
					/>
				))}
			</Stage>
			<div className="mx-auto mt-3 grid max-w-md gap-2">
				<Segmented
					options={[
						{ v: "shared", label: "One curve per edge", sub: "both tiles use it" },
						{ v: "alone", label: "One curve per tile", sub: "each bends its own side" },
					]}
					value={mode}
					onChange={setMode}
				/>
				<Segmented options={EDGES} value={edge} onChange={(v) => setEdge(v as ParquetPresetId)} cols={3} />
				<Slider label="Amount" value={amount} onChange={setAmount} min={0} max={100} unit="%" />
			</div>
		</Figure>
	);
}

export function ParquetTurnFigure({ caption }: { caption?: string }) {
	const [edge, setEdge] = useState<ParquetPresetId>("pinwheel");
	// One unit square, every edge at full deformation: a translational cell of the deformed grid, since
	// the shared-curve rule gives every horizontal edge one curve and every vertical edge another.
	const tile = useMemo(
		() =>
			buildDeformedTiling(TILINGS.square.build(1, 1), {
				keyframes: [PARQUET_PRESETS[edge].edge],
				amount: 1,
				weights: () => [1],
			})[0].outline.slice(0, -1), // the walk ends where it began; a ring lists that corner once
		[edge],
	);
	const cell = useMemo(
		() => ({
			cellPolygons: [{ vertices: tile.map(([x, y]) => [x, y]), hue: 205 }],
			basis: [
				[1, 0],
				[0, 1],
			],
		}),
		[tile],
	);
	// The same tile, a quarter turn about the centre of its square.
	const turned: Pt[] = tile.map(([x, y]) => [0.5 - (y - 0.5), 0.5 + (x - 0.5)]);
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-[3fr_2fr] items-center gap-3">
				<InteractiveTilingPreviewCard
					cell={cell}
					tilingId={`parquet-${edge}`}
					square
					showExpand={false}
					showOpenInPlay={false}
					homePeriods={4}
				/>
				<Stage fit={[poly(tile), poly(turned)]} className="max-h-[220px]">
					<polygon points={svgPoints(poly(tile))} fill={tileFill({ hue: 45, n: 0, vertices: [] })} {...OUTLINE} />
					<polygon points={svgPoints(poly(turned))} fill="none" {...OUTLINE} strokeWidth={2} strokeDasharray="5 4" />
				</Stage>
			</div>
			<div className="mx-auto mt-3 max-w-md">
				<Segmented options={EDGES} value={edge} onChange={(v) => setEdge(v as ParquetPresetId)} cols={3} />
			</div>
		</Figure>
	);
}
