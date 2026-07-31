// The id grammar for previews that name a SHELF instead of an atlas tiling, and where each one goes
// when it is clicked.
//
// Client-safe: plain string work, no imports, so the modal and the /updates page share one
// definition. The geometry behind these ids is built at build time in lib/updates/preview-cells.ts,
// which parses them with the same function.
//
// Every other preview id is an atlas id ("t1003", "isl-4a-488"), lives in a reference shard, and
// deep-links to /play. A shelf id has no shard entry, so /play cannot show it; it links to the page
// that draws it, at the type it names.

export type ShelfPreviewKind = "pentagon" | "isohedral";

export interface ShelfPreview {
	kind: ShelfPreviewKind;
	/** Pentagon type 1-15, or isohedral type 1-93. */
	n: number;
}

const PENTAGON = /^pentagon-t(\d{1,2})$/;
const ISOHEDRAL = /^isohedral-ih(\d{1,2})$/;

/** `null` for an atlas id, which is every id that is not one of these two shapes. */
export function parseShelfPreviewId(id: string): ShelfPreview | null {
	const p = PENTAGON.exec(id);
	if (p) {
		const n = Number(p[1]);
		return n >= 1 && n <= 15 ? { kind: "pentagon", n } : null;
	}
	const i = ISOHEDRAL.exec(id);
	if (i) {
		const n = Number(i[1]);
		return n >= 1 && n <= 93 ? { kind: "isohedral", n } : null;
	}
	return null;
}

/** Where a preview card and a text chip both point. */
export function previewHref(id: string): string {
	const shelf = parseShelfPreviewId(id);
	if (!shelf) return `/play?source=reference&tiling=${encodeURIComponent(id)}`;
	// The two pages take their type through ?type=, in the form each one's own picker writes:
	// a bare number on /pentagons, the zero-padded label on /isohedral.
	return shelf.kind === "pentagon"
		? `/pentagons?type=${shelf.n}`
		: `/isohedral?type=IH${String(shelf.n).padStart(2, "0")}`;
}

/** Card label. The atlas ids are self-describing; these are not. */
export function previewLabel(id: string): string {
	const shelf = parseShelfPreviewId(id);
	if (!shelf) return id;
	return shelf.kind === "pentagon"
		? `Pentagon type ${shelf.n}`
		: `IH${String(shelf.n).padStart(2, "0")}`;
}
