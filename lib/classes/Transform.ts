import type { Vector } from './Vector';

export type Gyration = {
    center: Vector;
    order: number;
}

export type Reflection = {
    axis: Vector;
    point: Vector;
}

export type GlideReflection = {
    axis: Vector;
    point: Vector;
    delta: number;
}