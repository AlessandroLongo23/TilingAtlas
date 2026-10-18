import type { ReactNode } from "react";

interface LabCardProps {
	canvas: ReactNode;
	body: ReactNode;
}

export function LabCard({ canvas, body }: LabCardProps) {
	return (
		<div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface-overlay/30">
			<div className="aspect-square w-full bg-surface-raised/60">{canvas}</div>
			<div className="border-t border-line px-3 pt-2 pb-3">{body}</div>
		</div>
	);
}
