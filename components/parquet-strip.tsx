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
  /** Turn the drawing a quarter clockwise, so a strip runs top to bottom: its left end at the top. The
   *  phone's portrait frame fits a long strip far larger this way. The geometry is untouched. */
  vertical?: boolean;
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
  vertical = false,
  className,
}: ParquetStripProps) {
  const model = useMemo(
    () => buildParquetSvgModel(tileOutlines, guideOutlines ?? []),
    [tileOutlines, guideOutlines],
  );
  const clipId = useId();
  const box = (viewBox ?? model.viewBox).split(" ").map(Number);
  // rotate(90) sends (x, y) to (-y, x), so the box [x, x+w] by [y, y+h] lands on [-(y+h), -y] by [x, x+w].
  const [bx, by, bw, bh] = box;
  const shown = vertical
    ? `${-(by + bh)} ${bx} ${bh} ${bw}`
    : (viewBox ?? model.viewBox);

  return (
    <svg
      viewBox={shown}
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
      <g transform={vertical ? "rotate(90)" : undefined}>
        <g clipPath={clip ? `url(#${clipId})` : undefined}>
          {model.guidePaths.length > 0 && (
            <g
              stroke="currentColor"
              strokeWidth={0.015}
              fill="none"
              opacity={0.16}
            >
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
      </g>
    </svg>
  );
}
