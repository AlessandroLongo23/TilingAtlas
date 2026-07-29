"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { ChangeText } from "@/components/updates/change-text";
import { KIND_LABEL, KIND_ORDER, type ChangeKind, type UpdateEntry } from "@/lib/updates/entries";
import { groupByMonth } from "@/lib/updates/grouping";
import { releaseLevel } from "@/lib/updates/version";
import { cn } from "@/lib/utils/cn";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// The history behind the modal: every release, newest first, with the tilings it added shown live
// and not as thumbnails. Unlike the modal, this page keeps each release as its own block —
// someone reading the whole history wants the boundaries, where someone catching up does not.
//
// A sticky index on the left groups the releases by month and scrolls to one on click, with the
// entry in view highlighted as you read.

const BUMP_LABEL: Record<string, string> = {
	major: "major release",
	minor: "feature release",
	patch: "update",
};

/** Left offset per release level in the index — majors flush, features in one step, patches two. */
const INDENT: Record<string, string> = {
	major: "ml-0",
	minor: "ml-3",
	patch: "ml-6",
};

const releaseDomId = (version: string) => `release-${version.replace(/\./g, "-")}`;

function formatDate(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

export function UpdatesClient({
	entries,
	cells,
}: {
	entries: UpdateEntry[];
	cells: Record<string, TranslationalCellData>;
}) {
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const [active, setActive] = useState(entries[0]?.version ?? "");
	const months = useMemo(() => groupByMonth(entries), [entries]);

	// Which release you are reading = the LAST one whose heading has passed a line a quarter down the
	// scroller. Computed straight from scroll position, not through an IntersectionObserver:
	// "topmost element still intersecting" is the obvious approach and it is wrong at the end of the
	// list, where the final release can never reach the top and its predecessor keeps the highlight.
	useEffect(() => {
		const root = scrollerRef.current;
		if (!root) return;

		let frame = 0;
		const update = () => {
			frame = 0;
			const articles = [...root.querySelectorAll<HTMLElement>("article[data-version]")];
			if (articles.length === 0) return;
			// At the bottom the last release is the one being read, whatever the line says — it may be
			// too short to ever cross it.
			if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
				setActive(articles[articles.length - 1].dataset.version ?? "");
				return;
			}
			const line = root.getBoundingClientRect().top + root.clientHeight * 0.25;
			let current = articles[0].dataset.version ?? "";
			for (const el of articles) {
				if (el.getBoundingClientRect().top <= line) current = el.dataset.version ?? current;
			}
			setActive(current);
		};

		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(update);
		};
		root.addEventListener("scroll", onScroll, { passive: true });
		update();
		return () => {
			root.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [entries]);

	// No setActive here: the scroll handler resolves it as the smooth scroll lands, and doing both
	// makes the highlight jump to the target and then correct itself a beat later.
	const jumpTo = (version: string) => {
		document.getElementById(releaseDomId(version))?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		// A real left column, a sibling of the scroller, not a sticky block inside it. Inside, it
		// rode up with the content until it jammed under the header; out here it simply never moves,
		// scrolls on its own when the months outgrow the viewport, and sits against the left edge the
		// way /play's sidebar does.
		<>
			<nav
				aria-label="Releases"
				className="hidden lg:flex w-60 shrink-0 flex-col overflow-y-auto"
			>
				<div className="flex flex-col gap-5 p-6">
					{months.map((group) => (
						<div key={group.month} className="flex flex-col gap-1">
							<h2 className="text-[11px] uppercase tracking-wider text-fg-muted sticky top-0 bg-surface-raised py-1">
								{group.month}
							</h2>
							{group.items.map((entry) => (
								<button
									key={entry.version}
									type="button"
									onClick={() => jumpTo(entry.version)}
									className={cn(
										"text-left text-xs leading-snug py-1 border-l-2 pl-2 transition-colors cursor-pointer",
										// Indent by what kind of release it is, so the shape of the list shows at a
										// glance where the big ones are: majors flush, features one step in,
										// patches two.
										INDENT[releaseLevel(entry.version)],
										active === entry.version
											? "border-accent text-fg"
											: "border-line-subtle text-fg-muted hover:text-fg hover:border-line-strong",
									)}
								>
									<span className="font-mono text-[11px] mr-1.5">v{entry.version}</span>
									{entry.title}
								</button>
							))}
						</div>
					))}
				</div>
			</nav>

			<div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
				<div className="max-w-3xl mx-auto px-6 md:px-12 py-12 flex flex-col gap-12">
					<header className="flex flex-col gap-2">
						<h1 className="text-2xl font-semibold text-fg">Updates</h1>
						<p className="text-sm text-fg-secondary max-w-prose">
							What has changed in the Atlas, newest first. New tilings are shown as they arrived —
							drag to pan, scroll to zoom, or open any of them in Play.
						</p>
					</header>

					{entries.map((entry) => {
						// Read off the version itself, not diffed against the release below, so the
						// oldest entry gets a real answer instead of a hardcoded guess.
						const kind = releaseLevel(entry.version);

						const byKind = new Map<ChangeKind, typeof entry.changes>();
						for (const change of entry.changes) {
							const list = byKind.get(change.kind);
							if (list) list.push(change);
							else byKind.set(change.kind, [change]);
						}

						return (
							<article
								key={entry.version}
								id={releaseDomId(entry.version)}
								data-version={entry.version}
								className="flex flex-col gap-4 border-t border-line-subtle pt-6 scroll-mt-6"
							>
								<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
									<h2 className="text-lg font-medium text-fg">{entry.title}</h2>
									<span className="text-xs font-mono text-accent">v{entry.version}</span>
									<span className="text-xs text-fg-muted">{formatDate(entry.date)}</span>
									<span className="text-[11px] uppercase tracking-wider text-fg-muted">
										{BUMP_LABEL[kind]}
									</span>
								</div>

								{KIND_ORDER.filter((k) => byKind.has(k)).map((k) => (
									<section key={k} className="flex flex-col gap-2">
										<h3 className="text-[11px] uppercase tracking-wider text-fg-muted">
											{KIND_LABEL[k]}
										</h3>
										<ul className="flex flex-col gap-4">
											{(byKind.get(k) ?? []).map((change, j) => {
												const previews = (change.tilings ?? []).filter((id) => cells[id]);
												const textOnly = (change.tilings ?? []).filter((id) => !cells[id]);
												return (
													<li key={j} className="text-sm text-fg-secondary leading-relaxed">
														{change.href ? (
															<Link href={change.href} className="hover:text-fg transition-colors">
																<ChangeText text={change.text} />
															</Link>
														) : (
															<ChangeText text={change.text} />
														)}

														{/* No fixed height on the wrapper: the card's own slot is
														    `aspect-square` and sizes itself from its width, so a fixed-height
														    box does not contain it — it overflows and lands on the prose
														    below. Let the grid column decide the width and the card the rest. */}
														{previews.length > 0 ? (
															<div className="not-prose mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3">
																{previews.map((id) => (
																	<InteractiveTilingPreviewCard
																		key={id}
																		cell={cells[id]}
																		tilingId={id}
																		title={id}
																		homePeriods={3}
																		showExpand={false}
																	/>
																))}
															</div>
														) : null}

														{textOnly.length > 0 ? (
															<div className="mt-2 flex flex-wrap gap-2">
																{textOnly.map((id) => (
																	<Link
																		key={id}
																		href={`/play?tiling=${encodeURIComponent(id)}`}
																		className="px-2 py-1 text-xs font-mono border border-line text-fg-secondary hover:text-fg hover:border-line-strong transition-colors"
																	>
																		{id} →
																	</Link>
																))}
															</div>
														) : null}
													</li>
												);
											})}
										</ul>
									</section>
								))}
							</article>
						);
					})}

					<footer className="border-t border-line-subtle pt-6 text-xs text-fg-muted">
						Entries before 30 July 2026 were reconstructed from the commit history, and are coarser
						than the ones written at release time.
					</footer>
				</div>
			</div>
		</>
	);
}
