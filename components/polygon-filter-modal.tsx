"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { speciesPolygons } from "@/components/polygon-glyph";
import { parseSpecies, speciesLabel, type PolygonMode } from "@/lib/services/polygonSpecies";
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
	onToggle: (key: string) => void;
	onClear: () => void;
	mode: Mode;
	onModeChange: (m: Mode) => void;
	/** How many tilings the current selection matches — the live consequence of the picks. */
	matchCount: number;
}

/**
 * One tile species as a selectable card: the same thumbnail renderer and card shell as PrototileCard
 * on /theory/tiles, plus selection state and the tiling count.
 */
function SpeciesCard({
	species,
	count,
	selected,
	onToggle,
}: {
	species: string;
	count: number;
	selected: boolean;
	onToggle: () => void;
}) {
	const polygons = useMemo(() => speciesPolygons(species), [species]);
	if (!polygons) return null;
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onToggle}
			title={`${speciesLabel(species)} — ${count.toLocaleString()} tiling${count === 1 ? "" : "s"}`}
			className={cn(
				"group relative flex flex-col overflow-hidden rounded-lg border text-left transition-colors",
				"focus:outline-none focus-visible:ring-1 focus-visible:ring-fg",
				selected
					? "border-fg bg-surface-overlay/60"
					: "border-line bg-surface-overlay/30 hover:border-line-strong hover:bg-surface-overlay/50",
				count === 0 && !selected ? "opacity-40" : null,
			)}
		>
			<div className="relative aspect-square bg-surface-raised">
				<TilingThumbnail polygons={polygons} fit={0.66} />
				{selected ? (
					<span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fg text-bg">
						<Check size={11} strokeWidth={3.5} />
					</span>
				) : null}
			</div>
			<div className="flex items-baseline justify-between gap-1 px-1.5 py-1">
				<span
					className={cn(
						"truncate text-[11px] font-medium leading-none",
						selected ? "text-fg" : "text-fg-secondary",
					)}
				>
					{speciesLabel(species)}
				</span>
				<span className="shrink-0 text-[10px] leading-none tabular-nums text-fg-muted">
					{count.toLocaleString()}
				</span>
			</div>
		</button>
	);
}

export function PolygonFilterModal({
	isOpen,
	onOpenChange,
	available,
	counts,
	selected,
	onToggle,
	onClear,
	mode,
	onModeChange,
	matchCount,
}: PolygonFilterModalProps) {
	// Regular polygons in one row, then one row PER STAR FOLD — the folds have between one and six
	// point angles each, and mixing them into a single flow put 6★ 90° next to 8★ 15° with nothing to
	// say they belong to different tiles. One row per fold is also how /theory/tiles reads.
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
	// re-flow each row to its own count and leave the sections visibly misaligned.
	const grid = { gridTemplateColumns: "repeat(auto-fill, 92px)" } as const;

	return (
		<Modal isOpen={isOpen} onOpenChange={onOpenChange} title="Filter by polygon" size="lg">
			{/* Modal renders children unpadded — every caller supplies its own inset. */}
			<div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto p-4">
				<div className="flex flex-col gap-1.5">
					<OptionWall
						columns={3}
						options={MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.note }))}
						selected={mode}
						onChange={onModeChange}
					/>
					<p className="text-[11px] leading-snug text-fg-muted">
						{MODE_OPTIONS.find((o) => o.value === mode)?.note}
					</p>
				</div>

				{regular.length ? (
					<section className="flex flex-col gap-2">
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
							Regular polygons
						</h4>
						<div className="grid gap-2" style={grid}>
							{regular.map((key) => (
								<SpeciesCard
									key={key}
									species={key}
									count={counts.get(key) ?? 0}
									selected={selected.includes(key)}
									onToggle={() => onToggle(key)}
								/>
							))}
						</div>
					</section>
				) : null}

				{starRows.length ? (
					<section className="flex flex-col gap-3">
						<h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
							Star polygons
							<span className="ml-1.5 font-normal normal-case tracking-normal text-fg-disabled">
								by fold, each at every point angle in the atlas
							</span>
						</h4>
						{starRows.map(([fold, keys]) => (
							<div key={fold} className="flex flex-col gap-1.5">
								<span className="text-[10px] font-medium tabular-nums text-fg-disabled">{fold}★</span>
								<div className="grid gap-2" style={grid}>
									{keys.map((key) => (
										<SpeciesCard
											key={key}
											species={key}
											count={counts.get(key) ?? 0}
											selected={selected.includes(key)}
											onToggle={() => onToggle(key)}
										/>
									))}
								</div>
							</div>
						))}
					</section>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
				<span className="text-xs text-fg-muted">
					{selected.length === 0 ? (
						"No polygons selected — the facet is off"
					) : (
						<>
							<span className="font-medium tabular-nums text-fg-secondary">
								{matchCount.toLocaleString()}
							</span>{" "}
							tiling{matchCount === 1 ? "" : "s"} match {selected.length} selected
						</>
					)}
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onClear}
						disabled={selected.length === 0}
						className="px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
					>
						Clear
					</button>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="border border-line-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-overlay"
					>
						Done
					</button>
				</div>
			</div>
		</Modal>
	);
}
