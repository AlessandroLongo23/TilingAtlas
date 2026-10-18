"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Badge } from "@/components/ui/badge";
import { InspectorDrawer } from "@/components/run/inspector-drawer";
import { fetchFoundTilings, type FoundTiling } from "@/lib/services/runsService";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";

type SortKey = "seed" | "found" | "size";
const SORTS: Record<SortKey, string> = { seed: "Seed #", found: "Found", size: "Cell size" };

function polyCount(t: FoundTiling): number {
	const rc = t.render_cell as { cellPolygons?: unknown[] } | null;
	return rc?.cellPolygons?.length ?? 0;
}

/**
 * Live found-tilings gallery (M2). A card appears the moment a cell certifies. Uses POKE-THEN-REFETCH
 * (TA note 2): the Realtime INSERT is only a poke; large cell rows can be truncated in the change
 * payload — so we re-select. New cards animate in; reordering (sort changes) animates via `layout`.
 * Reuses the existing TilingThumbnail (renders render_cell, no Cyclotomic in-bundle).
 */
export function GalleryPanel({ runId, initial }: { runId: string; initial: FoundTiling[] }) {
	const [tilings, setTilings] = useState<FoundTiling[]>(initial);
	const [sort, setSort] = useState<SortKey>("seed");
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	useEffect(() => {
		const client = createClient();
		let cancelled = false;
		const refetch = async () => {
			const rows = await fetchFoundTilings(client, runId);
			if (!cancelled) setTilings(rows);
		};
		const channel = client
			.channel(`found-${runId}`)
			.on(
				"postgres_changes",
				{ event: "INSERT", schema: "public", table: "found_tilings", filter: `run_id=eq.${runId}` },
				() => void refetch(),
			)
			.subscribe();
		return () => {
			cancelled = true;
			client.removeChannel(channel);
		};
	}, [runId]);

	// "new" tracks the actually-newest cell (max first_seen_at), independent of the display sort.
	const newestKey = useMemo(
		() =>
			tilings.reduce<FoundTiling | null>((m, t) => (!m || t.first_seen_at > m.first_seen_at ? t : m), null)
				?.canonical_key,
		[tilings],
	);

	const sorted = useMemo(() => {
		const arr = [...tilings];
		if (sort === "seed")
			arr.sort((a, b) => (a.seed_idx ?? 0) - (b.seed_idx ?? 0) || a.canonical_key.localeCompare(b.canonical_key));
		else if (sort === "found") arr.sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at));
		else arr.sort((a, b) => polyCount(a) - polyCount(b) || (a.seed_idx ?? 0) - (b.seed_idx ?? 0));
		return arr;
	}, [tilings, sort]);

	// Resolve the open cell from the live list by key, so refetches keep it in sync (and it closes
	// itself if the row ever disappears).
	const selected = useMemo(() => tilings.find((t) => t.canonical_key === selectedKey) ?? null, [tilings, selectedKey]);

	if (tilings.length === 0) {
		return <div className="py-10 text-center text-sm text-fg-disabled">No cells mirrored yet.</div>;
	}

	return (
		<div>
			<div className="mb-3 flex items-center justify-end gap-1 text-[11px]">
				<span className="mr-1 text-fg-disabled">sort</span>
				{(Object.keys(SORTS) as SortKey[]).map((k) => (
					<button
						key={k}
						type="button"
						onClick={() => setSort(k)}
						className={cn(
							"rounded px-2 py-0.5 transition-colors max-md:min-h-11 max-md:px-3 max-md:text-xs",
							sort === k ? "bg-accent-subtle text-accent" : "text-fg-muted hover:bg-surface-overlay/50 hover:text-fg",
						)}
					>
						{SORTS[k]}
					</button>
				))}
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				<AnimatePresence initial={false}>
					{sorted.map((t) => (
						<motion.div
							key={t.canonical_key}
							layout
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
							role="button"
							tabIndex={0}
							onClick={() => setSelectedKey(t.canonical_key)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									setSelectedKey(t.canonical_key);
								}
							}}
							className="group cursor-pointer overflow-hidden rounded-lg border border-line bg-surface-overlay/30 transition-colors hover:border-accent/60 focus:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/40"
						>
							<div className="aspect-square bg-surface-raised">
								{t.render_cell ? (
									<TilingThumbnail translationalCell={t.render_cell as TranslationalCellData} pxPerEdge={18} />
								) : (
									<div className="flex h-full w-full items-center justify-center text-[10px] text-fg-disabled">
										k={t.k}
									</div>
								)}
							</div>
							<div className="flex items-center justify-between gap-1 px-2 py-1.5">
								<span className="truncate font-mono text-[10px] text-fg-muted">seed #{t.seed_idx ?? "?"}</span>
								{t.canonical_key === newestKey ? <Badge tone="accent">new</Badge> : null}
							</div>
						</motion.div>
					))}
				</AnimatePresence>
			</div>

			<InspectorDrawer tiling={selected} onClose={() => setSelectedKey(null)} />
		</div>
	);
}
