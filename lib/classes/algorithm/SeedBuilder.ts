import { SeedConfiguration } from './SeedConfiguration';
import { VertexConfiguration } from './VertexConfiguration';
import { Vector } from '../Vector';
import { Cyclotomic, getActiveRing, zetaIndexFromAngle } from '../Cyclotomic';
import type { Polygon } from '../polygons/Polygon';
import { deduplicatePolygons, isWithinTolerance, isWithinAngularTolerance } from '@/utils';

type PlacedVC = {
    center: Vector;
    neighboringVertices: Vector[];
    /** Exact neighbouring vertices, index-aligned with `neighboringVertices`. */
    neighboringVerticesExact: Cyclotomic[];
};

type BFSNode = {
    seed: SeedConfiguration;
    placedVCs: PlacedVC[];
    remaining: string[];
};

/** One geometric completion of an open vertex: the placed VC plus the polygons it adds to the
 *  patch. Two placements adding the SAME polygon set are the same completion (deduped), whatever
 *  (VC name, rotation) produced them — entropy counts completions, not placements. */
export type VertexCompletion = {
    vc: VertexConfiguration;
    addedPolygons: Polygon[];
};

const CANONICAL_PRECISION = 3;

/** Cached VC template: base VC at origin + precomputed neighboring vertices. */
type CachedVC = { vc: VertexConfiguration; neighboringVertices: Vector[] };

const mirrorVCNameCache = new Map<string, string>();

/** Returns the mirror (chiral opposite) VC name. Achiral VCs return the same name. Cached. */
function getMirrorVCName(name: string): string {
    let cached = mirrorVCNameCache.get(name);
    if (!cached) {
        const reversed = name.split(',').reverse().join(',');
        cached = VertexConfiguration.fromName(reversed).getName();
        mirrorVCNameCache.set(name, cached);
    }
    return cached;
}

/** True if the set has 2+ VCs that are all chiral-equivalent — effectively k=1, so skip to avoid k=2 output. */
function isChiralOnlySet(seedSet: string[]): boolean {
    if (seedSet.length <= 1) return false;
    const first = seedSet[0].split(',');
    for (let i = 1; i < seedSet.length; i++) {
        if (!vcNamesMatch(first, seedSet[i].split(','))) return false;
    }
    return true;
}

function vcNamesMatch(a: string[], b: string[]): boolean {
    const n = a.length;
    if (n !== b.length) return false;
    
    for (let i = 0; i < n; i++) {
        const rotated = a.slice(i).concat(a.slice(0, i));
        if (rotated.every((v, j) => v === b[j])) return true;
    }

    const reversed = a.slice().reverse();
    for (let i = 0; i < n; i++) {
        const rotated = reversed.slice(i).concat(reversed.slice(0, i));
        if (rotated.every((v, j) => v === b[j])) return true;
    }
    
    return false;
}

export class SeedBuilder {
    seedConfigurations: SeedConfiguration[] = [];
    /** Cache VertexConfiguration by name to avoid repeated fromName + computeNeighboringVertices. */
    private vcCache: Map<string, CachedVC> = new Map();

    constructor() {}

    private getCachedVC = (name: string): CachedVC => {
        let cached = this.vcCache.get(name);
        if (!cached) {
            const vc = VertexConfiguration.fromName(name);
            vc.computeNeighboringVertices();
            cached = { vc, neighboringVertices: vc.neighboringVertices.map((v) => v.copy()) };
            this.vcCache.set(name, cached);
        }
        return cached;
    };

