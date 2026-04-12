"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { querySearchOracle, type OracleResult } from "@/lib/services/searchOracle";
import { cn } from "@/lib/utils/cn";

interface SearchCompletenessBarProps {
	selectedNames?: string[];
	kValues?: number[];
}

export function SearchCompletenessBar({
	selectedNames = [],
	kValues = [],
}: SearchCompletenessBarProps) {
	const [result, setResult] = useState<OracleResult | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const names = [...selectedNames];
		const ks = [...kValues];
		setResult(null);
		setLoading(true);

		const timer = setTimeout(async () => {
			if (names.length === 0 || ks.length === 0) {
				setLoading(false);
				return;
			}
			try {
				const r = await querySearchOracle(names, ks);
				setResult(r);
			} catch {
				setResult(null);
			} finally {
				setLoading(false);
			}
		}, 300);

		return () => clearTimeout(timer);
	}, [selectedNames, kValues]);

	const viewLink = result?.coveringHash ? `/lab/${result.coveringHash}/tilings` : null;

	const containerClass = cn(
		"flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
		loading || !result
			? "border-line bg-surface-overlay/30"
			: result.status === "Full"
				? "text-accent bg-accent-subtle border-line-focus"
				: result.status === "Partial"
					? "text-yellow-400 bg-yellow-400/10 border-yellow-500/30"
					: "text-fg-muted bg-surface-overlay/50 border-line",
	);

	return (
		<div className={containerClass}>
			{loading ? (
				<>
					<span className="w-2 h-2 rounded-full bg-fg-muted animate-pulse shrink-0" />
					<span className="text-fg-muted">Checking coverage…</span>
				</>
			) : !result ? (
				<>
					<span className="w-2 h-2 rounded-full bg-surface-overlay shrink-0" />
					<span className="text-fg-disabled">Select polygons and k values to check coverage</span>
				</>
			) : result.status === "Full" ? (
				<>
					<span className="w-2 h-2 rounded-full bg-accent shrink-0" />
					<span className="flex-1">Complete coverage</span>
					{viewLink ? (
						<Link href={viewLink} className="shrink-0 underline hover:text-accent transition-colors ml-1">
							View results →
						</Link>
					) : null}
				</>
			) : result.status === "Partial" ? (
				<>
					<span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
					<span className="flex-1">Partial results exist — running will add more</span>
					{viewLink ? (
						<Link href={viewLink} className="shrink-0 underline hover:text-yellow-300 transition-colors ml-1">
							View →
						</Link>
					) : null}
				</>
			) : (
				<>
					<span className="w-2 h-2 rounded-full bg-fg-muted shrink-0" />
					<span>No prior search found</span>
				</>
			)}
		</div>
	);
}
