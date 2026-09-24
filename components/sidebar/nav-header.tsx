"use client";

import type { ReactNode } from "react";
import { compactVertexConfig, tileClassOf, TILE_CLASS_LABEL } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

interface NavHeaderProps {
	selected: CatalogueTiling | null;
	/** Overrides the title, e.g. /automata's named uniform tilings ("4.4.4.4 · Square"). */
	title?: ReactNode;
}

// The sidebar's top zone on /play and /automata: what is on the canvas, named, in two lines. It sits
// ABOVE the tabs so it stays visible on all of them. Stepping through the catalogue lives on the canvas
// toolbar, next to the thing it changes.
export function NavHeader({ selected, title }: NavHeaderProps) {
	if (!selected) return <p className="text-[13px] text-fg-muted">Select a tiling below.</p>;
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="truncate text-[15px] font-semibold tracking-tight text-fg" title={`{${selected.family}}`}>
				{title ?? compactVertexConfig(selected.family)}
			</span>
			{/* Freedraw's k counts grid-point orbits, not vertex orbits: spelled out so the shared axis
			    never reads as the same quantity. */}
			<span className="truncate text-xs text-fg-muted">
				{TILE_CLASS_LABEL[tileClassOf(selected)].long} · k = {selected.k}
				{selected.freedraw ? " grid points" : selected.colors ? " colored vertices" : null} ·{" "}
				<span className="font-mono text-[11px]" title={selected.canonicalKey}>
					{selected.canonicalKey}
				</span>
			</span>
		</div>
	);
}
