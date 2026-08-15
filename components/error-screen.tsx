"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
	HERO_INDEX_URL,
	heroCellUrl,
	isExcludedHeroId,
	liveSpecimen,
	pickPresentation,
	type ErrorSpecimen,
	type HeroCell,
} from "@/lib/render/errorSpecimen";
import { ERROR_SPECIMENS } from "@/lib/render/errorSpecimens";

// The shell behind app/error.tsx and app/not-found.tsx: a 3 × 3 wall of specimens with the message in
// the middle cell, hairlines between cells like the landing's collections grid. The eight cells around
// it are all the same size and each holds one whole picture, so the wall reads as eight specimens and
// not as a layout — earlier it split the top-left cell into four and the bottom-right into two, which
// made those six read as offcuts of their neighbours.
//
// The eight are new on every load, and drawn from the whole catalogue: after mount the wall fetches
// /hero-index.json — every drawable Euclidean tiling in the atlas, 4593 of them — picks at random from
// it, lazy-fetches those cells and renders them in the browser, some of them through the spiral or
// inversion lens. Same two files the landing hero rotator uses. lib/render/errorSpecimen.ts holds the
// rendering and explains the split; this file only decides what goes where.
//
// Until that lands (and if it never does — an error screen renders after something has already broken,
// so it cannot assume the network is there) the wall shows the baked seed from
// lib/render/errorSpecimens.ts: inline path data, no fetch, nothing to wait on. The seed also keeps two
// slots for good, because the colourings, edge patterns and hollow tilings are not in the hero index
// and a wall filled purely from it would show nothing but tilings.
//
// Client component: lucide icon references can't cross the RSC boundary into <Button>, so both callers
// stay client too (see components/landing/landing-buttons.tsx).

const SLOTS = 8;
/** Slots the live pick takes; the rest stay with the seed's decoration classes. */
const LIVE_SLOTS = 6;

const DECORATIONS = ERROR_SPECIMENS.filter((s) => s.klass && s.klass !== "tiling");

/**
 * The eight the server renders, and what the client falls back to before it has drawn its own.
 *
 * Deliberately not the first eight: the seed is grouped by class, so those would all be uniform
 * tilings. Spread evenly across it and the wall shows the range even on its very first frame.
 */
const OPENING: ErrorSpecimen[] = Array.from({ length: SLOTS }, (_, i) =>
	ERROR_SPECIMENS[Math.round((i * (ERROR_SPECIMENS.length - 1)) / (SLOTS - 1))],
);

/** `n` distinct members of `pool`, uniformly at random — a partial Fisher–Yates over a copy of it. */
function sample<T>(pool: readonly T[], n: number): T[] {
	const copy = pool.slice();
	const take = Math.min(n, copy.length);
	for (let i = 0; i < take; i++) {
		const j = i + Math.floor(Math.random() * (copy.length - i));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, take);
}

/** Eight from the seed alone — the opening shuffle, and the whole wall when the fetch fails. */
const drawSeed = () => sample(ERROR_SPECIMENS, SLOTS);

/**
 * Eight for a normal load: live tilings from the atlas, plus decorations the index does not carry.
 *
 * Every step is allowed to come up short — a 404 on the index, a cell that fails to parse, a tiling
 * whose lattice is degenerate — and the seed backfills whatever is missing, so the wall is always
 * eight pictures however little of this worked.
 */
async function drawLive(signal: AbortSignal): Promise<ErrorSpecimen[]> {
	const res = await fetch(HERO_INDEX_URL, { signal });
	if (!res.ok) throw new Error(`hero index: HTTP ${res.status}`);
	const ids = (await res.json()) as string[];
	const wanted = sample(ids.filter((id) => !isExcludedHeroId(id)), LIVE_SLOTS);

	const live = await Promise.all(
		wanted.map(async (id) => {
			try {
				const cell = await fetch(heroCellUrl(id), { signal });
				if (!cell.ok) return null;
				return liveSpecimen((await cell.json()) as HeroCell, pickPresentation(Math.random), Math.random);
			} catch {
				return null;
			}
		}),
	);

	const drawn = live.filter((s): s is ErrorSpecimen => s !== null);
	// Whatever the live pick did not fill goes to the seed's decorations — which is the two reserved
	// slots on a good load, and more when a cell failed to arrive.
	const fill = sample(DECORATIONS.length ? DECORATIONS : ERROR_SPECIMENS, SLOTS - drawn.length);
	// Shuffled together, so the live picks are not always the same six cells of the grid.
	return sample([...drawn, ...fill], SLOTS);
}

/**
 * The eight this load gets: live from the atlas, or the seed if any part of that failed.
 *
 * Never rejects. The index can 404 (a dev server before a build), the network can be gone — this is an
 * error screen, so assuming otherwise is exactly the wrong bet — and either way there is a wall.
 */
async function drawWall(signal: AbortSignal): Promise<ErrorSpecimen[]> {
	try {
		return await drawLive(signal);
	} catch {
		return drawSeed();
	}
}

