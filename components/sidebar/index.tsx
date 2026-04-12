"use client";

import { useEffect } from "react";
import { useConfiguration, ActiveTab } from "@/stores/configuration";
import { useContentService } from "@/services/contentService";
import { Tabs } from "@/components/ui/tabs";
import { PageSidebar } from "@/components/page-sidebar";
import { TheorySidebar } from "@/components/theory-sidebar";
import type { CampaignTiling } from "@/services/campaignService";
import { TilingsTab } from "./tilings-tab";
import { GameOfLifeTab } from "./game-of-life-tab";

interface SidebarProps {
	newTilings?: CampaignTiling[];
	onNewTilingSelect?: (t: CampaignTiling) => void;
	activeTheorySection?: string;
	onSectionSelect?: (sectionId: string) => void;
}

export function Sidebar({
	newTilings = [],
	onNewTilingSelect,
	activeTheorySection = "",
	onSectionSelect,
}: SidebarProps) {
	const activeTab = useConfiguration((s) => s.activeTab);
	const setCfg = useConfiguration((s) => s.set);
	const theorySections = useContentService((s) => s.sections);
	const theoryLoading = useContentService((s) => s.isLoading);
	const theoryError = useContentService((s) => s.error);
	const loadContent = useContentService((s) => s.loadContent);

	useEffect(() => {
		if (activeTab === ActiveTab.THEORY) {
			void loadContent("/theory/tilings-and-automata.md");
		}
	}, [activeTab, loadContent]);

	return (
		<PageSidebar scrollable={false}>
			<Tabs
				value={activeTab}
				onValueChange={(v) => setCfg({ activeTab: v as ActiveTab })}
				tabs={[ActiveTab.TILINGS, ActiveTab.GAME_OF_LIFE, ActiveTab.THEORY]}
			>
				{(tab) => {
					if (tab === ActiveTab.TILINGS)
						return (
							<TilingsTab newTilings={newTilings} onNewTilingSelect={onNewTilingSelect} />
						);
					if (tab === ActiveTab.GAME_OF_LIFE) return <GameOfLifeTab />;
					return (
						<div className="h-full flex flex-col">
							<TheorySidebar
								sections={theorySections}
								activeSection={activeTheorySection}
								onSectionSelect={(id) => onSectionSelect?.(id)}
								isLoading={theoryLoading}
								error={theoryError}
							/>
						</div>
					);
				}}
			</Tabs>
		</PageSidebar>
	);
}
