"use client";

import { useEffect } from "react";
import { Home, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<div
			className="min-h-screen flex items-center justify-center p-8"
			style={{
				background: "linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)",
			}}
		>
			<div className="max-w-md w-full text-center p-10 rounded-2xl border border-line bg-surface-overlay/60 backdrop-blur-xl shadow-2xl">
				<div className="mb-6">
					<span className="inline-flex items-center justify-center w-16 h-16 text-2xl font-bold text-accent bg-accent-subtle rounded-xl border border-line-focus">
						!
					</span>
				</div>
				<h1 className="text-3xl font-semibold text-fg mb-2 tracking-tight">
					Something went wrong
				</h1>
				<p className="text-fg-muted mb-2 leading-relaxed">
					{error.message || "An unexpected error occurred."}
				</p>
				<p className="text-fg-disabled text-xs mb-8">Use the links below to get back on track.</p>

				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Button
						variant="primary"
						size="lg"
						onClick={reset}
						label="Try Again"
					/>
					<Button href="/play" variant="secondary" size="lg" icon={Home} label="Go to Play" />
					<Button href="/theory" variant="secondary" size="lg" icon={BookOpen} label="Go to Theory" />
				</div>
			</div>
		</div>
	);
}
