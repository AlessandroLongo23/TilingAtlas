"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DiscordIcon } from "@/components/icons/discord";
import { cn } from "@/lib/utils/cn";
import { useImmersive } from "@/stores/immersive";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { UpdatesButton } from "@/components/updates/updates-button";
import { CURRENT_VERSION } from "@/lib/updates/entries";
import { DISCORD_INVITE } from "@/lib/constants";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { SheetBackdrop, SheetHeader, useSheet } from "@/components/ui/bottom-sheet";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	// `blurb` is the phone menu's one-line description of each section.
	{ href: "/theory", label: "Theory", blurb: "The mathematics behind the catalogue, with live figures" }, // Prototiles + vertex configs live under here now (Elements)
	{ href: "/library", label: "Library", blurb: "Browse and filter every tiling in the atlas" },
	{ href: "/play", label: "Play", blurb: "Open any tiling live: pan, zoom, decorate, edit" },
	{ href: "/parquet", label: "Parquet", blurb: "One tiling morphing smoothly into another" },
	{ href: "/freedraw", label: "Freedraw", blurb: "Edge patterns drawn over tiling scaffolds" },
	{ href: "/colors", label: "Colors", blurb: "Periodic colorings of the square grid" },
	{ href: "/aperiodic", label: "Aperiodic", blurb: "Penrose, the hat, Sub Rosa and multigrids" }, // Sub Rosa, Penrose, hat, Multigrid — switched in its sidebar
	{ href: "/isohedral", label: "Isohedral", blurb: "The 93 isohedral types, reshaped live" }, // Grünbaum & Shephard IH1–IH93, parameterized via Tactile
	{ href: "/pentagons", label: "Pentagons", blurb: "The 15 convex pentagons that tile the plane" }, // Kershner's 15 convex-pentagon families, closed by Rao 2017
	{ href: "/automata", label: "Automata", blurb: "Game of Life and its relatives on tilings" }, // Life-like CA over the catalogue; the tenth link, so its key is 0
	// { href: "/history", label: "History" }, // hidden from header (route still exists)
];

/** The keycap for the i-th link: 1–9, then 0 for a tenth. Beyond ten there is no key. */
const navKey = (i: number) => (i < 9 ? String(i + 1) : i === 9 ? "0" : "");

const isActiveLink = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** The hexagon mark: one hexagon in the tile palette's own hexagon colour (tileFill(polygonHue(6))). */
function Mark() {
	return (
		<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
			<polygon points="9,1.2 15.8,5.1 15.8,12.9 9,16.8 2.2,12.9 2.2,5.1" fill="#b2daa1" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
		</svg>
	);
}

export function Nav() {
	const pathname = usePathname();
	const router = useRouter();
	// Immersive (fullscreen-canvas) mode collapses the header. Kept in the layout (not unmounted) and
	// animated so entering/exiting is a smooth 300ms slide, matching the sidebar collapse on /play.
	const immersive = useImmersive((s) => s.immersive);
	// The phone menu is open while this holds the path it was opened on, so navigating anywhere closes
	// it with no effect to run.
	const [menuPath, setMenuPath] = useState<string | null>(null);
	// Crossing to a desktop width (a phone turned to landscape) closes it for good: the menu is a phone
	// layer, and it should not be waiting when the width comes back.
	const isPhone = useIsPhone();
	if (!isPhone && menuPath !== null) setMenuPath(null);
	const menuOpen = menuPath === pathname && !immersive && isPhone;
	const section = LINKS.find((l) => isActiveLink(pathname, l.href));

	// Number keys jump to the matching nav link (in visible order): 1–9, then 0 for a tenth. Same guard
	// pattern as the /play key handler: skip modifier combos so browser Cmd/Ctrl+number keeps switching
	// tabs, and skip while typing in a form field or contenteditable.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			// "1".."9" -> 0..8, "0" -> 9. Anything else leaves idx out of range and falls through.
			const idx = e.key === "0" ? 9 : Number(e.key) - 1;
			const link = LINKS[idx];
			if (link) {
				e.preventDefault();
				router.push(link.href);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [router]);

	return (
		<nav
			className={cn(
				"w-full shrink-0 flex items-center bg-surface-chrome px-4 overflow-hidden transition-all duration-300 ease-in-out",
				immersive
					? "h-0 opacity-0 pointer-events-none border-b-0"
					: // On a phone the bar sits under the status bar (viewport-fit=cover), so it grows by that inset.
						// A pinch that starts on the phone bar would zoom the whole page, chrome and all.
						"h-12 border-b border-line-subtle max-md:h-[var(--topbar-h)] max-md:pt-[env(safe-area-inset-top)] max-md:pr-1 max-md:touch-pan-x max-md:touch-pan-y",
			)}
		>
			{/* Phone bar: the mark, where you are, and the menu that holds everything else. */}
			<Link href="/" aria-label="The Tiling Atlas, home" className="hidden h-11 shrink-0 items-center pr-3 max-md:flex">
				<Mark />
			</Link>
			<span className="hidden min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-fg max-md:block">
				{section?.label ?? "The Tiling Atlas"}
			</span>
			<button
				type="button"
				onClick={() => setMenuPath(pathname)}
				aria-label="Open menu"
				aria-expanded={menuOpen}
				aria-haspopup="dialog"
				className="hidden size-11 shrink-0 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-overlay hover:text-fg max-md:flex"
			>
				<Menu size={20} />
			</button>
			{menuOpen ? <PhoneMenu pathname={pathname} onClose={() => setMenuPath(null)} /> : null}

			<Link href="/" className="flex shrink-0 items-center gap-2 mr-4 max-md:hidden">
				<Mark />
				<span className="text-fg font-semibold tracking-[-0.01em] text-[15px] leading-none whitespace-nowrap">The Tiling Atlas</span>
				{/* The release the build is cut at; the same number the footer and the updates modal show. */}
				<span className="font-mono text-fg-muted text-[10.5px] leading-none tabular-nums">v{CURRENT_VERSION}</span>
			</Link>

			<div className="h-5 border-l border-line-subtle mr-3 max-md:hidden" />

			{/* Ten links do not fit a laptop window with their keycaps attached, so the caps are the first
			    thing to go (below 2xl) and the row scrolls sideways below that rather than sliding under
			    the theme toggle — the nav clips its overflow, so an unscrollable row would just vanish. */}
			<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide max-md:hidden">
				{LINKS.map((link, i) => {
					const isActive = isActiveLink(pathname, link.href);
					return (
						<Link
							key={link.href}
							href={link.href}
							title={`${link.label} (${navKey(i)})`}
							className={cn(
								"group flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-control transition-colors",
								// Text only, and the active link in ink, not accent: the accent marks actions.
								isActive ? "text-fg bg-surface-overlay" : "text-fg-muted hover:text-fg hover:bg-surface-overlay",
							)}
						>
							<span className="text-[13px] font-medium whitespace-nowrap">{link.label}</span>
							<Kbd className="hidden 2xl:inline-flex">{navKey(i)}</Kbd>
						</Link>
					);
				})}
			</div>

			<div className="flex items-center gap-0.5 max-md:hidden">
				<Tooltip label="Join the Discord" side="left" delay={0}>
					<a
						href={DISCORD_INVITE}
						target="_blank"
						rel="noreferrer"
						aria-label="Join the Tiling Atlas Discord"
						className="flex items-center justify-center w-8 h-8 rounded-control text-fg-muted hover:text-fg hover:bg-surface-overlay transition-colors focus:outline-none"
					>
						<DiscordIcon size={15} />
					</a>
				</Tooltip>
				<UpdatesButton />
				<ThemeToggle />
			</div>
		</nav>
	);
}

