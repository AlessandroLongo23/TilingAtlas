"use client";

import { useEffect, useMemo, useState } from "react";
import { cylinderShardUrl, type CylinderIndexEntry, type CylinderRecord } from "@/lib/squaring/shelf";
import { HyperbolicBallFigure } from "./hyperbolic-ball-figure";
import { CylinderCircuit } from "./cylinder-circuit";
import { SquaredCylinderFigure } from "./squared-cylinder-figure";
import { RailPanel, StageBoard } from "./stage-board";

// One hyperbolic tiling becoming one squared cylinder, in the same four stages as the other two.
//
// The control here is the RADIUS of the ball, and it stands where the battery edge stood on the sphere
// and the homology class on the torus. Growing it is not a rendering knob: the whole content of the
// hyperbolic case is that the circumference converges as the ball grows, because the random walk is
// transient and escapes to the boundary. The Euclidean {3,6} is in the picker for exactly that reason —
// its circumference turns over and decays, and watching that happen is the fastest way to see what
// hyperbolic buys.

const STAGES = [
	{ n: 1, title: "The tiling", blurb: "A ball of radius r. The dashed ring is the wired boundary, shorted to one vertex." },
	{ n: 2, title: "The harmonic potential", blurb: "One volt at the centre, zero on the whole rim. Thickness is current." },
	{ n: 3, title: "The circuit", blurb: "The ball cut along a ray and laid flat, with height set to potential. Thickness is current." },
	{ n: 4, title: "The squared cylinder", blurb: "Left edge glued to right. The squares pile up on the boundary circle." },
];

const shardCache = new Map<string, CylinderRecord>();

export function CylinderStages({ entry }: { entry: CylinderIndexEntry }) {
	const cached = shardCache.get(entry.id) ?? null;
	const [, bumpAfterFetch] = useState(0);
	const [error, setError] = useState<"stale" | "failed" | null>(null);
	const [radius, setRadius] = useState<number>(entry.radii[entry.radii.length - 1]);
	const [hovered, setHovered] = useState<number | null>(null);
	const record = cached;

	useEffect(() => {
		if (shardCache.has(entry.id)) return;
		let live = true;
		fetch(cylinderShardUrl(entry.id))
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((data: CylinderRecord) => {
				shardCache.set(entry.id, data);
				if (live) bumpAfterFetch((n) => n + 1);
			})
			.catch((e: Error) => {
				if (live) setError(e.message === "404" ? "stale" : "failed");
			});
		return () => {
			live = false;
		};
	}, [entry.id]);

	const layer = useMemo(() => record?.layers.find((l) => l.radius === radius) ?? record?.layers[0] ?? null, [record, radius]);

	// One colour per square SIZE, so the bands of the cylinder read as bands in the disk too.
	const fills = useMemo(() => {
		if (!layer) return [];
		const sizes = [...new Set(layer.squares.map((s) => s.side))].sort((a, b) => a - b);
		const rank = new Map(sizes.map((s, i) => [s, i]));
		const out = new Array<string>(layer.edges.length).fill("var(--color-line)");
		for (const s of layer.squares) {
			const t = sizes.length > 1 ? (rank.get(s.side) as number) / (sizes.length - 1) : 0.5;
			out[s.edge] = `hsl(${(300 * (1 - t)).toFixed(1)}, 62%, 55%)`;
		}
		return out;
	}, [layer]);

	if (error)
		return (
			<div className="border border-line bg-surface-overlay/30 p-4 text-sm text-fg-muted">
				{error === "stale" ? (
					<>
						<p>
							This page is holding an older list: <span className="font-mono text-fg">{entry.id}</span> is no
							longer in the shelf.
						</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="mt-3 border border-line px-2 py-1 text-[11px] transition-colors hover:text-fg"
						>
							Reload the page
						</button>
					</>
				) : (
					<p>
						Could not load <span className="font-mono text-fg">{entry.id}</span>. Run{" "}
						<code className="font-mono">pnpm tsx scripts/build-cylinder-shelf.ts</code>.
					</p>
				)}
			</div>
		);
	if (!record || !layer) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;

	const idx = entry.radii.indexOf(layer.radius);
	const prev = idx > 0 ? entry.conductance[idx - 1] : null;
	const hyperbolic = entry.geometry === "hyperbolic";

	return (
		<StageBoard
			control={
				<RailPanel label="control" title="The ball radius" hint="Grow the ball and watch the circumference settle.">
						<div className="flex items-baseline justify-between gap-2">
							<p className="font-mono text-base leading-none text-fg">r = {layer.radius}</p>
							<p className="font-mono text-base leading-none text-fg">
								{layer.circumference.toFixed(4)}
								{prev !== null ? (
									<span className={layer.circumference > prev ? "text-accent" : "text-fg-muted"}>
										{" "}
										{layer.circumference > prev ? "↑" : "↓"}
									</span>
								) : null}
							</p>
						</div>
						<input
							type="range"
							min={entry.radii[0]}
							max={entry.radii[entry.radii.length - 1]}
							step={1}
							value={layer.radius}
							onChange={(e) => setRadius(Number(e.target.value))}
							className="mt-2 w-full accent-fg"
							aria-label="ball radius"
						/>
						<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-2.5 font-mono text-[10px]">
							<Fact label="squares" value={String(layer.squares.length)} />
							<Fact label="walk" value={hyperbolic ? "transient" : "recurrent"} />
							<Fact label="ball" value={`V ${layer.counts.vertices} · E ${layer.counts.edges}`} />
							<Fact label="circumference" value={layer.circumference.toFixed(6)} />
						</dl>
				</RailPanel>
			}
			stages={[
				{
					...STAGES[0],
					node: (
						<HyperbolicBallFigure
							layer={layer}
							mode="plain"
							geometry={entry.geometry}
							hovered={hovered}
							onHover={setHovered}
						/>
					),
				},
				{
					...STAGES[1],
					node: (
						<HyperbolicBallFigure
							layer={layer}
							mode="flow"
							geometry={entry.geometry}
							hovered={hovered}
							onHover={setHovered}
						/>
					),
				},
				{ ...STAGES[2], node: <CylinderCircuit layer={layer} fills={fills} hovered={hovered} onHover={setHovered} /> },
				{
					...STAGES[3],
					node: (
						<SquaredCylinderFigure
							layer={layer}
							hovered={hovered}
							onHover={setHovered}
							fills={fills}
							span={layer.circumference > 2.2 ? 1 / 3 : 1}
						/>
					),
				},
			]}
		/>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[9px] uppercase tracking-wide text-fg-muted">{label}</dt>
			<dd className="break-all text-fg">{value}</dd>
		</div>
	);
}
