"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/design-system/components/button";
import { Modal } from "@/design-system/components/modal";
import { OptionWall } from "@/design-system/components/option-wall";
import { Tooltip } from "@/design-system/components/tooltip";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { speciesPolygons } from "@/components/polygon-glyph";
import { parseSpecies, speciesLabel } from "@/lib/services/polygonSpecies";
import type { PolygonMode as Mode } from "@/lib/services/referenceAtlas";
import { cn } from "@/lib/utils/cn";

const MODE_OPTIONS: { value: Mode; label: string; note: string }[] = [
	{ value: "all", label: "Uses all of", note: "every selected tile appears in the tiling" },
	{ value: "any", label: "Uses any of", note: "at least one selected tile appears" },
	{ value: "only", label: "Only these", note: "the tiling uses nothing outside the selection" },
];

export interface PolygonFilterModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	/** Every species present in the shelf's current scope, sorted regular-then-star. */
	available: string[];
	/** Tilings carrying each species, within the current filters MINUS the polygon facet. */
	counts: Map<string, number>;
	selected: string[];
	/** Species the tiling must not use. A card click cycles either → selected → excluded → either. */
	excluded: string[];
	onToggle: (key: string) => void;
	onClear: () => void;
	mode: Mode;
	onModeChange: (m: Mode) => void;
	/** How many tilings the current selection matches — the live consequence of the picks. */
	matchCount: number;
}

/**
 * One tile species as a selectable card: the same thumbnail renderer and card shell as PrototileCard
 * on /play/about/prototiles, plus selection state and the tiling count.
 */
function SpeciesCard({
	species,
	count,
	selected,
	excluded,
	onToggle,
}: {
	species: string;
	count: number;
	selected: boolean;
	excluded: boolean;
	onToggle: () => void;
}) {
	const polygons = useMemo(() => speciesPolygons(species), [species]);
	if (!polygons) return null;
	return (
		<Tooltip
			label={`${speciesLabel(species)} — ${count.toLocaleString()} tiling${count === 1 ? "" : "s"}${excluded ? " (excluded)" : ""}`}
		>
			{/* ds-check: keep (a three-state thumbnail card, either → required → excluded; Button pressed and OptionWall are two-state) */}
			<button
				type="button"
				aria-pressed={selected ? true : excluded ? "mixed" : false}
				onClick={onToggle}
				className={cn(
					"group ta-well relative flex flex-col overflow-hidden text-left transition-colors",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-fg",
					selected
						? "border-fg bg-surface-overlay/60"
						: excluded
							? "border-line-strong opacity-50"
							: "hover:border-line-strong hover:bg-surface-overlay/50",
					count === 0 && !selected && !excluded ? "opacity-40" : null,
				)}
			>
				<div className="relative aspect-square bg-surface-raised">
					<TilingThumbnail polygons={polygons} fit={0.66} />
					{selected ? (
						<span className="text-bg absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-fg">
							<Check className="size-icon-xs" strokeWidth={3.5} />
						</span>
					) : excluded ? (
						<span className="text-bg absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-fg-muted">
							<X className="size-icon-xs" strokeWidth={3.5} />
						</span>
					) : null}
				</div>
				<div className="flex items-baseline justify-between gap-1 px-1.5 py-1">
					<span
						className={cn("truncate text-caption leading-none font-medium", selected ? "text-fg" : "text-fg-secondary")}
					>
						{speciesLabel(species)}
					</span>
					<span className="shrink-0 text-micro leading-none text-fg-muted tabular-nums">{count.toLocaleString()}</span>
				</div>
			</button>
		</Tooltip>
	);
}

