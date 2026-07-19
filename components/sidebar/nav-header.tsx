"use client";

import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { tileClassOf, TILE_CLASS_LABEL } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

interface NavHeaderProps {
	selected: CatalogueTiling | null;
	/** Tilings in the current geometry — prev/random/next are scoped to it, so they disable below 2. */
	count: number;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
}

// The /play sidebar's top zone: selected-tiling metadata + prev/random/next. It sits ABOVE the
// Catalogue/Options tabs so it stays visible on both, and its nav buttons stay scoped to the geometry
// mode (the parent hands it that geometry's list and count).
export function NavHeader({ selected, count, onRandom, onPrev, onNext }: NavHeaderProps) {
	return (
		<div className="p-3 flex-shrink-0 border-b border-line bg-surface-overlay/40 flex flex-col gap-3">
			{selected ? (
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-mono text-fg-secondary" title={`{${selected.family}}`}>
						k={selected.k} · {TILE_CLASS_LABEL[tileClassOf(selected)].long}
					</span>
					<span className="text-[10px] font-mono text-fg-disabled truncate" title={selected.canonicalKey}>
						{selected.canonicalKey}
					</span>
				</div>
			) : (
				<span className="text-xs text-fg-muted">Select a tiling below.</span>
			)}

			<div className="flex items-stretch gap-2">
				<Button
					variant="secondary"
					size="icon"
					icon={ChevronLeft}
					onClick={onPrev}
					disabled={!onPrev || count < 2}
					title="Previous tiling (←)"
					aria-label="Previous tiling"
				/>
				<Button
					variant="secondary"
					size="sm"
					classes="flex-1"
					icon={Shuffle}
					onClick={onRandom}
					disabled={!onRandom || count < 2}
					title="Pick a random tiling (R)"
				>
					<span className="flex items-center gap-2">
						Random tiling
						<Kbd>R</Kbd>
					</span>
				</Button>
				<Button
					variant="secondary"
					size="icon"
					icon={ChevronRight}
					onClick={onNext}
					disabled={!onNext || count < 2}
					title="Next tiling (→)"
					aria-label="Next tiling"
				/>
			</div>
		</div>
	);
}
