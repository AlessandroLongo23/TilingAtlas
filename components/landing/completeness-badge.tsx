import { cn } from "@/lib/utils/cn";

// Completeness as first-class metadata (spec P5): every collection wears its enumeration status.
// The vocabulary is fixed — proven / complete-so-far / open frontier / infinite family / finite.

export type CompletenessTone = "proven" | "complete" | "open" | "infinite" | "finite";

// Monochrome grammar: enumeration strength is carried by ink weight, not hue —
// proven inverts, complete outlines in full ink, open is dashed, infinite/finite stay quiet.
const TONE_CLASS: Record<CompletenessTone, string> = {
	proven: "bg-fg text-fg-inverse border border-fg",
	complete: "border border-fg text-fg",
	open: "border border-dashed border-line-strong text-fg-secondary",
	infinite: "border border-line text-fg-muted",
	finite: "border border-line text-fg-muted",
};

interface CompletenessBadgeProps {
	tone: CompletenessTone;
	label: string;
}

export function CompletenessBadge({ tone, label }: CompletenessBadgeProps) {
	return (
		<span
			className={cn(
				"shrink-0 text-[10px] leading-none px-1.5 py-1 whitespace-nowrap",
				TONE_CLASS[tone],
			)}
		>
			{label}
		</span>
	);
}
