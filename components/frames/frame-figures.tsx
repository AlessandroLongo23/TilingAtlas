"use client";

// The figures the frames article embeds, drawn from the census itself (public/frames), so every picture
// on the page is a frame the explorer also lists:
//   <frame-figure set="iamond5" shape="1" frame="0">   one frame, tiling 1 / tiling 2 / both overlaid;
//   <debt-figure set="iamond5" shape="1" frame="18">   the overlap-debt search building that frame, a
//                                                       step at a time, with the debt shaded.
// SVG, not the explorer's WebGL canvas: a figure is a few dozen polygons that must read at phone
// width inside prose, and an article may hold several. Copies and hues come from the same helper the
// explorer draws with (copyPolygons), so a frame is coloured the same in both places. The box and the
// stage are the article kit's (components/about/figure.tsx).

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/shelf";
import { copyPolygons } from "@/lib/heesch/data";
import { loadFrameSet, loadFrames, type Frame, type FrameShape } from "@/lib/frames/data";
import {
	Figure,
	FigureLoading,
	OUTLINE as STROKE,
	Stage,
	svgPath as pathOf,
	svgPoints as pts,
	tileFill as fill,
} from "@/components/about/figure";
import type { RawPolygon } from "@/lib/utils/renderTiling";

type Pt = { x: number; y: number };

/** One frame of the census, fetched by set, shape index and frame index. */
function useFrame(set: string, shape: number, frame: number) {
	const [got, setGot] = useState<{ shape: FrameShape; frame: Frame } | null>(null);
	useEffect(() => {
		let live = true;
		loadFrameSet(set).then(async (d) => {
			const s = d?.shapes[shape];
			if (!s) return;
			// A set file says how many frames a file holds; frames before this one fill whole files.
			const files = await loadFrames(set, shape, 0);
			const per = files?.length ?? 1;
			const chunk = frame < per ? files : await loadFrames(set, shape, Math.floor(frame / per));
			const f = chunk?.[frame % per];
			if (live && f) setGot({ shape: s, frame: f });
		});
		return () => {
			live = false;
		};
	}, [set, shape, frame]);
	return got;
}

export function FrameFigure({
	set,
	shape,
	frame,
	caption,
}: {
	set: string;
	shape: number;
	frame: number;
	caption?: string;
}) {
	const got = useFrame(set, shape, frame);
	const [view, setView] = useState("both");
	const [one, two] = useMemo(() => {
		if (!got) return [[], []];
		const hueOf = new Map<string, number>();
		return [copyPolygons(got.shape, got.frame.t[0], hueOf), copyPolygons(got.shape, got.frame.t[1], hueOf)];
	}, [got]);
	return (
		<Figure caption={caption}>
			{got ? (
				<>
					<Stage fit={one}>
						{(view === "two" ? two : one).map((p, i) => (
							<polygon key={i} points={pts(p)} fill={fill(p)} {...STROKE} />
						))}
						{view === "both" &&
							two.map((p, i) => (
								<polygon key={`d${i}`} points={pts(p)} fill="none" {...STROKE} strokeDasharray="5 4" />
							))}
					</Stage>
					<div className="mx-auto mt-3 max-w-sm">
						<Segmented
							options={[
								{ v: "one", label: "Tiling 1" },
								{ v: "two", label: "Tiling 2" },
								{ v: "both", label: "Both", sub: "2 dashed" },
							]}
							value={view}
							onChange={setView}
							cols={3}
						/>
					</div>
				</>
			) : (
				<FigureLoading what="frame" />
			)}
		</Figure>
	);
}

// ---------------------------------------------------------------------------------------------------
// The debt search, replayed on a known frame. The search itself works on cells; the figure has only
// the tiles, so it samples points inside them. A point covered by one tiling and not the other is
// debt, owed by the other tiling; each step pays the lowest debt point with the tile of the owing
// tiling that covers it, starting from tiling 1's tile on the lowest point of the region. That is the
// search's order with "fewest legal tiles" replaced by "lowest debt": the path differs, the frame and
// the debts along the way are real.

function inside(p: Pt, poly: Pt[]) {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i],
			b = poly[j];
		if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) hit = !hit;
	}
	return hit;
}

/** Points inside a polygon on a fine grid, offset so none falls on an edge. */
function samples(poly: Pt[], step: number): Pt[] {
	const xs = poly.map((v) => v.x),
		ys = poly.map((v) => v.y);
	const out: Pt[] = [];
	for (let y = Math.min(...ys) + step * 0.37; y < Math.max(...ys); y += step)
		for (let x = Math.min(...xs) + step * 0.29; x < Math.max(...xs); x += step)
			if (inside({ x, y }, poly)) out.push({ x, y });
	return out;
}

type Step = { t: 0 | 1; i: number };

