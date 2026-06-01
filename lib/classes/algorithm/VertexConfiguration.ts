import { 
    Vector, 
    Polygon, 
    PolygonType, 
    PolygonSignature, 
    StarVertexTypes, 
    RegularPolygon, 
    StarRegularPolygon,
    StarParametricPolygon, 
    EquilateralPolygon, 
    GenericPolygon,
    SeedConfiguration,
    type PartialConfiguration,
    type SurroundingPolygon
} from '@/classes';
import { deduplicatePoints, isWithinAngularTolerance, isWithinTolerance, toRadians, compareVCNames } from '@/utils';
import { regularPolygonRegex, regularStarRegex, parametricStarRegex, equilateralPolygonRegex, genericPolygonRegex } from './regex';
import { tolerance } from '@/utils/tolerance';
import { Cyclotomic, getActiveRing } from '../Cyclotomic';

/** Interior-angle turn between consecutive polygons in a VC walk, in integer ζ-steps. */
function interiorAngleSteps(n: number, N: number): number {
    const stepsReal = (N * (n - 2)) / (2 * n); // π(n-2)/n in units of 2π/N
    const steps = Math.round(stepsReal);
    if (Math.abs(stepsReal - steps) > 1e-9) {
        throw new Error(`interiorAngleSteps: regular ${n}-gon interior angle is off-grid for N=${N}`);
    }
    return ((steps % N) + N) % N;
}

export class VertexConfiguration {
    polygons: Polygon[];
    angle: number;
    name: string;
    current_dir: Vector;
    valid: boolean = true;
    neighboringVertices: Vector[];
    /** Exact neighbouring vertices, index-aligned with `neighboringVertices` (when exact). */
    neighboringVerticesExact: Cyclotomic[] = [];
    sharedVertex: Vector;

    private _polygonBaseNames: string[] | null = null;
    private _edgePairs: Set<string> | null = null;
    private _partialConfigs: PartialConfiguration[] | null = null;
    private _partialDoubledReversed: string[] | null = null;

    constructor(polygons: Polygon[], angle: number | null = null, name: string | null = null, current_dir: Vector | null = null) {
        this.polygons = polygons;
        this.angle = angle || this.computeAngle();
        this.name = name || this.getName();
        this.current_dir = current_dir || new Vector(1, 0);
        this.neighboringVertices = [];
        this.sharedVertex = this.computeSharedVertex();
    }

    static fromName = (name: string): VertexConfiguration => {
        const polygonsData = name.split(',');

        // Exact path: a VC of only regular polygons (the {3,4,6,8,12} gate) is built by the
        // exact boundary walk from the origin, tracking an integer direction index. Every
        // vertex stays in ℤ[ζ_N]; the shared vertex is the exact origin.
        const allRegular = polygonsData.every((p) => !!p.match(regularPolygonRegex));
        if (allRegular) {
            const ring = getActiveRing();
            const N = ring.N;
            const ZERO = Cyclotomic.ZERO(ring);
            const polygons: Polygon[] = [];
            let dirIndex = 0;
            for (const p of polygonsData) {
                const n = parseInt(p);
                polygons.push(RegularPolygon.fromAnchorAndDirExact(n, ZERO, dirIndex));
                dirIndex = (dirIndex + interiorAngleSteps(n, N)) % N;
            }
            return new VertexConfiguration(polygons, null, name);
        }

        let polygons: Polygon[] = [];
        let current_dir: Vector = new Vector(1, 0);

        for (const p of polygonsData) {
            let polygon: Polygon | null = null;

            if (p.match(regularPolygonRegex)) {
                polygon = RegularPolygon.fromAnchorAndDir(parseInt(p), new Vector(0, 0), current_dir.copy());
            } else if (p.match(regularStarRegex)) {
                const regularStarMatch = p.match(regularStarRegex);
                const [, n, d, suffix] = regularStarMatch;
                const startsWith = suffix === 'i' ? StarVertexTypes.INNER : StarVertexTypes.OUTER;
                polygon = StarRegularPolygon.fromAnchorAndDir(parseInt(n), new Vector(0, 0), current_dir.copy(), parseInt(d), startsWith);
            } else if (p.match(parametricStarRegex)) {
                const parametricStarMatch = p.match(parametricStarRegex);
                const [, n, value, suffix] = parametricStarMatch;
                const startsWith = suffix === 'i' ? StarVertexTypes.INNER : StarVertexTypes.OUTER;
                if (suffix) {
                    polygon = StarParametricPolygon.fromAnchorAndDir(parseInt(n), new Vector(0, 0), current_dir.copy(), toRadians(parseInt(value)), startsWith);
                } else {
                    polygon = StarRegularPolygon.fromAnchorAndDir(parseInt(n), new Vector(0, 0), current_dir.copy(), parseInt(value), startsWith);
                }
            } else if (p.match(equilateralPolygonRegex)) {
                const equilateralPolygonMatch = p.match(equilateralPolygonRegex);
                const [, n, angles] = equilateralPolygonMatch;
                polygon = EquilateralPolygon.fromAnchorAndDir(parseInt(n), new Vector(0, 0), current_dir.copy(), angles.split(';').map(a => toRadians(parseInt(a))));
            } else if (p.match(genericPolygonRegex)) {
                const genericPolygonMatch = p.match(genericPolygonRegex);
                const [, n, sides, angles] = genericPolygonMatch;
                polygon = GenericPolygon.fromAnchorAndDir(parseInt(n), new Vector(0, 0), current_dir.copy(), sides.split(';').map(s => parseFloat(s)), angles.split(';').map(a => toRadians(parseInt(a))));
            }

            if (polygon) {
                polygons.push(polygon);
                current_dir.rotate(polygon.interior_angle);
            }
        }
        return new VertexConfiguration(polygons, null, name);
    }

