"use client";

import { useMemo } from "react";
import { sounds } from "@/lib/utils/sounds";

interface TilingCardPayload {
	name: string;
	cr: string;
	rulestring: string;
	golRules: unknown;
}

interface TilingCardProps extends TilingCardPayload {
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

export function TilingCard({
	name,
	cr,
	rulestring,
	golRules,
	imageUrl,
	dualImageUrl,
	onClick,
}: TilingCardProps) {
	const isDual = rulestring.includes("*");
	const imageSrc = isDual && dualImageUrl ? dualImageUrl : imageUrl;
	const formattedCr = useMemo(() => formatCrNotation(cr), [cr]);

	return (
		<button
			onClick={() => {
				sounds.button();
				onClick({ name, cr, rulestring, golRules });
			}}
			className="w-full p-3 border border-zinc-700/50 bg-zinc-800/40 hover:bg-zinc-700/60 transition-all rounded-lg mb-2 text-left group"
		>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium mb-1 text-white/90 group-hover:text-white truncate">
					{capitalize(name)}
				</span>
				<div className="relative w-full aspect-square bg-zinc-700/30 rounded-md flex items-center justify-center overflow-hidden border border-zinc-700/40 group-hover:border-green-500/50">
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
							<span className="text-xs font-medium text-white/90 group-hover:text-white bg-zinc-800 rounded-full px-2 py-[2px]">
								Dual
							</span>
						</div>
					) : null}
				</div>
				{cr ? (
					<span
						className="text-xs text-zinc-400"
						dangerouslySetInnerHTML={{ __html: `C&R: ${formattedCr}` }}
					/>
				) : null}
			</div>
		</button>
	);
}
