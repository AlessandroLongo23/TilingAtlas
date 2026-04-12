"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Star, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Campaign } from "@/lib/services/campaignService";
import { getOwnCampaignIds, getAuthorName } from "@/lib/utils/authorIdentity";
import { NewExperimentModal } from "@/components/new-experiment-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface LabListClientProps {
	campaigns: Campaign[];
	total: number;
	page: number;
	pageSize: number;
}

const STATUS_COLOR: Record<string, string> = {
	completed: "text-accent bg-accent-subtle",
	running: "text-yellow-400 bg-yellow-400/10",
	pending: "text-fg-muted bg-surface-overlay/40",
	failed: "text-danger bg-danger-subtle",
};

function relativeTime(dateStr: string) {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(dateStr).toLocaleDateString();
}

export function LabListClient({ campaigns, total, page, pageSize }: LabListClientProps) {
	const router = useRouter();
	const [showModal, setShowModal] = useState(false);
	const [ownIds, setOwnIds] = useState<string[]>([]);
	const [ownAuthor, setOwnAuthor] = useState("");

	useEffect(() => {
		setOwnIds(getOwnCampaignIds());
		setOwnAuthor(getAuthorName());
	}, []);

	const totalPages = Math.ceil(total / pageSize);

	const isOwn = (c: Campaign) =>
		ownIds.includes(c.id) || (ownAuthor !== "" && c.author_name === ownAuthor);
	const isGoldStandard = (c: Campaign) => c.data_source === "pipeline-storage";

	const goToPage = (p: number) => {
		const url = new URL(window.location.href);
		url.searchParams.set("page", String(p));
		router.replace(url.pathname + url.search, { scroll: false });
	};

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="shrink-0 border-b border-line-subtle px-6 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<FlaskConical size={18} className="text-accent" />
					<h1 className="text-base font-semibold text-fg">Research Journal</h1>
					{total > 0 ? (
						<span className="text-xs text-fg-muted bg-surface-overlay px-2 py-0.5 rounded-full">{total}</span>
					) : null}
				</div>
				<Button
					variant="primary"
					size="sm"
					icon={Plus}
					onClick={() => setShowModal(true)}
					label="New Experiment"
				/>
			</div>

			<main className="flex-1 overflow-y-auto px-6 py-5">
				{campaigns.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-disabled">
						<FlaskConical size={40} className="mb-4 opacity-30" />
						<p className="text-sm font-medium text-fg-muted mb-1">No experiments yet</p>
						<p className="text-xs">Click &ldquo;New Experiment&rdquo; to run your first search.</p>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-2">
							{campaigns.map((campaign) => {
								const gold = isGoldStandard(campaign);
								const own = isOwn(campaign);
								const hash = campaign.unique_hash ?? campaign.id;
								const href = `/lab/${hash}/polygons`;
								return (
									<Link
										key={campaign.id}
										href={href}
										className={cn(
											"flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors",
											gold
												? "border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10"
												: own
													? "border-line-focus bg-accent-subtle hover:bg-accent-subtle"
													: "border-line bg-surface-overlay/30 hover:bg-surface-overlay/50",
										)}
									>
										<span className="shrink-0 font-mono text-[11px] px-2 py-1 rounded-md bg-surface-raised/60 text-fg-muted w-24 text-center truncate">
											{hash.slice(0, 8)}
										</span>
										{gold ? <Star size={13} className="shrink-0 text-yellow-400 fill-yellow-400/60" /> : null}
										<div className="flex-1 min-w-0 flex flex-col gap-0.5">
											<span className="text-sm text-fg-secondary truncate">
												{campaign.polygon_config?.names?.join(", ") || "—"}
											</span>
											<span className="text-xs text-fg-muted">
												k = {campaign.k_values?.join(", ") || "—"}
											</span>
										</div>
										<span
											className={cn(
												"shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium",
												STATUS_COLOR[campaign.status] ?? STATUS_COLOR.pending,
											)}
										>
											{campaign.status}
										</span>
										<span className="shrink-0 text-xs text-fg-muted w-20 text-right tabular-nums">
											{campaign.tiling_count.toLocaleString()} tilings
										</span>
										<span className="shrink-0 text-xs text-fg-muted w-28 truncate text-right">
											{own ? (
												<>
													<span className="text-accent">You</span>
													{campaign.author_name && campaign.author_name !== ownAuthor
														? ` · ${campaign.author_name}`
														: null}
												</>
											) : campaign.author_name ? (
												campaign.author_name
											) : (
												<span className="opacity-40">—</span>
											)}
										</span>
										<span className="shrink-0 flex items-center gap-1 text-xs text-fg-disabled w-20 text-right">
											<Clock size={11} />
											{relativeTime(campaign.created_at)}
										</span>
									</Link>
								);
							})}
						</div>

						{totalPages > 1 ? (
							<div className="flex items-center justify-center gap-3 mt-6">
								<Button
									variant="secondary"
									size="icon"
									icon={ChevronLeft}
									aria-label="Previous page"
									onClick={() => goToPage(page - 1)}
									disabled={page <= 1}
								/>
								<span className="text-sm text-fg-muted">
									Page {page} of {totalPages}
								</span>
								<Button
									variant="secondary"
									size="icon"
									icon={ChevronRight}
									aria-label="Next page"
									onClick={() => goToPage(page + 1)}
									disabled={page >= totalPages}
								/>
							</div>
						) : null}
					</>
				)}
			</main>

			<NewExperimentModal isOpen={showModal} onOpenChange={setShowModal} />
		</div>
	);
}
