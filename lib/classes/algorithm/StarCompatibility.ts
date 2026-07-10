/**
 * Star VC edge-adjacency relation + seed-set enumeration — the exact-arithmetic analog of the regular
 * `generateVCsWithCompatibilityGraph` (pipeline-core.ts) → `SeedSetExtractor` path, kept OUT of the
 * float `VertexConfiguration`/`SeedBuilder` front-end (StarVC.ts §1: that front-end reintroduces float
 * on the decisive star path and its exact `fromName` branch is gated to all-regular VCs). Instead:
 *
 *   enumerateStarVCs(includeStarFree) → generateStarVCCompatibility → starSeedSets(k)
 *
 * The adjacency primitive is `placeStarVCPair` (StarVC.ts): two VCs are compatible iff their fans admit
 * ≥1 admissible edge-gluing (shared tile, no proper overlap) — the merge-search, sound by
 * `exactPolygonsOverlap`. `starSeedSets` ports `SeedSetExtractor.findSeedSets` verbatim (connected
 * sub-multisets up to size k, with-replacement padding) but over VC NAMES rather than a
 * `CompatibilityGraph` instance, so no float VertexConfiguration objects are constructed.
 *
 * CERTIFIED-CORRECT, not complete: `placeStarVCPair` is a sound necessary-condition search (every edge
 * it reports is a real edge-to-edge adjacency), but it is not claimed to find every gluing. A missing
 * edge can only DROP a candidate seed-set, never admit a wrong one — a completeness gap to log, not a
 * soundness break.
 */
import type { Cyclotomic } from '../Cyclotomic';
import { placeStarVCPair, type StarVC } from './StarVC';

export type StarCompatibility = {
	/** All distinct VC names, sorted — the graph's node set. */
	vcNames: string[];
	/** Undirected, name-keyed adjacency (both directions present), same shape as the regular
	 *  `generateVCsWithCompatibilityGraph` output. */
	adjacencyList: Record<string, string[]>;
};

/**
 * Build the star VC compatibility graph. For every unordered pair of distinct VCs, mark an edge iff a
 * merge-search gluing exists in EITHER orientation (A-at-origin or B-at-origin — the origin sweep alone
 * can miss the gluing that closes). Existence only, so `maxSeeds=1` per probe. Self-pairs are not
 * emitted: `starSeedSets` never forms `{a,a}` (matching `SeedSetExtractor`), and no in-ring target fig
 * has two identical orbits.
 */
export function generateStarVCCompatibility(
	vcs: StarVC[],
	ring: Cyclotomic['ring'],
): StarCompatibility {
	const byName = new Map<string, StarVC>();
	for (const vc of vcs) if (!byName.has(vc.name)) byName.set(vc.name, vc);
	const vcNames = [...byName.keys()].sort();

	const adjacencyList: Record<string, string[]> = {};
	for (const n of vcNames) adjacencyList[n] = [];

	for (let i = 0; i < vcNames.length; i++) {
		for (let j = i + 1; j < vcNames.length; j++) {
			const a = byName.get(vcNames[i])!;
			const b = byName.get(vcNames[j])!;
			const compatible =
				placeStarVCPair(a, b, ring, 1).length > 0 || placeStarVCPair(b, a, ring, 1).length > 0;
			if (compatible) {
				adjacencyList[vcNames[i]].push(vcNames[j]);
				adjacencyList[vcNames[j]].push(vcNames[i]);
			}
		}
	}
	for (const n of vcNames) adjacencyList[n].sort();
	return { vcNames, adjacencyList };
}

/** True iff `{a,b}` is an edge of the compatibility graph. */
export function areStarVCsCompatible(compat: StarCompatibility, a: string, b: string): boolean {
	return (compat.adjacencyList[a] ?? []).includes(b);
}

function combinationsWithReplacement<T>(elements: T[], count: number): T[][] {
	if (count === 0) return [[]];
	if (elements.length === 0) return [];
	const [first, ...rest] = elements;
	const combs: T[][] = [];
	for (let i = 0; i <= count; i++) {
		for (const tail of combinationsWithReplacement(rest, count - i)) {
			combs.push([...Array(i).fill(first), ...tail]);
		}
	}
	return combs;
}

/**
 * Enumerate k-VC seed-sets from the compatibility graph — connected sub-multisets of up to k VCs, with
 * the leftover slots filled by combinations-with-replacement from the connected core (a k-uniform seed
 * may repeat a VC type). A verbatim port of `SeedSetExtractor.findSeedSets` operating on VC names.
 * Topology-agnostic: identical logic for regular and star graphs.
 */
export function starSeedSets(compat: StarCompatibility, k: number): string[][] {
	const { vcNames, adjacencyList } = compat;
	const indexOf = new Map<string, number>();
	vcNames.forEach((n, i) => indexOf.set(n, i));
	const graph = new Map<number, number[]>();
	for (const n of vcNames) graph.set(indexOf.get(n)!, adjacencyList[n].map((m) => indexOf.get(m)!));

	const subgraphs = new Set<string>();
	const validSubgraphs: number[][] = [];

	const findSubgraphs = (currentSubset: number[], neighbors: Set<number>) => {
		const key = [...currentSubset].sort((a, b) => a - b).join(',');
		if (subgraphs.has(key)) return;
		subgraphs.add(key);
		validSubgraphs.push([...currentSubset]);
		if (currentSubset.length >= k) return;
		for (const neighbor of neighbors) {
			if (currentSubset.includes(neighbor)) continue;
			const newSubset = [...currentSubset, neighbor];
			const newNeighbors = new Set(neighbors);
			for (const edge of graph.get(neighbor) ?? []) newNeighbors.add(edge);
			findSubgraphs(newSubset, newNeighbors);
		}
	};
	for (const [node, edges] of graph.entries()) findSubgraphs([node], new Set(edges));

	const seedSets: string[][] = [];
	const seen = new Set<string>();
	const emit = (indices: number[]) => {
		const names = indices.map((i) => vcNames[i]).sort();
		const dedupKey = names.join('|');
		if (seen.has(dedupKey)) return;
		seen.add(dedupKey);
		seedSets.push(names);
	};
	for (const subgraph of validSubgraphs) {
		const m = subgraph.length;
		if (m > 1) {
			for (const dist of combinationsWithReplacement(subgraph, k - m)) emit([...subgraph, ...dist]);
		} else if (k === 1) {
			emit(subgraph);
		}
	}
	return seedSets;
}