function debtOrder(tilings: [RawPolygon[], RawPolygon[]]): Step[] {
	const all = [...tilings[0], ...tilings[1]];
	let minEdge = Infinity;
	for (const p of all)
		p.vertices.forEach((a, k) => {
			const b = p.vertices[(k + 1) % p.vertices.length];
			minEdge = Math.min(minEdge, Math.hypot(a.x - b.x, a.y - b.y) || Infinity);
		});
	const step = minEdge / 5;
	const pts = tilings[0].flatMap((p) => samples(p.vertices, step));
	const owner = (t: 0 | 1, q: Pt) => tilings[t].findIndex((p) => inside(q, p.vertices));
	const lowest = (qs: Pt[]) =>
		qs.reduce((a, b) => (b.y < a.y - 1e-9 || (Math.abs(b.y - a.y) < 1e-9 && b.x < a.x) ? b : a));
	const placed: [Set<number>, Set<number>] = [new Set(), new Set()];
	const order: Step[] = [{ t: 0, i: owner(0, lowest(pts)) }];
	placed[0].add(order[0].i);
	while (order.length < all.length) {
		// A point's debt: covered by one tiling's placed tiles and not the other's.
		const debts = pts.filter((q) => placed[0].has(owner(0, q)) !== placed[1].has(owner(1, q)));
		if (!debts.length) break;
		const q = lowest(debts);
		const t: 0 | 1 = placed[0].has(owner(0, q)) ? 1 : 0;
		const i = owner(t, q);
		placed[t].add(i);
		order.push({ t, i });
	}
	return order;
}

export function DebtFigure({
	set,
	shape,
	frame,
	caption,
}: {
	set: string;
	shape: number;
	frame: number;
	caption?: string;
}) {
	const got = useFrame(set, shape, frame);
	const tilings = useMemo<[RawPolygon[], RawPolygon[]] | null>(() => {
		if (!got) return null;
		const hueOf = new Map<string, number>();
		return [copyPolygons(got.shape, got.frame.t[0], hueOf), copyPolygons(got.shape, got.frame.t[1], hueOf)];
	}, [got]);
	const order = useMemo(() => (tilings ? debtOrder(tilings) : []), [tilings]);
	const [k, setK] = useState(1);
	const [playing, setPlaying] = useState(false);
	useEffect(() => {
		if (!playing) return;
		const id = window.setInterval(() => setK((v) => (v >= order.length ? 1 : v + 1)), 1100);
		return () => window.clearInterval(id);
	}, [playing, order.length]);

	if (!tilings)
		return (
			<Figure caption={caption}>
				<FigureLoading what="frame" />
			</Figure>
		);
	const shown = order.slice(0, k);
	const placed = shown.map((s) => tilings[s.t][s.i]);
	const ones = shown.filter((s) => s.t === 0).map((s) => tilings[0][s.i]);
	const twos = shown.filter((s) => s.t === 1).map((s) => tilings[1][s.i]);
	const done = k >= order.length;
	const last = shown[shown.length - 1];
	return (
		<Figure caption={caption}>
			<Stage fit={tilings[0]}>
				{/* The finished frame, faint, so the target is in view from the first step. */}
				{tilings[0].map((p, i) => (
					<polygon key={`g${i}`} points={pts(p)} className="fill-line-subtle" />
				))}
				{ones.map((p, i) => (
					<polygon key={`a${i}`} points={pts(p)} fill={fill(p)} {...STROKE} />
				))}
				{twos.map((p, i) => (
					<polygon key={`b${i}`} points={pts(p)} fill="none" {...STROKE} strokeDasharray="5 4" />
				))}
				{/* Debt: covered by exactly one tiling so far. Tiles of one tiling never overlap, so the
				    even-odd fill of every placed tile is exactly the cells one tiling covers and the other does not. */}
				<path d={pathOf(placed)} fillRule="evenodd" fill="rgb(220 38 38 / 0.45)" stroke="none" />
			</Stage>
			<div className="mt-3 flex items-center justify-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronLeft}
					aria-label="Previous step"
					onClick={() => setK(Math.max(1, k - 1))}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={playing ? Pause : Play}
					aria-label={playing ? "Pause" : "Play"}
					onClick={() => setPlaying(!playing)}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={ChevronRight}
					aria-label="Next step"
					onClick={() => setK(Math.min(order.length, k + 1))}
				/>
				<span className="ml-2 font-mono text-xs text-fg-muted tabular-nums">
					step {k} of {order.length}
				</span>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{k === 1
					? "Tiling 1's tile on the lowest triangle. All of it is debt for tiling 2."
					: done
						? "No debt left: both tilings cover the same region, and no tile is in both."
						: `Tiling ${last.t + 1} pays the lowest debt. Red: covered by one tiling only.`}
			</p>
		</Figure>
	);
}
