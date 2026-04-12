"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

export function ReloadButton() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [manualLoading, setManualLoading] = useState(false);

	const handleReload = () => {
		setManualLoading(true);
		startTransition(() => {
			router.refresh();
			// router.refresh resolves after server render completes; isPending flips off then.
			setManualLoading(false);
		});
	};

	const loading = isPending || manualLoading;

	return (
		<button
			type="button"
			onClick={handleReload}
			disabled={loading}
			title="Reload data from JSON files"
			aria-label="Reload data"
			className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-all bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:bg-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600/60 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<RefreshCw size={12} className={loading ? "animate-spin" : ""} />
			<span>{loading ? "Reloading…" : "Reload"}</span>
		</button>
	);
}
