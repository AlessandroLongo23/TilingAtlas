"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ParquetMini } from "@/components/landing/parquet-mini";
import { tilingToSvg, type TilingSvg } from "@/lib/render/tilingSvg";
import { UNIFORM_CELLS } from "@/lib/render/uniformCells";

// The shell behind app/error.tsx and app/not-found.tsx: a 3 × 3 wall of specimens with the message
// in the middle cell, hairlines between cells like the landing's collections grid. The eight cells
// around the message hold the eleven uniform tilings — the top-left cell splits into a 2 × 2 of
// four, the bottom-right into a parquet strip over one more — so the page a reader lands on after a
// failure still shows the catalogue.
//
// Everything here is self-contained: an error screen renders after something has already broken, so
// it reaches no server data. The cells come from lib/render/uniformCells.ts (7 kB of vertices lifted
// out of the atlas) and are drawn as inline SVG, no canvas and no effect to wait on.
//
// Client component: lucide icon references can't cross the RSC boundary into <Button>, so both
// callers stay client too (see components/landing/landing-buttons.tsx).

const cellOf = (id: string) => UNIFORM_CELLS.find((c) => c.id === id)!.cell;

// Vertex configurations written out, not taken from the atlas's `family` field — that field carries
// the distinct polygons ("4.8"), not the configuration (4.8.8), so it would mislabel half of these.
interface Specimen {
	id: string;
	label: string;
	svg: TilingSvg | null;
}

/**
 * @param edges  tile edge-lengths across the cell — the zoom.
 * @param aspect the cell's rough width : height at a desktop viewport, so the patch isn't generated
 *               for rows the crop will throw away.
 */
const specimen = (id: string, label: string, edges: number, aspect: number): Specimen => ({
	id,
	label,
	svg: tilingToSvg(cellOf(id), edges, aspect),
});

// Drawn once at module load: fixed geometry, no per-render work.
// `edges` is tuned per tiling, not shared: the lattice spacings run from 1 (the triangular tiling)
// to 4.73 (4.6.12), so a single zoom would show one dodecagon beside forty triangles. Each value
// puts roughly five repeats across its cell.
const QUAD = [
	specimen("t1005", "4⁴", 7, 1.3),
	specimen("t1001", "6³", 8, 1.3),
	specimen("t1011", "3⁶", 7, 1.3),
	specimen("t1007", "(3.6)²", 9, 1.3),
];
const TOP_CENTRE = specimen("t1003", "4.6.12", 22, 1.3);
const TOP_RIGHT = specimen("t1002", "4.8²", 13, 1.3);
const MID_LEFT = specimen("t1006", "3.4.6.4", 20, 1.6);
const MID_RIGHT = specimen("t1004", "3.12²", 24, 1.6);
const BOTTOM_LEFT = specimen("t1010", "3⁴.6", 20, 2.2);
const BOTTOM_CENTRE = specimen("t1008", "3³.4²", 11, 2.2);
const BOTTOM_RIGHT = specimen("t1009", "3².4.3.4", 12, 3.5);

/** One specimen, full-bleed in its cell and clickable through to Play. */
function TilingTile({ spec }: { spec: Specimen }) {
	if (!spec.svg) return null;
	return (
		<Link
			href={`/play?source=reference&tiling=${spec.id}`}
			className="group relative block w-full h-full overflow-hidden bg-surface-raised"
			aria-label={`Open the ${spec.label} tiling in Play`}
		>
			<svg
				viewBox={spec.svg.viewBox}
				preserveAspectRatio="xMidYMid slice"
				aria-hidden="true"
				className="absolute inset-0 w-full h-full saturate-[0.88] opacity-95 transition-[filter,opacity] duration-300 group-hover:saturate-100 group-hover:opacity-100"
			>
				{spec.svg.paths.map((path, i) => (
					<path
						key={i}
						d={path.d}
						fill={path.fill}
						stroke="rgba(0,0,0,0.45)"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
			{/* The specimen names itself on hover, in the caption style the hero uses. */}
			<span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono bg-surface/80 backdrop-blur-sm border border-line rounded px-1.5 py-0.5 text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity">
				{spec.id} · {spec.label}
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

export function ErrorScreen({ eyebrow, title, body, detail, actions }: ErrorScreenProps) {
	// Three equal columns and three equal rows from sm up, so the wall is a regular 3 × 3. Below
	// that the message row sizes to its content instead: a third of a phone screen can't hold a
	// title, a body, a digest and three buttons.
	return (
		// h-screen with overflow-hidden and NO flex-1: as a flex item, `min-height: auto` floors the
		// grid at its min-content height, so a message row taller than its share pushed the wall past
		// the viewport and the page scrolled. Out of the flex flow it is exactly one screen, and the
		// message cell scrolls inside itself instead.
		<main
			className="h-screen overflow-hidden grid grid-cols-3 gap-px bg-line-subtle text-fg
				grid-rows-[minmax(4rem,1fr)_auto_minmax(4rem,1fr)] sm:grid-rows-3"
		>
			{/* Row 1 — the top-left cell subdivides into four. A phone column is ~130 px wide, where a
			    quarter of it is a stripe, not a specimen, so below sm only the first one shows. */}
			<div className="col-start-1 row-start-1 grid grid-cols-1 grid-rows-1 sm:grid-cols-2 sm:grid-rows-2 gap-px bg-line-subtle">
				{QUAD.map((spec, i) => (
					<div key={spec.id} className={i === 0 ? "" : "hidden sm:block"}>
						<TilingTile spec={spec} />
					</div>
				))}
			</div>
			<div className="col-start-2 row-start-1">
				<TilingTile spec={TOP_CENTRE} />
			</div>
			<div className="col-start-3 row-start-1">
				<TilingTile spec={TOP_RIGHT} />
			</div>

			{/* Row 2 — the message. Below sm it takes the whole row and the two flanking specimens
			    drop out; explicit placement keeps it in the middle cell either way. */}
			<div className="hidden sm:block col-start-1 row-start-2">
				<TilingTile spec={MID_LEFT} />
			</div>
			{/* overflow-y-auto: on sm+ this cell is a fixed third of the viewport, and error.message is
			    whatever was thrown — a long one scrolls rather than spilling over its neighbours. */}
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
				<TilingTile spec={MID_RIGHT} />
			</div>

			{/* Row 3 — the bottom-right cell subdivides into a parquet strip over one specimen. */}
			<div className="col-start-1 row-start-3">
				<TilingTile spec={BOTTOM_LEFT} />
			</div>
			<div className="col-start-2 row-start-3">
				<TilingTile spec={BOTTOM_CENTRE} />
			</div>
			{/* Two equal halves: the strip's box is ~3.1 : 1 and half a cell is ~3.2 : 1, so it very
			    nearly fills its band. Dropped below sm, where a phone column is too narrow for a strip
			    to read as a deformation. */}
			<div className="col-start-3 row-start-3 grid grid-rows-1 sm:grid-rows-2 gap-px bg-line-subtle">
				<div className="relative overflow-hidden bg-surface-raised hidden sm:block">
					<ParquetMini />
				</div>
				<TilingTile spec={BOTTOM_RIGHT} />
			</div>
		</main>
	);
}
