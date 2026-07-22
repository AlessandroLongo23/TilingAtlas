"use client";

import { useMemo } from "react";
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
  className?: string;
}

/** Renders deformed-tiling outlines as crisp SVG line-art (optionally filled). Strokes use
 *  `currentColor`, so the caller's text colour (theme fg) decides black-on-white vs white-on-dark. */
export function ParquetStrip({ tileOutlines, guideOutlines, fills, viewBox, className }: ParquetStripProps) {
  const model = useMemo(
    () => buildParquetSvgModel(tileOutlines, guideOutlines ?? []),
    [tileOutlines, guideOutlines],
  );

  return (
    <svg
      viewBox={viewBox ?? model.viewBox}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
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
    </svg>
  );
}
