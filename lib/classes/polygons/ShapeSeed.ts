import { PolygonType } from "@/classes/polygons/PolygonType";

export type ShapeSeed = {
	type: PolygonType;
	n: number;
	sides?: number[];
	angles?: number[];
	alpha?: number;
	d?: number;
	special?: boolean;
};
