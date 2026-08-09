"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { cn } from "@/lib/utils/cn";
import { orbitColor } from "@/lib/utils/orbitColors";
import { drawPolygons, hsbToHsla, type RawPolygon } from "@/lib/utils/renderTiling";

// Assembling a seed, run by hand in front of the room: one vertex configuration of the set at the
// origin, then the other two placed on it.
//
// Everything drawn here is precomputed SeedBuilder output (scripts/build-seed-figure.ts) — which
// vertices of the partial seed are open, and every placement of a remaining configuration that
// survives the builder's overlap and validity gates at each of them, from
// `enumerateVertexCompletions`, the same audited enumerator its forward check runs through. Nothing
// is illustrated. What the widget adds is the pause: a placement is shown faint until it is
// confirmed, so the room sees a choice being made and not a result appearing.
//
// BOTH choices are the viewer's — which open vertex to fill, and which placement to put there —
// because the builder makes neither: `expandNode` branches on every open vertex with every placement
// at once. The precomputed tree therefore has one branch per (vertex, placement) pair, since what is
// open after the second configuration goes down depends on both.
//
// WHAT THE DOTS MEAN. A filled dot is a PLACED vertex, in its orbit's colour — the same hue the `o`
// overlay gives that orbit on a finished tiling, so the seed and the tiling it grows into are read in
// one language. A ring is an open vertex, and only vertices one edge from a placed centre are ever
// drawn: that is exactly what `computeAvailableVertices` returns, so the ring set is the builder's
// own frontier and not a decoration. Everything else on the boundary carries nothing.
//
// Keys are `,` `.` and Enter, matching <growth-strip> and deliberately NOT the arrows: the deck moves
// slides on the arrows, and a presentation clicker sends exactly those.

interface FigPoly {
	n: number;
	v: [number, number][];
}
interface FigCandidate {
	name: string;
	/** Only the tiles this placement ADDS; the rest of the figure lands on tiles already there. */
	add: FigPoly[];
}
interface FigOpen {
	at: [number, number];
	/** Empty for an open vertex nothing in the remaining set fits: drawn, but not clickable. */
	candidates: FigCandidate[];
}
interface SeedFigure {
	k: number;
	vcs: string[];
	/** The first configuration of the set, at the origin. */
	first: FigPoly[];
	root: FigOpen[];
	/** Keyed "vertexIndex:candidateIndex": the state reached by making that pair of choices. */
	next: Record<string, FigOpen[]>;
}

const toRaw = (polys: FigPoly[]): RawPolygon[] =>
	polys.map((p) => ({ n: p.n, vertices: p.v.map(([x, y]) => ({ x, y })) }));

interface Box {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

const boxOf = (polys: FigPoly[], into?: Box): Box => {
	const b = into ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
	for (const p of polys)
		for (const [x, y] of p.v) {
			if (x < b.minX) b.minX = x;
			if (x > b.maxX) b.maxX = x;
			if (y < b.minY) b.minY = y;
			if (y > b.maxY) b.maxY = y;
		}
	return b;
};

/**
 * One frame for all three cards, big enough for every patch any path can reach.
 *
 * Fitting each card to its own contents would draw the single configuration at the same size as the
 * finished seed, and the growing — the only thing the row exists to show — would vanish. A fixed
 * frame also means confirming a placement moves nothing that is already on screen.
 */
function worldFrame(fig: SeedFigure): Box {
	const b = boxOf(fig.first);
	for (const o of fig.root) for (const c of o.candidates) boxOf(c.add, b);
	for (const state of Object.values(fig.next)) for (const o of state) for (const c of o.candidates) boxOf(c.add, b);
	return b;
}

const PLACED_R = 5; // a filled, orbit-coloured centre, CSS px
const OPEN_R = 4.2; // a ring on an open vertex
const PICK_R = 14; // how close a click has to land
const WORK = "hsl(28 88% 44%)"; // the deck's "being worked on" orange

interface Dot {
	at: [number, number];
	/** Screen position, filled in by the draw so the click test and the picture cannot disagree. */
	sx: number;
	sy: number;
}

function SeedCard({
	frame,
	patch,
	placed,
	k,
	open,
	selected,
	overlay,
	activeStep,
	label,
	onPick,
}: {
	frame: Box;
	patch: FigPoly[] | null;
	/** Vertices a configuration has been placed on, in placement order = orbit order. */
	placed: [number, number][];
	k: number;
	/** Open vertices, drawn only on the card being worked on. */
	open: FigOpen[] | null;
	selected: number | null;
	overlay: FigPoly[] | null;
	activeStep: boolean;
	label: string;
	onPick?: (index: number) => void;
}) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const hits = useRef<Dot[]>([]);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const w = canvas.clientWidth, h = canvas.clientHeight;
		if (w <= 0 || h <= 0) return;
		const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
		if (canvas.width !== bw || canvas.height !== bh) {
			canvas.width = bw;
			canvas.height = bh;
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, bw, bh);
		hits.current = [];
		if (!patch) return;

