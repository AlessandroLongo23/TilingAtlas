"use client";

import { PageSidebar } from "@/components/page-sidebar";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	tilings?: CatalogueTiling[];
	selected?: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
}

export function Sidebar({ tilings = [], selected = null, onSelect }: SidebarProps) {
	return (
		<PageSidebar scrollable={false}>
			<TilingsTab tilings={tilings} selected={selected} onSelect={onSelect} />
		</PageSidebar>
	);
}
