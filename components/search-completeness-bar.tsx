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
			? "border-zinc-700/40 bg-zinc-800/30"
			: result.status === "Full"
				? "text-green-400 bg-green-400/10 border-green-500/30"
				: result.status === "Partial"
					? "text-yellow-400 bg-yellow-400/10 border-yellow-500/30"
					: "text-zinc-400 bg-zinc-800/50 border-zinc-700/50",
	);

	return (
		<div className={containerClass}>
			{loading ? (
				<>
					<span className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse shrink-0" />
					<span className="text-zinc-500">Checking coverage…</span>
				</>
			) : !result ? (
				<>
					<span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
					<span className="text-zinc-600">Select polygons and k values to check coverage</span>
				</>
			) : result.status === "Full" ? (
				<>
					<span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
					<span className="flex-1">Complete coverage</span>
					{viewLink ? (
						<Link href={viewLink} className="shrink-0 underline hover:text-green-300 transition-colors ml-1">
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
					<span className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />
					<span>No prior search found</span>
				</>
			)}
		</div>
	);
}
