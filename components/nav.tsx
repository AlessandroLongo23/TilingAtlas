"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, Gamepad2, Shapes, Grid3x3 } from "lucide-react"; // History icon commented out with its nav link below
import { cn } from "@/lib/utils/cn";
import { useImmersive } from "@/stores/immersive";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	{ href: "/tiles", label: "Tiles", icon: Shapes },
	{ href: "/configs", label: "Configs", icon: Grid3x3 },
	{ href: "/library", label: "Library", icon: Library },
	{ href: "/play", label: "Play", icon: Gamepad2 },
	// { href: "/history", label: "History", icon: History }, // hidden from header (route still exists)
];

export function Nav() {
	const pathname = usePathname();
	// Immersive (fullscreen-canvas) mode collapses the header. Kept in the layout (not unmounted) and
	// animated so entering/exiting is a smooth 300ms slide, matching the sidebar collapse on /play.
	const immersive = useImmersive((s) => s.immersive);

	return (
		<nav
			className={cn(
				"w-full shrink-0 flex items-center bg-surface-chrome px-4 overflow-hidden transition-all duration-300 ease-in-out",
				immersive ? "h-0 opacity-0 pointer-events-none border-b-0" : "h-12 border-b border-line-subtle",
			)}
		>
			<Link href="/" className="flex items-center justify-center mr-4">
				<span className="text-accent font-bold text-lg leading-none">Tiling Atlas</span>
			</Link>

			<div className="h-5 border-l border-line-subtle mr-3" />

			<div className="flex items-center gap-1">
				{LINKS.map((link) => {
					const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
					const Icon = link.icon;
					return (
						<Link
							key={link.href}
							href={link.href}
							className={cn(
								"group flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-colors",
								isActive
									? "text-accent bg-accent-subtle"
									: "text-fg-muted hover:text-fg hover:bg-surface-overlay",
							)}
						>
							<Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
							<span className="text-xs font-medium">{link.label}</span>
						</Link>
					);
				})}
			</div>

			<div className="flex-1" />

			<ThemeToggle />
		</nav>
	);
}
