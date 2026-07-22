import { cn } from "@/lib/utils/cn";

// The placeholder that occupies a preview slot while its render is queued or baking. Every thumbnail
// (euclidean / hyperbolic / spherical) shows the same one, so a mixed-geometry grid loads uniformly.
//
// It sits absolutely inset in the preview slot, BELOW the media, and the media fades in over it —
// see the .ta-skeleton / .ta-fade-in pair in app/globals.css. It stays mounted after `done` (fully
// covered by the opaque preview) and merely stops pulsing, so the slot never flashes card-white
// underneath a preview that is still fading in.
//
// `aria-hidden` because the slot's real content carries the alt text; a pulsing box is noise to a
// screen reader.
export function ThumbnailSkeleton({ done = false, className }: { done?: boolean; className?: string }) {
	return <div aria-hidden className={cn("absolute inset-0 rounded bg-surface-overlay", !done && "ta-skeleton", className)} />;
}
