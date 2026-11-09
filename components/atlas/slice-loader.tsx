"use client";

import { Download } from "lucide-react";
import { Spinner } from "@/design-system/components/spinner";
import { Tooltip } from "@/design-system/components/tooltip";
import type { BrowseNode } from "@/lib/atlas/browse";
import type { UnloadedTier } from "@/lib/services/atlasManifest";

// Beside the grid's count: the tilings in the scope that ship but are not in memory yet. A node with k
// slices of its own (a board, a row, a class's spine) offers each one to load, with its manifest count; a
// folder only says how many, since its slices sit on the boards under it in the tree.

const n = (x: number) => x.toLocaleString("en-US");

interface SliceLoaderProps {
	/** The grid's scope; null is the whole cell. */
	node: BrowseNode | null;
	/** Tilings under the scope in slices not loaded yet. */
	pending: number;
	onLoad: (tier: UnloadedTier) => void;
	loading: ReadonlySet<string>;
}

export function SliceLoader({ node, pending, onLoad, loading }: SliceLoaderProps) {
	const slices = (node?.slices ?? []).filter((s) => s.pending);
	if (!slices.length)
		return pending ? (
			<span className="text-small text-fg-muted">{n(pending)} more in slices not loaded yet</span>
		) : null;
	return (
		<span className="flex flex-wrap items-center gap-1.5">
			<span className="text-small text-fg-muted">Not loaded</span>
			{slices.map((s) => {
				const tier = s.pending!;
				const busy = loading.has(tier.key);
				// A row's share of a slice is smaller than the slice, and the whole slice is what gets fetched.
				const label = `Load k = ${s.k}: ${n(tier.count)} tilings${s.count !== tier.count ? `, ${n(s.count)} of them in this row` : ""}${tier.count > 200_000 ? ". A large slice, it takes a while" : ""}`;
				return (
					<Tooltip key={s.k} label={label}>
						<button
							type="button"
							disabled={busy}
							onClick={() => onLoad(tier)}
							aria-label={label}
							className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-dashed border-line px-2 text-small text-fg-secondary transition-colors hover:border-fg-muted hover:text-fg disabled:cursor-wait"
						>
							{busy ? (
								<Spinner size={12} className="text-current" />
							) : (
								<Download className="size-icon-xs" aria-hidden />
							)}
							k = {s.k}
							<span className="font-mono text-caption text-fg-muted tabular-nums">{n(s.count)}</span>
						</button>
					</Tooltip>
				);
			})}
		</span>
	);
}
