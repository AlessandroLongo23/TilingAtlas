/**
 * Figure IR — the single geometry description both emitters consume (emit/tikz.ts → thesis-final
 * PDF, emit/svg.ts → browser preview). Coordinates are MODEL units (unit polygon edge = 1); all
 * physical sizing (mm per edge, line widths, marker radii) is applied by the emitters from the
 * style module, so the two backends cannot drift.
 *
 * Elements carry a `styleRef` resolved by figures/style/palette.ts (e.g. "tile:n:6", "orbit:2",
 * "edge") — emitters stay dumb serializers. Paint order = array order.
 */
export type V2 = { x: number; y: number };

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export type PolyElement = { kind: 'poly'; verts: V2[]; styleRef: string };
export type PolylineElement = { kind: 'polyline'; verts: V2[]; closed?: boolean; styleRef: string };
export type MarkerElement = { kind: 'marker'; at: V2; styleRef: string };
export type ArrowElement = { kind: 'arrow'; from: V2; to: V2; styleRef: string };
/** `tex` is TikZ math-mode-capable text (e.g. "$\\zeta^5$"); the SVG preview renders it raw. */
export type TextElement = { kind: 'text'; at: V2; tex: string; styleRef: string };

export type FigureElement = PolyElement | PolylineElement | MarkerElement | ArrowElement | TextElement;

export type FigureIR = {
	/** Drawing extent in model units — emitters derive the physical size from this. */
	bbox: Rect;
	/** Optional hard clip (TikZ \clip / SVG clipPath), e.g. the gallery crop window. */
	clip?: Rect;
	elements: FigureElement[];
};

export const rectW = (r: Rect): number => r.maxX - r.minX;
export const rectH = (r: Rect): number => r.maxY - r.minY;
