"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

/**
 * Copy `text` to the clipboard: a ghost Button whose icon swaps to a green tick for a moment. With a
 * `label` it is a small text button that reads "copied" in that moment; without one, an icon button named
 * by its tooltip.
 */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = () =>
		navigator.clipboard?.writeText(text).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1300);
			},
			() => {},
		);
	const button = (
		<Button
			variant="ghost"
			size={label ? "xs" : "icon"}
			icon={copied ? Check : Copy}
			label={label ? (copied ? "copied" : label) : undefined}
			aria-label={label ?? "Copy"}
			onClick={copy}
			className={cn("shrink-0", copied && "[&_svg]:text-success", className)}
		/>
	);
	return label ? button : <Tooltip label="Copy">{button}</Tooltip>;
}
