"use client";

import { PageSidebar } from "@/components/page-sidebar";
import type { CampaignTiling } from "@/lib/services/campaignService";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	newTilings?: CampaignTiling[];
	onNewTilingSelect?: (t: CampaignTiling) => void;
}

export function Sidebar({ newTilings = [], onNewTilingSelect }: SidebarProps) {
	return (
		<PageSidebar scrollable={false}>
			<TilingsTab newTilings={newTilings} onNewTilingSelect={onNewTilingSelect} />
		</PageSidebar>
	);
}
