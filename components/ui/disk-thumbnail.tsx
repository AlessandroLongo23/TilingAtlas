"use client";

import { useEffect, useRef, useState } from "react";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";

// The shell around a baked Poincaré-disk preview: wait until the card is near the viewport, bake one
// frame through the frame-paced queue, fade the result in over a skeleton, and give up gracefully.
//
// Three thumbnail shelves had a copy of this each — developed patches, edge systems, colorings — and the
// copies agreed on every value that matters (the 300px rootMargin, disconnecting the observer after the
// first intersection, cancelling a pending bake on unmount). What differs between them is only the bake
// itself, which is the shelf's whole identity and stays with the shelf.
//
// WHY THE BAKE IS SPLIT IN TWO. `prepare` is for anything asynchronous a bake needs — the developed shelf
// fetches a patch catalogue shared across every card — and it runs OUTSIDE the queue, because the queue
// paces FRAMES and a network wait is not a frame. Only `bake` is paced. Getting this backwards would
// stall the queue on the network and bake every card in one frame once it arrived.

interface DiskThumbnailProps<T> {
	alt: string;
	/** Async setup, run outside the frame-paced queue. Resolve null to fail the card. */
	prepare: () => Promise<T | null>;
	/** The synchronous bake, frame-paced. Returns a data URL, or null to fail the card. */
	bake: (prepared: T) => string | null;
	/** Named for the console when a bake throws, so a stack points at a shelf and not at this file. */
	label: string;
}

export function DiskThumbnail<T>({ alt, prepare, bake, label }: DiskThumbnailProps<T>) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	// `prepare` and `bake` are the dependency: each caller wraps them in useCallback over the store fields
	// its bake reads, so a hue-ring drag re-bakes and an unrelated render does not.
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let disposed = false;
		let cancelJob: (() => void) | null = null;
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting) return;
				io.disconnect();
				prepare()
					.then((prepared) => {
						if (disposed) return;
						if (prepared == null) {
							setFailed(true);
							return;
						}
						cancelJob = enqueueThumbnailRender(() => {
							if (disposed) return;
							try {
								const dataUrl = bake(prepared);
								if (dataUrl) setUrl(dataUrl);
								else setFailed(true);
							} catch (e) {
								console.warn(`${label} render error:`, e);
								setFailed(true);
							}
						});
					})
					.catch((e) => {
						if (disposed) return;
						console.warn(`${label} prepare error:`, e);
						setFailed(true);
					});
			},
			{ rootMargin: "300px" },
		);
		io.observe(el);
		return () => {
			disposed = true;
			io.disconnect();
			// Drop a pending bake when the card unmounts (pagination, filter change) — otherwise the queue
			// keeps grinding through 512² fields for cards that no longer exist.
			cancelJob?.();
		};
	}, [prepare, bake, label]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				disk
			</div>
		);
	}

	// The skeleton holds the slot until the bake lands, then the disk fades in over it. `url` is never
	// reset once set, so a hue-ring drag swaps the image in place without flashing the skeleton back.
	return (
		<div ref={wrapRef} className="relative w-full h-full">
			<ThumbnailSkeleton done={url != null} />
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={url}
					alt={alt}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
