"use client";

import type { ComponentProps, ComponentType } from "react";
import { cn } from "@/lib/utils/cn";

interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
	id?: string;
	label?: React.ReactNode;
	icon?: ComponentType<{ className?: string }>;
	classes?: string;
}

export function Button({
	id,
	label,
	icon: Icon,
	classes,
	children,
	...rest
}: ButtonProps) {
	return (
		<button
			id={id}
			{...rest}
			className={cn(
				"bg-zinc-800/40 hover:bg-zinc-700/60 text-white/90 hover:text-white px-4 py-2 rounded-md transition-all duration-200 border border-zinc-700/50 hover:border-zinc-600/80 font-medium text-sm flex items-center justify-center gap-2",
				classes,
			)}
		>
			{Icon ? <Icon className="w-4 h-4" /> : null}
			{label ?? children}
		</button>
	);
}
