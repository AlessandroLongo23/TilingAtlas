"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas } from "@/components/canvas";
import { Sidebar } from "@/components/sidebar";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { TranslationalCellData } from "@/classes/algorithm/types";

interface PlayClientProps {
	tilings: CatalogueTiling[];
}

export function PlayClient({ tilings }: PlayClientProps) {
	const searchParams = useSearchParams();
	const requestedKey = searchParams.get("tiling");
	const canvasWrapRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });

	// Deterministic default (lowest k, then key) so the first paint is stable, not random.
	const sorted = useMemo(
		() => [...tilings].sort((a, b) => a.k - b.k || (a.canonicalKey < b.canonicalKey ? -1 : 1)),
		[tilings],
	);

	const [selected, setSelected] = useState<CatalogueTiling | null>(() => {
		if (requestedKey) {
			const m = sorted.find((t) => t.canonicalKey === requestedKey);
			if (m) return m;
		}
		return sorted[0] ?? null;
	});

	useEffect(() => {
		if (!requestedKey) return;
		const m = sorted.find((t) => t.canonicalKey === requestedKey);
		if (m && m.canonicalKey !== selected?.canonicalKey) setSelected(m);
	}, [requestedKey, sorted, selected?.canonicalKey]);

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
			<Sidebar tilings={sorted} selected={selected} onSelect={setSelected} />
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={(selected?.renderCell ?? null) as TranslationalCellData | null}
					translationalCellId={selected?.canonicalKey ?? null}
					showTilingRuleInput={false}
				/>
			</div>
		</div>
	);
}
