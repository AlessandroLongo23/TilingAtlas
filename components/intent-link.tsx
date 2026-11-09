"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A Link that fetches its route when the reader points at it (hover, focus, touch) and not when it scrolls
 * into view. Next's default prefetches the code of every route linked on screen, and with the nav bar on
 * every page that was 1.2 to 1.7 MB of JavaScript per visit for sections the reader mostly never opens.
 */
export function IntentLink({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
	const router = useRouter();
	const warm = () => {
		if (typeof props.href === "string") router.prefetch(props.href);
	};
	return (
		<Link
			prefetch={false}
			onMouseEnter={(e) => {
				warm();
				onMouseEnter?.(e);
			}}
			onFocus={(e) => {
				warm();
				onFocus?.(e);
			}}
			onTouchStart={(e) => {
				warm();
				onTouchStart?.(e);
			}}
			{...props}
		/>
	);
}
