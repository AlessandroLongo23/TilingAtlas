"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { ChangeText } from "@/components/updates/change-text";
import { KIND_LABEL, KIND_ORDER, type Change, type ChangeKind, type UpdateEntry } from "@/lib/updates/entries";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

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

function usePreviewCells(enabled: boolean): CellMap {
	const [cells, setCells] = useState<CellMap>({});
	const fetched = useRef(false);
	useEffect(() => {
		if (!enabled || fetched.current) return;
		fetched.current = true;
		let live = true;
		fetch("/updates-cells.json")
			.then((r) => (r.ok ? r.json() : {}))
			.then((j: CellMap) => {
				if (live) setCells(j);
			})
			// A missing or broken asset just means text-only previews, never a broken modal.
			.catch(() => {});
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
				const href = `/play?tiling=${encodeURIComponent(id)}`;
				if (!entry) {
					// No flat cell for this id (hyperbolic, spherical, freedraw, Schwarz, hollow). Still
					// reachable — it just travels as a chip instead of a picture.
					return (
						<Link
							key={id}
							href={href}
							className="px-2 py-1 text-xs font-mono border border-line text-fg-secondary hover:text-fg hover:border-line-strong transition-colors"
						>
							{id} →
						</Link>
					);
				}
				return (
					<Link
						key={id}
						href={href}
						title={`${entry.label} — open in Play`}
						className="block w-20 h-20 border border-line hover:border-accent transition-colors overflow-hidden"
					>
						{/* Small pxPerEdge on purpose: at 80px a card needs several repeats to read as a
						    tiling, not as a crop of one tile. */}
						<TilingThumbnail translationalCell={entry.cell} pxPerEdge={8} />
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
				<span className="text-xs font-mono text-fg-muted mr-2">
					{range} · {count}
				</span>
			}
		>
			<div className="max-h-[65vh] overflow-y-auto p-4 flex flex-col gap-5">
				{KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
					<section key={kind} className="flex flex-col gap-2">
						<h3 className="text-[11px] uppercase tracking-wider text-fg-muted">{KIND_LABEL[kind]}</h3>
						<ul className="flex flex-col gap-3">
							{(byKind.get(kind) ?? []).map((change, i) => (
								<li key={i} className="text-sm text-fg-secondary leading-relaxed">
									{change.href ? (
										<Link href={change.href} className="hover:text-fg transition-colors">
											<ChangeText text={change.text} />
										</Link>
									) : (
										<ChangeText text={change.text} />
									)}
									{change.tilings?.length ? <TilingStrip ids={change.tilings} cells={cells} /> : null}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			<div className="border-t border-line p-3 flex items-center justify-between">
				<span className="text-xs text-fg-muted">
					{newest.date} · v{newest.version}
				</span>
				<Link href="/updates" className="text-xs text-accent hover:underline" onClick={onClose}>
					See all updates →
				</Link>
			</div>
		</Modal>
	);
}
