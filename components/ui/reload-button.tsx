"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";

export function ReloadButton() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [manualLoading, setManualLoading] = useState(false);

	const handleReload = () => {
		setManualLoading(true);
		startTransition(() => {
			router.refresh();
			setManualLoading(false);
		});
	};

	const loading = isPending || manualLoading;

	return (
		<Button
			variant="secondary"
			size="sm"
			onClick={handleReload}
			disabled={loading}
			title="Reload data from JSON files"
			aria-label="Reload data"
		>
			<RefreshCw size={12} className={loading ? "animate-spin" : ""} />
			<span>{loading ? "Reloading…" : "Reload"}</span>
		</Button>
	);
}
