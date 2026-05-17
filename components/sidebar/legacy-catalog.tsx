"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Maximize2 } from "lucide-react";
import { useConfiguration } from "@/stores/configuration";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { useTilingModal } from "@/stores/modalState";
import { Button } from "@/components/ui/button";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegacyTilingCard } from "@/components/legacy-tiling-card";
import { useExpandableGroups } from "@/lib/hooks/useExpandableGroups";

export function LegacyCatalog() {
	const setCfg = useConfiguration((s) => s.set);
	const selectedDualname = useConfiguration((s) => s.selectedTiling.dualname);
	const initialized = useLegacyTilingStore((s) => s.initialized);
	const storeLoading = useLegacyTilingStore((s) => s.loading);
	const initialize = useLegacyTilingStore((s) => s.initialize);
	const tilingRules = useLegacyTilingStore((s) => s.tilingRules());
	const setModalOpen = useTilingModal((s) => s.setOpen);

	useEffect(() => {
		if (!initialized && !storeLoading) void initialize();
	}, [initialized, storeLoading, initialize]);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const [currentVisible, setCurrentVisible] = useState("");

	const { expanded, toggle, toggleAll, allExpanded } = useExpandableGroups(
		tilingRules,
		(g) => g.title,
	);

	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						const title = (e.target as HTMLElement).dataset.groupTitle;
						if (title) setCurrentVisible(title);
					}
				}
			},
			{ root, rootMargin: "-10px 0px -90% 0px", threshold: 0 },
		);
		root.querySelectorAll<HTMLElement>(".tiling-group").forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	}, [expanded, tilingRules]);

	const totalRules = tilingRules.reduce((acc, g) => acc + g.rules.length, 0);

	const loadTiling = (payload: { name: string; cr: string; rulestring: string }) => {
		setCfg({
			selectedTiling: {
				name: payload.name,
				rulestring: payload.rulestring,
				cr: payload.cr,
				dualname: selectedDualname,
			},
		});
	};

	const scrollToGroup = (title: string) => {
		const el = containerRef.current?.querySelector<HTMLElement>(
			`.tiling-group[data-group-title="${title}"]`,
		);
		el?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<div className="flex flex-col gap-2 h-full">
			<div className="sticky top-0 z-10 p-3 bg-surface-overlay">
				<div className="flex items-center justify-between">
					<SectionHeading count={storeLoading ? null : totalRules} loading={storeLoading}>
						Tiling Patterns
					</SectionHeading>
					<div className="flex gap-1.5">
						<Button
							variant="ghost"
							size="icon"
							icon={allExpanded ? ChevronsDownUp : ChevronsUpDown}
							onClick={() => toggleAll(!allExpanded)}
							aria-label={allExpanded ? "Collapse all" : "Expand all"}
							title={allExpanded ? "Collapse all" : "Expand all"}
						/>
						<Button
							variant="ghost"
							size="icon"
							icon={Maximize2}
							onClick={() => setModalOpen(true)}
							aria-label="View all tilings"
							title="View all tilings"
						/>
					</div>
				</div>
				{currentVisible ? (
					<div className="mt-2 flex items-center justify-between text-xs text-fg px-2 py-1 rounded-control border border-line bg-surface-overlay/30">
						<button
							className="truncate flex-grow text-left hover:text-fg cursor-pointer"
							onClick={() => scrollToGroup(currentVisible)}
						>
							{currentVisible}
						</button>
						<button
							className="ml-1.5 p-0.5 rounded-sm hover:bg-surface-overlay/70 text-fg-secondary hover:text-fg cursor-pointer"
							onClick={() => toggle(currentVisible)}
							aria-label={expanded[currentVisible] ? "Collapse group" : "Expand group"}
						>
							{expanded[currentVisible] ? (
								<ChevronsDownUp size={12} />
							) : (
								<ChevronsUpDown size={12} />
							)}
						</button>
					</div>
				) : null}
			</div>

			<div ref={containerRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
				{tilingRules.map((group) => (
					<div
						key={group.title}
						className="tiling-group"
						data-group-title={group.title}
					>
						<SidebarSection
							flush
							padded={false}
							title={group.title}
							summary={group.rules.length}
							open={expanded[group.title]}
							onOpenChange={() => toggle(group.title)}
						>
							<div className="grid grid-cols-2 gap-2 pt-2">
								{(
									group.rules as Array<{
										name: string;
										cr: string;
										rulestring: string;
										imageUrl: string;
										dualImageUrl: string;
										dualname: string;
									}>
								).map((tiling) => (
									<div key={tiling.rulestring} className="contents">
										<LegacyTilingCard
											groupId={group.id}
											name={tiling.name}
											cr={tiling.cr}
											rulestring={tiling.rulestring}
											imageUrl={tiling.imageUrl}
											dualImageUrl={tiling.dualImageUrl}
											onClick={loadTiling}
										/>
										{group.dual ? (
											<LegacyTilingCard
												groupId={group.id}
												name={tiling.dualname}
												cr={tiling.cr}
												rulestring={`${tiling.rulestring}*`}
												imageUrl={tiling.imageUrl}
												dualImageUrl={tiling.dualImageUrl}
												onClick={loadTiling}
											/>
										) : null}
									</div>
								))}
							</div>
						</SidebarSection>
					</div>
				))}
			</div>
		</div>
	);
}
