"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { HyperbolicDevelopedThumbnail } from "@/components/hyperbolic-developed-thumbnail";
import { HyperbolicEdgesThumbnail } from "@/components/hyperbolic-edges-thumbnail";
import { SphericalThumbnail } from "@/components/spherical-thumbnail";
import { ColorsThumbnail } from "@/components/colors/colors-thumbnail";
import { FreedrawThumbnail } from "@/components/freedraw/freedraw-thumbnail";
import { HollowThumbnail } from "@/components/hollow/hollow-thumbnail";
import { SphereFreedrawThumbnail } from "@/components/freedraw/sphere-freedraw-thumbnail";
import { SphSchwarzThumbnail } from "@/components/freedraw/sph-schwarz-thumbnail";
import { SphPolyThumbnail } from "@/components/freedraw/sph-poly-thumbnail";
import { SphStarThumbnail } from "@/components/freedraw/sph-star-thumbnail";
import { hypSchwarzMeta } from "@/lib/freedraw/schwarz";
import { hypPolyMeta } from "@/lib/tilings/hyp-poly";
import { PentagonEdgesThumbnail } from "@/components/pentagon-edges-thumbnail";
import { IsohedralEdgesThumbnail } from "@/components/isohedral-edges-thumbnail";
import { HyperbolicColorsThumbnail } from "@/components/hyperbolic-colors-thumbnail";
import { SphericalColorsThumbnail } from "@/components/spherical-colors-thumbnail";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { paramGlyphs, type ParametricCellData } from "@/lib/utils/paramCell";
import { compactVertexConfig } from "@/lib/services/referenceAtlas";

// The /play picker's tile wall for one k-bucket: two columns of thumbnails (three on a phone, where the
// sheet is short and a wide column would leave room for barely one row) on the wall grid, with a
// GUTTER lane between them — a strip of panel colour a few px wide whose two edges are hairlines.
// Where the vertical lane crosses a horizontal one the four rounded corners open a diamond at each
// of the four corners of the little square they enclose. A single hairline (what the landing wall
// uses) put the previews shoulder to shoulder and left the selected one hard to pick out.
//
// VIRTUALISED. A class like Regular polygons holds 2,720 tilings; mounting them all put >4,000 live
// canvases in the DOM, at which point Chromium stopped delivering IntersectionObserver records
// altogether and NOTHING painted (small buckets were fine — the failure was purely one of scale).
// Only the rows near the viewport are mounted; everything above and below is one flat spacer cell. A
// scrollport clipped out of sight (a phone's sheet resting at peek) mounts none at all.
const COLS = 2;
const PHONE_COLS = 3;
const GUTTER = 10;
// Every tile carries a one-line caption under its square preview; part of the row pitch.
const CAPTION = 24;
const OVERSCAN = 2;
// Room left above a revealed tile so it doesn't land under the sticky headers: the bottom of this
// bucket's own k row once pinned (its sticky top plus its height), plus a few px of air.
const revealInset = (host: HTMLElement) => {
	const header = host.parentElement?.previousElementSibling as HTMLElement | null;
	return header ? parseFloat(getComputedStyle(header).top) + header.offsetHeight + 4 : 84;
};

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

// "ctrnact-star-k7-n1248" → "n1248"; a bare serial like "col-6-00001" keeps its parent segment ("6-00001").
const keyTail = (key: string) => {
	const parts = key.split("-");
	const last = parts[parts.length - 1];
	return /^\d+$/.test(last) && parts.length > 1 ? parts.slice(-2).join("-") : last;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A one-shot outline that radiates and fades — draws the eye after a jump (R / arrows / deep link).
// Outline, not box-shadow, so it doesn't replace the persistent selection ring; no fill:forwards, so
// it reverts when done.
function pulse(el: HTMLElement) {
	el.animate(
		[
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-text-primary) l c h / 0.9)", outlineOffset: "-3px" },
			{ outlineStyle: "solid", outlineWidth: "3px", outlineColor: "oklch(from var(--color-text-primary) l c h / 0)", outlineOffset: "2px" },
		],
		{ duration: 650, easing: "ease-out" },
	);
}

