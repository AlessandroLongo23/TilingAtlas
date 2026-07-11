"use client";

import { PageSidebar } from "@/components/page-sidebar";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TilingsTab } from "./tilings-tab";

interface SidebarProps {
	tilings?: CatalogueTiling[];
	selected?: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	/** Jump to a random tiling (wired to the sidebar button and the "R" shortcut). */
	onRandom?: () => void;
	/** "reference" relabels the picker for the oracle atlas (Oracle pill, not the cert badge). */
	mode?: "certified" | "reference";
}

export function Sidebar({ tilings = [], selected = null, onSelect, onRandom, mode = "certified" }: SidebarProps) {
	return (
		<PageSidebar scrollable={false}>
			<TilingsTab tilings={tilings} selected={selected} onSelect={onSelect} onRandom={onRandom} mode={mode} />
		</PageSidebar>
	);
}
