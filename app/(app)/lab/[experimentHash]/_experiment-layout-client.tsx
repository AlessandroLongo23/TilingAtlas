"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, FlaskConical, Star, PanelLeft } from "lucide-react";
import type { Campaign } from "@/lib/services/campaignService";
import { ExperimentProvider, useExperiment } from "./_experiment-context";
import { polygonNamesToSignatures, generateVCs } from "@/lib/algorithm/pipeline-core";
import { cn } from "@/lib/utils/cn";

interface ExperimentLayoutClientProps {
	campaign: Campaign;
	badgeCounts: { seeds: number; expandedSeeds: number; tilings: number } | null;
	children: ReactNode;
}

const STEPS = [
	{ id: "polygons", label: "Polygons" },
	{ id: "vcs", label: "Vertex Configs" },
	{ id: "seeds", label: "Seeds" },
	{ id: "expanded-seeds", label: "Expanded Seeds" },
	{ id: "tilings", label: "Tilings" },
] as const;

const STATUS_COLOR: Record<string, string> = {
	completed: "text-green-400 bg-green-400/10",
	running: "text-yellow-400 bg-yellow-400/10 animate-pulse",
	pending: "text-zinc-400 bg-zinc-700/40",
	failed: "text-red-400 bg-red-400/10",
};

export function ExperimentLayoutClient({
	campaign,
	badgeCounts,
	children,
}: ExperimentLayoutClientProps) {
	// Precompute the initial badges synchronously — they derive from pure
	// algorithm calls and the server-fetched manifest totals.
	const initialBadges = useMemo(() => {
		const names = campaign.polygon_config?.names ?? [];
		const badges: Record<string, number> = {};
		badges.polygons = polygonNamesToSignatures(names).length;
		badges.vcs = generateVCs(names).length;
		if (campaign.tiling_count > 0) badges.tilings = campaign.tiling_count;
		if (badgeCounts) {
			if (badgeCounts.seeds > 0) badges.seeds = badgeCounts.seeds;
			if (badgeCounts.expandedSeeds > 0) badges["expanded-seeds"] = badgeCounts.expandedSeeds;
			if (badgeCounts.tilings > 0) badges.tilings = badgeCounts.tilings;
		}
		return badges;
	}, [campaign, badgeCounts]);

	return (
		<ExperimentProvider initialBadges={initialBadges}>
			<Shell campaign={campaign}>{children}</Shell>
		</ExperimentProvider>
	);
}

function Shell({ campaign, children }: { campaign: Campaign; children: ReactNode }) {
	const { sidebarVisible, setSidebarVisible, tabBadges } = useExperiment();
	const pathname = usePathname();
	const hash = campaign.unique_hash ?? campaign.id;
	const polygonNames = campaign.polygon_config?.names ?? [];
	const kValues = campaign.k_values ?? [];
	const isGoldStandard = campaign.data_source === "pipeline-storage";
	const completedSteps = campaign.completed_steps ?? [];

	// Set document title (client-side)
	useEffect(() => {
		document.title = `${polygonNames.join(" + ") || hash} k=${kValues.join(",")} — TilingAtlas`;
	}, [polygonNames, kValues, hash]);

	const isStepUnlocked = (id: string) => {
		if (id === "polygons") return true;
		if (isGoldStandard) return true;
		return completedSteps.includes(id === "expanded-seeds" ? "expanding" : id === "tilings" ? "cells" : id);
	};

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<div className="shrink-0 border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
				<Link
					href="/lab"
					className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
					title="Back to Lab"
				>
					<ChevronLeft size={16} />
				</Link>

				{isGoldStandard ? (
					<Star size={14} className="shrink-0 text-yellow-400 fill-yellow-400/60" />
				) : (
					<FlaskConical size={14} className="shrink-0 text-green-400" />
				)}

				<span className="font-mono text-xs px-2 py-1 rounded-md bg-zinc-900/60 text-zinc-500 shrink-0">
					{hash.slice(0, 8)}
				</span>

				<div className="flex-1 min-w-0 flex items-baseline gap-2">
					<span className="text-sm font-medium text-zinc-200 truncate">
						{polygonNames.join(", ") || "—"}
					</span>
					<span className="text-xs text-zinc-500 shrink-0">k = {kValues.join(", ")}</span>
				</div>

				<span
					className={cn(
						"shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium",
						STATUS_COLOR[campaign.status] ?? STATUS_COLOR.pending,
					)}
				>
					{campaign.status}
				</span>

				{campaign.author_name ? (
					<span className="shrink-0 text-xs text-zinc-500">{campaign.author_name}</span>
				) : null}
			</div>

			<div className="shrink-0 border-b border-zinc-800 px-6 flex gap-1">
				{STEPS.map((step) => {
					const unlocked = isStepUnlocked(step.id);
					const href = `/lab/${hash}/${step.id}`;
					const active = pathname.endsWith(`/${step.id}`);
					if (!unlocked) {
						return (
							<span
								key={step.id}
								className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-zinc-700 cursor-not-allowed"
								title="Not yet computed"
							>
								{step.label}
							</span>
						);
					}
					return (
						<Link
							key={step.id}
							href={href}
							className={cn(
								"px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
								active
									? "border-green-400 text-green-400"
									: "border-transparent text-zinc-400 hover:text-zinc-200",
							)}
						>
							{step.label}
							{tabBadges[step.id] != null ? (
								<span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-green-400/15 text-green-400 tabular-nums leading-none">
									{tabBadges[step.id]}
								</span>
							) : null}
						</Link>
					);
				})}

				<button
					onClick={() => setSidebarVisible(!sidebarVisible)}
					className="ml-auto px-2 py-2 text-zinc-500 hover:text-zinc-300 transition-colors"
					title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
				>
					<PanelLeft size={14} />
				</button>
			</div>

			<div className="flex-1 min-h-0 flex overflow-hidden">{children}</div>
		</div>
	);
}
