"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SwapIcon } from "@/components/ui/swap-icon";
import { cn } from "@/lib/utils/cn";

/**
 * Copy `text` to the clipboard: the icon swaps to a tick for a moment. With a `label` it is a small chip
 * that reads "copied" in that moment; without one, a bare icon button.
 */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() =>
				navigator.clipboard?.writeText(text).then(
					() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1300);
					},
					() => {},
				)
			}
			title={label ? undefined : "Copy"}
			aria-label={label ?? "Copy"}
			className={cn(
				"inline-flex shrink-0 cursor-pointer items-center gap-1 rounded text-fg-muted transition-colors hover:bg-surface-overlay/60 hover:text-fg",
				label ? "px-2 py-1 text-[11px]" : "p-1 max-md:size-11 max-md:justify-center",
				className,
			)}
		>
			<SwapIcon icon={copied ? Check : Copy} size={label ? 12 : 13} className={copied ? "text-success" : undefined} />
			{label ? (copied ? "copied" : label) : null}
		</button>
	);
}
