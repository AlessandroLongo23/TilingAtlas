"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { ChangeImages } from "@/components/updates/change-images";
import { ChangeText } from "@/components/updates/change-text";
import { KIND_LABEL, KIND_ORDER, type Change, type ChangeKind, type UpdateEntry } from "@/lib/updates/entries";
import { parseShelfPreviewId, previewHref, previewLabel } from "@/lib/updates/preview-ids";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { shardBody } from "@/lib/services/atlasCodec";

// The "what's new" modal: everything a visitor has not seen, merged into one grouped list rather
// than one block per release. A returning reader wants to know WHAT changed, not which version
// boundary each line fell on; the range and the count carry the version information instead.
//
// Preview cells are fetched once, lazily, from the static public/updates-cells.json that
// scripts/gen-updates-data.ts writes — never bundled, so a visit that shows no modal costs nothing.
// Thumbnails are the static 2-D TilingThumbnail, not the live GL card: browsers cap live WebGL
// contexts at roughly 8-16 and a modal is the wrong place to spend them.

type CellMap = Record<string, { id: string; label: string; k: number; cell: TranslationalCellData }>;

interface UpdatesModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Newest first. Empty renders nothing. */
	entries: UpdateEntry[];
}

/**
 * The one in-flight fetch, cached at module scope so every mount shares it.
 *
 * A `fetched` ref inside the hook cannot do this job. Strict Mode runs each effect twice: the first
 * pass sets the ref and starts the request, the teardown flips the `live` flag that guards setState,
 * and the second pass returns early on the ref it just set — so the response lands with nothing left
 * to receive it, and the strip falls back to text chips in dev forever. Caching the PROMISE lets
 * every pass await the same request and the last one alive to keep the result. One network hit
 * either way. A missing or broken asset resolves to {}: text-only previews, never a broken modal.
 */
let cellsRequest: Promise<CellMap> | null = null;

function loadPreviewCells(): Promise<CellMap> {
	cellsRequest ??= fetch("/updates-cells.json.gz")
		.then((r) => (r.ok ? (shardBody(r) as Promise<CellMap>) : ({} as CellMap)))
		.catch(() => ({}) as CellMap);
	return cellsRequest;
}

function usePreviewCells(enabled: boolean): CellMap {
	const [cells, setCells] = useState<CellMap>({});
	useEffect(() => {
		if (!enabled) return;
		let live = true;
		loadPreviewCells().then((j) => {
			if (live) setCells(j);
		});
		return () => {
			live = false;
		};
	}, [enabled]);
	return cells;
}

function TilingStrip({ ids, cells }: { ids: string[]; cells: CellMap }) {
	return (
		<div className="mt-2 flex flex-wrap gap-2">
			{ids.map((id) => {
				const entry = cells[id];
				// /play for an atlas id, the shelf's own page for a shelf id — /play cannot open one.
				const href = previewHref(id);
				if (!entry) {
					// No flat cell for this id (hyperbolic, spherical, freedraw, Schwarz, hollow). Still
					// reachable — it just travels as a chip instead of a picture.
					return (
						<Link
							key={id}
							href={href}
							className="inline-flex items-center gap-1 border border-line px-2 py-1 font-mono text-xs text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
						>
							{previewLabel(id)}
							<ArrowRight size={12} aria-hidden="true" className="shrink-0" />
						</Link>
					);
				}
				return (
					<Link
						key={id}
						href={href}
						title={`Open ${entry.label}`}
						className="block h-20 w-20 overflow-hidden border border-line transition-colors hover:border-accent"
					>
						{/* Small pxPerEdge on purpose: at 80px a card needs several repeats to read as a
						    tiling, not as a crop of one tile. A shelf cell is scaled by its lattice
						    instead — its boundary is a flattened curve, so an "edge" there is a
						    segment, not a side, and pxPerEdge would zoom in about eightfold. */}
						<TilingThumbnail
							translationalCell={entry.cell}
							pxPerEdge={8}
							periodsAcross={parseShelfPreviewId(id) ? 2.2 : undefined}
						/>
					</Link>
				);
			})}
		</div>
	);
}

export function UpdatesModal({ isOpen, onClose, entries }: UpdatesModalProps) {
	const cells = usePreviewCells(isOpen);
	if (entries.length === 0) return null;

	const newest = entries[0];
	const oldest = entries[entries.length - 1];
	const range = entries.length === 1 ? newest.version : `${oldest.version} → ${newest.version}`;
	const count = entries.length === 1 ? "1 update" : `${entries.length} updates`;

	// Merge every unseen release's changes, keeping the declared kind order.
	const byKind = new Map<ChangeKind, Change[]>();
	for (const entry of entries) {
		for (const change of entry.changes) {
			const list = byKind.get(change.kind);
			if (list) list.push(change);
			else byKind.set(change.kind, [change]);
		}
	}

	return (
		<Modal
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			size="md"
			title="What's new"
			header={
				<span className="mr-2 font-mono text-xs text-fg-muted">
					{range} · {count}
				</span>
			}
		>
			<div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto p-4">
				{KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
					<section key={kind} className="flex flex-col gap-2">
						<h3 className="text-[11px] tracking-wider text-fg-muted uppercase">{KIND_LABEL[kind]}</h3>
						<ul className="flex flex-col gap-3">
							{(byKind.get(kind) ?? []).map((change, i) => (
								<li key={i} className="text-sm leading-relaxed text-fg-secondary">
									{change.href ? (
										<Link href={change.href} className="transition-colors hover:text-fg">
											<ChangeText text={change.text} />
										</Link>
									) : (
										<ChangeText text={change.text} />
									)}
									{change.items?.length ? (
										<ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-fg-muted">
											{change.items.map((item, j) => (
												<li key={j}>
													<ChangeText text={item} />
												</li>
											))}
										</ul>
									) : null}
									{change.tilings?.length ? <TilingStrip ids={change.tilings} cells={cells} /> : null}
									{change.images?.length ? <ChangeImages images={change.images} href={change.href} /> : null}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			<div className="flex items-center justify-between gap-3 border-t border-line p-3">
				<span className="text-xs text-fg-muted">
					{newest.date} · v{newest.version}
				</span>
				<Button href="/updates" variant="secondary" size="sm" iconRight={ArrowRight} onClick={onClose}>
					See all updates
				</Button>
			</div>
		</Modal>
	);
}
