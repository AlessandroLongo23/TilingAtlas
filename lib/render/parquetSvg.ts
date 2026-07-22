// Turn deformed-tiling outlines into an SVG model (viewBox + path strings). Pure — used both by the
// React <ParquetStrip> component and by the standalone-SVG exporter. SVG y grows downward, so we
// negate the tiling's y (up-positive) here. Guides are drawn as the undeformed tiling outlines.

import type { Pt } from "./parquetStrip";

export interface ParquetSvgModel {
  viewBox: string;
  tilePaths: string[];
  guidePaths: string[];
}

const fy = (y: number) => -y;
const n = (v: number) => Number(v.toFixed(4));

function outlineToPath(outline: Pt[]): string {
  let d = "";
  outline.forEach((p, i) => {
    d += `${i === 0 ? "M" : "L"}${n(p[0])} ${n(fy(p[1]))} `;
  });
  return d.trim() + " Z";
}

function bounds(outlines: Pt[][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of outlines) {
    for (const p of o) {
      const x = p[0];
      const y = fy(p[1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

const PAD = 0.4;

function viewBoxOf(outlines: Pt[][], pad: number): string {
  const b = bounds(outlines.length ? outlines : [[[0, 0]] as unknown as Pt[]]);
  return `${n(b.minX - pad)} ${n(b.minY - pad)} ${n(b.maxX - b.minX + 2 * pad)} ${n(b.maxY - b.minY + 2 * pad)}`;
}

/**
 * A viewBox covering EVERY frame handed in — the box an animated strip needs.
 *
 * A deformation moves tiles across the strip's edges, so a box fitted to one frame breathes as the
 * animation runs: the SVG's intrinsic aspect changes, and with it the element's height, which shoves
 * whatever sits below it. Fit the box to the whole phase sweep once and the strip holds still.
 */
export function parquetViewBox(frames: Pt[][][], pad = PAD): string {
  return viewBoxOf(frames.flat(), pad);
}

export function buildParquetSvgModel(
  tileOutlines: Pt[][],
  guideOutlines: Pt[][] = [],
): ParquetSvgModel {
  const all = guideOutlines.length ? tileOutlines.concat(guideOutlines) : tileOutlines;
  return {
    viewBox: viewBoxOf(all, PAD),
    tilePaths: tileOutlines.map(outlineToPath),
    guidePaths: guideOutlines.map(outlineToPath),
  };
}

/** A standalone black-on-white SVG document string, for download/export (thesis figures). */
export function parquetToSvgString(tileOutlines: Pt[][], guideOutlines: Pt[][] = []): string {
  const m = buildParquetSvgModel(tileOutlines, guideOutlines);
  const [vx, vy, w, h] = m.viewBox.split(" ").map(Number);
  const scale = 60; // px per tile unit → a crisp, reasonably-sized figure
  const guides = m.guidePaths
    .map((d) => `<path d="${d}" stroke="#00000022" stroke-width="0.02" fill="none"/>`)
    .join("");
  const tiles = m.tilePaths
    .map((d) => `<path d="${d}" stroke="#000" stroke-width="0.02" fill="none"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * scale).toFixed(0)}" height="${(h * scale).toFixed(0)}" viewBox="${m.viewBox}">` +
    `<rect x="${vx}" y="${vy}" width="${w}" height="${h}" fill="#fff"/>` +
    `<g stroke-linejoin="round" stroke-linecap="round">${guides}${tiles}</g>` +
    `</svg>`
  );
}
