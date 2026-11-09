"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Hash, MessageCircle, Search, Sparkles, SunMoon } from "lucide-react";
import { motion } from "motion/react";
import { fmMotion, SPRING } from "@/design-system/motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { LINKS } from "@/components/nav";
import { toggleTheme } from "@/components/ThemeToggle";
import { DISCORD_INVITE } from "@/lib/constants";
import { useUpdates } from "@/lib/stores/updates";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "@/design-system/components/kbd";

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
				{/* ds-check: keep (a dialog anchored near the top, headed by its own query line; Modal centres and is a bottom sheet on a phone, where the keyboard would cover the input) */}
				<Dialog.Overlay className="ta-overlay fixed inset-0 z-modal bg-scrim backdrop-blur-scrim" />
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
		// The catalogue reads its query once on mount, so from inside it (either lens) the search has to be
		// a full navigation to take effect.
		const href = `/catalogue?q=${encodeURIComponent(query.trim())}`;
		const search: Item = {
			id: "search",
			label: `Search the catalogue for “${query.trim()}”`,
			hint: "id or family",
			group: "Search",
			icon: /^[\d.]+$/.test(q) ? Hash : Search,
			run: () => (pathname.startsWith("/catalogue") ? window.location.assign(href) : router.push(href)),
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
				"ta-dialog fixed top-[18vh] left-1/2 z-modal w-[min(560px,calc(100vw-32px))] -translate-x-1/2",
				"overflow-hidden rounded-overlay bg-surface-raised shadow-modal ring-1 ring-line-subtle",
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
				<Search className="size-icon-md shrink-0 text-fg-muted" />
				{/* ds-check: keep (the palette's query line is the dialog's header: borderless, 48px, live on every key) */}
				<input
					autoFocus
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActive(0);
					}}
					placeholder="Jump to a section, or search the library…"
					aria-label="Command"
					className="h-12 min-w-0 flex-1 bg-transparent text-reading text-fg outline-none placeholder:text-fg-muted"
				/>
				<Kbd>esc</Kbd>
			</div>
			{/* The list's height follows its rows, so filtering shrinks the panel smoothly. */}
			<motion.div animate={{ height: "auto" }} transition={fmMotion("floating")} className="overflow-hidden">
				<div ref={listRef} role="listbox" className="max-h-[min(400px,50vh)] overflow-y-auto overscroll-contain p-1.5">
					{items.length === 0 ? (
						<p className="px-3 py-6 text-center text-body text-fg-muted">Nothing matches.</p>
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
											"relative flex w-full items-center gap-3 rounded-surface px-3 py-2 text-left",
											on ? "text-fg" : "text-fg-secondary",
										)}
									>
										{/* One highlight that slides from row to row. */}
										{on ? (
											<motion.span
												layoutId="palette-active"
												className="absolute inset-0 rounded-surface bg-surface-overlay"
												transition={SPRING.snap}
											/>
										) : null}
										<Icon size={15} className="relative shrink-0 text-fg-muted" />
										<span className="relative min-w-0 flex-1 truncate text-body font-medium">{item.label}</span>
										{item.hint ? (
											<span className="relative shrink-0 truncate text-small text-fg-muted max-md:hidden">
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
