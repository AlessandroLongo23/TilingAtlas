"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Shapes, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ShelfArticleNav } from "@/components/about/shelf-article-nav";
import { OptionWall } from "@/design-system/components/option-wall";
import { Badge } from "@/design-system/components/badge";
import { Button } from "@/design-system/components/button";
import { useMobileSheet } from "@/stores/mobileSheet";
import { PrototileCard } from "@/components/prototile-card";
import { allPrototiles, FAMILY_LABELS, type TileFamily } from "@/lib/tiles/prototiles";

// Prototile-SHAPE gallery — the shape-level companion to the tiling Library, same sidebar+grid layout.
// Four families: regular, convex-irregular, star (non-convex isotoxal), isotoxal (convex, two alternating
// angles). Only the isotoxal family depends on a direction grid; the toggle (30°/15°) exposes it so the
// off-grid members stay reachable. Display-only float geometry.
type FamilyFilter = TileFamily | "all";

const FAMILY_OPTIONS: { value: FamilyFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "regular", label: FAMILY_LABELS.regular },
	{ value: "scaled", label: FAMILY_LABELS.scaled },
	{ value: "polyomino", label: FAMILY_LABELS.polyomino },
	{ value: "convex", label: FAMILY_LABELS.convex },
	{ value: "star", label: FAMILY_LABELS.star },
	{ value: "isotoxal", label: FAMILY_LABELS.isotoxal },
	{ value: "isotoxalFull", label: FAMILY_LABELS.isotoxalFull },
];

const GRID_OPTIONS = [
	{ value: 12, label: "30° (ζ₁₂)" },
	{ value: 24, label: "15° (ζ₂₄)" },
];

const COLUMN_OPTIONS = [3, 4, 5, 6].map((c) => ({ value: c, label: `${c}` }));

export function TilesClient() {
	const [family, setFamily] = useState<FamilyFilter>("all");
	const [isoGrid, setIsoGrid] = useState<number>(24); // ζ₂₄ default — extends the isotoxal family to the off-grid members
	const [columns, setColumns] = useState<number>(5);

	const all = useMemo(() => allPrototiles(isoGrid), [isoGrid]);
	const tiles = useMemo(() => (family === "all" ? all : all.filter((t) => t.family === family)), [all, family]);

	const showGrid = family === "all" || family === "isotoxal" || family === "isotoxalFull";
	// Through a variable so a phone can hold the grid at two columns whatever the setting says.
	const gridStyle = { "--cols": columns } as CSSProperties;

	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			<PageSidebar
				scrollable={false}
				mobile="modal"
				mobileLabel="Filters"
				mobileBadge={family !== "all" ? 1 : 0}
				mobileFooter={
					<div className="flex items-center gap-2">
						{family !== "all" ? (
							<Button variant="ghost" icon={X} label="Clear" onClick={() => setFamily("all")} />
						) : null}
						<Button
							variant="primary"
							className="flex-1"
							label={`Show ${tiles.length} shapes`}
							onClick={() => useMobileSheet.getState().setOpen(false)}
						/>
					</div>
				}
			>
				{/* Same two-part sidebar as a theory article: the library switcher pinned on top, the page's
				    own controls scrolling under it. On a phone the sheet is one scroll, filters first. */}
				<div className="flex h-full min-h-0 flex-col max-md:overflow-y-auto max-md:overscroll-contain">
					<div className="shrink-0 border-b border-line-subtle pb-2 max-md:order-2 max-md:border-t max-md:border-b-0 max-md:pb-6">
						<ShelfArticleNav />
					</div>
					<div className="scrollbar-hide min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-md:order-1 max-md:flex-none max-md:overflow-visible">
						{/* The sheet's title says Filters and its footer carries Clear. */}
						<div className="flex items-center justify-between px-3 pt-3 max-md:hidden">
							<span className="ta-label">Filters</span>
							{family !== "all" ? (
								<button
									onClick={() => setFamily("all")}
									className="flex items-center gap-1 text-small text-fg-muted transition-colors hover:text-danger"
								>
									<X className="size-icon-xs" /> Clear
								</button>
							) : null}
						</div>

						<div className="flex flex-col gap-4 p-3 text-body">
							<section className="flex flex-col gap-2">
								<h3 className="ta-label">Tile class</h3>
								<OptionWall columns={3} options={FAMILY_OPTIONS} selected={family} onChange={setFamily} />
							</section>

							{showGrid ? (
								<section className="flex flex-col gap-2 border-t border-line-subtle pt-3">
									<h3 className="ta-label">Isotoxal angle grid</h3>
									<OptionWall options={GRID_OPTIONS} selected={isoGrid} onChange={setIsoGrid} />
									<p className="text-caption leading-relaxed text-fg-muted max-md:text-ui">
										15° adds the off-grid members (regular octagon, 105°/135° hexagon) the 30° grid can’t express. Only
										affects the isotoxal family.
									</p>
								</section>
							) : null}

							{/* A phone always shows two columns, so there is nothing for this to set there. */}
							<section className="flex flex-col gap-2 border-t border-line-subtle pt-3 max-md:hidden">
								<h3 className="ta-label">Columns</h3>
								<OptionWall options={COLUMN_OPTIONS} selected={columns} onChange={setColumns} />
							</section>
						</div>
					</div>
				</div>
			</PageSidebar>

			{/* Focusable: nothing in it takes focus, and a scroller has to for a keyboard to scroll it. */}
			<main tabIndex={0} className="relative flex-1 overflow-y-auto p-5 max-md:px-4 max-md:pb-24">
				<div className="mb-1 flex items-center gap-3">
					<Shapes className="size-icon-lg text-fg-accent" />
					<h1 className="text-title font-semibold text-fg">Prototiles</h1>
					<Badge mono>{tiles.length} shapes</Badge>
				</div>
				<p className="mb-5 max-w-3xl text-small leading-relaxed text-fg-muted max-md:text-ui">
					The individual tile shapes behind the tilings — regular, convex-irregular, star and isotoxal. Star and
					isotoxal are the two branches of one construction (n points of angle α alternating with β, α + β = 360 −
					360/n): reflex β makes a star, convex β makes an isotoxal tile. The{" "}
					<span className="text-fg-secondary">Isotoxal (unified)</span> class shows both branches as one α-sorted
					continuum per side-count — the same 2n-gon walked from convex through β = 180° into a reflex-vertex star.
					Display-only.
				</p>

				<div
					className="grid [grid-template-columns:repeat(var(--cols),1fr)] gap-3 max-md:[grid-template-columns:repeat(2,minmax(0,1fr))]"
					style={gridStyle}
				>
					{tiles.map((tile) => (
						<PrototileCard key={tile.id} tile={tile} />
					))}
				</div>
			</main>
		</div>
	);
}
