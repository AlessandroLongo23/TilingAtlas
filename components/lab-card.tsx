import type { ReactNode } from "react";

interface LabCardProps {
	canvas: ReactNode;
	body: ReactNode;
}

export function LabCard({ canvas, body }: LabCardProps) {
	return (
		<div className="rounded-xl border border-line bg-surface-overlay/30 overflow-hidden flex flex-col">
			<div className="aspect-square w-full bg-surface-raised/60">{canvas}</div>
			<div className="px-3 pt-2 pb-3 border-t border-line">{body}</div>
		</div>
	);
}
