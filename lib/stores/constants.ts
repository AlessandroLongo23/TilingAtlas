/** Store-module constants. BATCH_SIZE and tolerance live in @/lib/constants and @/utils/tolerance. */

import { PolygonType } from "@/classes/polygons/PolygonType";

export const offsets = [
	[-1, -1], [-1, 0], [-1, 1],
	[0, -1],  [0, 0],  [0, 1],
	[1, -1],  [1, 0],  [1, 1],
];

export const categoryOptions = [
	{ id: PolygonType.REGULAR, label: "Regular" },
	{ id: PolygonType.STAR_REGULAR, label: "Star Regular" },
	{ id: PolygonType.STAR_PARAMETRIC, label: "Star Parametric" },
	{ id: PolygonType.EQUILATERAL, label: "Equilateral" },
	{ id: PolygonType.GENERIC, label: "Generic" },
];

export const possibleAngles = [15, 20, 30, 36, 40, 45, 48, 60, 72, 75, 90, 120, 135, 144, 150, 180, 210, 225, 240, 270, 300, 315, 330];
export const possibleSides = [0, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 48, 60];

export const patch = {
	size: { x: 200, y: 200 },
	padding: 15,
	borderRadius: 12,
};

// Re-export tolerance + BATCH_SIZE for backward compatibility with source `$stores` barrel.
export { tolerance } from "@/utils/tolerance";
export { BATCH_SIZE } from "@/lib/constants";