    buildSeeds = (
        k: number,
        m: number,
        options?: {
            seedSetLoader?: (k: number, m: number) => string[][];
            onProgress?: (current: number, total: number, count: number) => void;
        }
    ): SeedConfiguration[] => {
        const { seedSetLoader, onProgress } = options ?? {};
        if (!seedSetLoader) {
            throw new Error('SeedBuilder.buildSeeds requires options.seedSetLoader (e.g. from run-pipeline)');
        }
        this.vcCache.clear();
        mirrorVCNameCache.clear();
        const seedSets = seedSetLoader(k, m);

        const seedConfigurations: SeedConfiguration[] = [];
        for (let i = 0; i < seedSets.length; i++) {
            if (isChiralOnlySet(seedSets[i])) continue;
            const before = seedConfigurations.length;
            seedConfigurations.push(...this.buildSeedsFromSet(seedSets[i]));
            onProgress?.(i + 1, seedSets.length, seedConfigurations.length - before);
        }

        return this.deduplicateSeeds(seedConfigurations);
    }

    buildSeedsFromSet = (seedSet: string[]): SeedConfiguration[] => {
        const initialNames = [seedSet[0], getMirrorVCName(seedSet[0])];
        const seenInitial = new Set<string>();

        const makeInitialNode = (name: string): BFSNode => {
            const vc = VertexConfiguration.fromName(name);
            vc.computeNeighboringVertices();
            const seed = new SeedConfiguration([vc]);
            const placedVCs: PlacedVC[] = [{
                center: new Vector(0, 0),
                neighboringVertices: vc.neighboringVertices.map((v) => v.copy()),
                neighboringVerticesExact: vc.neighboringVerticesExact.slice(),
            }];
            return { seed, placedVCs, remaining: seedSet.slice(1) };
        };

        if (seedSet.length === 1) {
            const results: SeedConfiguration[] = [];
            for (const name of initialNames) {
                if (seenInitial.has(name)) continue;
                seenInitial.add(name);
                const node = makeInitialNode(name);
                if (this.passesFinalVertexCheck(node, seedSet)) results.push(node.seed);
            }
            return results;
        }

        let currentLayer: BFSNode[] = [];
        for (const name of initialNames) {
            if (seenInitial.has(name)) continue;
            seenInitial.add(name);
            currentLayer.push(makeInitialNode(name));
        }

        while (currentLayer.length > 0) {
            const nextLayer: BFSNode[] = [];

            for (const node of currentLayer) {
                nextLayer.push(...this.expandNode(node, seedSet));
            }

            if (nextLayer.length === 0) return [];

            currentLayer = this.deduplicateLayer(nextLayer);

            if (currentLayer[0].remaining.length === 0) break;
        }

        // Final vertex check: filter out seeds that fail the adjacent-vertex validation
        currentLayer = currentLayer.filter(node => this.passesFinalVertexCheck(node, seedSet));
        return currentLayer.map(node => node.seed);
    }

    /** Place a VC (built at the origin) exactly: rotate by the on-grid angle (snapped to an
     *  integer ζ-step) then translate so its shared vertex lands on the exact target. */
    private placeVCExact = (vc: VertexConfiguration, rotation: number, target: Cyclotomic): void => {
        const ring = target.ring;
        const k = zetaIndexFromAngle(rotation, ring.N);
        vc.rotateZeta(Cyclotomic.ZERO(ring), k);
        vc.translateExact(target);
    };

