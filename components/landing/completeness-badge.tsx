import { Check } from "lucide-react";

// Completeness as first-class metadata (spec P5): every collection wears its enumeration status as a
// chip floated over its media. The vocabulary is fixed: proven / complete-so-far / open frontier /
// infinite family / finite. One chip for every tone; a proven result earns a check glyph, not a
// louder chip.

export type CompletenessTone = "proven" | "complete" | "open" | "infinite" | "finite";

interface CompletenessBadgeProps {
	tone: CompletenessTone;
	label: string;
}

export function CompletenessBadge({ tone, label }: CompletenessBadgeProps) {
	return (
		<span className="inline-flex h-5 items-center gap-1 rounded-control bg-surface-raised/95 ring-1 ring-line-subtle font-mono text-[11px] leading-none text-fg-secondary px-1.5 whitespace-nowrap">
			{tone === "proven" ? <Check aria-hidden="true" strokeWidth={2.5} className="w-3 h-3 -ml-0.5" /> : null}
			{label}
		</span>
	);
}
