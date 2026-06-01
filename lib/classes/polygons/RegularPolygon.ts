import { Polygon, PolygonType, Vector } from '@/classes';
import { Cyclotomic } from '../Cyclotomic';
import { isWithinTolerance, map } from '@/utils';

export class RegularPolygon extends Polygon {
    constructor(n: number) {
        super(n);
        this.interior_angle = Math.PI * (n - 2) / n;
        this.name = n.toString();
    }

    /**
     * Exact construction by boundary walk: start at the exact anchor with unit direction
     * ζ^{dirIndex}, step by one unit edge, turn by the exterior angle N/n each vertex. Every
     * vertex stays in ℤ[ζ_N]; requires n | N. The float cache is derived via toVector().
     */
    static fromAnchorAndDirExact = (n: number, anchorExact: Cyclotomic, dirIndex: number): RegularPolygon => {
        const ring = anchorExact.ring;
        const N = ring.N;
        if (N % n !== 0) {
            throw new Error(`RegularPolygon.fromAnchorAndDirExact: ${n} does not divide N=${N}`);
        }
        const turn = N / n; // exterior turn 2π/n in units of 2π/N
        const verts: Cyclotomic[] = [];
        const edgeDirs: number[] = [];
        let p = anchorExact;
        let dir = ((dirIndex % N) + N) % N;
        for (let i = 0; i < n; i++) {
            verts.push(p);
            edgeDirs.push(dir);
            p = p.add(Cyclotomic.zeta(ring, dir));
            dir = (dir + turn) % N;
        }
        const polygon = new RegularPolygon(n);
        polygon.setExactVertices(verts, edgeDirs);
        polygon.calculateHue();
        return polygon;
    }

    static fromCentroidAndAngle = (n: number, centroid: Vector, angle: number): RegularPolygon => {
        let polygon: RegularPolygon = new RegularPolygon(n);
        
        polygon.centroid = centroid;
        polygon.angle = angle;

        polygon.calculateVerticesFromCentroidAndAngle();
        polygon.calculateSides();
        polygon.calculateAngles();
        polygon.calculateHalfways();
        polygon.calculateHue();

        polygon.anchor = polygon.vertices[0].copy();
        polygon.dir = Vector.sub(polygon.vertices[1], polygon.vertices[0]);

        return polygon;
    }

    static fromAnchorAndDir = (n: number, anchor: Vector, dir: Vector): RegularPolygon => {
        const polygon: RegularPolygon = new RegularPolygon(n);
        
        polygon.anchor = anchor;
        polygon.dir = dir.copy();
        
        polygon.calculateVerticesFromAnchorAndDir();
        polygon.calculateSides();
        polygon.calculateAngles();
        polygon.calculateHalfways();
        polygon.calculateCentroid();
        polygon.calculateAngle();
        polygon.calculateHue();

        return polygon;
    }

    static fromVertices = (vertices: Vector[]): RegularPolygon => {
        const anchor = vertices[0].copy();
        const dir = Vector.sub(vertices[1], vertices[0]).copy();
        return RegularPolygon.fromAnchorAndDir(vertices.length, anchor, dir);
    }

    /**
     * Calculates the vertices of the polygon from the centroid and angle.
     * @note The vertices are generated in counter-clockwise order.
     */
    calculateVerticesFromCentroidAndAngle = () => {
        this.vertices = [];
        let radius = 0.5 / Math.sin(Math.PI / this.n);
        for (let i = 0; i < this.n; i++) {
            this.vertices.push(new Vector(
                this.centroid.x + radius * Math.cos(i * 2 * Math.PI / this.n + this.angle),
                this.centroid.y + radius * Math.sin(i * 2 * Math.PI / this.n + this.angle)
            ));
        }
    }

    /**
     * Calculates the vertices of the polygon from the anchor and direction.
     * @note The vertices are generated in counter-clockwise order.
     */
    calculateVerticesFromAnchorAndDir = () => {
        this.vertices = [this.anchor.copy()];
        let current_dir: Vector = this.dir.copy();
        for (let i = 1; i < this.n; i++) {
            const prev_vertex = this.vertices[this.vertices.length - 1];
            this.vertices.push(Vector.add(prev_vertex.copy(), current_dir.copy()));
            current_dir.rotate(Math.PI - this.interior_angle);
        }
    }

    calculateHue = () => {
        this.hue = map(Math.log(this.vertices.length), Math.log(3), Math.log(40), 0, 300);
    }

    getName = (coordinate: Vector | null = null): string => {
        if (!coordinate) return this.name;
        
        const vertex = this.vertices.find(v => isWithinTolerance(v, coordinate));
        if (!vertex) {
            console.error('Vertex not found');
            return '';
        }
    
        return this.name;
    }

    makeEmptyLike = (): RegularPolygon => new RegularPolygon(this.n);

    clone = (): RegularPolygon => {
        // Exact clone: copy the exact source of truth so no float round-trip occurs.
        if (this.exactVertices && this.edgeDirs) {
            const polygon = new RegularPolygon(this.n);
            polygon.setExactVertices(
                this.exactVertices.slice(),
                this.edgeDirs.slice()
            );
            polygon.calculateHue();
            return polygon;
        }
        const anchor = this.vertices[0].copy();
        const dir = Vector.sub(this.vertices[1], this.vertices[0]).copy().normalize();
        return RegularPolygon.fromAnchorAndDir(this.n, anchor, dir);
    }

    encode = (): Object => {
        const base: Record<string, unknown> = {
            type: PolygonType.REGULAR,
            n: this.n,
            vertices: this.vertices.map(v => v.encode()),
        };
        // Exact generator-level form (spec §6 / persistence): anchor + integer direction index.
        // Reconstructs every vertex exactly via the boundary walk — O(1) exact values, not per-vertex.
        if (this.exactVertices && this.edgeDirs) {
            base.anchor = this.exactVertices[0].encode();
            base.dir = this.edgeDirs[0];
        }
        return base;
    }
}