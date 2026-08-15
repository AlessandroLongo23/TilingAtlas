"use client";

import { useId, useMemo } from "react";
import type { Pt } from "@/lib/render/parquetStrip";
import { buildParquetSvgModel } from "@/lib/render/parquetSvg";

interface ParquetStripProps {
  tileOutlines: Pt[][];
  guideOutlines?: Pt[][];
  /** Optional per-tile fill colours, aligned with `tileOutlines`. Omit or null for line-art only. */
  fills?: (string | null)[];
  /** Overrides the per-frame fitted box. Animated callers pass `parquetViewBox` over the whole phase
   *  sweep, so the box stops breathing frame to frame (and stops resizing the element with it). */
  viewBox?: string;
  /** Clip the drawing to the viewBox. Needed when a drifting grid streams margin tiles through the
   *  frame: `preserveAspectRatio="meet"` letterboxes the box inside the viewport, so without an
   *  explicit clip those off-patch tiles show in the letterbox bands. */
  clip?: boolean;
  className?: string;
}

/** Renders deformed-tiling outlines as crisp SVG line-art (optionally filled). Strokes use
 *  `currentColor`, so the caller's text colour (theme fg) decides black-on-white vs white-on-dark. */
export function ParquetStrip({
  tileOutlines,
  guideOutlines,
  fills,
  viewBox,
  clip = false,
  className,
}: ParquetStripProps) {
  const model = useMemo(
    () => buildParquetSvgModel(tileOutlines, guideOutlines ?? []),
    [tileOutlines, guideOutlines],
  );
  const clipId = useId();
  const box = (viewBox ?? model.viewBox).split(" ").map(Number);

  return (
    <svg
      viewBox={viewBox ?? model.viewBox}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {clip && (
        <defs>
          <clipPath id={clipId}>
            <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} />
          </clipPath>
        </defs>
      )}
      <g clipPath={clip ? `url(#${clipId})` : undefined}>
        {model.guidePaths.length > 0 && (
          <g stroke="currentColor" strokeWidth={0.015} fill="none" opacity={0.16}>
            {model.guidePaths.map((d, i) => (
              <path key={`g${i}`} d={d} />
            ))}
          </g>
        )}
        <g stroke="currentColor" strokeWidth={0.02}>
          {model.tilePaths.map((d, i) => (
            <path key={i} d={d} fill={fills?.[i] ?? "none"} />
          ))}
        </g>
      </g>
    </svg>
  );
}
