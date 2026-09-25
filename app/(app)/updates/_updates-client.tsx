"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { Badge } from "@/components/ui/badge";
import { ChangeText } from "@/components/updates/change-text";
import { KIND_LABEL, KIND_ORDER, type ChangeKind, type UpdateEntry } from "@/lib/updates/entries";
import { groupByMonth } from "@/lib/updates/grouping";
import { previewHref, previewLabel } from "@/lib/updates/preview-ids";
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
	major: "major",
	minor: "feature",
	patch: "patch",
};

const releaseDomId = (version: string) => `release-${version.replace(/\./g, "-")}`;

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-09-24" to "24 Sep 2026". Spelled out by hand: en-GB "short" renders September as "Sept". */
function formatDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	return `${d} ${MONTHS[m - 1]} ${y}`;
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
		// One scroller for the page, and inside it the index and the release column as a single centred
		// pair. The index is sticky and exactly one scroller tall (100cqh against the scroller's size
		// container), so it stays put while you read and scrolls on its own when the months outgrow it.
		<div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto bg-surface [container-type:size]">
			<div className="mx-auto max-w-[1056px] px-4 md:px-6 lg:grid lg:grid-cols-[272px_minmax(0,680px)] lg:justify-center lg:gap-12">
				<nav
					aria-label="Releases"
					className="ta-scroll-fade hidden lg:flex sticky top-0 h-[100cqh] flex-col overflow-y-auto border-r border-line-subtle pr-4"
				>
					<div className="flex flex-col gap-4 pt-12 pb-16">
						{months.map((group) => (
							<div key={group.month} className="flex flex-col">
								<h2 className="ta-label text-fg-muted sticky top-0 z-10 bg-surface px-2 py-1.5">{group.month}</h2>
								{group.items.map((entry) => (
									<button
										key={entry.version}
										type="button"
										onClick={() => jumpTo(entry.version)}
										title={`v${entry.version} · ${entry.title}`}
										className={cn(
											"flex shrink-0 items-baseline rounded-control px-2 py-[5px] text-left text-[13px] leading-[18px] transition-colors cursor-pointer",
											active === entry.version
												? "relative bg-(--color-tab-on) text-fg font-medium shadow-[0_0_0_1px_var(--color-tab-ring),0_1px_2px_oklch(0_0_0/0.12)]"
												: "text-fg-secondary hover:bg-surface-overlay hover:text-fg",
										)}
									>
										<span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-fg-muted">{entry.version}</span>
										<span className="line-clamp-2">{entry.title}</span>
									</button>
								))}
							</div>
						))}
					</div>
				</nav>

				<div className="min-w-0 py-12 max-md:py-6">
					{/* Phone: the release index is a select pinned to the top of the scroller, following the
					    release being read like the lg-only index does. */}
					{entries.length > 0 ? (
						<div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line-subtle bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
							<label className="flex items-center gap-3 text-xs text-fg-muted">
								<span className="shrink-0">Jump to release</span>
								<select
									value={active}
									onChange={(e) => jumpTo(e.target.value)}
									className="h-11 min-w-0 flex-1 rounded-control border border-line bg-surface-raised px-2 text-fg"
								>
									{months.map((group) => (
										<optgroup key={group.month} label={group.month}>
											{group.items.map((entry) => (
												<option key={entry.version} value={entry.version}>
													v{entry.version} · {entry.title}
												</option>
											))}
										</optgroup>
									))}
								</select>
							</label>
						</div>
					) : null}
					<header className="mb-10 flex flex-col gap-3 max-md:mb-8">
						<h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-fg">Updates</h1>
						<p className="text-[15px] leading-[1.6] text-fg-secondary">
							What has changed in the Atlas, newest first. New tilings are shown as they arrived;
							<span className="max-md:hidden"> drag to pan, scroll to zoom,</span>
							<span className="md:hidden"> tap one to explore it (drag to pan, pinch to zoom),</span> or open any of
							them where it lives.
						</p>
						{entries.length > 0 ? (
							<p className="font-mono text-xs text-fg-muted">
								{entries.length} releases · since {formatDate(entries[entries.length - 1].date)}
							</p>
						) : null}
					</header>

					<div className="divide-y divide-line">
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
									className="flex flex-col gap-6 py-12 first:pt-0 max-md:scroll-mt-16 max-md:py-10"
								>
									<div className="flex flex-col gap-1.5">
										<h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">{entry.title}</h2>
										<div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
											<span>v{entry.version} · {formatDate(entry.date)}</span>
											<Badge mono className="bg-transparent ring-1 ring-line ring-inset max-md:text-xs">{BUMP_LABEL[kind]}</Badge>
										</div>
									</div>

									{KIND_ORDER.filter((k) => byKind.has(k)).map((k) => (
										<section key={k} className="flex flex-col gap-2">
											<h3 className="ta-label text-fg-muted">{KIND_LABEL[k]}</h3>
											<ul className="flex flex-col gap-4">
												{(byKind.get(k) ?? []).map((change, j) => {
													const previews = (change.tilings ?? []).filter((id) => cells[id]);
													const textOnly = (change.tilings ?? []).filter((id) => !cells[id]);
													return (
														<li key={j} className="text-[15px] leading-[1.6] text-fg-secondary">
															{change.href ? (
																<Link href={change.href} className="hover:text-fg transition-colors">
																	<ChangeText text={change.text} />
																</Link>
															) : (
																<ChangeText text={change.text} />
															)}

															{change.items?.length ? (
																<ul className="mt-1.5 flex flex-col gap-1 list-disc pl-5 marker:text-fg-muted">
																	{change.items.map((item, k2) => (
																		<li key={k2}>
																			<ChangeText text={item} />
																		</li>
																	))}
																</ul>
															) : null}

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
																			title={previewLabel(id)}
																			openHref={previewHref(id)}
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
																			href={previewHref(id)}
																			className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-mono border border-line text-fg-secondary hover:text-fg hover:border-line-strong transition-colors max-md:min-h-11 max-md:px-3"
																		>
																			{previewLabel(id)}
																			<ArrowRight size={12} aria-hidden="true" className="shrink-0" />
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

					</div>

					<footer className="mt-16 border-t border-line-subtle pt-6 text-xs text-fg-muted">
						Entries before 30 July 2026 were reconstructed from the commit history, and are coarser
						than the ones written at release time.
					</footer>
				</div>
			</div>
		</div>
	);
}
