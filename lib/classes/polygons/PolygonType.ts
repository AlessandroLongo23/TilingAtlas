export enum PolygonType {
	REGULAR = "regular",
	STAR_REGULAR = "star_regular",
	STAR_PARAMETRIC = "star_parametric",
	EQUILATERAL = "equilateral",
	ISOHEDRAL = "isohedral",
	GENERIC = "generic",
	DUAL = "dual",
}

// Here and not beside StarPolygon: utils/geometry reads it, Polygon imports utils/geometry, and StarPolygon
// extends Polygon, so taking it from StarPolygon made loading Polygon load its own subclass first.
export enum StarVertexTypes {
	INNER = "inner",
	OUTER = "outer",
}
