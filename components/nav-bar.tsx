// The header bar's pieces: the bar, its mark and brand, the rule after the brand and the link style. The
// atlas's Nav (components/nav.tsx) and TileSearch's header (tools/searcher/app) both draw with these, so
// the two bars cannot drift. Nothing here touches the router, so an app without Next can import it.
import { motion } from "motion/react";
import { cn } from "@/lib/utils/cn";

/** The hexagon mark: one hexagon in the tile palette's own hexagon colour (tileFill(polygonHue(6))). */
export function Mark() {
	return (
		<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
			<polygon
				points="9,1.2 15.8,5.1 15.8,12.9 9,16.8 2.2,12.9 2.2,5.1"
				fill="#b2daa1"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export const NAV_BAR = "flex w-full shrink-0 items-center overflow-hidden bg-surface-chrome px-4";
export const navLinkClass = (active: boolean) =>
	cn(
		"group relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-2.5 py-1.5 transition-colors",
		// Text only, and the active link in ink, not accent: the accent marks actions.
		active ? "text-fg" : "text-fg-muted hover:bg-surface-overlay hover:text-fg",
	);
export const NAV_LABEL = "relative text-[13px] font-medium whitespace-nowrap";

/** The active link's fill: one shared element, so changing section slides it to the new link. */
export function NavActivePill({ id = "nav-active" }: { id?: string }) {
	return (
		<motion.span
			layoutId={id}
			aria-hidden="true"
			className="absolute inset-0 rounded-control bg-surface-overlay"
			transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
		/>
	);
}

/** Mark, name and the release the build is cut at. */
export function NavBrand({ name, version }: { name: string; version: string }) {
	return (
		<>
			<Mark />
			<span className="text-[15px] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap text-fg">
				{name}
			</span>
			<span className="font-mono text-[10.5px] leading-none text-fg-muted tabular-nums">v{version}</span>
		</>
	);
}

export const NavDivider = () => <div className="mr-3 h-5 border-l border-line-subtle max-md:hidden" />;
