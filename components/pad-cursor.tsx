"use client";

import { useEffect, useRef } from "react";
import { enableTouchpad } from "@/lib/hooks/useGamepad";
import { touchpadSupported } from "@/lib/input/padTouch";
import { useGamepadState, usePadGlyph } from "@/lib/stores/gamepad";

// The controller's pointer: an arrow the left stick (or a DualShock's touchpad) moves over the page, for
// whatever the D-pad cannot reach. It only draws; the moving and the clicking are in useGamepad. The
// arrow follows the store through a subscription, so a moving pointer re-renders nothing.

export function PadCursor() {
	const on = useGamepadState((s) => !!s.cursor);
	const canAsk = useGamepadState((s) => s.family === "ps" && !s.touchpad) && touchpadSupported();
	const click = usePadGlyph("cross");
	const exit = usePadGlyph("circle");
	const ref = useRef<SVGSVGElement>(null);
	useEffect(() => {
		const place = (s: { cursor: { x: number; y: number } | null }) => {
			if (s.cursor && ref.current) ref.current.style.transform = `translate(${s.cursor.x}px, ${s.cursor.y}px)`;
		};
		place(useGamepadState.getState());
		return useGamepadState.subscribe(place);
	}, [on]);
	if (!on) return null;
	return (
		<>
			<svg ref={ref} width="20" height="24" viewBox="0 0 20 24" aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[1000] drop-shadow-md">
				<path d="M1 1 L1 19 L6 14.5 L9.5 22.5 L12.5 21.2 L9 13.3 L16 13.3 Z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
			<div className="ta-float pointer-events-none fixed left-1/2 top-14 z-[999] flex -translate-x-1/2 items-center gap-3 px-3 py-1.5 text-[12px] text-fg-secondary">
				<span>
					Pointer · <span className="font-mono text-fg">{click}</span> click · <span className="font-mono text-fg">{exit}</span> exit
				</span>
				{canAsk ? (
					// A real mouse click: the browser's device chooser will not open for a synthetic one.
					<button type="button" onClick={enableTouchpad} className="pointer-events-auto rounded-control bg-accent px-2 py-0.5 font-medium text-accent-contrast hover:bg-accent-hover">
						Use the touchpad
					</button>
				) : null}
			</div>
		</>
	);
}
