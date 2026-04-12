"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@/components/canvas";
import { Sidebar } from "@/components/sidebar";
import { TheoryContent } from "@/components/theory-content";
import { TilingModalContent } from "@/components/tiling-modal-content";
import { useConfiguration, ActiveTab } from "@/stores/configuration";
import { useContentService } from "@/services/contentService";
import type { CampaignTiling } from "@/services/campaignService";

interface PlayClientProps {
	newTilings: CampaignTiling[];
}

export function PlayClient({ newTilings }: PlayClientProps) {
	const activeTab = useConfiguration((s) => s.activeTab);
	const canvasWrapRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [selectedNew, setSelectedNew] = useState<CampaignTiling | null>(() =>
		newTilings.length > 0 ? newTilings[Math.floor(Math.random() * newTilings.length)] : null,
	);
	const [targetTheorySection, setTargetTheorySection] = useState("");
	const [activeTheorySection, setActiveTheorySection] = useState("");
	const loadContent = useContentService((s) => s.loadContent);

	useEffect(() => {
		const el = canvasWrapRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setSize({ w: Math.floor(width), h: Math.floor(height) });
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		void loadContent("/theory/tilings-and-automata.md");
	}, [loadContent]);

	const showGameOfLife = activeTab === ActiveTab.GAME_OF_LIFE;
	const showTheory = activeTab === ActiveTab.THEORY;

	return (
		<div className="flex-1 flex min-h-0 overflow-hidden">
			<Sidebar
				newTilings={newTilings}
				onNewTilingSelect={setSelectedNew}
				activeTheorySection={activeTheorySection}
				onSectionSelect={setTargetTheorySection}
			/>
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				{showTheory ? (
					<TheoryContent
						targetSection={targetTheorySection}
						onSectionActive={setActiveTheorySection}
					/>
				) : (
					<Canvas
						width={size.w}
						height={size.h}
						showGameOfLife={showGameOfLife}
						translationalCell={selectedNew?.translational_cell ?? null}
						translationalCellId={selectedNew?.id ?? null}
						showTilingRuleInput={false}
					/>
				)}
			</div>

			<TilingModalContent />
		</div>
	);
}