    private expandNode = (node: BFSNode, seedSet: string[]): BFSNode[] => {
        const { seed, placedVCs, remaining } = node;
        const children: BFSNode[] = [];

        const availableVertices = this.computeAvailableVertices(placedVCs);

        // Forward Checking: if any open vertex has entropy 0 (no VC from the full set can fit), prune this branch
        for (const { vertex, vertexExact, directions } of availableVertices) {
            if (!this.canAnyVCFitAtVertex(vertex, vertexExact, directions, seed, seedSet)) {
                return [];
            }
        }
        const seedCount = seed.polygons.length;

        for (const { vertex: v, vertexExact: vExact, directions } of availableVertices) {
            const triedNames = new Set<string>();

            for (let i = 0; i < remaining.length; i++) {
                const vcName = remaining[i];
                const mirrorName = getMirrorVCName(vcName);
                const namesToTry = [vcName, mirrorName].filter((n) => !triedNames.has(n));
                for (const nameToTry of namesToTry) triedNames.add(nameToTry);

                for (const nameToTry of namesToTry) {
                    const { vc: templateVC, neighboringVertices } = this.getCachedVC(nameToTry);

                    const triedRotations = new Set<string>();

                    for (const dirCtoV of directions) {
                        for (const nv of neighboringVertices) {
                            const rotation = dirCtoV - nv.heading() + Math.PI;
                            const normalizedRot = (rotation + 2 * Math.PI) % (2 * Math.PI);
                            const rotKey = normalizedRot.toFixed(4);
                            if (triedRotations.has(rotKey)) continue;
                            triedRotations.add(rotKey);

                            const clonedVC = templateVC.clone();
                            this.placeVCExact(clonedVC, rotation, vExact);
                            clonedVC.computeNeighboringVertices();

                            const vcCount = clonedVC.polygons.length;
                            const mergedPolygons = deduplicatePolygons([...seed.polygons, ...clonedVC.polygons]);
                            if (mergedPolygons.length === seedCount + vcCount) continue;

                            const newSeed = new SeedConfiguration([...seed.vertexConfigurations, clonedVC]);
                            if (newSeed.isValid()) {
                                const newPlacedVCs: PlacedVC[] = [
                                    ...placedVCs,
                                    {
                                        center: v.copy(),
                                        neighboringVertices: clonedVC.neighboringVertices.map((nv) => nv.copy()),
                                        neighboringVerticesExact: clonedVC.neighboringVerticesExact.slice(),
                                    },
                                ];
                                const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
                                children.push({
                                    seed: newSeed,
                                    placedVCs: newPlacedVCs,
                                    remaining: newRemaining,
                                });
                            }
                        }
                    }
                }
            }
        }

        return children;
    }

    /**
     * Forward Checking: tests whether at least one of the k original VCs can fit at this open vertex.
     * Uses the FULL seed set (all k VCs), not just remaining—an open vertex may host another copy
     * of an already-placed orbit in the infinite tiling.
     */
    private canAnyVCFitAtVertex = (
        vertex: Vector,
        vertexExact: Cyclotomic,
        directions: number[],
        seed: SeedConfiguration,
        allVCNames: string[]
    ): boolean => {
        return this.enumerateVertexCompletions(vertex, vertexExact, directions, seed, allVCNames, 1).length > 0;
    };

