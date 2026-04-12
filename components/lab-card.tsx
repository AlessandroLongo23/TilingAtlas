import type { ReactNode } from "react";

interface LabCardProps {
	canvas: ReactNode;
	body: ReactNode;
}

export function LabCard({ canvas, body }: LabCardProps) {
	return (
		<div className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 overflow-hidden flex flex-col">
			<div className="aspect-square w-full bg-zinc-900/60">{canvas}</div>
			<div className="px-3 pt-2 pb-3 border-t border-zinc-700/30">{body}</div>
		</div>
	);
}
