"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { HyperbolicDevelopedThumbnail } from "@/components/hyperbolic-developed-thumbnail";
import { SphericalThumbnail } from "@/components/spherical-thumbnail";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// The /play picker's tile wall for one k-bucket: two columns of thumbnails on the wall grid, with a
// GUTTER lane between them — a strip of panel colour a few px wide whose two edges are hairlines.
// Where the vertical lane crosses a horizontal one the four rounded corners open a diamond at each
// of the four corners of the little square they enclose. A single hairline (what the landing wall
// uses) put the previews shoulder to shoulder and left the selected one hard to pick out.
//
// VIRTUALISED. A class like Regular polygons holds 2,720 tilings; mounting them all put >4,000 live
// canvases in the DOM, at which point Chromium stopped delivering IntersectionObserver records
// altogether and NOTHING painted (small buckets were fine — the failure was purely one of scale).
// Only the rows near the viewport are mounted; everything above and below is one flat spacer cell.
const COLS = 2;
const GUTTER = 6;
const OVERSCAN = 2;
// Room left above a revealed tile so it doesn't land under the sticky class/k headers.
const REVEAL_INSET = 84;

interface TileGridProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Scroll this tiling into view and pulse it once, when it belongs to this bucket. */
	revealKey?: string | null;
	/**
	 * Content width of the list, measured ONCE by the panel and handed to every bucket. Measuring
	 * per grid raced the reveal: a bucket settled its own height a commit before its siblings, so a
	 * scroll target computed across them landed short.
	 */
	width: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A one-shot outline that radiates and fades — draws the eye after a jump (R / arrows / deep link).
// Outline, not box-shadow, so it doesn't replace the persistent selection ring; no fill:forwards, so
// it reverts when done.
function pulse(el: HTMLElement) {
	el.animate(
		[
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-fg) l c h / 0.9)", outlineOffset: "-3px" },
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-fg) l c h / 0)", outlineOffset: "2px" },
		],
		{ duration: 650, easing: "ease-out" },
	);
}

