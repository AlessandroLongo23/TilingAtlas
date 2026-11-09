// THE popup: what a Dropdown, a menu (ContextMenu) and a combobox open into, and the rows inside it.
// Paper with a hairline ring and a drop, scaling out of its trigger (Base UI's starting/ending style).
// Every popup also carries a HoverPill, so the highlight glides between rows the same way in all of them.

export const POPUP =
	"origin-[var(--transform-origin)] rounded-surface bg-surface-raised p-1 shadow-overlay ring-1 ring-line-subtle outline-none transition-[scale,opacity] motion-floating data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";

/** The button a popup opens from, a Dropdown's or a Popover's: a field with its value and a chevron. */
export const POPUP_TRIGGER =
	"ta-field flex h-control-md min-w-0 cursor-pointer items-center gap-1.5 pr-1.5 pl-2.5 text-ui text-fg hover:bg-surface-overlay data-disabled:cursor-not-allowed data-disabled:opacity-60";

/** A row of a popup: the keyboard highlight (data-highlighted) fills it; the pointer's is the HoverPill. */
export const POPUP_ITEM =
	"cursor-default items-center gap-2 rounded-control py-1.5 pr-3 pl-2 text-ui outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface-overlay";
