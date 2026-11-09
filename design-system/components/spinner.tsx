import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Something is loading or working. One glyph and one turn for every wait in both apps; `label` names it
 *  for a screen reader when the text beside it does not. */
export function Spinner({ size = 14, label, className }: { size?: number; label?: string; className?: string }) {
	return (
		<LoaderCircle
			size={size}
			role={label ? "status" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={cn("shrink-0 animate-spin text-fg-muted motion-reduce:animate-none", className)}
		/>
	);
}
