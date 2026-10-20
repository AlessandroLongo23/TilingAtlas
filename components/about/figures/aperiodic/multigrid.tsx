"use client";

// Figures for the multigrid article, built with the explorer's own engines:
//   <mg-dual n="5" preset="penrose">   n families of grid lines beside their dual rhombus tiling, with a
//                                      control for n and for the first offset γ₀; pointing at a rhombus
//                                      marks the crossing it came from;
//   <sr-rule n="5">                    a Sub Rosa substitution: one prototile's super-rhomb, or the
//                                      2n-rhomb star after one step, for every n the explorer builds.

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { buildMultigrid, canonicalOffsets, directions, MULTIGRID_SYMMETRIES } from "@/lib/multigrid/engine";
import { buildRule, seedSingle, seedStar, substituteOnce, SUPPORTED_SYMMETRIES } from "@/lib/subrosa/engine";
import { prototileAngles, sigma } from "@/lib/subrosa/sigma";
import type { RawPolygon } from "@/lib/utils/renderTiling";
import { tidy } from "./substitution";

// The explorer's prototile hues (shared by its multigrid and Sub Rosa views) and grid-family hues.
const HUES = [265, 175, 45, 330, 130, 200, 90];
const protoHue = (protoId: number) => HUES[(protoId - 1) % HUES.length];
const famStroke = (j: number, n: number) => `hsl(${(j * 360) / n} 70% 42%)`;

/** A regular pentagrid with Σγ ≡ 0: de Bruijn's condition for a Penrose tiling (see offsetSum). */
const PENROSE_OFFSETS = [0.1, 0.3, 0.55, 0.2, 0.85];

/**
 * de Bruijn's Σγⱼ (mod 1). His five directions are 2πj/5; the engine's are πj/n, which for n = 5 are
 * the same five lines with every odd family's direction reversed, and reversing a family negates its
 * offset. So de Bruijn's sum is the alternating sum of the engine's offsets.
 */
function offsetSum(g: number[]): number {
	const s = g.reduce((a, x, j) => a + (j % 2 ? -x : x), 0);
	return ((s % 1) + 1) % 1;
}

/** Patch radius in grid space for about `target` rhombi (crossings per unit area: Σ sin(π(j−i)/n)). */
function radiusFor(n: number, target: number) {
	let s = 0;
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sin((Math.PI * (j - i)) / n);
	return Math.sqrt(target / (Math.PI * s));
}

export function MultigridFigure({ n: n0, preset, caption }: { n?: string; preset?: string; caption?: string }) {
	const start = MULTIGRID_SYMMETRIES.includes(Number(n0)) ? Number(n0) : 5;
	const initial = (n: number) => (n === 5 && preset === "penrose" ? PENROSE_OFFSETS : canonicalOffsets(n));
	const [n, setN] = useState(start);
	const [offsets, setOffsets] = useState(() => initial(start));
	const [hot, setHot] = useState(-1);

	const R = useMemo(() => radiusFor(n, 380), [n]);
	const { tiles } = useMemo(() => buildMultigrid({ n, offsets, radius: R }), [n, offsets, R]);
	const polys = useMemo<RawPolygon[]>(
		() =>
			tidy(
				tiles.map((t) => ({ n: 4, hue: protoHue(t.protoId), vertices: t.corners.map((c) => ({ x: c.x, y: c.y })) })),
			),
		[tiles],
	);
	const lines = useMemo(() => {
		const e = directions(n);
		const out: { j: number; k: number; x1: number; y1: number; x2: number; y2: number }[] = [];
		e.forEach((d, j) => {
			for (let k = Math.ceil(offsets[j] - R); k <= Math.floor(offsets[j] + R); k++) {
				const s = k - offsets[j]; // the line z·eⱼ = s
				const h = Math.sqrt(Math.max(0, R * R - s * s));
				const r = (v: number) => Math.round(v * 1e6) / 1e6;
				out.push({
					j,
					k,
					x1: r(s * d.x - h * d.y),
					y1: r(s * d.y + h * d.x),
					x2: r(s * d.x + h * d.y),
					y2: r(s * d.y - h * d.x),
				});
			}
		});
		return out;
	}, [n, offsets, R]);
	const disc = useMemo(() => {
		const r = Math.round(R * 1e6) / 1e6;
		return [{ vertices: [-1, 1].flatMap((x) => [-1, 1].map((y) => ({ x: x * r, y: y * r }))) }];
	}, [R]);

	// de Bruijn's index of a vertex, Σ Kⱼ in his convention: four values exactly when Σγ ≡ 0.
	const indices = useMemo(() => {
		if (n !== 5) return 0;
		const s = new Set<number>();
		for (const t of tiles)
			for (const key of t.vkeys) {
				const K = key.split(",").map(Number);
				s.add(K[0] - K[1] + K[2] - K[3] + K[4]);
			}
		return s.size;
	}, [n, tiles]);

	const t = hot >= 0 ? tiles[hot] : null;
	const sum = offsetSum(offsets);
	const penrose = n === 5 && Math.min(sum, 1 - sum) < 0.005;
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-2 gap-2 sm:gap-3">
				<div>
					<Stage fit={disc}>
						{lines.map((l) => {
							const on = t && (t.fams[0] === l.j || t.fams[1] === l.j);
							return (
								<line
									key={`${l.j}:${l.k}`}
									x1={l.x1}
									y1={l.y1}
									x2={l.x2}
									y2={l.y2}
									stroke={famStroke(l.j, n)}
									strokeWidth={on ? 1.6 : 0.9}
									strokeOpacity={t && !on ? 0.35 : 1}
									vectorEffect="non-scaling-stroke"
								/>
							);
						})}
						{t && <circle cx={t.site.x} cy={t.site.y} r={R / 28} fill="#000" />}
					</Stage>
					<p className="mt-1 text-center font-mono text-xs text-fg-muted">{n} grid families</p>
				</div>
				<div>
					<Stage fit={polys}>
						{polys.map((p, i) => (
							<polygon
								key={i}
								points={svgPoints(p)}
								fill={i === hot ? "#000" : tileFill(p)}
								{...OUTLINE}
								onPointerEnter={() => setHot(i)}
								onPointerLeave={() => setHot((h) => (h === i ? -1 : h))}
								onClick={() => setHot(i)}
							/>
						))}
					</Stage>
					<p className="mt-1 text-center font-mono text-xs text-fg-muted">{tiles.length.toLocaleString()} rhombi</p>
				</div>
			</div>
			<div className="mx-auto mt-3 grid max-w-md gap-3">
				<Segmented
					options={MULTIGRID_SYMMETRIES.map((v) => ({ v: String(v), label: `n = ${v}` }))}
					value={String(n)}
					onChange={(v) => {
						const nn = Number(v);
						setN(nn);
						setOffsets(initial(nn));
						setHot(-1);
					}}
					cols={4}
				/>
				<Slider
					label="Offset γ₀"
					value={offsets[0]}
					min={0}
					max={0.99}
					step={0.01}
					format={(v) => v.toFixed(2)}
					onChange={(v) => {
						setOffsets((g) => [v, ...g.slice(1)]);
						setHot(-1);
					}}
				/>
				{n === 5 && (
					<p className="text-center font-mono text-xs text-fg-muted tabular-nums">
						Σγ ≡ {sum.toFixed(2)} (mod 1) · vertex index takes {indices} values ·{" "}
						{penrose ? "Penrose" : "generalised Penrose"}
					</p>
				)}
			</div>
		</Figure>
	);
}