export function TileGrid({ items, selectedKey, onSelect, revealKey, width }: TileGridProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [range, setRange] = useState({ start: 0, end: 0 });
	// Whether any of the scrollport is on screen. A phone's sheet at peek clips it away entirely, and then
	// no row is mounted: the thumbnails wait for the sheet to open instead of drawing behind it.
	const [shown, setShown] = useState(true);
	const cols = useIsPhone() ? PHONE_COLS : COLS;

	// Column width drives everything: tiles are square, so it is also the row height. A row is
	// `cols` tiles, cols + 1 lanes, and a hairline between each of those.
	const cell = width > 0 ? (width - (cols + 1) * GUTTER - (2 * cols)) / cols : 0;
	// Row pitch: one tile row (preview + caption), the two 1px gaps around the gutter row, and the
	// gutter row itself.
	const stride = cell + CAPTION + GUTTER + 2;
	const rows = Math.ceil(items.length / cols);

	const recompute = useCallback(() => {
		const el = hostRef.current;
		if (!el || cell <= 0) return;
		const scroller = el.closest<HTMLElement>("[data-sidebar-scroll]");
		const next = (() => {
			if (!scroller) return { start: 0, end: rows };
			if (!shown) return { start: 0, end: 0 };
			// Offset of this grid's top within the scrollport, in scrollport coordinates.
			const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
			return {
				start: clamp(Math.floor(-top / stride) - OVERSCAN, 0, rows),
				end: clamp(Math.ceil((-top + scroller.clientHeight) / stride) + OVERSCAN, 0, rows),
			};
		})();
		setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
	}, [cell, stride, rows, shown]);

	// No dep array on purpose: a sibling section expanding or collapsing moves this grid without
	// resizing it and without firing a scroll, and the only signal for that is the re-render itself.
	// recompute bails out of setState when the window is unchanged, so this cannot loop.
	useEffect(() => {
		recompute();
	});

	// The scrollport's own size, not the window's: a phone's sheet changes snap without a resize event.
	useEffect(() => {
		const scroller = hostRef.current?.closest<HTMLElement>("[data-sidebar-scroll]");
		if (!scroller) return;
		scroller.addEventListener("scroll", recompute, { passive: true });
		const ro = new ResizeObserver(recompute);
		ro.observe(scroller);
		return () => {
			scroller.removeEventListener("scroll", recompute);
			ro.disconnect();
		};
	}, [recompute]);
	// Visibility through every clipping ancestor, which the scrollport's own size does not report.
	useEffect(() => {
		const scroller = hostRef.current?.closest<HTMLElement>("[data-sidebar-scroll]");
		if (!scroller) return;
		const io = new IntersectionObserver(([e]) => setShown(e.isIntersecting));
		io.observe(scroller);
		return () => io.disconnect();
	}, []);

	// Reveal on selection change — R, the arrows, a deep link. Two paths, because the target row may
	// not be mounted: if the tile is on screen it is scrolled to as an element (short, smooth); if it
	// isn't, the jump is computed from its row index, then RE-CHECKED against the real element once
	// that row mounts. The re-check is what makes it reliable — the buckets above only take on their
	// true heights over a couple of commits, and a target measured across them lands short.
	// Metrics through a ref, so the effect below keys on the SELECTION alone. Keyed on cell/stride
	// too, it would tear down mid-retry every time the width settled — which is exactly when the
	// retry is needed.
	const metrics = useRef({ cell, stride, cols });
	metrics.current = { cell, stride, cols };
	useEffect(() => {
		if (!revealKey) return;
		const idx = items.findIndex((t) => t.canonicalKey === revealKey);
		if (idx < 0) return;
		const el = hostRef.current;
		const scroller = el?.closest<HTMLElement>("[data-sidebar-scroll]");
		if (!el || !scroller) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const selector = `[data-tiling-key="${CSS.escape(revealKey)}"]`;
		const inset = revealInset(el);

		let timer = 0;
		let tries = 0;
		const step = () => {
			const { stride: rowStride, cell: cellSize, cols: perRow } = metrics.current;
			const row = Math.floor(idx / perRow);
			const btn = el.querySelector<HTMLElement>(selector);
			if (btn) {
				const b = btn.getBoundingClientRect();
				const s = scroller.getBoundingClientRect();
				const off = b.top - s.top - inset;
				if (b.top < s.top + inset || b.bottom > s.bottom) {
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
				scroller.scrollTo({ top: Math.max(0, y - inset), behavior: "auto" });
			}
			if (++tries < 6) timer = window.setTimeout(step, 60);
		};
		step();
		return () => window.clearTimeout(timer);
	}, [revealKey, items]);

	// Lane, tile, lane, tile, lane — the outer lanes frame the wall the same way the middle one
	// separates the columns, so no preview ever runs into the edge of the panel.
	const lanes = { gridTemplateColumns: `${GUTTER}px ${`1fr ${GUTTER}px `.repeat(cols).trim()}` };
	const columns = Array.from({ length: cols }, (_, c) => c);
	const visible: number[] = [];
	for (let r = range.start; r < range.end; r++) visible.push(r);

	// The pt-1 wrapper keeps the first row clear of the sticky k header's rule. It sits outside hostRef,
	// so every offset above is still measured from the first row.
	return (
		<div className="pt-1">
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
								{columns.map((c) => (
									<Fragment key={c}>
										<div className="ta-wall-cell bg-surface-chrome" />
										<div className="bg-surface-chrome" />
									</Fragment>
								))}
							</div>
						) : null}
						<div className="grid gap-px" style={lanes}>
							<div className="ta-wall-cell bg-surface-chrome" />
							{/* Keyed by the tiling, not the column: when the column count changes (a phone crossing
							    768px) a column index would hand a mounted thumbnail a different tiling. */}
							{columns.map((c) => (
								<Fragment key={items[r * cols + c]?.canonicalKey ?? `empty-${c}`}>
									<Tile t={items[r * cols + c]} selectedKey={selectedKey} onSelect={onSelect} />
									<div className="ta-wall-cell bg-surface-chrome" />
								</Fragment>
							))}
						</div>
					</div>
				))}
				{range.end < rows ? <div className="ta-wall-cell bg-surface-chrome" style={{ height: (rows - range.end) * stride - 1 }} /> : null}
			</div>
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
			// A finger gets the press it cannot hover: the tile sinks a little while it is held.
			className="group relative flex flex-col overflow-hidden rounded-lg bg-surface-raised ring-1 ring-line-subtle cursor-pointer max-md:transition-transform max-md:active:scale-[0.96]"
		>
			<div className="relative aspect-square bg-surface-raised">
				{t.hollow ? (
					<HollowThumbnail patch={t.hollow.patch} />
				) : t.sphPoly ? (
					<SphPolyThumbnail pattern={t.sphPoly} />
				) : t.sphStar ? (
					<SphStarThumbnail pattern={t.sphStar} />
				) : t.pentEdges ? (
					<PentagonEdgesThumbnail pattern={t.pentEdges} />
				) : t.ihEdges ? (
					<IsohedralEdgesThumbnail pattern={t.ihEdges} />
				) : t.sphEdges ? (
					<SphSchwarzThumbnail pattern={t.sphEdges} />
				) : t.hypPoly ? (
					<HyperbolicColorsThumbnail pattern={hypPolyMeta(t.hypPoly)} />
				) : t.schwarz ? (
					t.schwarz.geometry === "spherical" ? (
						<SphSchwarzThumbnail pattern={t.schwarz} />
					) : (
						<HyperbolicEdgesThumbnail pattern={hypSchwarzMeta(t.schwarz)} />
					)
				) : t.sphBubble ? (
					// A spherical bubble decoration draws through the same thumbnail, which swaps the flat
					// solid for the meshed bubble surface when it is handed the bite words.
					<SphericalThumbnail solidId={t.sphBubble.solid} bubbleBites={t.sphBubble.bites} />
				) : t.spherical ? (
					<SphericalThumbnail solidId={t.spherical.solid} />
				) : t.sphColors ? (
					<SphericalColorsThumbnail pattern={t.sphColors.pattern} mode="polyhedron" />
				) : t.hypColors ? (
					<HyperbolicColorsThumbnail pattern={t.hypColors} />
				) : t.hypEdges ? (
					<HyperbolicEdgesThumbnail pattern={t.hypEdges} />
				) : t.sphericalFreedraw ? (
					<SphereFreedrawThumbnail
						pattern={t.sphericalFreedraw.pattern}
						solidId={t.sphericalFreedraw.solid}
						mode="polyhedron"
						showGrid={false}
					/>
				) : t.freedraw ? (
					<FreedrawThumbnail pattern={t.freedraw} />
				) : t.colors ? (
					<ColorsThumbnail pattern={t.colors} live />
				) : t.developed ? (
					<HyperbolicDevelopedThumbnail patch={t.developed.patch} />
				) : t.renderCell ? (
					<TilingThumbnail translationalCell={t.renderCell as TranslationalCellData} pxPerEdge={14} />
				) : null}
				{t.paramCell ? <ParamBadge paramCell={t.paramCell} /> : null}
			</div>
			<span
				className="flex items-center gap-1.5 border-t border-line-subtle px-2 font-mono text-[10.5px] text-fg-secondary max-md:text-xs"
				style={{ height: CAPTION }}
			>
				<span className="min-w-0 truncate">{compactVertexConfig(t.family)}</span>
				{/* A k bucket often holds one configuration many times over, so the key's tail is what tells
				    two neighbours apart; the full key and config stay in the title. */}
				<span className="ml-auto shrink-0 text-[11px] text-fg-muted max-md:text-xs">{keyTail(t.canonicalKey)}</span>
			</span>
			{/* The selection ring lives on its own overlay, not on the button: both an inset ring
			    (a box-shadow) and a negatively-offset outline paint UNDER the button's children in
			    Chromium, and the thumbnail fills the cell edge to edge — it swallowed the ring whole.
			    An absolutely positioned sibling after the thumbnail always paints on top. */}
			<span
				data-ring
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 z-10 rounded-lg",
					// Selected: a 1.5px ink edge with a 2px panel-colour gap inside it, so the ring separates
					// from the preview without shouting over it.
					selected
						? "shadow-[inset_0_0_0_1.5px_var(--color-text-primary),inset_0_0_0_3.5px_var(--color-surface-raised)]"
						: "group-hover:ring-1 group-hover:ring-inset group-hover:ring-line-strong",
				)}
			/>
		</button>
	);
}

