import { cn } from "@/lib/utils/cn";

// The placeholder that occupies a preview slot while its render is queued or baking. Every thumbnail
// (euclidean / hyperbolic / spherical) shows the same one, so a mixed-geometry grid loads uniformly.
//
// It sits absolutely inset in the preview slot, BELOW the media, and the media fades in over it —
// see the .ta-skeleton / .ta-fade-in / .ta-fade-out trio in app/globals.css. It stays mounted after
// `done` but crossfades out on the preview's own timing, so the slot never flashes card-white under
// a preview that is still fading in, and nothing is left painted behind previews that render with
// transparency (the hyperbolic disk and the spherical ball both do).
//
// `aria-hidden` because the slot's real content carries the alt text; a pulsing box is noise to a
// screen reader.
export function ThumbnailSkeleton({ done = false, className }: { done?: boolean; className?: string }) {
	return (
		<div
			aria-hidden
			className={cn("absolute inset-0 rounded bg-surface-overlay", done ? "ta-fade-out" : "ta-skeleton", className)}
		/>
	);
}
