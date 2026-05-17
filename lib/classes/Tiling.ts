import { type Polygon, Vector, type Gyration, type Reflection, type GlideReflection } from '@/classes';
import type { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { islamicAnglesForHalfways } from '@/utils/islamicNoise';
import { tolerance } from "@/utils/tolerance";
import { useConfiguration } from "@/stores/configuration";
import { sortPointsByAngleAndDistance, isWithinTolerance, deduplicatePolygons, vertexFigureHue } from '@/utils';

export type VCWithOccurrences = { vc: VertexConfiguration; occurrences: number };

export class Tiling {
    nodes: Polygon[];
    anchorNodes: Polygon[];
    vcs: VCWithOccurrences[] = [];
    newLayerNodes: Polygon[];
    seedNodes: Polygon[];
    coreNode: Polygon | null;

    // tiling check
    translationalCellBasis: [Vector, Vector] | null = null;
    originPolygon: Polygon | null = null;
    gyrations: Gyration[] | null = null;
    reflections: Reflection[] | null = null;
    glideReflections: GlideReflection[] | null = null;

    constructor() {
        this.nodes = [];
        this.anchorNodes = [];

        this.newLayerNodes = [];
        this.seedNodes = [];
        this.coreNode = null;
    }

    show = (ctx, showPolygonPoints: boolean, opacity: number = 1, circlePacking: boolean = false): void => {
        const lineWidthValue = useConfiguration.getState().lineWidth;
        if (lineWidthValue > 1) {
            ctx.strokeWeight(lineWidthValue / useConfiguration.getState().controls.zoom);
            ctx.stroke(0, 0, 0);
        } else if (lineWidthValue === 0) {
            ctx.noStroke();
        } else {
            ctx.strokeWeight(1 / useConfiguration.getState().controls.zoom);
            ctx.stroke(0, 0, 0, lineWidthValue);
        }

        if (circlePacking) {
            for (let i = 0; i < this.nodes.length; i++) {
                const node = this.nodes[i];
                const radius = node.halfways?.length > 0
                    ? Vector.distance(node.centroid, node.halfways[0])
                    : 0;
                if (radius > 0) {
                    ctx.fill(node.hue, 40, 100 / opacity, 0.80 * opacity);
                    ctx.ellipse(node.centroid.x, node.centroid.y, radius * 2, radius * 2);
                }
            }
        } else {
            if (useConfiguration.getState().isIslamic) {
                this.drawIslamicVertexRegions(ctx, opacity);
            }
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].show(ctx, showPolygonPoints, null, opacity);
            }
        }
        
        const showDualConnectionsValue = useConfiguration.getState().showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx);
    }

    showGraph = (ctx): void => {
        this.show(ctx, false, 0.5);

        const zoom = useConfiguration.getState().controls.zoom;
        ctx.push();
        ctx.stroke(0, 0, 100);
        ctx.strokeWeight(2 / zoom);

        const seen = new Set<string>();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            for (const neighbor of node.neighbors ?? []) {
                const j = this.nodes.indexOf(neighbor);
                if (j < 0) continue;
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                ctx.line(
                    node.centroid.x,
                    node.centroid.y,
                    neighbor.centroid.x,
                    neighbor.centroid.y
                );
            }
        }

        ctx.noStroke();
        ctx.fill(0, 0, 100);
        const r = 4 / zoom;
        for (const node of this.nodes) {
            ctx.ellipse(node.centroid.x, node.centroid.y, r, r);
        }
        ctx.pop();
    }

    drawConstructionPoints = (ctx): void => {
        let uniqueCentroids: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            if (!uniqueCentroids.some(c => isWithinTolerance(c, anchorNode.centroid)))
                uniqueCentroids.push(anchorNode.centroid);
        let uniqueCentroidsSorted = sortPointsByAngleAndDistance(uniqueCentroids);
        uniqueCentroidsSorted = uniqueCentroidsSorted.filter(centroid => !isWithinTolerance(centroid, new Vector()));

        let uniqueHalfways: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            for (let halfway of anchorNode.halfways)
                if (!uniqueHalfways.some(h => isWithinTolerance(h, halfway)))
                    uniqueHalfways.push(halfway);
        let uniqueHalfwaysSorted = sortPointsByAngleAndDistance(uniqueHalfways);

        let uniqueVertices: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            for (let vertex of anchorNode.vertices)
                if (!uniqueVertices.some(v => isWithinTolerance(v, vertex)))
                    uniqueVertices.push(vertex);
        let uniqueVerticesSorted = sortPointsByAngleAndDistance(uniqueVertices);


        let offset = new Vector(6 / useConfiguration.getState().controls.zoom, 0 / useConfiguration.getState().controls.zoom)
        let pointSize = 6 / useConfiguration.getState().controls.zoom

        ctx.scale(1, -1);
        ctx.textSize(18 / useConfiguration.getState().controls.zoom);
        ctx.fill(0, 0, 100);
        ctx.stroke(0, 0, 0);

        ctx.strokeWeight(1 / useConfiguration.getState().controls.zoom);

        for (let i in uniqueCentroidsSorted)
            ctx.ellipse(uniqueCentroidsSorted[i].x, -uniqueCentroidsSorted[i].y, pointSize);

        for (let i in uniqueHalfwaysSorted)
            ctx.ellipse(uniqueHalfwaysSorted[i].x, -uniqueHalfwaysSorted[i].y, pointSize);

        for (let i in uniqueVerticesSorted)
            ctx.ellipse(uniqueVerticesSorted[i].x, -uniqueVerticesSorted[i].y, pointSize);

        ctx.strokeWeight(3 / useConfiguration.getState().controls.zoom);

        for (let i in uniqueCentroidsSorted)
            ctx.text('c' + (i + 1), uniqueCentroidsSorted[i].x + offset.x, -uniqueCentroidsSorted[i].y + offset.y);

        for (let i in uniqueHalfwaysSorted)
            ctx.text('h' + (i + 1), uniqueHalfwaysSorted[i].x + offset.x, -uniqueHalfwaysSorted[i].y + offset.y);

        for (let i in uniqueVerticesSorted)
            ctx.text('v' + (i + 1), uniqueVerticesSorted[i].x + offset.x, -uniqueVerticesSorted[i].y + offset.y);

        
        const showDualConnectionsValue = useConfiguration.getState().showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx, true);
    }

    drawIslamicVertexRegions = (ctx, opacity: number = 1): void => {
        const cfg = useConfiguration.getState();
        const animate = cfg.islamicAnimate;
        const baseAngle = cfg.islamicAngle * Math.PI / 180;

        const tipsCache = new Map<Polygon, Vector[]>();
        const getTips = (tile: Polygon): Vector[] => {
            let t = tipsCache.get(tile);
            if (!t) {
                let angle: number | number[] = baseAngle;
                if (animate) {
                    angle = islamicAnglesForHalfways(ctx, tile.halfways);
                }
                t = tile.calculateIslamicTips(angle);
                tipsCache.set(tile, t);
            }
            return t;
        };

        const QUANT = 1e5;
        const keyOf = (v: Vector) => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;

        type Corner = { tile: Polygon; cornerIdx: number; position: Vector };
        const fans = new Map<string, Corner[]>();
        for (const tile of this.nodes) {
            if (!tile.vertices || !tile.halfways) continue;
            for (let ci = 0; ci < tile.vertices.length; ci++) {
                const v = tile.vertices[ci];
                const key = keyOf(v);
                let arr = fans.get(key);
                if (!arr) { arr = []; fans.set(key, arr); }
                arr.push({ tile, cornerIdx: ci, position: v });
            }
        }

        ctx.push();
        ctx.noStroke();

        for (const corners of fans.values()) {
            if (corners.length < 2) continue;

            const V = corners[0].position;

            const withAngle = corners.map(c => ({
                c,
                ang: Math.atan2(c.tile.centroid.y - V.y, c.tile.centroid.x - V.x),
            }));
            withAngle.sort((a, b) => a.ang - b.ang);
            const ordered = withAngle.map(w => w.c);

            let interiorSum = 0;
            let interiorOk = true;
            for (const c of ordered) {
                const a = c.tile.angles?.[c.cornerIdx];
                if (typeof a === 'number' && isFinite(a)) interiorSum += a;
                else { interiorOk = false; break; }
            }
            if (!interiorOk) continue;
            if (Math.abs(interiorSum - 2 * Math.PI) > 1e-3) continue;

            type Arms = { ccwArm: Vector; cwArm: Vector; tip: Vector };
            const armsOf = (c: Corner): Arms => {
                const n = c.tile.halfways.length;
                const hPrev = c.tile.halfways[(c.cornerIdx - 1 + n) % n];
                const hNext = c.tile.halfways[c.cornerIdx];
                const tip = getTips(c.tile)[(c.cornerIdx - 1 + n) % n];
                const tc = c.tile.centroid;
                const tcx = tc.x - V.x, tcy = tc.y - V.y;
                const px = hPrev.x - V.x, py = hPrev.y - V.y;
                const crossPrev = tcx * py - tcy * px;
                if (crossPrev > 0) return { ccwArm: hPrev, cwArm: hNext, tip };
                return { ccwArm: hNext, cwArm: hPrev, tip };
            };

            const armsArr = ordered.map(armsOf);
            const hue = vertexFigureHue(ordered.map(c => c.tile.n));

            ctx.fill(hue, 40, 100 / opacity, 0.80 * opacity);
            ctx.beginShape();
            for (let i = 0; i < ordered.length; i++) {
                ctx.vertex(armsArr[i].cwArm.x, armsArr[i].cwArm.y);
                ctx.vertex(armsArr[i].tip.x, armsArr[i].tip.y);
            }
            ctx.endShape(ctx.CLOSE);
        }

        ctx.pop();
    }

    drawDualConnections = (ctx, flipY = false): void => {
        const zoom = useConfiguration.getState().controls.zoom;
        ctx.push();
        ctx.strokeWeight(2 / zoom);
        ctx.stroke(0, 0, 100, 0.9);
        ctx.fill(0, 0, 100);

        const seen = new Set<string>();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            for (const neighbor of node.edgeNeighbors ?? []) {
                const j = this.nodes.indexOf(neighbor);
                if (j < 0) continue;
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                ctx.line(
                    node.centroid.x,
                    flipY ? -node.centroid.y : node.centroid.y,
                    neighbor.centroid.x,
                    flipY ? -neighbor.centroid.y : neighbor.centroid.y
                );
            }
        }

        ctx.noStroke();
        const r = 4 / zoom;
        for (const node of this.nodes) {
            ctx.ellipse(
                node.centroid.x,
                flipY ? -node.centroid.y : node.centroid.y,
                r,
                r
            );
        }
        ctx.pop();
    }

    rotate = (origin: Vector, angle: number): void => {
        for (let node of this.nodes) {
            node.rotate(origin, angle);
        }
    }

    static rotate = (tiling: Tiling, origin: Vector, angle: number): Tiling => {
        const rotatedTiling: Tiling = tiling.clone();
        rotatedTiling.rotate(origin, angle);
        return rotatedTiling;
    }

    reflect = (axis: Vector, point: Vector): void => {
        for (let node of this.nodes) {
            node.mirror(point, axis);
        }
    }

    static reflect = (tiling: Tiling, axis: Vector, point: Vector): Tiling => {
        const reflectedTiling: Tiling = tiling.clone();
        reflectedTiling.reflect(axis, point);
        return reflectedTiling;
    }

    translate = (vector: Vector): void => {
        for (let node of this.nodes) {
            node.translate(vector);
        }
    }

    static translate = (tiling: Tiling, vector: Vector): Tiling => {
        const translatedTiling: Tiling = tiling.clone();
        translatedTiling.translate(vector);
        return translatedTiling;
    }

    clone = (): Tiling => {
        const newTiling: Tiling = new Tiling();
        newTiling.nodes = this.nodes.map(node => node.clone());
        newTiling.anchorNodes = this.anchorNodes.map(node => node.clone());
        return newTiling;
    }

    static merge = (tilingA: Tiling, tilingB: Tiling, tol: number = tolerance): Tiling => {
        const mergedTiling: Tiling = tilingA.clone();
        mergedTiling.nodes.push(...tilingB.nodes);
        mergedTiling.nodes = deduplicatePolygons(mergedTiling.nodes, tol);
        return mergedTiling;
    }

    isEquivalent = (other: Tiling, tol: number = tolerance): boolean => {
        if (!other) return false;

        const mergedTiling: Tiling = Tiling.merge(this, other, tol);

        for (let i = 0; i < mergedTiling.nodes.length - 1; i++) {
            const polygon = mergedTiling.nodes[i];
            for (let j = i + 1; j < mergedTiling.nodes.length; j++) {
                const otherPolygon = mergedTiling.nodes[j];
                if (polygon.intersects(otherPolygon, tol)) {
                    return false;
                }
            }
        }

        return true;
    }

    showNeighbors = (ctx, showPolygonPoints: boolean): void => {
        const lineWidthValue = useConfiguration.getState().lineWidth;
        if (lineWidthValue > 1) {
            ctx.strokeWeight(lineWidthValue / useConfiguration.getState().controls.zoom);
            ctx.stroke(0, 0, 0);
        } else if (lineWidthValue === 0) {
            ctx.noStroke();
        } else {
            ctx.strokeWeight(1 / useConfiguration.getState().controls.zoom);
            ctx.stroke(0, 0, 0, lineWidthValue);
        }
        
        const mouseWorldX = (ctx.mouseX - ctx.width / 2) / useConfiguration.getState().controls.zoom;
        const mouseWorldY = (-ctx.mouseY + ctx.height / 2) / useConfiguration.getState().controls.zoom;
        const mousePoint = new Vector(mouseWorldX, mouseWorldY);
        
        for (let node of this.nodes) {
            if (node.containsPoint(mousePoint)) {
                node.show(ctx, showPolygonPoints, ctx.color(0, 0, 100));

                for (let neighbor of node.neighbors) {
                    neighbor.show(ctx, showPolygonPoints, ctx.color(240, 100, 100, 0.5));
                    ctx.line(
                        node.centroid.x,
                        node.centroid.y,
                        neighbor.centroid.x,
                        neighbor.centroid.y
                    );
                    ctx.ellipse(
                        neighbor.centroid.x,
                        neighbor.centroid.y,
                        1/5,
                        1/5
                    );
                }

                ctx.fill(0, 0, 0);
                ctx.ellipse(
                    node.centroid.x,
                    node.centroid.y,
                    1/5,
                    1/5
                );
            }
        }
        
        const showDualConnectionsValue = useConfiguration.getState().showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx);
    }

    exportGraph = () => {
        let graph = {
            n: this.nodes.length,
            edges: []
        };
        
        const nodeMap = new Map();
        this.nodes.forEach((node, index) => {
            nodeMap.set(node, index);
        });
        
        this.nodes.forEach((node, nodeIndex) => {
            if (node.neighbors && node.neighbors.length > 0) {
                node.neighbors.forEach(neighbor => {
                    const neighborIndex = nodeMap.get(neighbor);
                    if (neighborIndex !== undefined) {
                        const edgeExists = graph.edges.some(e => 
                            (e.source === nodeIndex && e.target === neighborIndex) || 
                            (e.source === neighborIndex && e.target === nodeIndex)
                        );
                        
                        if (!edgeExists) {
                            graph.edges.push({
                                source: nodeIndex,
                                target: neighborIndex,
                                type: 'neighbor'
                            });
                        }
                    }
                });
            }
        });
        
        const jsonData = JSON.stringify(graph, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tiling-graph.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return graph;
    }
}