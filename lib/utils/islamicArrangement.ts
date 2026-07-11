import { Vector } from "@/classes/Vector";

export type Segment = [Vector, Vector];
export type MarkerKind = "centroid" | "dent" | "tip";
export interface Marker { point: Vector; kind: MarkerKind; }
export interface Face { vertices: Vector[]; }

export const PRIORITY: Record<MarkerKind, number> = { centroid: 0, dent: 1, tip: 2 };
export const HUE: Record<MarkerKind, number> = { centroid: 125, dent: 42, tip: 210 };

const QUANT = 1e5;
export const keyOf = (v: Vector): string => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;

export function signedArea(pts: Vector[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

export function pointInPolygon(poly: Vector[], p: Vector): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const crosses = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
}

/** Intersection of line (p1 + s·d1) with line (p2 + t·d2). Null if parallel. */
export function lineIntersect(p1: Vector, d1: Vector, p2: Vector, d2: Vector): Vector | null {
    const denom = Vector.cross(d1, d2);
    if (Math.abs(denom) < 1e-12) return null;
    const diff = Vector.sub(p2, p1);
    const s = Vector.cross(diff, d2) / denom;
    return new Vector(p1.x + d1.x * s, p1.y + d1.y * s);
}

/** Tip point = intersection of the two inward-normal lines through the halfways of adjacent edges. */
export function tipPoint(hPrev: Vector, nPrev: Vector, hCur: Vector, nCur: Vector): Vector | null {
    return lineIntersect(hPrev, nPrev, hCur, nCur);
}

/**
 * Bounded faces of the arrangement of `segments`. Assumes the segments never cross transversally
 * (true for the Islamic construction: a ray always stops on contact), so the only vertices are
 * shared endpoints and T-junctions. Interior faces come out CCW; the outer face(s) are dropped.
 */
export function extractFaces(segments: Segment[]): Face[] {
    // 1. Dedupe endpoints to vertex indices.
    const idxOf = new Map<string, number>();
    const pts: Vector[] = [];
    const vid = (v: Vector): number => {
        const k = keyOf(v);
        let i = idxOf.get(k);
        if (i === undefined) { i = pts.length; idxOf.set(k, i); pts.push(v.copy()); }
        return i;
    };
    const raw: [number, number][] = [];
    for (const [a, b] of segments) {
        const i = vid(a), j = vid(b);
        if (i !== j) raw.push([i, j]);
    }

    // 2. Split each edge at any vertex lying on its interior (T-junctions).
    const edges = new Set<string>();
    const undirected = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    for (const [a, b] of raw) {
        const A = pts[a], B = pts[b];
        const AB = Vector.sub(B, A);
        const len2 = AB.dot(AB);
        if (len2 < 1e-18) continue;
        const on: { t: number; idx: number }[] = [];
        for (let k = 0; k < pts.length; k++) {
            if (k === a || k === b) continue;
            const AP = Vector.sub(pts[k], A);
            const t = AP.dot(AB) / len2;
            if (t <= 1e-7 || t >= 1 - 1e-7) continue;
            const proj = new Vector(A.x + AB.x * t, A.y + AB.y * t);
            if (Vector.distance(proj, pts[k]) < 1e-6) on.push({ t, idx: k });
        }
        on.sort((x, y) => x.t - y.t);
        let prev = a;
        for (const { idx } of on) { if (prev !== idx) edges.add(undirected(prev, idx)); prev = idx; }
        if (prev !== b) edges.add(undirected(prev, b));
    }

    // 3. Adjacency, sorted CCW by angle.
    const adj: number[][] = pts.map(() => []);
    for (const e of edges) {
        const [a, b] = e.split("-").map(Number);
        adj[a].push(b); adj[b].push(a);
    }
    const ang = (a: number, b: number) => Math.atan2(pts[b].y - pts[a].y, pts[b].x - pts[a].x);
    for (let a = 0; a < pts.length; a++) adj[a].sort((x, y) => ang(a, x) - ang(a, y));

    // A degree-1 (pendant) vertex means a segment endpoint dangles in open space rather than meeting
    // another segment — impossible for the closed Islamic construction, but if the caller ever violates
    // that (e.g. a ray dropped for having no partner), the trace detours into the spur and back, making
    // the containing face non-simple. Never let that pass silently.
    if (pts.some((_, a) => adj[a].length === 1)) {
        console.warn("extractFaces: a degree-1 (pendant) vertex — a dangling segment endpoint will make its face non-simple");
    }

    // 4. Trace faces: at each vertex the next half-edge is the one just clockwise of the reverse.
    const visited = new Set<string>();
    const he = (a: number, b: number) => `${a}->${b}`;
    const faces: Face[] = [];
    for (const e of edges) {
        const [u, v] = e.split("-").map(Number);
        for (const [a0, b0] of [[u, v], [v, u]] as [number, number][]) {
            if (visited.has(he(a0, b0))) continue;
            const loop: number[] = [];
            let a = a0, b = b0;
            let guard = 0;
            while (!visited.has(he(a, b)) && guard++ < 100000) {
                visited.add(he(a, b));
                loop.push(a);
                const nb = adj[b];
                const ia = nb.indexOf(a);
                const c = nb[(ia - 1 + nb.length) % nb.length];
                a = b; b = c;
            }
            if (guard >= 100000) console.warn("extractFaces: face-trace guard hit — the face may be truncated");
            faces.push({ vertices: loop.map((i) => pts[i]) });
        }
    }

    // 5. Keep interior faces (CCW, positive area); drop the outer face(s) and degenerate ones.
    const result: Face[] = [];
    for (const f of faces) if (signedArea(f.vertices) > 1e-9) result.push(f);
    return result;
}
