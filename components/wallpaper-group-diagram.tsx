"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
	LATTICE_REALIZABLE_GROUPS,
	ORBIFOLD_SIGNATURE,
	WALLPAPER_GROUPS,
	isGroupOnLattice,
	type LatticeShape,
	type WallpaperGroup,
} from "@/lib/classes/symmetry/types";
import { cn } from "@/lib/utils/cn";

/** Coarse-to-fine, which is also specialization order: every later shape is a special case of oblique. */
export const LATTICE_SHAPES = ["oblique", "rectangular", "rhombic", "square", "hexagonal"] as const;

/**
 * The cell-structure diagram for one (group, lattice) pair, as a file under /wallpaper-groups/.
 *
 * WHICH pairs exist is not decided here — it is `LATTICE_REALIZABLE_GROUPS` in
 * lib/classes/symmetry/types.ts, the table the app already uses, so the deck and the library agree
 * by construction. A group sits on every lattice whose holohedry contains its point group with
 * compatible centring, which is why p1 and p2 appear on all five and p4/p3/p6 on exactly one: a
 * lattice is allowed to carry MORE symmetry than the pattern on it, never less. This map only
 * answers "and which file draws that pair", and tests/wallpaper-diagrams.test.ts fails if the two
 * ever disagree or if a file named here is missing from disk.
 *
 * Sources: Commons "Wallpaper group diagram *" (public domain), fetched by
 * scripts/fetch-wallpaper-diagrams.sh. Three files are not Commons downloads — pm-square and
 * pg-square are derived from the rectangular originals by a transform proven against Commons' own
 * pmm-square, and cm-square is hand-drawn in the same style. That script documents both.
 */
const DIAGRAM_FILE: Record<WallpaperGroup, Partial<Record<LatticeShape, string>>> = {
	p1: {
		oblique: "p1.svg",
		rectangular: "p1-rect.svg",
		rhombic: "p1-rhombic.svg",
		square: "p1-square.svg",
		hexagonal: "p1-hexagonal.svg",
	},
	p2: {
		oblique: "p2.svg",
		rectangular: "p2-rect.svg",
		rhombic: "p2-rhombic.svg",
		square: "p2-square.svg",
		hexagonal: "p2-hexagonal.svg",
	},
	pm: { rectangular: "pm.svg", square: "pm-square.svg" },
	pg: { rectangular: "pg.svg", square: "pg-square.svg" },
	cm: { rhombic: "cm.svg", square: "cm-square.svg" },
	pmm: { rectangular: "pmm.svg", square: "pmm-square.svg" },
	pmg: { rectangular: "pmg.svg", square: "pmg-square.svg" },
	pgg: { rectangular: "pgg.svg", square: "pgg-square.svg" },
	cmm: { rhombic: "cmm-rhombic.svg", square: "cmm-square.svg" },
	p3: { hexagonal: "p3.svg" },
	p3m1: { hexagonal: "p3m1.svg" },
	p31m: { hexagonal: "p31m.svg" },
	p4: { square: "p4.svg" },
	p4m: { square: "p4m.svg" },
	p4g: { square: "p4g.svg" },
	p6: { hexagonal: "p6.svg" },
	p6m: { hexagonal: "p6m.svg" },
};

/**
 * The two shapes of canvas in this diagram series: a square cell is drawn in a square viewBox, and
 * everything else — rectangular, oblique, rhombic, hexagonal — in the same wide one.
 *
 * Declared here rather than read from the files because the wall has to know a tile's proportions
 * BEFORE the SVG loads. Without that, the first layout pass sizes every tile at zero width, the
 * height fit is computed against a wall that is not there yet, and the diagrams then load into a
 * size that overflows the slide. The test checks these two numbers against every file's real
 * viewBox, so the shortcut cannot rot.
 */
const ASPECT_SQUARE = 1;
const ASPECT_WIDE = 590 / 362;

export interface LatticeDiagram {
	group: WallpaperGroup;
	lattice: LatticeShape;
	src: string;
	/** width / height of the diagram's own canvas. */
	aspect: number;
	/** Stable across both groupings, so a tile keeps its identity when the wall regroups. */
	key: string;
}

