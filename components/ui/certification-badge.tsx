import { BadgeCheck, FlaskConical, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// The §0 honesty badge for the catalogue. CERTIFIED = proven complete & correct (a certified run's
// digest matched the recorded target + the human certify step). CANDIDATE = enumerated but NOT YET
// proven — matches the literature counts, but the proof is the thesis's contribution, so this is not a
// formality. Never render a candidate as certified.
interface CertificationBadgeProps {
	certified: boolean;
	size?: "sm" | "md";
	className?: string;
}

export function CertificationBadge({ certified, size = "md", className }: CertificationBadgeProps) {
	const sm = size === "sm";
	const base = cn(
		"inline-flex items-center gap-1 rounded-full border font-medium backdrop-blur-sm",
		sm ? "text-[9px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
		certified
			? "text-emerald-400 bg-emerald-400/10 border-emerald-400/25"
			: "text-amber-400 bg-amber-400/10 border-amber-400/25",
		className,
	);
	const icon = sm ? 10 : 12;
	return (
		<span className={base} title={certified ? "Proven complete & correct (certified run)" : "Enumerated, not yet proven complete/correct"}>
			{certified ? <BadgeCheck size={icon} /> : <FlaskConical size={icon} />}
			{certified ? "Certified" : "Candidate"}
		</span>
	);
}

// The Reference-atlas counterpart: a literature oracle (Galebach/Myers), shown for display only — NOT
// a result of this project's search, so never a certified/candidate claim.
export function OracleBadge({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
	const sm = size === "sm";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border font-medium backdrop-blur-sm",
				"text-sky-400 bg-sky-400/10 border-sky-400/25",
				sm ? "text-[9px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
				className,
			)}
			title="Reference tiling from the literature (oracle) — display only, not a certified result"
		>
			<BookMarked size={sm ? 10 : 12} />
			Oracle
		</span>
	);
}