export function TileGrid({ items, selectedKey, onSelect, revealKey, width }: TileGridProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [range, setRange] = useState({ start: 0, end: 0 });

	// Column width drives everything: tiles are square, so it is also the row height. A row is
	// COLS tiles, COLS+1 lanes, and a hairline between each of those.
	const cell = width > 0 ? (width - (COLS + 1) * GUTTER - (2 * COLS)) / COLS : 0;
	// Row pitch: one tile row, the two hairlines around the gutter row, and the gutter row itself.
	const stride = cell + GUTTER + 2;
	const rows = Math.ceil(items.length / COLS);

	const recompute = useCallback(() => {
		const el = hostRef.current;
		if (!el || cell <= 0) return;
		const scroller = el.closest<HTMLElement>("[data-sidebar-scroll]");
		const next = (() => {
			if (!scroller) return { start: 0, end: rows };
			// Offset of this grid's top within the scrollport, in scrollport coordinates.
			const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
			return {
				start: clamp(Math.floor(-top / stride) - OVERSCAN, 0, rows),
				end: clamp(Math.ceil((-top + scroller.clientHeight) / stride) + OVERSCAN, 0, rows),
			};
		})();
		setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
	}, [cell, stride, rows]);

	// No dep array on purpose: a sibling section expanding or collapsing moves this grid without
	// resizing it and without firing a scroll, and the only signal for that is the re-render itself.
	// recompute bails out of setState when the window is unchanged, so this cannot loop.
	useEffect(() => {
		recompute();
	});

	useEffect(() => {
		const scroller = hostRef.current?.closest<HTMLElement>("[data-sidebar-scroll]");
		scroller?.addEventListener("scroll", recompute, { passive: true });
		window.addEventListener("resize", recompute);
		return () => {
			scroller?.removeEventListener("scroll", recompute);
			window.removeEventListener("resize", recompute);
		};
	}, [recompute]);

	// Reveal on selection change — R, the arrows, a deep link. Two paths, because the target row may
	// not be mounted: if the tile is on screen it is scrolled to as an element (short, smooth); if it
	// isn't, the jump is computed from its row index, then RE-CHECKED against the real element once
	// that row mounts. The re-check is what makes it reliable — the buckets above only take on their
	// true heights over a couple of commits, and a target measured across them lands short.
	// Metrics through a ref, so the effect below keys on the SELECTION alone. Keyed on cell/stride
	// too, it would tear down mid-retry every time the width settled — which is exactly when the
	// retry is needed.
	const metrics = useRef({ cell, stride });
	metrics.current = { cell, stride };
	useEffect(() => {
		if (!revealKey) return;
		const idx = items.findIndex((t) => t.canonicalKey === revealKey);
		if (idx < 0) return;
		const el = hostRef.current;
		const scroller = el?.closest<HTMLElement>("[data-sidebar-scroll]");
		if (!el || !scroller) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const row = Math.floor(idx / COLS);
		const selector = `[data-tiling-key="${CSS.escape(revealKey)}"]`;

		let timer = 0;
		let tries = 0;
		const step = () => {
			const { stride: rowStride, cell: cellSize } = metrics.current;
			const btn = el.querySelector<HTMLElement>(selector);
			if (btn) {
				const b = btn.getBoundingClientRect();
				const s = scroller.getBoundingClientRect();
				const off = b.top - s.top - REVEAL_INSET;
				if (b.top < s.top + REVEAL_INSET || b.bottom > s.bottom) {
					scroller.scrollBy({ top: off, behavior: tries === 0 && !reduce ? "smooth" : "auto" });
				}
				// Pulse the ring overlay, for the same paint-order reason the ring lives there.
				const ring = btn.querySelector<HTMLElement>("[data-ring]") ?? btn;
				if (!reduce) timer = window.setTimeout(() => pulse(ring), 60);
				return;
			}
			// Off screen: jump by row index, instantly (a smooth scroll across 100k px is not a
			// transition anyone reads), then come back next frame to check where it actually landed.
			if (cellSize > 0) {
				const y =
					el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop +
					row * rowStride;
				scroller.scrollTo({ top: Math.max(0, y - REVEAL_INSET), behavior: "auto" });
			}
			if (++tries < 6) timer = window.setTimeout(step, 60);
		};
		step();
		return () => window.clearTimeout(timer);
	}, [revealKey, items]);

	// Lane, tile, lane, tile, lane — the outer lanes frame the wall the same way the middle one
	// separates the columns, so no preview ever runs into the edge of the panel.
	const lanes = { gridTemplateColumns: `${GUTTER}px 1fr ${GUTTER}px 1fr ${GUTTER}px` };
	const visible: number[] = [];
	for (let r = range.start; r < range.end; r++) visible.push(r);

	return (
		<div ref={hostRef} className="ta-wall flex flex-col gap-px">
			{range.start > 0 ? <div className="ta-wall-cell bg-surface-chrome" style={{ height: range.start * stride - 1 }} /> : null}
			{visible.map((r, i) => (
				<div key={r} className="contents">
					{/* The horizontal lane, split by the three vertical ones — this is where the diamonds
					    land. Not before the first mounted row: the spacer above already ends in a hairline,
					    and the row pitch (spacer height = start*stride - 1) is measured on that. */}
					{i > 0 ? (
						<div className="grid gap-px" style={{ ...lanes, height: GUTTER }}>
							{/* The squares where lanes cross are the cells left sharp: at GUTTER px across one
							    would otherwise round into a dot, and its curve would swallow the diamonds its
							    rounded neighbours open at each of the four corners. */}
							<div className="bg-surface-chrome" />
							<div className="ta-wall-cell bg-surface-chrome" />
							<div className="bg-surface-chrome" />
							<div className="ta-wall-cell bg-surface-chrome" />
							<div className="bg-surface-chrome" />
						</div>
					) : null}
					<div className="grid gap-px" style={lanes}>
						<div className="ta-wall-cell bg-surface-chrome" />
						<Tile t={items[r * COLS]} selectedKey={selectedKey} onSelect={onSelect} />
						<div className="ta-wall-cell bg-surface-chrome" />
						<Tile t={items[r * COLS + 1]} selectedKey={selectedKey} onSelect={onSelect} />
						<div className="ta-wall-cell bg-surface-chrome" />
					</div>
				</div>
			))}
			{range.end < rows ? <div className="ta-wall-cell bg-surface-chrome" style={{ height: (rows - range.end) * stride - 1 }} /> : null}
		</div>
	);
}

function Tile({
	t,
	selectedKey,
	onSelect,
}: {
	t: CatalogueTiling | undefined;
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
}) {
	// The odd tile out on the last row: an empty cell keeps the lane and the hairlines running.
	if (!t) return <div className="ta-wall-cell bg-surface-chrome" />;
	const selected = t.canonicalKey === selectedKey;
	return (
		<button
			data-tiling-key={t.canonicalKey}
			type="button"
			onClick={() => onSelect?.(t)}
			title={`${t.canonicalKey} · {${t.family}}`}
			className="ta-wall-cell group relative flex flex-col bg-surface-raised overflow-hidden cursor-pointer"
		>
			<div className="relative aspect-square bg-surface-raised">
				{t.spherical ? (
					<SphericalThumbnail solidId={t.spherical.solid} />
				) : t.developed ? (
					<HyperbolicDevelopedThumbnail patch={t.developed.patch} />
				) : t.renderCell ? (
					<TilingThumbnail translationalCell={t.renderCell as TranslationalCellData} pxPerEdge={14} />
				) : null}
				{t.paramCell ? (
					<span
						title="One-parameter family (adjustable α)"
						className="absolute top-1 left-1 inline-flex h-4 w-4 items-center justify-center text-[10px] font-bold leading-none bg-fg text-fg-inverse"
					>
						α
					</span>
				) : null}
			</div>
			{/* The selection ring lives on its own overlay, not on the button: both an inset ring
			    (a box-shadow) and a negatively-offset outline paint UNDER the button's children in
			    Chromium, and the thumbnail fills the cell edge to edge — it swallowed the ring whole.
			    An absolutely positioned sibling after the thumbnail always paints on top. */}
			<span
				data-ring
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 z-10",
					// fg (not a fixed black) keeps the selection visible in both themes.
					selected ? "ring-2 ring-inset ring-fg" : "group-hover:ring-2 group-hover:ring-inset group-hover:ring-line-strong",
				)}
			/>
		</button>
	);
}
