"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Star, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Campaign } from "@/lib/services/campaignService";
import { getOwnCampaignIds, getAuthorName } from "@/lib/utils/authorIdentity";
import { NewExperimentModal } from "@/components/new-experiment-modal";
import { cn } from "@/lib/utils/cn";

interface LabListClientProps {
	campaigns: Campaign[];
	total: number;
	page: number;
	pageSize: number;
}

const STATUS_COLOR: Record<string, string> = {
	completed: "text-green-400 bg-green-400/10",
	running: "text-yellow-400 bg-yellow-400/10",
	pending: "text-zinc-400 bg-zinc-700/40",
	failed: "text-red-400 bg-red-400/10",
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
			<div className="shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<FlaskConical size={18} className="text-green-400" />
					<h1 className="text-base font-semibold text-zinc-100">Research Journal</h1>
					{total > 0 ? (
						<span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{total}</span>
					) : null}
				</div>
				<button
					onClick={() => setShowModal(true)}
					className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-600/20 border border-green-500/40 text-green-400 text-sm font-medium hover:bg-green-600/30 transition-colors"
				>
					<Plus size={14} />
					New Experiment
				</button>
			</div>

			<main className="flex-1 overflow-y-auto px-6 py-5">
				{campaigns.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-zinc-600">
						<FlaskConical size={40} className="mb-4 opacity-30" />
						<p className="text-sm font-medium text-zinc-400 mb-1">No experiments yet</p>
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
													? "border-green-500/20 bg-green-500/5 hover:bg-green-500/8"
													: "border-zinc-700/40 bg-zinc-800/30 hover:bg-zinc-800/50",
										)}
									>
										<span className="shrink-0 font-mono text-[11px] px-2 py-1 rounded-md bg-zinc-900/60 text-zinc-400 w-24 text-center truncate">
											{hash.slice(0, 8)}
										</span>
										{gold ? <Star size={13} className="shrink-0 text-yellow-400 fill-yellow-400/60" /> : null}
										<div className="flex-1 min-w-0 flex flex-col gap-0.5">
											<span className="text-sm text-zinc-200 truncate">
												{campaign.polygon_config?.names?.join(", ") || "—"}
											</span>
											<span className="text-xs text-zinc-500">
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
										<span className="shrink-0 text-xs text-zinc-400 w-20 text-right tabular-nums">
											{campaign.tiling_count.toLocaleString()} tilings
										</span>
										<span className="shrink-0 text-xs text-zinc-500 w-28 truncate text-right">
											{own ? (
												<>
													<span className="text-green-400">You</span>
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
										<span className="shrink-0 flex items-center gap-1 text-xs text-zinc-600 w-20 text-right">
											<Clock size={11} />
											{relativeTime(campaign.created_at)}
										</span>
									</Link>
								);
							})}
						</div>

						{totalPages > 1 ? (
							<div className="flex items-center justify-center gap-3 mt-6">
								<button
									onClick={() => goToPage(page - 1)}
									disabled={page <= 1}
									className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronLeft size={16} />
								</button>
								<span className="text-sm text-zinc-400">
									Page {page} of {totalPages}
								</span>
								<button
									onClick={() => goToPage(page + 1)}
									disabled={page >= totalPages}
									className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronRight size={16} />
								</button>
							</div>
						) : null}
					</>
				)}
			</main>

			<NewExperimentModal isOpen={showModal} onOpenChange={setShowModal} />
		</div>
	);
}
