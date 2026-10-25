"use client";

import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils/cn";

type Icon = ComponentType<{ className?: string; size?: number }>;

/**
 * An icon that pops in when it CHANGES (Copy → Check and back): a scale-up out of a slight blur, the
 * glyph-swap motion of Sonner and Vercel's toolbar. The first icon renders still, so a page of buttons
 * does not all pop on load. A new icon is a new element type, so React remounts it and the CSS
 * animation (.ta-icon-pop) runs on that mount.
 */
export function SwapIcon({ icon: Icon, className, size }: { icon: Icon; className?: string; size?: number }) {
	const [prev, setPrev] = useState(() => Icon);
	const [swapped, setSwapped] = useState(false);
	if (Icon !== prev) {
		setPrev(() => Icon);
		setSwapped(true);
	}
	return <Icon size={size} className={cn(className, swapped && "ta-icon-pop")} />;
}
