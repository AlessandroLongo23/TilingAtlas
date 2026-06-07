"use client";

import { useMemo } from "react";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { SectionHeading } from "@/components/ui/section-heading";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { CertificationBadge } from "@/components/ui/certification-badge";
import { cn } from "@/lib/utils/cn";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// The /play picker: the certified-results catalogue grouped by k, each a thumbnail + cert badge.
// Click selects (renders large on the canvas). Replaces the legacy NewTilingsCatalog/LegacyCatalog.
interface CatalogueListPanelProps {
	items: CatalogueTiling[];
	selectedKey: string | null;
	onSelect?: (t: CatalogueTiling) => void;
}

export function CatalogueListPanel({ items, selectedKey, onSelect }: CatalogueListPanelProps) {
	const grouped = useMemo(() => {
		const map = new Map<number, CatalogueTiling[]>();
		for (const t of items) {
			if (!map.has(t.k)) map.set(t.k, []);
			map.get(t.k)!.push(t);
		}
		return Array.from(map.entries()).sort(([a], [b]) => a - b);
	}, [items]);

	const { expanded, toggle } = useExpandableGroups(grouped, ([k]) => String(k));

	return (
		<div className="flex flex-col gap-2">
			<div className="sticky top-0 z-10 p-3 bg-surface-overlay">
				<SectionHeading count={items.length}>Certified catalogue</SectionHeading>
			</div>
			<div className="p-3 flex flex-col gap-2">
				{grouped.map(([k, list]) => (
					<SidebarSection
						key={k}
						flush
						padded={false}
						title={`k = ${k}`}
						summary={list.length}
						open={expanded[String(k)]}
						onOpenChange={() => toggle(String(k))}
					>
						<div className="grid grid-cols-2 gap-2 pt-2">
							{list.map((t) => (
								<button
									key={t.canonicalKey}
									type="button"
									onClick={() => onSelect?.(t)}
									title={`${t.canonicalKey} · {${t.family}}`}
									className={cn(
										"relative flex flex-col rounded-lg border bg-surface-overlay/30 hover:border-line-strong transition-colors overflow-hidden",
										t.canonicalKey === selectedKey ? "border-accent ring-1 ring-accent/40" : "border-line",
									)}
								>
									<div className="relative aspect-square bg-surface-raised">
										{t.renderCell ? (
											<TilingThumbnail translationalCell={t.renderCell as TranslationalCellData} pxPerEdge={14} />
										) : null}
										<div className="absolute top-1 left-1">
											<CertificationBadge certified={t.certified} size="sm" />
										</div>
									</div>
								</button>
							))}
						</div>
					</SidebarSection>
				))}
			</div>
		</div>
	);
}