		// The shared frame, filling the card bar a hair of margin. It has to hold the largest patch any
		// path reaches, so the first configuration already sits at about half the card's width.
		const fw = frame.maxX - frame.minX, fh = frame.maxY - frame.minY;
		const s = 0.94 * Math.min(w / fw, h / fh);
		const cx = (frame.minX + frame.maxX) / 2, cy = (frame.minY + frame.maxY) / 2;
		ctx.scale(dpr, dpr);
		ctx.save();
		ctx.translate(w / 2, h / 2);
		ctx.scale(s, -s); // world y is up
		ctx.translate(-cx, -cy);

		drawPolygons(ctx, toRaw(patch), s);
		if (overlay && overlay.length > 0) {
			// A placement has to read as a PROPOSAL from the back of a room, and faintness alone does not
			// do it — a pale tile beside pale tiles is just another tile. Faint fill, then a dashed
			// outline in the deck's working colour, which nothing else in the figure wears.
			ctx.globalAlpha = 0.35;
			drawPolygons(ctx, toRaw(overlay), s, 0, false);
			ctx.globalAlpha = 1;
			ctx.save();
			ctx.strokeStyle = WORK;
			ctx.lineWidth = 2 / s;
			ctx.setLineDash([6 / s, 4 / s]);
			for (const p of overlay) {
				ctx.beginPath();
				p.v.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
				ctx.closePath();
				ctx.stroke();
			}
			ctx.restore();
		}
		ctx.restore();

		// The dots are screen-space: a world-space circle would be an ellipse under the y flip and
		// would change size with the frame.
		const tx = (x: number) => w / 2 + s * (x - cx);
		const ty = (y: number) => h / 2 - s * (y - cy);

		open?.forEach((o, i) => {
			const sx = tx(o.at[0]), sy = ty(o.at[1]);
			if (o.candidates.length) hits.current.push({ at: o.at, sx, sy });
			const picked = i === selected;
			ctx.beginPath();
			ctx.arc(sx, sy, picked ? OPEN_R + 3 : OPEN_R, 0, 2 * Math.PI);
			ctx.fillStyle = "#fff";
			ctx.fill();
			ctx.strokeStyle = picked ? WORK : o.candidates.length ? "rgba(20,20,20,0.55)" : "rgba(20,20,20,0.16)";
			ctx.lineWidth = picked ? 2.5 : 1.5;
			ctx.stroke();
		});