/**
 * The phone menu: a full-height panel from the right edge with every section, then the pieces the
 * desktop bar carries as icons (what's new, Discord, theme) and the version. Portalled to <body> so the
 * bar's clipping and its immersive fade never reach it. A link followed from it takes the history entry
 * the open menu holds (lib/hooks/useModalLayer.ts), so Back from the new page returns to the one it was
 * opened on.
 */
function PhoneMenu({ pathname, onClose }: { pathname: string; onClose: () => void }) {
	const panelRef = useRef<HTMLDivElement>(null);
	const { swipe, dialogProps } = useSheet(panelRef, true, onClose, "Menu", "right");
	const row =
		"flex min-h-12 items-center gap-3 rounded-control px-3 py-1.5 transition-colors hover:bg-surface-overlay";

	return createPortal(
		<div className="fixed inset-0 z-[60] md:hidden">
			<SheetBackdrop onClose={onClose} className="z-0" />
			{/* A swipe to the right anywhere on the panel closes it. touch-pan-y, on the scroller too (where
			    the browser decides), leaves sideways moves to the swipe. */}
			<div
				ref={panelRef}
				{...dialogProps}
				{...swipe}
				className="ta-panel-in absolute inset-y-0 right-0 flex w-[min(340px,88vw)] flex-col bg-surface-chrome shadow-xl focus:outline-none pt-[env(safe-area-inset-top)]"
			>
				<SheetHeader
					title="The Tiling Atlas"
					onClose={onClose}
					closeLabel="Close menu"
					grabBar={false}
					className="h-12 pr-1 [&_h2]:text-[15px]"
				/>
				{/* The version scrolls with the rows, so on a short screen it never covers the last one. */}
				<nav
					aria-label="Sections"
					className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 pt-2 pb-[env(safe-area-inset-bottom)]"
				>
					<Link href="/" onClick={onClose} className={cn(row, "text-[15px] font-medium text-fg")}>
						<Mark />
						Home
					</Link>
					<div className="my-1 h-px bg-line-subtle" />
					{LINKS.map((link) => {
						const active = isActiveLink(pathname, link.href);
						return (
							<Link
								key={link.href}
								href={link.href}
								onClick={onClose}
								aria-current={active ? "page" : undefined}
								className={cn(row, "flex-col items-start justify-center gap-0", active && "bg-surface-overlay")}
							>
								<span className={cn("text-[15px] font-medium", active ? "text-fg" : "text-fg-secondary")}>{link.label}</span>
								<span className="text-[13px] leading-snug text-fg-muted">{link.blurb}</span>
							</Link>
						);
					})}
					<div className="my-1 h-px bg-line-subtle" />
					<UpdatesButton variant="row" onOpen={onClose} />
					<a
						href={DISCORD_INVITE}
						target="_blank"
						rel="noreferrer"
						className={cn(row, "text-[15px] text-fg")}
					>
						<DiscordIcon size={18} />
						Join the Discord
					</a>
					<ThemeToggle variant="row" />
					<p className="mt-2 border-t border-line-subtle px-3 py-3 font-mono text-xs tabular-nums text-fg-muted">
						v{CURRENT_VERSION}
					</p>
				</nav>
			</div>
		</div>,
		document.body,
	);
}