// ---------------------------------------------------------------------------------------------------

export function SubRosaFigure({ n: n0, caption }: { n?: string; caption?: string }) {
	const [n, setN] = useState(SUPPORTED_SYMMETRIES.includes(Number(n0)) ? Number(n0) : 5);
	const [x, setX] = useState(1);
	const [seed, setSeed] = useState("one");
	const rule = useMemo(() => buildRule(n), [n]);
	const protos = useMemo(() => prototileAngles(n), [n]);
	const x_ = Math.min(x, protos.length);
	const starTiles = 2 * n * (rule?.prototiles[0]?.children.length ?? 0);
	const star = seed === "star" && starTiles <= 6000;
	const polys = useMemo<RawPolygon[]>(() => {
		if (!rule) return [];
		const tiles = substituteOnce(rule, star ? seedStar(rule) : seedSingle(rule, x_));
		return tidy(
			tiles.map((t) => ({ n: 4, hue: protoHue(t.protoId), vertices: t.corners.map((c) => ({ x: c.x, y: c.y })) })),
		);
	}, [rule, star, x_]);
	return (
		<Figure caption={caption}>
			<Stage fit={polys} className="max-h-[380px]">
				{polys.map((p, i) => (
					<polygon
						key={i}
						points={svgPoints(p)}
						fill={tileFill(p)}
						{...OUTLINE}
						strokeWidth={polys.length > 1500 ? 0.6 : 1}
					/>
				))}
			</Stage>
			<div className="mx-auto mt-3 grid max-w-md gap-2">
				<Segmented
					options={SUPPORTED_SYMMETRIES.map((v) => ({ v: String(v), label: `${2 * v}-fold`, sub: `n = ${v}` }))}
					value={String(n)}
					onChange={(v) => setN(Number(v))}
					cols={4}
				/>
				<Segmented
					options={[
						{ v: "one", label: "One prototile" },
						{ v: "star", label: "Star of 2n", sub: starTiles > 6000 ? "too many to draw here" : "one step" },
					]}
					value={star ? "star" : "one"}
					onChange={setSeed}
					cols={2}
				/>
				{!star && (
					<Segmented
						options={protos.map((p) => ({ v: String(p.x), label: `${+p.acuteDeg.toFixed(1)}°` }))}
						value={String(x_)}
						onChange={(v) => setX(Number(v))}
						cols={protos.length}
					/>
				)}
				<p className="text-center font-mono text-xs text-fg-muted tabular-nums">
					Σ({n}) = {sigma(n).join(" ")} · {polys.length.toLocaleString()} rhombi · inflation {rule?.scaling.toFixed(3)}
				</p>
			</div>
		</Figure>
	);
}
