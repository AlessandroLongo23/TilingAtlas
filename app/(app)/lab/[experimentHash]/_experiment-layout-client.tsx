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
	completed: "text-accent bg-accent-subtle",
	running: "text-yellow-400 bg-yellow-400/10 animate-pulse",
	pending: "text-fg-muted bg-surface-overlay/40",
	failed: "text-danger bg-danger-subtle",
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
			<div className="shrink-0 border-b border-line-subtle px-6 py-3 flex items-center gap-4">
				<Link
					href="/lab"
					className="shrink-0 text-fg-muted hover:text-fg-secondary transition-colors"
					title="Back to Lab"
				>
					<ChevronLeft size={16} />
				</Link>

				{isGoldStandard ? (
					<Star size={14} className="shrink-0 text-yellow-400 fill-yellow-400/60" />
				) : (
					<FlaskConical size={14} className="shrink-0 text-accent" />
				)}

				<span className="font-mono text-xs px-2 py-1 rounded-md bg-surface-raised/60 text-fg-muted shrink-0">
					{hash.slice(0, 8)}
				</span>

				<div className="flex-1 min-w-0 flex items-baseline gap-2">
					<span className="text-sm font-medium text-fg-secondary truncate">
						{polygonNames.join(", ") || "—"}
					</span>
					<span className="text-xs text-fg-muted shrink-0">k = {kValues.join(", ")}</span>
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
					<span className="shrink-0 text-xs text-fg-muted">{campaign.author_name}</span>
				) : null}
			</div>

			<div className="shrink-0 border-b border-line-subtle px-6 flex gap-1">
				{STEPS.map((step) => {
					const unlocked = isStepUnlocked(step.id);
					const href = `/lab/${hash}/${step.id}`;
					const active = pathname.endsWith(`/${step.id}`);
					if (!unlocked) {
						return (
							<span
								key={step.id}
								className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-fg-disabled cursor-not-allowed"
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
									? "border-line-focus text-accent"
									: "border-transparent text-fg-muted hover:text-fg-secondary",
							)}
						>
							{step.label}
							{tabBadges[step.id] != null ? (
								<span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-accent-subtle text-accent tabular-nums leading-none">
									{tabBadges[step.id]}
								</span>
							) : null}
						</Link>
					);
				})}

				<button
					onClick={() => setSidebarVisible(!sidebarVisible)}
					className="ml-auto px-2 py-2 text-fg-muted hover:text-fg-secondary transition-colors"
					title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
				>
					<PanelLeft size={14} />
				</button>
			</div>

			<div className="flex-1 min-h-0 flex overflow-hidden">{children}</div>
		</div>
	);
}
