"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, FlaskConical, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	{ href: "/theory", label: "Theory", icon: BookOpen },
	{ href: "/library", label: "Library", icon: Library },
	{ href: "/lab", label: "Lab", icon: FlaskConical },
	{ href: "/play", label: "Play", icon: Gamepad2 },
];

export function Nav() {
	const pathname = usePathname();

	return (
		<nav className="w-full shrink-0 flex items-center bg-surface-chrome border-b border-line-subtle px-4 h-12">
			<Link href="/" className="flex items-center justify-center mr-4">
				<span className="text-accent font-bold text-lg leading-none">T</span>
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