/** One specimen, full-bleed in its cell and clickable through to the view that draws it. */
function TilingTile({ spec }: { spec: ErrorSpecimen }) {
	return (
		<Link
			href={spec.href}
			className="group relative block w-full h-full overflow-hidden"
			style={{ background: spec.background }}
			aria-label={`Open ${spec.label} in Play`}
		>
			<svg
				viewBox={spec.viewBox}
				preserveAspectRatio="xMidYMid slice"
				aria-hidden="true"
				// The lens specimens carry world-space geometry with hairline strokes, so their joins have to
				// round the way the shader's distance field does — a mitre on a tile the map has bent to a
				// sliver spikes off the screen.
				strokeLinejoin="round"
				strokeLinecap="round"
				className="absolute inset-0 w-full h-full saturate-[0.88] opacity-95 transition-[filter,opacity] duration-300 group-hover:saturate-100 group-hover:opacity-100"
			>
				{spec.paths.map((path, i) => (
					<path
						key={i}
						d={path.d}
						fill={path.fill ?? "none"}
						fillOpacity={path.fillOpacity}
						fillRule={path.fillRule}
						stroke={path.stroke}
						strokeOpacity={path.strokeOpacity}
						strokeWidth={path.strokeWidth}
					/>
				))}
			</svg>
			{/* The specimen names itself on hover, in the caption style the hero uses. */}
			<span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono bg-surface/80 backdrop-blur-sm border border-line rounded px-1.5 py-0.5 text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity">
				{spec.label}
			</span>
		</Link>
	);
}

interface ErrorScreenProps {
	/** Micro-label above the title, e.g. "error 404". */
	eyebrow: string;
	title: string;
	body: string;
	/** Monospace technical block under the copy — the thrown message, a digest, a bad path. */
	detail?: ReactNode;
	/** The action row. Built by the caller so each screen picks its own routes. */
	actions: ReactNode;
}

// Cells are placed by explicit, literal grid classes — Tailwind scans source text, so a class built by
// interpolation is never generated and the cell silently auto-flows into the wrong row.
const TOP_CELLS = ["col-start-1 row-start-1", "col-start-2 row-start-1", "col-start-3 row-start-1"];
const BOTTOM_CELLS = ["col-start-1 row-start-3", "col-start-2 row-start-3", "col-start-3 row-start-3"];

export function ErrorScreen({ eyebrow, title, body, detail, actions }: ErrorScreenProps) {
	// Picked after mount, never during render: a random draw in the render body is a different draw on
	// the server than on the client, which is a hydration mismatch. The opening eight paint first, the
	// seed shuffle replaces them immediately, and the live wall lands when its fetches do.
	const [picked, setPicked] = useState<ErrorSpecimen[]>(OPENING);

	useEffect(() => {
		const ctrl = new AbortController();
		// One state write, and it happens in a promise callback — a synchronous setState in an effect
		// body is a cascading render, and the lint rule that says so is right.
		drawWall(ctrl.signal).then((wall) => {
			if (!ctrl.signal.aborted) setPicked(wall);
		});
		return () => ctrl.abort();
	}, []);

	// Reading order around the message: three across the top, one either side, three across the bottom.
	const top = picked.slice(0, 3);
	const bottom = picked.slice(5, 8);

	// Three equal columns and three equal rows from sm up, so the wall is a regular 3 × 3. Below that the
	// message row sizes to its content instead: a third of a phone screen can't hold a title, a body, a
	// digest and three buttons.
	return (
		// h-screen with overflow-hidden and NO flex-1: as a flex item, `min-height: auto` floors the grid
		// at its min-content height, so a message row taller than its share pushed the wall past the
		// viewport and the page scrolled. Out of the flex flow it is exactly one screen, and the message
		// cell scrolls inside itself instead.
		<main
			className="h-screen overflow-hidden grid grid-cols-3 gap-px bg-line-subtle text-fg
				grid-rows-[minmax(4rem,1fr)_auto_minmax(4rem,1fr)] sm:grid-rows-3"
		>
			{top.map((spec, i) => (
				<div key={`${spec.id}-${i}`} className={TOP_CELLS[i]}>
					<TilingTile spec={spec} />
				</div>
			))}

			{/* Row 2 — the message. Below sm it takes the whole row and the two flanking specimens drop
			    out; explicit placement keeps it in the middle cell either way. */}
			<div className="hidden sm:block col-start-1 row-start-2">
				<TilingTile spec={picked[3]} />
			</div>
			{/* overflow-y-auto: on sm+ this cell is a fixed third of the viewport, and error.message is
			    whatever was thrown — a long one scrolls instead of spilling over its neighbours. */}
			<div className="col-start-1 col-span-3 sm:col-start-2 sm:col-span-1 row-start-2 bg-surface flex flex-col justify-center p-6 md:p-8 overflow-y-auto">
				<p className="text-[10px] uppercase tracking-wider text-fg-muted font-mono">{eyebrow}</p>
				<h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-balance">
					{title}
				</h1>
				<p className="mt-3 text-sm text-fg-secondary leading-relaxed">{body}</p>
				{detail ? (
					<div className="mt-4 border-l-2 border-line-strong pl-3 text-xs font-mono text-fg-secondary break-words">
						{detail}
					</div>
				) : null}
				<div className="mt-6 flex flex-wrap gap-2">{actions}</div>
			</div>
			<div className="hidden sm:block col-start-3 row-start-2">
				<TilingTile spec={picked[4]} />
			</div>

			{bottom.map((spec, i) => (
				<div key={`${spec.id}-${i}`} className={BOTTOM_CELLS[i]}>
					<TilingTile spec={spec} />
				</div>
			))}
		</main>
	);
}