    static merge = (vcA: VertexConfiguration, vcB: VertexConfiguration, a: PartialConfiguration, b: PartialConfiguration): SeedConfiguration => {
        const clonedB = vcB.clone();

        const dirA = Vector.sub(a.partialVertex, a.fullVertex).heading();
        const dirB = Vector.sub(b.partialVertex, b.fullVertex).heading();
        clonedB.rotate(b.fullVertex, dirA - dirB + Math.PI);
        clonedB.translate(Vector.sub(a.partialVertex, b.fullVertex));

        return new SeedConfiguration([vcA, clonedB]);
    }

    generatePolygon = (polygonData: PolygonSignature, dir: Vector): Polygon => {
        let polygon: Polygon;
        switch (polygonData.type) {
            case PolygonType.REGULAR:
                polygon = RegularPolygon.fromAnchorAndDir(polygonData.n, new Vector(0, 0), dir);
                break;
            case PolygonType.STAR_REGULAR:
                polygon = StarRegularPolygon.fromAnchorAndDir(polygonData.n, new Vector(0, 0), dir, polygonData.d, polygonData.startsWith);
                break;
            case PolygonType.STAR_PARAMETRIC:
                polygon = StarParametricPolygon.fromAnchorAndDir(polygonData.n, new Vector(0, 0), dir, polygonData.alpha, polygonData.startsWith);
                break;
            case PolygonType.EQUILATERAL:
                polygon = EquilateralPolygon.fromAnchorAndDir(polygonData.n, new Vector(0, 0), dir, [...polygonData.angles]);
                break;
            case PolygonType.GENERIC:
                polygon = GenericPolygon.fromAnchorAndDir(polygonData.n, new Vector(0, 0), dir, [...polygonData.sides], [...polygonData.angles]);
                break;
        }

        return polygon;
    }

    addPolygon = (polygonData: PolygonSignature) => {
        let newPolygon = this.generatePolygon(polygonData, this.current_dir.copy().normalize());
        this.polygons.push(newPolygon);
        this.angle += newPolygon.interior_angle;

        // FIRST CHECK: check if the new polygon conflicts with any other polygon
        if (this.polygons.length > 1) {
            for (let i = 0; i < this.polygons.length - 1; i++) {
                if (newPolygon.intersects(this.polygons[i])) {
                    this.valid = false;
                    return;
                }
            }
        }

        // SECOND CHECK: at the adjacent vertex (where last two polygons meet, excluding center), the angle sum must not exceed 2π
        if (this.polygons.length > 1) {
            const secondLastPolygon = this.polygons[this.polygons.length - 2];
            const adjacentVertex = findAdjacentVertex(newPolygon, secondLastPolygon);
            if (adjacentVertex) {
                const angleA = newPolygon.getAngleAtVertex(adjacentVertex);
                const angleB = secondLastPolygon.getAngleAtVertex(adjacentVertex);
                if (angleA + angleB > 2 * Math.PI + tolerance) {
                    this.valid = false;
                    return;
                }
            }
        }

        // THIRD CHECK: when cycle closes, at the adjacent vertex (where first and last meet, excluding center), the angle sum must not exceed 2π
        if (isWithinAngularTolerance(this.angle, 2 * Math.PI)) {
            const firstPolygon = this.polygons[0];
            const adjacentVertex = findAdjacentVertex(newPolygon, firstPolygon);
            if (adjacentVertex) {
                const angleA = newPolygon.getAngleAtVertex(adjacentVertex);
                const angleB = firstPolygon.getAngleAtVertex(adjacentVertex);
                if (angleA + angleB > 2 * Math.PI + tolerance) {
                    this.valid = false;
                    return;
                }
            }
        }

        this.name = this.getName();
        this.current_dir.rotate(newPolygon.interior_angle);
    }