		// Placed centres last, over everything: they are the k orbits the seed exists to carry.
		placed.forEach(([x, y], i) => {
			const col = orbitColor(i, k);
			ctx.beginPath();
			ctx.arc(tx(x), ty(y), PLACED_R, 0, 2 * Math.PI);
			ctx.fillStyle = hsbToHsla(col.h, col.s, col.b, 1);
			ctx.fill();
			ctx.strokeStyle = "rgba(20,20,20,0.8)";
			ctx.lineWidth = 1.4;
			ctx.stroke();
		});
	}, [frame, patch, overlay, open, selected, placed, k]);

	const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (!onPick || !open) return;
		const r = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - r.left, py = e.clientY - r.top;
		let best = -1, bestD = PICK_R;
		hits.current.forEach((d) => {
			const dist = Math.hypot(d.sx - px, d.sy - py);
			if (dist < bestD) {
				bestD = dist;
				best = open.findIndex((o) => o.at[0] === d.at[0] && o.at[1] === d.at[1]);
			}
		});
		if (best >= 0) onPick(best);
	};

	return (
		<figure className="m-0 flex min-w-0 flex-1 flex-col items-center gap-[0.4em]">
			<div
				className={cn(
					"aspect-square w-full border transition-colors",
					activeStep ? "border-fg" : "border-line",
					!patch && "opacity-30",
				)}
			>
				<canvas
					ref={ref}
					onClick={pick}
					className={cn("h-full w-full", onPick && "cursor-pointer")}
				/>
			</div>
			<figcaption className="text-center text-[clamp(0.62rem,0.95vh+0.26vw,0.92rem)] text-fg-muted">
				{label}
			</figcaption>
		</figure>
	);
}

interface Choice {
	vi: number;
	ci: number;
}

