import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge has to know the design system's scales (design-system/tokens/tailwind.css). Without them it
// read every type role as a colour, so cn("text-accent-contrast", "text-ui") dropped the colour: primary
// buttons rendered black on blue in light mode. cn.test.ts fails when tailwind.css gains a name missing here.
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["micro", "caption", "small", "ui", "body", "title", "reading", "heading", "headline", "display", "hero"],
			spacing: [
				"indent",
				"corner",
				"control-xs",
				"control-sm",
				"control-md",
				"control-lg",
				"control-touch",
				"icon-xs",
				"icon-sm",
				"icon-md",
				"icon-lg",
			],
			radius: ["mark", "tag", "control", "surface", "overlay", "sheet", "pill"],
			shadow: ["raised", "handle", "lift", "float", "overlay", "modal", "sheet"],
			"drop-shadow": ["handle"], // ds-check: keep (the theme key that names the scale, not a class)
			blur: ["scrim", "float"],
			tracking: ["caps"],
		},
		classGroups: { z: [{ z: ["chrome", "sheet", "modal", "menu", "popup", "cursor"] }] },
	},
	// In Tailwind 4 a leading-* utility wins over a type role's line height in any order, so a later text-*
	// must not delete it.
	override: { conflictingClassGroups: { "font-size": [] } },
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