    computeNeighboringVertices = (): void => {
        // Exact path: compute exact neighbours, derive the float list from them so the two
        // arrays stay index-aligned (callers pair float vertices with their exact form).
        if (this.hasExact()) {
            this.neighboringVerticesExact = this.neighboringVerticesExact_compute();
            this.neighboringVertices = this.neighboringVerticesExact.map((v) => v.toVector());
            this.sharedVertex = this.computeSharedVertexExact().toVector();
            return;
        }

        this.neighboringVertices = [];
        this.neighboringVerticesExact = [];
        this.sharedVertex = this.computeSharedVertex();

        for (const polygon of this.polygons) {
            for (let i = 0; i < polygon.vertices.length; i++) {
                const next = polygon.vertices[(i + 1) % polygon.vertices.length];
                if (isWithinTolerance(next, this.sharedVertex))
                    this.neighboringVertices.push(polygon.vertices[i].copy());
            }
        }

        this.neighboringVertices = deduplicatePoints(this.neighboringVertices);
    }

    computeAngle = (): number => {
        if (this.polygons.length === 0) {
            return 0;
        }

        let angle = 0;
        for (let polygon of this.polygons) {
            angle += polygon.interior_angle;
        }
        return angle;
    }

    getName = (): string => {
        const polygonNames: string[] = this.polygons.map(p => p.getName());
        let minPolygonNames: string[] = polygonNames;
        for (let i = 0; i < polygonNames.length; i++) {
            let rotated = polygonNames.slice(i).concat(polygonNames.slice(0, i));
            if (compareVCNames(rotated, minPolygonNames) < 0) {
                minPolygonNames = rotated;
            }
        }

        return minPolygonNames.join(',');
    }

    private getPolygonBaseNames = (): string[] => {
        if (!this._polygonBaseNames) {
            this._polygonBaseNames = this.polygons.map(p => p.getName());
        }
        return this._polygonBaseNames;
    }

    private getEdgePairs = (): Set<string> => {
        if (!this._edgePairs) {
            const names = this.getPolygonBaseNames();
            this._edgePairs = new Set<string>();
            for (let i = 0; i < names.length; i++) {
                this._edgePairs.add(names[i] + ',' + names[(i + 1) % names.length]);
            }
        }
        return this._edgePairs;
    }

    private getPartialConfigs = (): PartialConfiguration[] => {
        if (!this._partialConfigs) {
            this.computeNeighboringVertices();
            this._partialConfigs = this.neighboringVertices.map(nv => this.evaluatePartialconfiguration(nv));
        }
        return this._partialConfigs;
    }

    private getPartialDoubledReversed = (): string[] => {
        if (!this._partialDoubledReversed) {
            this._partialDoubledReversed = this.getPartialConfigs().map(pc => {
                return (pc.name + ',' + pc.name).split(',').reverse().join(',');
            });
        }
        return this._partialDoubledReversed;
    }

