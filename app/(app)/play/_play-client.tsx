"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@/components/canvas";
import { Sidebar } from "@/components/sidebar";
import { TilingModalContent } from "@/components/tiling-modal-content";
import type { CampaignTiling } from "@/services/campaignService";

interface PlayClientProps {
	newTilings: CampaignTiling[];
}

export function PlayClient({ newTilings }: PlayClientProps) {
	const canvasWrapRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [selectedNew, setSelectedNew] = useState<CampaignTiling | null>(() =>
		newTilings.length > 0 ? newTilings[Math.floor(Math.random() * newTilings.length)] : null,
	);

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

	return (
		<div className="flex-1 flex min-h-0 overflow-hidden">
			<Sidebar newTilings={newTilings} onNewTilingSelect={setSelectedNew} />
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={selectedNew?.translational_cell ?? null}
					translationalCellId={selectedNew?.id ?? null}
					showTilingRuleInput={false}
				/>
			</div>

			<TilingModalContent />
		</div>
	);
}
