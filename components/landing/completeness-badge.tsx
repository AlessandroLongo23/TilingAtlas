import { Check } from "lucide-react";
import { Badge } from "@/design-system/components/badge";

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
		<Badge tone="raised" mono className="h-5 whitespace-nowrap">
			{tone === "proven" ? <Check aria-hidden="true" strokeWidth={2.5} className="-ml-0.5 size-icon-xs" /> : null}
			{label}
		</Badge>
	);
}
