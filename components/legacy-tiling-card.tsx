"use client";

import { useMemo } from "react";
import { sounds } from "@/lib/utils/sounds";

interface TilingCardPayload {
	name: string;
	cr: string;
	rulestring: string;
	golRules: unknown;
}

interface LegacyTilingCardProps extends TilingCardPayload {
	groupId?: string;
	imageUrl?: string;
	dualImageUrl?: string;
	onClick: (payload: TilingCardPayload) => void;
}

function capitalize(str: string) {
	if (!str) return "";
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatCrNotation(cr: string) {
	if (!cr) return "";
	return cr.replace(/\^(\d+)/g, "<sup>$1</sup>").replace(/_(\d+)/g, "<sub>$1</sub>");
}

export function LegacyTilingCard({
	name,
	cr,
	rulestring,
	golRules,
	imageUrl,
	dualImageUrl,
	onClick,
}: LegacyTilingCardProps) {
	const isDual = rulestring.includes("*");
	const imageSrc = isDual && dualImageUrl ? dualImageUrl : imageUrl;
	const formattedCr = useMemo(() => formatCrNotation(cr), [cr]);

	return (
		<button
			onClick={() => {
				sounds.button();
				onClick({ name, cr, rulestring, golRules });
			}}
			className="w-full p-3 border border-line bg-surface-overlay/40 hover:bg-surface-overlay/60 transition-all rounded-lg mb-2 text-left group cursor-pointer"
		>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium mb-1 text-fg group-hover:text-fg truncate">
					{capitalize(name)}
				</span>
				<div className="relative w-full aspect-square bg-surface-overlay/30 rounded-md flex items-center justify-center overflow-hidden border border-line group-hover:border-line-focus">
					{imageSrc ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={imageSrc}
							alt={name}
							className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-300"
						/>
					) : null}
					{isDual ? (
						<div className="absolute top-0 right-1">
							<span className="text-xs font-medium text-fg group-hover:text-fg bg-surface-overlay rounded-full px-2 py-[2px]">
								Dual
							</span>
						</div>
					) : null}
				</div>
				{cr ? (
					<span
						className="text-xs text-fg-muted"
						dangerouslySetInnerHTML={{ __html: `C&R: ${formattedCr}` }}
					/>
				) : null}
			</div>
		</button>
	);
}
