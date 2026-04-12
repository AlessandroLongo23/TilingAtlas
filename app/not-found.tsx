"use client";

import { Home, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
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
						404
					</span>
				</div>
				<h1 className="text-3xl font-semibold text-fg mb-2 tracking-tight">Page not found</h1>
				<p className="text-fg-muted mb-2 leading-relaxed">
					The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
				</p>
				<p className="text-fg-disabled text-xs mb-8">Check the URL or use the links below to navigate.</p>
				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Button href="/play" variant="primary" size="lg">
						<Home className="w-5 h-5" />
						Go to Play
					</Button>
					<Button href="/theory" variant="secondary" size="lg">
						<BookOpen className="w-5 h-5" />
						Go to Theory
					</Button>
				</div>
			</div>
		</div>
	);
}
