"use client";

import { ScrollText } from "lucide-react";
import { useEffect } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { Tooltip } from "@/components/ui/tooltip";
import { useUpdates } from "@/stores/updates";
import { unseenSince } from "@/lib/updates/unseen";

// The "what's new" button, beside the theme toggle. Carries an accent dot whenever unseen releases
// exist — which is the ONLY signal a patch-only delta gets, since those never open the modal on
// their own. Clicking opens the same modal the gate would.
//
// ScrollText, a written log of entries, because that is what this is. Rejected: Bell (an alert you
// must act on, and it would double up with the dot this already draws), History (accurate, but
// /history in this app is the enumeration-run table and one word should not name two things),
// CircleArrowUp / RefreshCw (they promise a software update to install), Megaphone (marketing).
//
// Shift+U, mirroring ThemeToggle's Shift+T, registered the same way (capture phase, skipping form
// fields so it can't fire mid-typing).

export function UpdatesButton() {
	const lastSeen = useUpdates((s) => s.lastSeen);
	const init = useUpdates((s) => s.init);
	const open = useUpdates((s) => s.open);

	useEffect(() => {
		init();
	}, [init]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "U" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			open();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [open]);

	// undefined until init() has run on the client; rendering the dot before then would differ from
	// the server markup and flash on every hydration.
	const unseen = lastSeen === undefined ? 0 : unseenSince(lastSeen).length;

	return (
		<Tooltip label="What's new" shortcut="Shift + U" side="left" delay={0}>
			<button
				type="button"
				onClick={open}
				aria-label={unseen > 0 ? `What's new (${unseen} unread)` : "What's new"}
				className="relative flex items-center justify-center w-8 h-8 rounded-control border border-line text-fg-muted hover:text-fg hover:bg-surface-overlay transition-colors focus:outline-none cursor-pointer"
			>
				<ScrollText size={16} strokeWidth={1.75} />
				{unseen > 0 ? (
					// Out at the button's corner, not over the glyph: at top-1 it landed on the scroll's
					// curl and read as part of the icon, not as a badge.
					<span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
				) : null}
			</button>
		</Tooltip>
	);
}
