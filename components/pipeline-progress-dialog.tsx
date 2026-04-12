"use client";

import { useEffect } from "react";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePipelineProgress } from "@/stores/pipelineProgress";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils/cn";

export function PipelineProgressDialog() {
	const { isOpen, title, progress, message, canClose, close } = usePipelineProgress();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && canClose) close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [canClose, close]);

	return (
		<AnimatePresence>
			{isOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="progress-dialog-title"
					aria-describedby="progress-dialog-message"
				>
					<button
						className={cn(
							"fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
							canClose ? "cursor-pointer" : "cursor-default",
						)}
						onClick={() => canClose && close()}
						aria-label="Close dialog"
					/>
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: -8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: -8 }}
						transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
						className="relative bg-surface-overlay border border-line rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
					>
						<div className="flex items-center justify-between px-5 py-4 border-b border-line">
							<div className="flex items-center gap-3">
								{progress === 100 && canClose ? (
									<CheckCircle2 size={22} className="text-accent shrink-0" />
								) : (
									<Loader2 size={22} className="text-accent animate-spin shrink-0" />
								)}
								<h2 id="progress-dialog-title" className="text-lg font-medium text-fg">
									{title}
								</h2>
							</div>
							{canClose ? (
								<Button
									variant="ghost"
									size="icon"
									icon={X}
									aria-label="Close"
									onClick={close}
								/>
							) : null}
						</div>

						<div className="px-5 py-5 space-y-4">
							<p id="progress-dialog-message" className="text-sm text-fg-secondary font-mono leading-relaxed min-h-[2.5rem]">
								{message || "Starting…"}
							</p>

							<div className="h-2 rounded-full bg-surface-overlay/60 overflow-hidden">
								{progress !== null ? (
									<div
										className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full transition-all duration-300 ease-out"
										style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
									/>
								) : (
									<div
										className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full"
										style={{ width: "40%", marginLeft: "-20%", animation: "progressIndeterminate 1.5s ease-in-out infinite" }}
									/>
								)}
							</div>

							{progress !== null && progress < 100 && !canClose ? (
								<p className="text-xs text-fg-muted tabular-nums">{Math.round(progress)}%</p>
							) : null}
						</div>
					</motion.div>

					<style jsx>{`
						@keyframes progressIndeterminate {
							0% {
								transform: translateX(-100%);
							}
							50% {
								transform: translateX(350%);
							}
							100% {
								transform: translateX(-100%);
							}
						}
					`}</style>
				</div>
			) : null}
		</AnimatePresence>
	);
}
