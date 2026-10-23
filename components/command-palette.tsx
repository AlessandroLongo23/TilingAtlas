"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Hash, MessageCircle, Search, Sparkles, SunMoon } from "lucide-react";
import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { LINKS } from "@/components/nav";
import { toggleTheme } from "@/components/ThemeToggle";
import { DISCORD_INVITE } from "@/lib/constants";
import { useUpdates } from "@/lib/stores/updates";
import { cn } from "@/lib/utils/cn";

interface Item {
	id: string;
	label: string;
	hint?: string;
	group: "Search" | "Go to" | "Actions";
	icon: ComponentType<{ size?: number; className?: string }>;
	run: () => void;
}

/** ⌘K / Ctrl+K from anywhere: jump to a section, search the library, or run a global action. */
export function CommandPalette() {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
			e.preventDefault();
			setOpen((o) => !o);
		};
		const onOpen = () => setOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener("ta:command-palette", onOpen);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("ta:command-palette", onOpen);
		};
	}, []);
	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Portal>
				<Dialog.Overlay className="ta-overlay fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
				{/* Mounted only while open, so every opening starts from an empty query. */}
				{open ? <Palette close={() => setOpen(false)} /> : null}
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function Palette({ close }: { close: () => void }) {
	const router = useRouter();
	const pathname = usePathname();
	const openUpdates = useUpdates((s) => s.open);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	const items = useMemo(() => {
		const go = (href: string) => () => router.push(href);
		const all: Item[] = [
			...LINKS.map((l) => ({
				id: l.href,
				label: l.label,
				hint: l.blurb,
				group: "Go to" as const,
				icon: ArrowRight,
				run: go(l.href),
			})),
			{ id: "home", label: "Home", hint: "The landing page", group: "Go to", icon: ArrowRight, run: go("/") },
			{ id: "theme", label: "Toggle theme", hint: "Shift + T", group: "Actions", icon: SunMoon, run: toggleTheme },
			{ id: "news", label: "What's new", hint: "Release notes", group: "Actions", icon: Sparkles, run: openUpdates },
			{
				id: "discord",
				label: "Join the Discord",
				group: "Actions",
				icon: MessageCircle,
				run: () => window.open(DISCORD_INVITE, "_blank", "noreferrer"),
			},
		];
		const q = query.trim().toLowerCase();
		const hits = q ? all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q)) : all;
		if (!q) return hits;
		// The library reads its query once on mount, so from inside the library the search has to be a
		// full navigation to take effect.
		const href = `/library?q=${encodeURIComponent(query.trim())}`;
		const search: Item = {
			id: "search",
			label: `Search the library for “${query.trim()}”`,
			hint: "id or family",
			group: "Search",
			icon: /^[\d.]+$/.test(q) ? Hash : Search,
			run: () => (pathname === "/library" ? window.location.assign(href) : router.push(href)),
		};
		return [search, ...hits];
	}, [query, router, pathname, openUpdates]);

	const current = Math.min(active, items.length - 1);
	const run = (item: Item | undefined) => {
		if (!item) return;
		close();
		item.run();
	};

	// Keep the highlighted row in view as the arrows walk past the edge of the list.
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
	}, [current]);

	return (
		<Dialog.Content
			aria-describedby={undefined}
			className={cn(
				"ta-dialog fixed top-[18vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2",
				"overflow-hidden rounded-overlay bg-surface-raised shadow-xl ring-1 ring-line-subtle",
				"max-md:top-[calc(var(--topbar-h)+12px)]",
			)}
			onKeyDown={(e) => {
				if (e.key === "ArrowDown" || e.key === "ArrowUp") {
					e.preventDefault();
					const step = e.key === "ArrowDown" ? 1 : -1;
					setActive((current + step + items.length) % items.length);
				} else if (e.key === "Enter") {
					e.preventDefault();
					run(items[current]);
				}
			}}
		>
			<Dialog.Title className="sr-only">Command palette</Dialog.Title>
			<div className="flex items-center gap-3 border-b border-line-subtle px-4">
				<Search size={16} className="shrink-0 text-fg-muted" />
				<input
					autoFocus
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActive(0);
					}}
					placeholder="Jump to a section, or search the library…"
					aria-label="Command"
					className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted"
				/>
				<kbd className="rounded border border-line bg-surface-overlay/70 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted max-md:hidden">
					esc
				</kbd>
			</div>
			{/* The list's height follows its rows, so filtering shrinks the panel smoothly. */}
			<motion.div
				animate={{ height: "auto" }}
				transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
				className="overflow-hidden"
			>
				<div ref={listRef} role="listbox" className="max-h-[min(400px,50vh)] overflow-y-auto overscroll-contain p-1.5">
					{items.length === 0 ? (
						<p className="px-3 py-6 text-center text-sm text-fg-muted">Nothing matches.</p>
					) : (
						items.map((item, i) => {
							const Icon = item.icon;
							const on = i === current;
							return (
								<div key={item.id}>
									{i === 0 || items[i - 1].group !== item.group ? (
										<p className="ta-label px-3 pt-2 pb-1">{item.group}</p>
									) : null}
									<button
										type="button"
										role="option"
										aria-selected={on}
										data-index={i}
										tabIndex={-1}
										onPointerMove={() => setActive(i)}
										onClick={() => run(item)}
										className={cn(
											"relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
											on ? "text-fg" : "text-fg-secondary",
										)}
									>
										{/* One highlight that slides from row to row. */}
										{on ? (
											<motion.span
												layoutId="palette-active"
												className="absolute inset-0 rounded-lg bg-surface-overlay"
												transition={{ type: "spring", duration: 0.25, bounce: 0 }}
											/>
										) : null}
										<Icon size={15} className="relative shrink-0 text-fg-muted" />
										<span className="relative min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
										{item.hint ? (
											<span className="relative shrink-0 truncate text-xs text-fg-muted max-md:hidden">
												{item.hint}
											</span>
										) : null}
									</button>
								</div>
							);
						})
					)}
				</div>
			</motion.div>
		</Dialog.Content>
	);
}
