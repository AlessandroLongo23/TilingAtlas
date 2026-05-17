import { Vector, type Gyration, type Reflection } from "@/classes";

export type EncodedGyration = { type: "gyration"; center: { x: number; y: number }; order: number };
export type EncodedReflection = {
    type: "reflection";
    axis: { x: number; y: number };
    point: { x: number; y: number };
};
export type EncodedGenerator = EncodedGyration | EncodedReflection;

type EncodedPoint = { x: number; y: number } | [number, number];

/**
 * Permissive shape covering both the in-memory `EncodedGenerator` (long keys:
 * type/center/order/axis/point) and the storage-compact form (short keys:
 * t/c/o/a/pt). Used as the input type for `decodeGenerator` so callers can
 * pass either flavor without casts.
 */
export interface EncodedGeneratorRaw {
    t?: string;
    type?: "gyration" | "reflection";
    c?: EncodedPoint;
    center?: EncodedPoint;
    o?: number;
    order?: number;
    a?: EncodedPoint;
    axis?: EncodedPoint;
    pt?: EncodedPoint;
    point?: EncodedPoint;
}

export function encodeGenerator(g: Gyration | Reflection): EncodedGenerator {
    if ("order" in g) {
        return { type: "gyration", center: g.center.encode(), order: g.order };
    }
    return { type: "reflection", axis: g.axis.encode(), point: g.point.encode() };
}

export function decodeGenerator(g: EncodedGeneratorRaw): Gyration | Reflection {
    const type = g.t ?? g.type;
    if (type === "gyration") {
        const c = g.c ?? g.center;
        if (!c) throw new Error("decodeGenerator: gyration missing center");
        const [x, y] = Array.isArray(c) ? c : [c.x, c.y];
        const order = g.o ?? g.order;
        if (order === undefined) throw new Error("decodeGenerator: gyration missing order");
        return { center: new Vector(x, y), order };
    }
    const a = g.a ?? g.axis;
    const pt = g.pt ?? g.point;
    if (!a || !pt) throw new Error("decodeGenerator: reflection missing axis or point");
    return {
        axis: new Vector(Array.isArray(a) ? a[0] : a.x, Array.isArray(a) ? a[1] : a.y),
        point: new Vector(Array.isArray(pt) ? pt[0] : pt.x, Array.isArray(pt) ? pt[1] : pt.y),
    };
}
