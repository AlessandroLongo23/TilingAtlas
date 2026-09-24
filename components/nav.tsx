"use client";

import { useEffect } from "react";
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
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	{ href: "/theory", label: "Theory" }, // Prototiles + vertex configs live under here now (Elements)
	{ href: "/library", label: "Library" },
	{ href: "/play", label: "Play" },
	{ href: "/parquet", label: "Parquet" },
	{ href: "/freedraw", label: "Freedraw" },
	{ href: "/colors", label: "Colors" },
	{ href: "/aperiodic", label: "Aperiodic" }, // Sub Rosa, Penrose, hat, Multigrid — switched in its sidebar
	{ href: "/isohedral", label: "Isohedral" }, // Grünbaum & Shephard IH1–IH93, parameterized via Tactile
	{ href: "/pentagons", label: "Pentagons" }, // Kershner's 15 convex-pentagon families, closed by Rao 2017
	{ href: "/automata", label: "Automata" }, // Life-like CA over the catalogue; the tenth link, so its key is 0
	// { href: "/history", label: "History" }, // hidden from header (route still exists)
];

/** The keycap for the i-th link: 1–9, then 0 for a tenth. Beyond ten there is no key. */
const navKey = (i: number) => (i < 9 ? String(i + 1) : i === 9 ? "0" : "");

export function Nav() {
	const pathname = usePathname();
	const router = useRouter();
	// Immersive (fullscreen-canvas) mode collapses the header. Kept in the layout (not unmounted) and
	// animated so entering/exiting is a smooth 300ms slide, matching the sidebar collapse on /play.
	const immersive = useImmersive((s) => s.immersive);

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
				immersive ? "h-0 opacity-0 pointer-events-none border-b-0" : "h-12 border-b border-line-subtle",
			)}
		>
			<Link href="/" className="flex shrink-0 items-center gap-2 mr-4">
				{/* The mark: one hexagon in the tile palette's own hexagon colour (tileFill(polygonHue(6))). */}
				<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
					<polygon points="9,1.2 15.8,5.1 15.8,12.9 9,16.8 2.2,12.9 2.2,5.1" fill="#b2daa1" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
				</svg>
				<span className="text-fg font-semibold tracking-[-0.01em] text-[15px] leading-none whitespace-nowrap">The Tiling Atlas</span>
				{/* The release the build is cut at; the same number the footer and the updates modal show. */}
				<span className="font-mono text-fg-muted text-[10.5px] leading-none tabular-nums">v{CURRENT_VERSION}</span>
			</Link>

			<div className="h-5 border-l border-line-subtle mr-3" />

			{/* Ten links do not fit a laptop window with their keycaps attached, so the caps are the first
			    thing to go (below 2xl) and the row scrolls sideways below that rather than sliding under
			    the theme toggle — the nav clips its overflow, so an unscrollable row would just vanish. */}
			<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
				{LINKS.map((link, i) => {
					const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
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

			<div className="flex items-center gap-0.5">
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