/** Every realizable (group, lattice) pair, in group order. 32 of them across the 17 groups. */
export const WALLPAPER_DIAGRAMS: LatticeDiagram[] = WALLPAPER_GROUPS.flatMap((group) =>
	LATTICE_SHAPES.filter((lattice) => isGroupOnLattice(group, lattice)).map((lattice) => ({
		group,
		lattice,
		src: DIAGRAM_FILE[group][lattice] ?? "",
		aspect: lattice === "square" ? ASPECT_SQUARE : ASPECT_WIDE,
		key: `${group}:${lattice}`,
	})),
);

/** The diagrams for one group, in lattice order. */
export function diagramsForGroup(group: WallpaperGroup): LatticeDiagram[] {
	return WALLPAPER_DIAGRAMS.filter((d) => d.group === group);
}

const DIAGRAM_BASE = "/wallpaper-groups/";

/**
 * Just the Wikipedia cell diagram(s) for a group — white cards + lattice captions, no header. Shared by
 * the library sidebar tooltip and the /play symmetry panel so both show the exact same images. `size` is
 * the per-diagram square in px (sidebar tooltip 104; the compact HUD panel passes a smaller value).
 */
export function WallpaperGroupDiagrams({ group, size = 104 }: { group: WallpaperGroup; size?: number }) {
	const diagrams = diagramsForGroup(group);
	// 4 or 5 diagrams read best as a block two or three wide; 1/2/3 sit in a single row.
	const cols = diagrams.length >= 4 ? 3 : diagrams.length;
	const colClass = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
	return (
		<div className={cn("grid w-fit justify-items-center gap-2", colClass)}>
			{diagrams.map((d) => (
				<figure key={d.key} className="flex flex-col items-center gap-1">
					{/* Fixed white card so the black symmetry lines stay legible in dark mode. */}
					<span className="rounded-md bg-white p-1 shadow-sm">
						{/* Static public-dir SVG; next/image adds no value for a tiny inline vector. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`${DIAGRAM_BASE}${d.src}`}
							alt={`${group} cell diagram on a ${d.lattice} lattice`}
							width={size}
							height={size}
							style={{ width: size, height: size }}
							className="block object-contain"
						/>
					</span>
					<figcaption className="text-[10px] text-fg-muted">{d.lattice}</figcaption>
				</figure>
			))}
		</div>
	);
}

/** How the wall is clustered. Both groupings show the SAME 32 tiles; only the boxes change. */
type Grouping = "group" | "lattice";

/** px. Below the floor the symmetry marks stop reading; above the ceiling the wall looks like a poster. */
const TILE_MIN = 20;
const TILE_MAX = 104;

/**
 * The largest tile height at which BOTH arrangements still fit the slide.
 *
 * Both, not just the one on screen, and that is the whole difficulty. The clusters are boxes that
 * flow and wrap, so each grouping packs differently — 17 small boxes against 5 large ones — and the
 * size that fills the slide for one overflows it for the other. Fitting only the visible one is what
 * made "by lattice shape" spill off the bottom. So the inactive arrangement is rendered too, hidden
 * and out of flow, purely to be measured: `ghost` below.
 *
 * The test is a bisection rather than arithmetic because a cluster's box re-wraps as the tiles grow,
 * so wall height is a step function of tile size. And it is `scrollHeight > usable` rather than any
 * "space remaining" figure, because the slide's `spread` layout hands its slack to auto margins: the
 * frame measures the same height whether the wall inside it is 200px or 500px tall, and only the
 * moment of overflow is observable.
 *
 * The ghost is out of flow, so it contributes nothing to `frame.scrollHeight`; what it costs the
 * layout is however much TALLER it is than the arrangement actually in flow.
 */
function useBothArrangementsFit() {
	const ref = useRef<HTMLDivElement | null>(null);
	const visibleRef = useRef<HTMLDivElement | null>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	const [tile, setTile] = useState<number | null>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		const visible = visibleRef.current;
		const ghost = ghostRef.current;
		const frame = el?.closest(".slide-frame") as HTMLElement | null;
		const box = frame?.parentElement;
		if (!el || !visible || !ghost || !frame || !box) return;

		let lastBoxHeight = -1;
		const fit = () => {
			// The observer also fires for size changes this function itself caused; re-fitting then
			// would be at best wasted layout and at worst a feedback loop.
			if (box.clientHeight === lastBoxHeight) return;
			lastBoxHeight = box.clientHeight;

			const boxStyle = getComputedStyle(box);
			// The height the frame is ALLOWED to reach, as a border-box figure, because that is what
			// `frame.scrollHeight` reports — its own padding is already inside that number.
			const usable =
				box.clientHeight - (parseFloat(boxStyle.paddingTop) || 0) - (parseFloat(boxStyle.paddingBottom) || 0);

			const at = (candidate: number) => el.style.setProperty("--wp-h", `${candidate}px`);
			const bisect = (fits: (t: number) => boolean) => {
				let lo = TILE_MIN;
				let hi = TILE_MAX;
				if (fits(hi)) return hi;
				for (let i = 0; i < 9; i++) {
					const mid = (lo + hi) / 2;
					if (fits(mid)) lo = mid;
					else hi = mid;
				}
				return lo;
			};

			// Pass 1 — how tall the wall is ALLOWED to be. This cannot be read off directly: with slack
			// to absorb, `frame.scrollHeight` reports exactly `usable` whatever the wall does, right up
			// until it overflows. So push the in-flow arrangement until it overflows, back off, and the
			// height it reaches there IS the budget.
			const widest = bisect((t) => {
				at(t);
				return frame.scrollHeight <= usable;
			});
			at(widest);
			const budget = visible.offsetHeight;

			// Pass 2 — the largest tile at which BOTH arrangements stay inside that budget. Measured on
			// the two walls themselves, never on the frame, which has nothing more to tell us.
			const tile = bisect((t) => {
				at(t);
				return Math.max(visible.offsetHeight, ghost.offsetHeight) <= budget;
			});
			at(tile);
			setTile(tile);
		};

		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(box);
		return () => ro.disconnect();
	}, []);

	return { ref, visibleRef, ghostRef, tile };
}

interface Cluster {
	key: string;
	title: string;
	note: string;
	items: LatticeDiagram[];
}

function clustersFor(mode: Grouping, showSignature: boolean): Cluster[] {
	if (mode === "group") {
		return WALLPAPER_GROUPS.map((group) => {
			const items = diagramsForGroup(group);
			return {
				key: `group:${group}`,
				title: group,
				// The orbifold signature is the better note when it is wanted, but the count is what
				// carries the slide's point: seventeen groups, thirty-two cells.
				note: showSignature ? ORBIFOLD_SIGNATURE[group] : items.length > 1 ? `${items.length}` : "",
				items,
			};
		});
	}
	return LATTICE_SHAPES.map((lattice) => ({
		key: `lattice:${lattice}`,
		title: lattice,
		note: `${LATTICE_REALIZABLE_GROUPS[lattice].length}`,
		items: WALLPAPER_DIAGRAMS.filter((d) => d.lattice === lattice),
	}));
}

/** Widest a cluster box may get, in tiles. Past this it starts crowding out its neighbours on the line. */
const MAX_TILES_PER_ROW = 6;

/** Balanced column count for a cluster of `n` tiles: 12 -> 6, 7 -> 4, anything up to the cap -> n. */
function columnsFor(n: number): number {
	return Math.ceil(n / Math.ceil(n / MAX_TILES_PER_ROW));
}

/**
 * One arrangement of the wall: every cluster in its own box, boxes flowing and wrapping.
 *
 * Rendered twice — once in flow, once hidden and out of flow — so the fit can size the tiles against
 * whichever arrangement is taller. Only the in-flow copy registers its tiles for the animation;
 * `register` is null for the ghost, whose tiles must never end up in the FLIP map.
 */
function Arrangement({
	mode,
	showSignature,
	register,
}: {
	mode: Grouping;
	showSignature: boolean;
	register: ((key: string) => (el: HTMLElement | null) => () => void) | null;
}) {
	// `items-start`, so a one-row box beside a two-row one keeps its own height instead of being
	// stretched to match and leaving its tiles marooned at the bottom of an empty box.
	return (
		<div className="flex flex-wrap items-start justify-center gap-[0.45em]">
			{clustersFor(mode, showSignature).map((cluster) => (
				<section
					key={cluster.key}
					className="flex flex-col items-center gap-[0.15em] rounded-md border border-line/70 bg-surface-overlay/30 px-[0.35em] pt-[0.15em] pb-[0.3em]"
				>
					<h3 className="flex items-baseline gap-[0.3em] leading-none">
						<span className="text-[clamp(0.55rem,0.8vh+0.26vw,0.95rem)] font-semibold text-fg">
							{cluster.title}
						</span>
						{cluster.note && (
							<span className="font-mono text-[clamp(0.45rem,0.55vh+0.18vw,0.72rem)] text-fg-muted">
								{cluster.note}
							</span>
						)}
					</h3>
					{/* An explicit column count, not a free wrap, because it is what stops the big clusters
					    from each taking a line to themselves: "square" laid out in one row is twelve tiles
					    wide and nothing fits beside it, so the wall becomes a column of near-empty rows.
					    Capped and balanced (12 -> 6+6, 7 -> 4+3), the same five boxes pack two to a row.
					    `auto` columns rather than a fixed cell: the square-lattice diagrams are narrower
					    than the rest, and a uniform cell would pad every one of the twelve. */}
					<div
						className="grid flex-1 items-end justify-center justify-items-center gap-[0.3em]"
						style={{ gridTemplateColumns: `repeat(${columnsFor(cluster.items.length)}, auto)` }}
					>
						{cluster.items.map((d) => (
							<figure
								key={d.key}
								ref={register?.(d.key)}
								className="m-0 flex flex-col items-center gap-[0.1em]"
							>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={`${DIAGRAM_BASE}${d.src}`}
									alt={`${d.group} cell diagram on a ${d.lattice} lattice`}
									style={{
										height: "var(--wp-h)",
										// Width from the declared aspect, not `auto`: `auto` is zero until the
										// SVG loads, and the fit runs before that.
										width: `calc(var(--wp-h) * ${d.aspect})`,
										background: "#fff",
										padding: "0.12rem",
										borderRadius: "0.2rem",
										margin: 0,
									}}
									className="block object-contain"
								/>
								<figcaption className="text-[clamp(0.44rem,0.58vh+0.19vw,0.7rem)] leading-none text-fg-muted">
									{mode === "group" ? d.lattice : d.group}
								</figcaption>
							</figure>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

/**
 * The 17 wallpaper groups on every lattice each of them can occupy — 32 cell diagrams — clustered
 * either by group or by lattice, with the tiles flying between the two arrangements.
 *
 * WHY BOTH GROUPINGS. The two readings answer different questions and the wall is the same 32 tiles
 * either way, which is the argument: by group it says "there are seventeen of these, and a group is
 * not one picture — p1 alone sits on all five lattices"; by lattice it says "and the constraint runs
 * the other way too: the square lattice carries twelve of the seventeen, the oblique one only two."
 * A viewer who only ever sees the first arrangement tends to read lattice shape as a property OF the
 * group, which is exactly the error the second one kills.
 *
 * WHICH PAIRS ARE DRAWN comes from LATTICE_REALIZABLE_GROUPS, not from this file — see DIAGRAM_FILE.
 *
 * ONE GRID, NOT CLUSTER BOXES. Both arrangements are the same 32 cells in the same rectangle; the
 * grouping decides only the ORDER, and a cluster is a contiguous RUN of cells — named on the cell
 * that opens it, tinted as a band so a run that wraps across rows still reads as one thing. Giving
 * each cluster its own box instead makes the wall a column of rows, because "square" alone is twelve
 * tiles wide and nothing else fits beside it; the wall then spends its height on five near-empty
 * rows and the tiles shrink to pay for it.
 *
 * MOTION is FLIP, not a CSS transition, because regrouping is a permutation of cells: nothing about
 * a tile's own box changes, it is simply somewhere else in the grid, so there is no property CSS
 * could animate. Positions are read before the state change, re-read after commit in a layout
 * effect, and the difference played back as a transform — what the room sees is p1's five cells
 * scattering to five different bands and back. Reduced motion skips to the new arrangement.
 *
 * SIZING. Cells are uniform and sized for the WIDE diagram; the square-lattice ones are narrower and
 * sit centred in their cell, because a diagram's proportions are the data here — a rectangular cell
 * is wide, a square cell is square — and stretching them all to one box (which is what the previous
 * single-diagram wall did with `aspect-ratio: 1/1`) would flatten the one distinction the slide is
 * about. Plate, padding and size are inline because the deck styles every slide `img` through a
 * descendant selector (`[&_img]` in slide-markdown) that outranks a class here. The grid's shape is
 * solved for, not guessed — see useGridFit.
 */
export function WallpaperGroupWall({ signatures }: { signatures?: string }) {
	const showSignature = String(signatures) === "yes";
	const [mode, setMode] = useState<Grouping>("group");
	const { ref: wallRef, visibleRef, ghostRef, tile } = useBothArrangementsFit();
	const other: Grouping = mode === "group" ? "lattice" : "group";

	// key -> the tile element currently mounted for it. Tiles are re-parented across a regroup, so
	// this is keyed by (group, lattice) rather than holding a stable node.
	const tiles = useRef(new Map<string, HTMLElement>());
	// Positions captured just before the regroup; consumed by the layout effect below, once.
	const frozen = useRef<Map<string, DOMRect> | null>(null);

	const register = useCallback(
		(key: string) => (el: HTMLElement | null) => {
			if (el) tiles.current.set(key, el);
			return () => {
				if (tiles.current.get(key) === el) tiles.current.delete(key);
			};
		},
		[],
	);

	const switchTo = useCallback(
		(next: Grouping) => {
			if (next === mode) return;
			const rects = new Map<string, DOMRect>();
			for (const [key, el] of tiles.current) rects.set(key, el.getBoundingClientRect());
			frozen.current = rects;
			setMode(next);
		},
		[mode],
	);

	useLayoutEffect(() => {
		const before = frozen.current;
		frozen.current = null;
		if (!before) return; // first paint, or a re-render that was not a regroup
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

		for (const [key, el] of tiles.current) {
			const from = before.get(key);
			if (!from) continue;
			const to = el.getBoundingClientRect();
			const dx = from.left - to.left;
			const dy = from.top - to.top;
			// Sub-pixel moves are not worth an animation, and animating them makes a tile that should
			// have stayed put shimmer.
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			el.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }], {
				duration: 520,
				easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
			});
		}
	}, [mode]);

	return (
		<div
			ref={wallRef}
			// The clamp is the fallback until the first measurement lands, one frame later.
			style={tile === null ? undefined : ({ "--wp-h": `${tile}px` } as CSSProperties)}
			className="not-prose mx-auto flex w-full flex-col items-center gap-[0.6em] [--wp-h:clamp(1.6rem,4vh,2.6rem)]"
		>
			<div
				role="group"
				aria-label="Group the cell diagrams by"
				className="flex items-center gap-0 overflow-hidden rounded-full border border-line text-[clamp(0.62rem,0.85vh+0.28vw,0.92rem)]"
			>
				{(
					[
						["group", "by wallpaper group"],
						["lattice", "by lattice shape"],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						onClick={() => switchTo(value)}
						aria-pressed={mode === value}
						className={cn(
							"px-[0.9em] py-[0.3em] transition-colors",
							mode === value ? "bg-accent font-medium text-white" : "text-fg-muted hover:text-fg",
						)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="relative w-full">
				<div ref={visibleRef}>
					<Arrangement mode={mode} showSignature={showSignature} register={register} />
				</div>
				{/* The arrangement NOT on screen, laid out at the same width so it wraps exactly as it
				    would if shown, and measured by the fit so the tile size serves both. Out of flow and
				    `visibility: hidden`, so it takes no space, catches no clicks and is skipped by screen
				    readers — but it is still laid out, which is the point. */}
				<div
					ref={ghostRef}
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 invisible"
				>
					<Arrangement mode={other} showSignature={showSignature} register={null} />
				</div>
			</div>
		</div>
	);
}

/** Tooltip body for a wallpaper group: its orbifold signature plus the Wikipedia cell diagram(s). */
export function WallpaperGroupTooltip({ group }: { group: WallpaperGroup }) {
	return (
		<div className="flex w-fit flex-col gap-2">
			<div className="flex items-baseline gap-1.5">
				<span className="font-medium text-fg">{group}</span>
				<span className="font-mono text-xs text-fg-muted">{ORBIFOLD_SIGNATURE[group]}</span>
			</div>
			<WallpaperGroupDiagrams group={group} />
		</div>
	);
}