// The free-angle badge: one glyph per independent slider the tiling gets in /play, in slider order — "α"
// for the ordinary one-parameter families, "α β" for a two-parameter one, "θ" for a merged family whose
// coordinate is not the exported α. Same glyphs as the slider panel and the library card, so the badge
// reads as a count of the axes, not a generic "this deforms" mark.
function ParamBadge({ paramCell }: { paramCell: ParametricCellData }) {
	const all = paramGlyphs(paramCell);
	// An INTRINSIC family's parameters are corner angles of the tiling and there can be nineteen of them,
	// which is a count, not a badge. Past three the badge says the number; the glyph list stays in the
	// title and in the slider panel, where there is room for it.
	const glyphs = all.length > 3 ? [`${all.length}×`] : all;
	if (!glyphs.length) return null;
	return (
		<span
			title={
				all.length > 1
					? `${all.length}-parameter family — ${all.join(", ")} vary independently (${all.length} sliders in Play)`
					: `One-parameter family (adjustable ${all[0]})`
			}
			// min-w-4 + px-1 keeps the single-glyph badge the square it has always been and lets the
			// two-glyph one grow sideways instead of squeezing the pair into 16px.
			className="absolute top-1.5 left-1.5 inline-flex h-4 min-w-4 items-center justify-center gap-0.5 rounded px-1 text-[10px] font-semibold leading-none bg-fg/85 text-fg-inverse"
		>
			{glyphs.join(" ")}
		</span>
	);
}