export function SeedStrip({ src = "/defense/seed-build.json" }: { src?: string }) {
	const [fig, setFig] = useState<SeedFigure | null>(null);
	const [path, setPath] = useState<Choice[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [cursor, setCursor] = useState(0);

	useEffect(() => {
		let live = true;
		fetch(src)
			.then((r) => r.json())
			.then((d: SeedFigure) => {
				if (live) setFig(d);
			})
			.catch(() => {
				if (live) setFig(null);
			});
		return () => {
			live = false;
		};
	}, [src]);

	const step = path.length;
	/** The open vertices of the partial seed as it now stands, or null once the seed is finished. */
	const state: FigOpen[] | null = useMemo(() => {
		if (!fig) return null;
		if (step === 0) return fig.root;
		if (step === 1) return fig.next[`${path[0].vi}:${path[0].ci}`] ?? null;
		return null;
	}, [fig, step, path]);

	// Tiles and placed centres along the path taken so far. The centre of a placement is the vertex it
	// was put on, which is why the path stores the vertex index and not just the choice.
	const { patches, placedAt } = useMemo(() => {
		if (!fig) return { patches: [] as FigPoly[][], placedAt: [] as [number, number][][] };
		const patches: FigPoly[][] = [fig.first];
		const placedAt: [number, number][][] = [[[0, 0]]];
		let here: FigOpen[] | null = fig.root;
		for (let i = 0; i < path.length && here; i++) {
			const o = here[path[i].vi];
			patches.push([...patches[i], ...o.candidates[path[i].ci].add]);
			placedAt.push([...placedAt[i], o.at]);
			here = fig.next[`${path[i].vi}:${path[i].ci}`] ?? null;
		}
		return { patches, placedAt };
	}, [fig, path]);

	const frame = useMemo(() => (fig ? worldFrame(fig) : null), [fig]);
	const picked = selected !== null && state ? state[selected] : null;
	const total = picked?.candidates.length ?? 0;
	const candidate = total ? picked!.candidates[cursor % total] : null;

	const cycle = useCallback(
		(d: number) => {
			if (!total) return;
			setCursor((c) => (c + d + total) % total);
		},
		[total],
	);
	const confirm = useCallback(() => {
		if (selected === null || !total) return;
		setPath((p) => [...p, { vi: selected, ci: cursor % total }]);
		setSelected(null);
		setCursor(0);
	}, [selected, total, cursor]);
	const reset = useCallback(() => {
		setPath([]);
		setSelected(null);
		setCursor(0);
	}, []);
	const pickVertex = useCallback((i: number) => {
		setSelected(i);
		setCursor(0);
	}, []);

	// Registered once, reading the current handlers through a ref: depending on them directly re-runs
	// the effect every time the cursor moves, which drops keypresses.
	const keysRef = useRef({ cycle, confirm });
	useEffect(() => {
		keysRef.current = { cycle, confirm };
	}, [cycle, confirm]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			if (e.key === ",") {
				e.preventDefault();
				e.stopPropagation();
				keysRef.current.cycle(-1);
			} else if (e.key === ".") {
				e.preventDefault();
				e.stopPropagation();
				keysRef.current.cycle(1);
			} else if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				keysRef.current.confirm();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, []);

	if (!fig || !frame) {
		return (
			<div className="not-prose flex h-[34vh] items-center justify-center border border-line bg-surface-overlay/30 text-xs text-fg-muted">
				loading the seed…
			</div>
		);
	}

	const labels = ["one configuration", "two placed", `the k = ${fig.k} seed`];

	return (
		// Takes whatever the heading and prose leave: `marginBlock` inline because the spread layout
		// centres a figure with `margin: auto`, which outranks a utility class and would absorb the free
		// space before flex-grow could have it.
		<div
			style={{ marginBlock: 0 }}
			className="not-prose flex min-h-0 w-full flex-1 flex-col items-center gap-[0.6em]"
		>
			<div className="flex min-h-0 w-full flex-1 items-center justify-center gap-[1.5vw]">
				{[0, 1, 2].map((i) => (
					<div key={i} className="contents">
						{i > 0 && (
							<span
								aria-hidden
								className={cn("shrink-0 text-2xl", patches[i] ? "text-fg-muted" : "text-line")}
							>
								→
							</span>
						)}
						<SeedCard
							frame={frame}
							patch={patches[i] ?? null}
							placed={placedAt[i] ?? []}
							k={fig.k}
							open={i === step ? state : null}
							selected={i === step ? selected : null}
							overlay={i === step ? (candidate?.add ?? null) : null}
							// `step` still points at the last card once the seed is finished, but there is
							// nothing to choose there — an accent border would promise a control that is gone.
							activeStep={i === step && state !== null}
							label={labels[i]}
							onPick={i === step && state ? pickVertex : undefined}
						/>
					</div>
				))}
			</div>

			<div className="flex h-[1.9em] items-center gap-2 text-[clamp(0.62rem,0.95vh+0.26vw,0.92rem)]">
				{!state ? (
					<button
						type="button"
						onClick={reset}
						className="border border-line bg-surface-overlay/40 px-[0.8em] py-[0.15em] text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
					>
						start again
					</button>
				) : !picked || !total ? (
					<span className="text-fg-muted">
						click an open vertex — {state.filter((o) => o.candidates.length).length} of them can take a
						configuration
					</span>
				) : (
					<>
						<button
							type="button"
							onClick={() => cycle(-1)}
							aria-label="previous placement"
							className="border border-line px-2 py-[0.15em] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
						>
							‹
						</button>
						<span className="tabular-nums text-fg-secondary">
							<span className="font-mono">{candidate?.name.replaceAll(",", ".")}</span> — placement{" "}
							{(cursor % total) + 1} of {total} here
						</span>
						<button
							type="button"
							onClick={() => cycle(1)}
							aria-label="next placement"
							className="border border-line px-2 py-[0.15em] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
						>
							›
						</button>
						<button
							type="button"
							onClick={confirm}
							className="ml-1 flex items-center gap-[0.5em] border border-line bg-surface-overlay/40 px-[0.8em] py-[0.15em] text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
						>
							place it
							<kbd className="border border-line px-[0.35em] font-mono text-[0.85em] text-fg-muted">
								↵
							</kbd>
						</button>
					</>
				)}
			</div>
		</div>
	);
}