export function PolygonFilterModal({
	isOpen,
	onOpenChange,
	available,
	counts,
	selected,
	excluded,
	onToggle,
	onClear,
	mode,
	onModeChange,
	matchCount,
}: PolygonFilterModalProps) {
	// Regular polygons in one row, then one row PER STAR FOLD — the folds have between one and six
	// point angles each, and mixing them into a single flow put 6★ 90° next to 8★ 15° with nothing to
	// say they belong to different tiles. One row per fold is also how /play/about/prototiles reads.
	const { regular, starRows } = useMemo(() => {
		const reg: string[] = [];
		const byFold = new Map<number, string[]>();
		for (const key of available) {
			const p = parseSpecies(key);
			if (!p) continue;
			if (!p.star) reg.push(key);
			else byFold.set(p.n, [...(byFold.get(p.n) ?? []), key]);
		}
		return {
			regular: reg,
			starRows: [...byFold.entries()].sort((a, b) => a[0] - b[0]),
		};
	}, [available]);

	// One fixed track width everywhere so every row lines up, whatever its length. auto-fill would
	// re-flow each row to its own count and leave the sections visibly misaligned. A phone gets three
	// equal columns instead, which is the same alignment at the width it has.
	const grid =
		"grid gap-2 [grid-template-columns:repeat(auto-fill,92px)] max-md:[grid-template-columns:repeat(3,minmax(0,1fr))]";

	return (
		// On a phone the sheet takes the full 92dvh; the Modal body scrolls and the footer below sticks to
		// its bottom edge, so Done is always in reach.
		<Modal open={isOpen} onOpenChange={onOpenChange} title="Filter by polygon" maxWidth="max-w-4xl max-md:h-[92dvh]">
			{/* Modal renders children unpadded — every caller supplies its own inset. */}
			<div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto p-4 max-md:max-h-none max-md:overflow-visible">
				<div className="flex flex-col gap-1.5">
					<OptionWall
						columns={3}
						options={MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.note }))}
						selected={mode}
						onChange={onModeChange}
					/>
					<p className="text-caption leading-tight text-fg-muted">
						{MODE_OPTIONS.find((o) => o.value === mode)?.note}. Click a tile again to exclude it, a third time to clear
						it.
					</p>
				</div>

				{regular.length ? (
					<section className="flex flex-col gap-2">
						<h4 className="ta-label">Regular polygons</h4>
						<div className={grid}>
							{regular.map((key) => (
								<SpeciesCard
									key={key}
									species={key}
									count={counts.get(key) ?? 0}
									selected={selected.includes(key)}
									excluded={excluded.includes(key)}
									onToggle={() => onToggle(key)}
								/>
							))}
						</div>
					</section>
				) : null}

				{starRows.length ? (
					<section className="flex flex-col gap-3">
						<h4 className="ta-label">
							Star polygons
							<span className="ml-1.5 font-sans font-normal tracking-normal text-fg-muted normal-case">
								by fold, each at every point angle in the atlas
							</span>
						</h4>
						{starRows.map(([fold, keys]) => (
							<div key={fold} className="flex flex-col gap-1.5">
								<span className="text-micro font-medium text-fg-muted tabular-nums">{fold}★</span>
								<div className={grid}>
									{keys.map((key) => (
										<SpeciesCard
											key={key}
											species={key}
											count={counts.get(key) ?? 0}
											selected={selected.includes(key)}
											excluded={excluded.includes(key)}
											onToggle={() => onToggle(key)}
										/>
									))}
								</div>
							</div>
						))}
					</section>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 max-md:sticky max-md:bottom-0 max-md:bg-surface-raised">
				<span className="text-small text-fg-muted">
					{selected.length + excluded.length === 0 ? (
						"No polygons selected — the facet is off"
					) : (
						<>
							<span className="font-medium text-fg-secondary tabular-nums">{matchCount.toLocaleString()}</span> tiling
							{matchCount === 1 ? "" : "s"} match {selected.length} selected
							{excluded.length ? `, ${excluded.length} excluded` : ""}
						</>
					)}
				</span>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						label="Clear"
						onClick={onClear}
						disabled={selected.length + excluded.length === 0}
					/>
					<Button variant="secondary" size="sm" label="Done" onClick={() => onOpenChange(false)} />
				</div>
			</div>
		</Modal>
	);
}
