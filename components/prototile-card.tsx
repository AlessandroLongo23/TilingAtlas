"use client";

import { Camera } from "lucide-react";
import { Badge, type BadgeTone } from "@/design-system/components/badge";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { renderFigureToDataUrl } from "@/lib/utils/renderTiling";
import { SCREENSHOT_BUTTONS_ENABLED } from "@/lib/utils/featureFlags";
import { Button } from "@/design-system/components/button";
import { Tooltip } from "@/design-system/components/tooltip";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { FAMILY_LABELS, type Prototile } from "@/lib/tiles/prototiles";

// Filesystem-safe download filename — a plain replace keeps the name readable, unlike sanitizeForStorage's
// reversible _XX_ encoding (that's for storage keys, not user-facing files).
function safeFilename(name: string): string {
	return name.replace(/[/\\?%*:|"<>]+/g, "-").replace(/^-+|-+$/g, "");
}

// One prototile SHAPE as a card — a single polygon through the real thumbnail renderer. Mirrors the
// ReferenceCard shell (same wrapper/thumb/meta classes) so the gallery reads like the Library.
// A tag that is not established reads dashed; every other tag is a plain outlined one.
const BADGE_TONE: Record<string, BadgeTone> = { "non-decomp": "dashed" };

export function PrototileCard({ tile }: { tile: Prototile }) {
	const openScreenshot = useScreenshotPreview((s) => s.open);

	const handleScreenshot = (e: React.MouseEvent) => {
		e.stopPropagation();
		const dataUrl = renderFigureToDataUrl([
			{ n: tile.sideCount, vertices: tile.vertices, star: tile.star, hue: tile.hue },
		]);
		if (!dataUrl) return;
		const safe = safeFilename(tile.name || tile.id) || "tile";
		openScreenshot({
			imageDataUrl: dataUrl,
			filename: `${safe}.png`,
			rulestring: tile.name,
			groupId: null,
			allowSupabaseUpload: false,
		});
	};

	return (
		<div className="group ta-well relative flex flex-col overflow-hidden transition-colors hover:border-line-strong hover:bg-surface-overlay/50">
			<div className="relative aspect-square bg-surface-raised">
				{/* Fit, not a fixed edge length: these are lone tiles, so the frame has to follow
				    the shape (a triangle is one edge across, an 18★ at 20° apex about eleven). The bar
				    puts the unit back — it's the only thing left that compares one card to the next.
				    Room below for it: 0.74 leaves a ~13% margin, which is where the ruler sits. */}
				<TilingThumbnail
					polygons={[{ n: tile.sideCount, vertices: tile.vertices, star: tile.star, hue: tile.hue }]}
					fit={0.74}
					scaleBar
				/>
				{SCREENSHOT_BUTTONS_ENABLED ? (
					<Tooltip label="Screenshot">
						<Button
							variant="secondary"
							size="icon"
							icon={Camera}
							onClick={handleScreenshot}
							aria-label="Take screenshot"
							className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
						/>
					</Tooltip>
				) : null}
			</div>
			<div className="flex flex-col gap-1.5 px-2.5 py-2">
				<div className="flex flex-wrap items-center gap-1">
					<Badge tone="line" className="max-md:text-small">
						{FAMILY_LABELS[tile.family]}
					</Badge>
					{tile.badges.map((b) => (
						<Badge key={b} tone={BADGE_TONE[b] ?? "line"} className="max-md:text-small">
							{b}
						</Badge>
					))}
				</div>
				<p className="font-mono text-small leading-tight text-fg-secondary" title={tile.name}>
					{tile.name}
				</p>
				<p className="font-mono text-micro leading-tight text-fg-muted">
					{tile.sideCount} sides
				</p>
			</div>
		</div>
	);
}