    /**
     * Enumerate the distinct geometric completions of an open vertex, up to `max`. The single
     * audited completion enumerator: `canAnyVCFitAtVertex` is `max=1` (the entropy-0 test), the
     * lookahead scout uses `max=2` to classify entropy 0 / 1 / ≥2. Same search as the historical
     * forward check: full seed set + mirrors, every frontier direction, every on-grid rotation,
     * exact placement, float-tolerance merge + validity. Distinctness is by ADDED polygon set
     * (a completion reachable via two (name, rotation) routes counts once).
     */
    enumerateVertexCompletions = (
        vertex: Vector,
        vertexExact: Cyclotomic,
        directions: number[],
        seed: SeedConfiguration,
        allVCNames: string[],
        max: number = Number.POSITIVE_INFINITY
    ): VertexCompletion[] => {
        const effectiveNames = new Set<string>();
        for (const n of allVCNames) {
            effectiveNames.add(n);
            effectiveNames.add(getMirrorVCName(n));
        }

        const seedCount = seed.polygons.length;
        const completions: VertexCompletion[] = [];
        const seenAdded = new Set<string>();

        for (const vcName of effectiveNames) {
            const { vc: templateVC, neighboringVertices } = this.getCachedVC(vcName);
            const triedRotations = new Set<string>();

            for (const dirCtoV of directions) {
                for (const nv of neighboringVertices) {
                    const rotation = dirCtoV - nv.heading() + Math.PI;
                    const normalizedRot = (rotation + 2 * Math.PI) % (2 * Math.PI);
                    const rotKey = normalizedRot.toFixed(4);
                    if (triedRotations.has(rotKey)) continue;
                    triedRotations.add(rotKey);

                    const clonedVC = templateVC.clone();
                    this.placeVCExact(clonedVC, rotation, vertexExact);
                    clonedVC.computeNeighboringVertices();

                    const vcCount = clonedVC.polygons.length;
                    const mergedPolygons = deduplicatePolygons([...seed.polygons, ...clonedVC.polygons]);
                    if (mergedPolygons.length === seedCount + vcCount) continue;

                    const newSeed = new SeedConfiguration([...seed.vertexConfigurations, clonedVC]);
                    if (!newSeed.isValid()) continue;

                    // deduplicatePolygons keeps first occurrences (the seed's), so the tail is
                    // exactly the polygons this placement adds.
                    const addedPolygons = mergedPolygons.slice(seedCount);
                    const addedKey = addedPolygons
                        .map((p) => (p.hasExact() ? p.exactKey() : `${p.getName()}@${p.centroid.x.toFixed(6)},${p.centroid.y.toFixed(6)}`))
                        .sort()
                        .join('|');
                    if (seenAdded.has(addedKey)) continue;
                    seenAdded.add(addedKey);

                    completions.push({ vc: clonedVC, addedPolygons });
                    if (completions.length >= max) return completions;
                }
            }
        }
        return completions;
    };

    /** Remove duplicate seeds from the final output (e.g. from chiral seed sets producing same seeds). */
    private deduplicateSeeds = (seeds: SeedConfiguration[]): SeedConfiguration[] => {
        const seen = new Map<string, SeedConfiguration>();
        for (const seed of seeds) {
            const key = this.computeCanonicalForm(seed);
            if (!seen.has(key)) seen.set(key, seed);
        }
        return Array.from(seen.values());
    };

    private deduplicateLayer = (nodes: BFSNode[]): BFSNode[] => {
        const seen = new Map<string, BFSNode>();

        for (const node of nodes) {
            const remainingKey = [...node.remaining].sort().join('\0');
            const canonical = this.computeCanonicalForm(node.seed);
            const key = remainingKey + '|' + canonical;

            if (!seen.has(key)) {
                seen.set(key, node);
            }
        }

        return Array.from(seen.values());
    }

    private computeCanonicalForm = (seed: SeedConfiguration): string => {
        const polygons = seed.polygons;
        const n = polygons.length;
        if (n === 0) return '';

        const exact = polygons.every((p) => p.hasExact());
        const P = CANONICAL_PRECISION;
        const profiles: string[] = new Array(n);

        for (let i = 0; i < n; i++) {
            const neighbors: string[] = new Array(n - 1);
            let k = 0;
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                // Exact: hash the EXACT squared distance |cᵢ − cⱼ|² (real, exact — z·conj(z)),
                // not a rounded float distance. Boundary-safe, no drift.
                const dist = exact
                    ? polygons[i].exactCentroid!.sub(polygons[j].exactCentroid!).normSquared().key()
                    : polygons[i].centroid.distance(polygons[j].centroid).toFixed(P);
                neighbors[k++] = polygons[j].getName() + '@' + dist;
            }
            neighbors.sort();
            profiles[i] = polygons[i].getName() + ':' + neighbors.join(',');
        }

