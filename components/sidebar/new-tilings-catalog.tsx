"use client";

import { useMemo } from "react";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { SectionHeading } from "@/components/ui/section-heading";
import { TilingCard } from "@/components/tiling-card";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";
import type { CampaignTiling } from "@/services/campaignService";

interface NewTilingsCatalogProps {
	items: CampaignTiling[];
	onSelect?: (t: CampaignTiling) => void;
}

export function NewTilingsCatalog({ items, onSelect }: NewTilingsCatalogProps) {
	const grouped = useMemo(() => {
		const map = new Map<string, CampaignTiling[]>();
		for (const t of items) {
			const key = t.wallpaper_group ?? "Other";
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(t);
		}
		return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
	}, [items]);

	const { expanded, toggle } = useExpandableGroups(grouped, ([g]) => g);

	return (
		<div className="flex flex-col gap-2">
			<div className="sticky top-0 z-10 p-3 bg-surface-overlay">
				<SectionHeading count={items.length}>Tiling Patterns</SectionHeading>
			</div>
			<div className="p-3 flex flex-col gap-2">
				{grouped.map(([group, list]) => (
					<SidebarSection
						key={group}
						flush
						padded={false}
						title={group}
						summary={list.length}
						open={expanded[group]}
						onOpenChange={() => toggle(group)}
					>
						<div className="grid grid-cols-2 gap-2 pt-2">
							{list.map((tiling) => (
								<TilingCard
									key={tiling.id}
									tiling={tiling}
									density="compact"
									onClick={onSelect}
								/>
							))}
						</div>
					</SidebarSection>
				))}
			</div>
		</div>
	);
}
