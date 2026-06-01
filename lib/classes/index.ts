// Core
export * from "./Vector";
export * from "./Cyclotomic";
export * from "./Transform";
export * from "./Tiling";
export * from "./TilingChecker";

// Polygons
export * from "./polygons/Polygon";
export * from "./polygons/RegularPolygon";
export * from "./polygons/StarPolygon";
export * from "./polygons/StarRegularPolygon";
export * from "./polygons/StarParametricPolygon";
export * from "./polygons/DualPolygon";
export * from "./polygons/GenericPolygon";
export * from "./polygons/EquilateralPolygon";
export * from "./polygons/IsohedralPolygon";
export * from "./polygons/PolygonType";
export * from "./polygons/ShapeSeed";

// Algorithm
export * from "./algorithm/PolygonsGenerator";
export * from "./algorithm/VCGenerator";
export * from "./algorithm/VertexConfiguration";
export * from "./algorithm/CompatibilityGraph";
export * from "./algorithm/PolygonSignature";
export * from "./algorithm/SeedConfiguration";
export * from "./algorithm/SeedSetExtractor";
export * from "./algorithm/SeedBuilder";
export * from "./algorithm/SeedExpander";
export * from "./algorithm/TranslationalCellExtractor";
export * from "./algorithm/Tiling";

// algorithm/TilingGenerator intentionally NOT re-exported: it imports node:fs
// and is only consumed by the CLI pipeline script (@/lib/algorithm/run-pipeline).
// Import directly from "@/classes/algorithm/TilingGenerator" if you need it
// in a server-only context.
export * from "./algorithm/regex";
export * from "./algorithm/types";