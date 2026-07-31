/*
 * Type declarations for Tactile-JS, hand-written for this repo.
 *
 * Tactile-JS itself is Copyright 2018 Craig S. Kaplan, csk@uwaterloo.ca, distributed under the
 * 3-clause BSD license; see ./LICENSE. `tactile.js` beside this file is byte-identical to
 * https://github.com/isohedral/tactile-js @ master (sha1 743b1a55…), so it can be re-pulled and
 * dropped in place. Only this declaration file is ours.
 *
 * Written against master and NOT against npm `tactile-js@1.0.0`, which is stale: it predates the
 * `last_y` clamp in fillRegionQuad that stops rows repeating.
 */

/** A point, and the only vector shape the library speaks. */
export interface TactilePoint {
	x: number;
	y: number;
}

/**
 * The top two rows of a 3x3 affine matrix, row-major: [a b c, d e f] standing for
 * [a b c; d e f; 0 0 1]. Every transform in the library is one of these.
 */
export type TactileMatrix = number[];

/**
 * The four intrinsic symmetries a tiling edge can be forced to have. The canonical edge runs from
 * (0,0) to (1,0) and it is the caller's job to draw a path that actually has the symmetry.
 *
 * Values are 10001..10004, NOT 0..3 — the C++ Tactile enumerates J,U,S,I as 0..3, so the two
 * codebases share the order but not the numbering. Never hard-code the integers.
 */
export declare const EdgeShape: {
	/** Free: any path at all. */
	readonly J: 10001;
	/** Mirror across the perpendicular bisector of the chord, like a letter U. */
	readonly U: 10002;
	/** 180 degree rotation about the midpoint, like a letter S. */
	readonly S: 10003;
	/** Both, so it must be a straight line. */
	readonly I: 10004;
};

export type EdgeShapeValue = (typeof EdgeShape)[keyof typeof EdgeShape];

/** 81 — the number of isohedral types this library parameterizes, not the 93 that exist. */
export declare const numTypes: number;

/**
 * The 81 legal type numbers in ascending order, with holes. IH19, 35, 48, 60, 63, 65, 70, 75, 80,
 * 87, 89 and 92 are absent: those twelve need interior markings to break the tile's symmetry and
 * cannot be expressed by the boundary alone.
 */
export declare const tilingTypes: number[];

/** One tiling edge, from `shape()`. */
export interface TactileShapePart {
	/** Maps the canonical (0,0)->(1,0) edge into place on the tile boundary. */
	T: TactileMatrix;
	/** Which canonical edge shape this edge uses; edges sharing an id share a curve. */
	id: number;
	shape: EdgeShapeValue;
	/** True when the control points must be walked backwards to keep the outline continuous. */
	rev: boolean;
}

/**
 * One tiling edge from `parts()`, which splits U and S edges in half and folds the symmetry into
 * `T` so the caller can draw one generic path per half.
 */
export interface TactilePart extends TactileShapePart {
	/** False for J and I. For U and S: false on the first half, true on the second. */
	second: boolean;
}

/** One placed tile, from `fillRegionBounds` / `fillRegionQuad`. */
export interface TactileFillItem {
	/** Aspect transform with the lattice translation folded into the last column. */
	T: TactileMatrix;
	/** Lattice coordinates, for `getColour`. */
	t1: number;
	t2: number;
	/** Index into the type's aspects. */
	aspect: number;
}

export declare class IsohedralTiling {
	/** @param tp one of `tilingTypes`. Passing an absent type throws inside `reset`. */
	constructor(tp: number);

	reset(tp: number): void;
	recompute(): void;

	getTilingType(): number;

	/** 0 to 6. 26 of the 81 types have none. */
	numParameters(): number;
	getParameters(): number[];
	/**
	 * Beware: a length mismatch is silently ignored upstream, leaving the old geometry in place.
	 * Validate against `numParameters()` before calling; `lib/isohedral/build.ts` does.
	 */
	setParameters(arr: number[]): void;

	/** 1 to 5. */
	numEdgeShapes(): number;
	getEdgeShape(idx: number): EdgeShapeValue;

	/** 3 to 6. */
	numVertices(): number;
	getVertex(idx: number): TactilePoint;
	vertices(): TactilePoint[];

	/** 1 to 12. */
	numAspects(): number;
	getAspectTransform(idx: number): TactileMatrix;

	getT1(): TactilePoint;
	getT2(): TactilePoint;

	shape(): Generator<TactileShapePart, void, unknown>;
	parts(): Generator<TactilePart, void, unknown>;

	/**
	 * Approximate by design: it can emit tiles wholly outside the box and leave fringes at the
	 * edges. Kaplan's advice is to fill larger than needed and discard.
	 */
	fillRegionBounds(
		xmin: number,
		ymin: number,
		xmax: number,
		ymax: number,
	): Generator<TactileFillItem, void, unknown>;
	fillRegionQuad(
		A: TactilePoint,
		B: TactilePoint,
		C: TactilePoint,
		D: TactilePoint,
	): Generator<TactileFillItem, void, unknown>;

	/** 0, 1 or 2, chosen so no two adjacent tiles share a value. */
	getColour(a: number, b: number, asp: number): number;
}

/** Matrix times matrix, or matrix times point. Overloaded on the shape of the second argument. */
export declare function mul(A: TactileMatrix, B: TactileMatrix): TactileMatrix;
export declare function mul(A: TactileMatrix, B: TactilePoint): TactilePoint;

/** The orientation-preserving similarity carrying (0,0) to p and (1,0) to q. */
export declare function matchSeg(p: TactilePoint, q: TactilePoint): TactileMatrix;

export declare function makePoint(coeffs: number[], offs: number, params: number[]): TactilePoint;
export declare function makeMatrix(coeffs: number[], offs: number, params: number[]): TactileMatrix;
