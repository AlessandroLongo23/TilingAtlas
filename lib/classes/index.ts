// Core
export * from "./Vector";
export * from "./Transform";
export * from "./Tiling";
export * from "./GameOfLifeRule";
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
export * from "./wallpaperGroups";
export * from "./algorithm/regex";
export * from "./algorithm/types";

// Generator: intentionally NOT re-exported from the barrel — those classes
// (TilingGeneratorFromRule, Transformer, GOLEngine, Parser, TilingGenerator)
// import named values from @/stores that were pre-Zustand writables. Import
// directly from "@/classes/generator/..." when you actually need them, AFTER
// the corresponding store usage has been rewritten to useConfiguration.getState().
// This keeps those classes out of the client bundle until Phase 5's Canvas
// port migrates their store reads.