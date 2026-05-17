import { Polygon, PolygonType, Vector } from '@/classes';

export interface GeneratorParameters {
    [PolygonType.REGULAR]?: {
        n_max: number;
    },
    [PolygonType.STAR_REGULAR]?: {
        n_max: number;
        angle?: number;
    },
    [PolygonType.STAR_PARAMETRIC]?: {
        n_max: number;
    },
    [PolygonType.EQUILATERAL]?: {
        n_max: number;
        angle: number;
    },
    [PolygonType.DUAL]?: {
        n_max: number;
    },
}

export type PartialConfiguration = {
    name: string,
    fullVertex: Vector
    partialVertex: Vector,
}

export type SurroundingPolygon = { polygon: Polygon, prevDir: number, nextDir: number };

/**
 * Translational-cell payload as stored in pipeline-output JSON (gzip-batched
 * under translationalCells/k=*\/m=*\/). Short-form keys (`p`, `b`, `v`) are
 * produced by the encoder; long-form keys are the in-memory equivalents.
 */
export type CellVertex = [number, number] | { x: number; y: number };

export interface CellPolygonData {
    v?: CellVertex[];
    vertices?: CellVertex[];
    n?: number;
}

export interface TranslationalCellData {
    p?: CellPolygonData[];
    cellPolygons?: CellPolygonData[];
    b?: number[][];
    basis?: number[][];
}