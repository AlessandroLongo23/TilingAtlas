import { StarParametricPolygon } from "@/classes";
import { regularVertices } from "@/lib/tiles/prototiles";
import { parseSpecies } from "@/lib/services/polygonSpecies";
import type { RawPolygon } from "@/lib/utils/renderTiling";

/**
 * A species key ("12", "6*60") as the SAME prototile geometry the /theory/tiles gallery draws —
 * unit-edge float vertices for `TilingThumbnail`, so a tile looks identical in the Library's polygon
 * picker and in the Elements gallery. Star species carry their real point angle, so 6★ 30° and
 * 6★ 90° are drawn as the different tiles they are.
 */
export function speciesPolygons(key: string): RawPolygon[] | null {
	const p = parseSpecies(key);
	if (!p) return null;
	if (!p.star) return [{ n: p.n, vertices: regularVertices(p.n) }];
	const poly = StarParametricPolygon.fromCentroidAndAngle(p.n, ((p.alpha ?? 360 / p.n) * Math.PI) / 180);
	return [{ n: 2 * p.n, vertices: poly.vertices.map((v) => ({ x: v.x, y: v.y })), star: true }];
}
