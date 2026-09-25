"use client";

// The way out of a live card on a touch screen. A click-to-activate card (lib/hooks/useCardActivation.ts)
// claims every swipe over it while it is live, and the desktop hands the page back with Esc or a click
// elsewhere. A phone has no Esc, and a tap beside the card only moves focus when it lands on something
// focusable, so without this chip a reader could end up unable to scroll past the card.
//
// Rendered only while the card is live, and shown only on phones: at 768px and up (touch tablets too)
// the element exists but is display:none, so nothing about the desktop page changes.
// Sits inside the card's focusable host, so tapping it keeps focus "inside" until onDone runs.
export function CardDoneChip({ active, onDone }: { active: boolean; onDone: () => void }) {
	if (!active) return null;
	return (
		<button
			type="button"
			// The host starts a pan (or focuses itself) on pointerdown; the chip is not part of the canvas.
			onPointerDown={(e) => e.stopPropagation()}
			onClick={(e) => {
				e.stopPropagation();
				onDone();
			}}
			aria-label="Done: stop interacting with this preview"
			className="ta-float absolute bottom-2 right-2 z-10 hidden h-11 min-w-11 items-center justify-center px-4 text-sm font-medium text-fg max-md:flex"
		>
			Done
		</button>
	);
}
