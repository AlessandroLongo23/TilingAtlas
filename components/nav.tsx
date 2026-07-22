"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Library, PenLine, Play, Shapes, Grid3x3, Waves } from "lucide-react"; // History icon commented out with its nav link below
import { cn } from "@/lib/utils/cn";
import { useImmersive } from "@/stores/immersive";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	{ href: "/tiles", label: "Tiles", icon: Shapes },
	{ href: "/configs", label: "Configs", icon: Grid3x3 },
	{ href: "/library", label: "Library", icon: Library },
	{ href: "/play", label: "Play", icon: Play },
	{ href: "/theory", label: "Theory", icon: BookOpen },
	{ href: "/parquet", label: "Parquet", icon: Waves },
	{ href: "/freedraw", label: "Freedraw", icon: PenLine },
	// { href: "/history", label: "History", icon: History }, // hidden from header (route still exists)
];

export function Nav() {
	const pathname = usePathname();
	const router = useRouter();
	// Immersive (fullscreen-canvas) mode collapses the header. Kept in the layout (not unmounted) and
	// animated so entering/exiting is a smooth 300ms slide, matching the sidebar collapse on /play.
	const immersive = useImmersive((s) => s.immersive);

	// Number keys 1–7 jump to the matching nav link (in visible order). Same guard pattern as the /play
	// key handler: skip modifier combos so browser Cmd/Ctrl+number keeps switching tabs, and skip while
	// typing in a form field or contenteditable.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			const idx = Number(e.key) - 1;
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
			<Link href="/" className="flex items-center justify-center mr-4">
				<span className="text-accent font-bold text-lg leading-none">The Tiling Atlas</span>
			</Link>

			<div className="h-5 border-l border-line-subtle mr-3" />

			<div className="flex items-center gap-1">
				{LINKS.map((link, i) => {
					const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
					const Icon = link.icon;
					return (
						<Link
							key={link.href}
							href={link.href}
							title={`${link.label} (${i + 1})`}
							className={cn(
								"group flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-colors",
								isActive
									? "text-accent bg-accent-subtle"
									: "text-fg-muted hover:text-fg hover:bg-surface-overlay",
							)}
						>
							<Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
							<span className="text-xs font-medium">{link.label}</span>
							<Kbd>{i + 1}</Kbd>
						</Link>
					);
				})}
			</div>

			<div className="flex-1" />

			<ThemeToggle />
		</nav>
	);
}