    isCompatible = (other: VertexConfiguration): boolean => {
        const thisEdgePairs = this.getEdgePairs();
        const otherEdgePairs = other.getEdgePairs();

        let hasInvertedPair = false;
        for (const pair of thisEdgePairs) {
            const sep = pair.indexOf(',');
            const reversed = pair.substring(sep + 1) + ',' + pair.substring(0, sep);
            if (otherEdgePairs.has(reversed)) {
                hasInvertedPair = true;
                break;
            }
        }
        if (!hasInvertedPair) return false;

        const vcAPartials = this.getPartialConfigs();
        const vcBPartials = other.getPartialConfigs();
        const vcAReversed = this.getPartialDoubledReversed();
        const vcBReversed = other.getPartialDoubledReversed();

        for (let i = 0; i < vcAPartials.length; i++) {
            for (let j = 0; j < vcBPartials.length; j++) {
                if (vcAReversed[i].includes(vcBPartials[j].name) ||
                    vcBReversed[j].includes(vcAPartials[i].name)) {
                    if (checkMergeCompatibility(this, other, vcAPartials[i], vcBPartials[j])) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    rotate = (origin: Vector, angle: number): void => {
        const shared = this.computeSharedVertex();
        this.current_dir.rotate(angle);
        for (let polygon of this.polygons) {
            polygon.rotate(origin, angle);
        }
        this.sharedVertex = shared.rotateAround(origin, angle);
    }

    static rotate = (vc: VertexConfiguration, origin: Vector, angle: number): VertexConfiguration => {
        const clonedVC = vc.clone();
        clonedVC.rotate(origin, angle);
        return clonedVC;
    }

    translate = (vector: Vector): void => {
        for (let polygon of this.polygons) {
            polygon.translate(vector);
        }
        this.sharedVertex = Vector.add(this.sharedVertex, vector);
    }

    static translate = (vc: VertexConfiguration, vector: Vector): VertexConfiguration => {
        const clonedVC = vc.clone();
        clonedVC.translate(vector);
        return clonedVC;
    }

    mirror = (point: Vector, dir: Vector): void => {
        for (let polygon of this.polygons) {
            polygon.mirror(point, dir);
        }
        this.sharedVertex = Vector.mirrorByPointAndDir(this.sharedVertex.copy(), point.copy(), dir.copy());
    }

    static mirror = (vc: VertexConfiguration, point: Vector, dir: Vector): VertexConfiguration => {
        const clonedVC = vc.clone();
        clonedVC.mirror(point, dir);
        return clonedVC;
    }

    glide = (point: Vector, dir: Vector, delta: number): void => {
        for (let polygon of this.polygons) {
            polygon.glide(point, dir, delta);
        }
        this.sharedVertex = Vector.add(this.sharedVertex, Vector.scale(dir, delta));
    }

    static glide = (vc: VertexConfiguration, point: Vector, dir: Vector, delta: number): VertexConfiguration => {
        const clonedVC = vc.clone();
        clonedVC.glide(point, dir, delta);
        return clonedVC;
    }

    evaluatePartialconfiguration = (vertex: Vector): PartialConfiguration => {
        // 1. Find the surrounding polygons, i.e., the polygons that have a vertex at the coordinate
        const surroundingPolygons: SurroundingPolygon[] = [];
        for (let j = 0; j < this.polygons.length; j++) {
            const p = this.polygons[j];
            const vertexIndex = p.vertices.findIndex(v => isWithinTolerance(v, vertex));
            // Note: in the other direction, we consider the next vertex to be the previous vertex and vice versa
            if (vertexIndex !== -1) {
                const previousVertex = p.vertices[(vertexIndex + 1) % p.vertices.length];
                const currentVertex = p.vertices[vertexIndex];
                const nextVertex = p.vertices[(vertexIndex - 1 + p.vertices.length) % p.vertices.length];

                const previousDir = Vector.sub(currentVertex, previousVertex).heading();
                const nextDir = Vector.sub(currentVertex, nextVertex).heading();
                
                surroundingPolygons.push({ 
                    polygon: p, 
                    prevDir: previousDir,
                    nextDir: nextDir,
                });
            }
        }

        // find the polygon that has no previous polygon. If it doesn't exist, use the first polygon
        let firstPolygon: SurroundingPolygon = surroundingPolygons.find(p => {
            const previousPolygon: SurroundingPolygon | undefined = surroundingPolygons.find(other => isWithinAngularTolerance(other.nextDir, p.prevDir));
            return previousPolygon === undefined;
        }) || surroundingPolygons[0];

        // now order the surrounding polygons such that the nextDir of each polygon is the prevDir of the next polygon
        let currentPolygon: SurroundingPolygon = firstPolygon;
        const orderedPolygons: SurroundingPolygon[] = [];
        while (orderedPolygons.length < surroundingPolygons.length) {
            orderedPolygons.push(currentPolygon);
            currentPolygon = surroundingPolygons.find(p => isWithinAngularTolerance(p.prevDir, currentPolygon.nextDir))!;
        }

        const partialConfiguration: Polygon[] = orderedPolygons.map(p => p.polygon);
        const partialConfigurationName = partialConfiguration.map(p => p.getName()).join(',');

        return {
            name: partialConfigurationName,
            fullVertex: new Vector(),
            partialVertex: vertex.copy(),
        }
    }

    clone = (): VertexConfiguration => {
        return new VertexConfiguration(this.polygons.map(p => p.clone()), this.angle, this.name, this.current_dir.copy());
    }

    /**
     * The shared vertex is the vertex that is shared by all the polygons
     * @returns the shared vertex
     */
    computeSharedVertex = (): Vector => {
        if (this.polygons.length === 0) return new Vector(0, 0);
        const allVertices = deduplicatePoints(this.polygons.flatMap(p => p.vertices));
        const found = allVertices.find(v => this.polygons.every(p => p.vertices.some(v2 => isWithinTolerance(v2, v))));
        return found ?? this.polygons[0].vertices[0].copy();
    }

    // ---------------------------------------------------------------------------
    // Exact coordinate representation — polygons are the single source of truth
    // ---------------------------------------------------------------------------

    hasExact = (): boolean => this.polygons.length > 0 && this.polygons.every((p) => p.hasExact());

    /** The exact vertex common to all polygons (exact equality). */
    computeSharedVertexExact = (): Cyclotomic => {
        const first = this.polygons[0];
        const verts = first.exactVertices!;
        for (const v of verts) {
            if (this.polygons.every((p) => p.exactVertices!.some((v2) => v2.equals(v)))) return v;
        }
        return verts[0];
    }

    /** Exact vertices adjacent (one edge away) to the shared vertex. */
    private neighboringVerticesExact_compute = (): Cyclotomic[] => {
        const shared = this.computeSharedVertexExact();
        const result: Cyclotomic[] = [];
        for (const p of this.polygons) {
            const verts = p.exactVertices!;
            for (let i = 0; i < verts.length; i++) {
                const next = verts[(i + 1) % verts.length];
                if (next.equals(shared)) {
                    const cand = verts[i];
                    if (!result.some((r) => r.equals(cand))) result.push(cand);
                }
                const prev = verts[(i - 1 + verts.length) % verts.length];
                if (prev.equals(shared)) {
                    const cand2 = verts[i];
                    if (!result.some((r) => r.equals(cand2))) result.push(cand2);
                }
            }
        }
        return result;
    }

    rotateZeta = (origin: Cyclotomic, k: number): void => {
        for (const p of this.polygons) p.rotateZeta(origin, k);
        this.sharedVertex = this.computeSharedVertexExact().toVector();
    }

    translateExact = (t: Cyclotomic): void => {
        for (const p of this.polygons) p.translateExact(t);
        this.sharedVertex = this.computeSharedVertexExact().toVector();
    }

    mirrorZeta = (origin: Cyclotomic, axisK: number): void => {
        for (const p of this.polygons) p.mirrorZeta(origin, axisK);
        this.sharedVertex = this.computeSharedVertexExact().toVector();
    }
}

/**
 * Finds the adjacent vertex where two polygons meet (excluding the center at origin).
 * Returns the vertex position if found, null otherwise.
 */
const findAdjacentVertex = (polyA: Polygon, polyB: Polygon): Vector | null => {
    const origin = new Vector(0, 0);
    for (let i = 1; i < polyA.vertices.length; i++) {
        const v = polyA.vertices[i];
        if (isWithinTolerance(v, origin)) continue;
        const match = polyB.vertices.find(vb => isWithinTolerance(v, vb));
        if (match && !isWithinTolerance(match, origin)) return v.copy();
    }
    return null;
};

const checkMergeCompatibility = (
    vcA: VertexConfiguration,
    vcB: VertexConfiguration,
    a: PartialConfiguration,
    b: PartialConfiguration
): boolean => {
    const clonedB = vcB.clone();

    const dirA = Vector.sub(a.partialVertex, a.fullVertex).heading();
    const dirB = Vector.sub(b.partialVertex, b.fullVertex).heading();
    clonedB.rotate(b.fullVertex, dirA - dirB + Math.PI);
    clonedB.translate(Vector.sub(a.partialVertex, b.fullVertex));

    const newBPolygons: Polygon[] = [];
    for (const bp of clonedB.polygons) {
        if (!vcA.polygons.some(ap => isWithinTolerance(ap.centroid, bp.centroid))) {
            newBPolygons.push(bp);
        }
    }

    for (const ap of vcA.polygons) {
        for (const bp of newBPolygons) {
            if (ap.intersects(bp)) return false;
        }
    }

    return true;
}