        profiles.sort();
        return profiles.join('|');
    }

    /**
     * Final check on vertices adjacent to placed VC centers.
     * - If surrounded: emerging VC must match one in the seed set.
     * - If open: at least one VC from the set must fit.
     */
    private passesFinalVertexCheck = (node: BFSNode, seedSet: string[]): boolean => {
        const availableVertices = this.computeAvailableVertices(node.placedVCs);

        for (const { vertex, vertexExact, directions } of availableVertices) {
            const polygonsAtVertex = this.getPolygonsAtVertex(vertex, node.seed.polygons);
            const angleSum = polygonsAtVertex.reduce((sum, p) => sum + p.getAngleAtVertex(vertex), 0);
            const isSurrounded = isWithinAngularTolerance(angleSum, 2 * Math.PI);

            if (isSurrounded) {
                const emergingVCName = this.getEmergingVCNameAtVertex(vertex, polygonsAtVertex);
                if (emergingVCName === null) return false;
                if (!this.isVCNameInSet(emergingVCName, seedSet)) return false;
            } else {
                if (!this.canAnyVCFitAtVertex(vertex, vertexExact, directions, node.seed, seedSet)) return false;
            }
        }
        return true;
    };

    private getPolygonsAtVertex = (vertex: Vector, polygons: Polygon[]): Polygon[] => {
        return polygons.filter((p) => p.vertices.some((v) => isWithinTolerance(v, vertex)));
    };

    private getEmergingVCNameAtVertex = (vertex: Vector, polygons: Polygon[]): string | null => {
        if (polygons.length === 0) return null;
        // VertexConfiguration.getName canonicalizes over ROTATIONS of the polygon LIST order — it
        // assumes the list is in cyclic angular order around the shared vertex. The incident set
        // arrives here in seed.polygons FILTER order, so without sorting, a faithful surrounded
        // vertex can be mis-named (e.g. true cyclic order 3,3,4,12 named as 3,4,3,12) and the
        // whole seed set silently rejected by passesFinalVertexCheck — this dropped the only seed
        // able to produce Galebach t3007 (NOTES §29). Sort by centroid heading around the vertex
        // first (same pattern as TilingChecker).
        const ordered = polygons
            .slice()
            .sort((a, b) => Vector.sub(a.centroid, vertex).heading() - Vector.sub(b.centroid, vertex).heading());
        const vc = new VertexConfiguration(ordered);
        return vc.getName();
    };

    /** Check if a VC name matches any in the set (considering rotation and chirality). */
    private isVCNameInSet = (emergingName: string, seedSet: string[]): boolean => {
        const emerging = emergingName.split(',');
        for (const seedName of seedSet) {
            const seed = seedName.split(',');
            if (emerging.length !== seed.length) continue;
            if (this.vcNamesMatch(emerging, seed)) return true;
        }
        return false;
    };

    private vcNamesMatch = (a: string[], b: string[]): boolean => {
        const n = a.length;
        for (let i = 0; i < n; i++) {
            const rotated = a.slice(i).concat(a.slice(0, i));
            if (rotated.every((v, j) => v === b[j])) return true;
        }
        const reversed = a.slice().reverse();
        for (let i = 0; i < n; i++) {
            const rotated = reversed.slice(i).concat(reversed.slice(0, i));
            if (rotated.every((v, j) => v === b[j])) return true;
        }
        return false;
    };

    computeAvailableVertices = (
        placedVCs: PlacedVC[]
    ): { vertex: Vector; vertexExact: Cyclotomic; directions: number[] }[] => {
        const available: { vertex: Vector; vertexExact: Cyclotomic; directions: number[] }[] = [];

        for (const pvc of placedVCs) {
            for (let i = 0; i < pvc.neighboringVertices.length; i++) {
                const v = pvc.neighboringVertices[i];
                const vExact = pvc.neighboringVerticesExact[i];
                if (placedVCs.some((other) => isWithinTolerance(v, other.center))) continue;

                let entry = available.find((av) => isWithinTolerance(av.vertex, v));
                if (!entry) {
                    entry = { vertex: v.copy(), vertexExact: vExact, directions: [] };
                    available.push(entry);
                }
                const dirCtoV = Vector.sub(v, pvc.center).heading();
                entry.directions.push(dirCtoV);
            }
        }

        return available;
    }

}