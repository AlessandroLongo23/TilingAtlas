"use client";

import { useMemo, useState } from "react";
import { Shapes, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
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
	const gridStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				<div className="flex items-center justify-between px-3 pt-3">
					<span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Filters</span>
					{family !== "all" ? (
						<button
							onClick={() => setFamily("all")}
							className="flex items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
						>
							<X size={11} /> Clear
						</button>
					) : null}
				</div>

				<div className="p-3 flex flex-col gap-4 text-sm">
					<section className="flex flex-col gap-2">
						<h3 className="text-xs font-medium text-fg-muted uppercase tracking-wider">Tile class</h3>
						<ButtonGroup variant="chip" options={FAMILY_OPTIONS} selected={family} onChange={setFamily} />
					</section>

					{showGrid ? (
						<section className="flex flex-col gap-2 border-t border-line-subtle pt-3">
							<h3 className="text-xs font-medium text-fg-muted uppercase tracking-wider">
								Isotoxal angle grid
							</h3>
							<ButtonGroup variant="chip" options={GRID_OPTIONS} selected={isoGrid} onChange={setIsoGrid} />
							<p className="text-[11px] text-fg-disabled leading-relaxed">
								15° adds the off-grid members (regular octagon, 105°/135° hexagon) the 30° grid can’t
								express. Only affects the isotoxal family.
							</p>
						</section>
					) : null}

					<section className="flex flex-col gap-2 border-t border-line-subtle pt-3">
						<h3 className="text-xs font-medium text-fg-muted uppercase tracking-wider">Columns</h3>
						<ButtonGroup variant="chip" options={COLUMN_OPTIONS} selected={columns} onChange={setColumns} />
					</section>
				</div>
			</PageSidebar>

			<main className="relative flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-1">
					<Shapes size={18} className="text-accent" />
					<h1 className="text-base font-semibold text-fg">Prototiles</h1>
					<span className="text-xs px-2 py-0.5 bg-surface-overlay border border-line text-fg-muted">
						{tiles.length} shapes
					</span>
				</div>
				<p className="text-xs text-fg-muted max-w-3xl mb-5 leading-relaxed">
					The individual tile shapes behind the tilings — regular, convex-irregular, star and isotoxal. Star and
					isotoxal are the two branches of one construction (n points of angle α alternating with β,
					α + β = 360 − 360/n): reflex β makes a star, convex β makes an isotoxal tile. The <span className="text-fg-secondary">Isotoxal
					(unified)</span> class shows both branches as one α-sorted continuum per side-count — the same 2n-gon
					walked from convex through β = 180° into a reflex-vertex star. Display-only.
				</p>

				<div className="grid gap-3" style={gridStyle}>
					{tiles.map((tile) => (
						<PrototileCard key={tile.id} tile={tile} />
					))}
				</div>
			</main>
		</div>
	);
}
