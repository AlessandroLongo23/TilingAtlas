"use client";

import { useCallback, useEffect, useRef } from "react";
import { prepare, type Box } from "@/lib/render/figureCanvas";
import { drawWithText, type Api } from "@/lib/render/figureGlyphs";

// One framed canvas with a caption above and a note below: the chrome every multi-panel engine figure
// on /defense uses. Kept in one place so a row of three and a row of four cannot drift apart.

export interface PanelSpec {
	title: string;
	note: string;
	box: Box;
	draw: (api: Api) => void;
	/** Titles that name an identifier in the source are set in mono, like the code spans in the prose. */
	mono?: boolean;
}

export function FigurePanel({ panel, aspect = "4/3" }: { panel: PanelSpec; aspect?: string }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		const p = prepare(h, c, panel.box, 0.97);
		if (!p) return;
		// Text scales with the panel, floored so a four-across row stays readable and capped so a
		// two-across one does not shout.
		drawWithText(p.ctx, p.s, p.dpr, Math.max(10, Math.min(19, h.clientWidth * 0.075)), panel.draw);
	}, [panel]);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	return (
		<figure className="m-0 flex min-w-[10rem] flex-1 flex-col gap-1.5">
			<figcaption
				className={`text-center text-[clamp(0.7rem,1vh+0.24vw,1rem)] font-medium text-fg${panel.mono ? " font-mono" : ""}`}
			>
				{panel.title}
			</figcaption>
			<div
				ref={host}
				className="relative w-full overflow-hidden rounded-xl border border-line bg-surface-base"
				style={{ aspectRatio: aspect }}
			>
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<div className="text-center text-[clamp(0.54rem,0.74vh+0.14vw,0.74rem)] leading-snug text-fg-muted">
				{panel.note}
			</div>
		</figure>
	);
}
