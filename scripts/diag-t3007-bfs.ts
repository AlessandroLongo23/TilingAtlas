/* Probe 4: instrument SeedBuilder's BFS for [3,12,12;3,3,4,12;3,4,6,4] — which layer/check kills it.
 * Accesses private members via `as any` (diagnostic only).
 *   pnpm tsx scripts/diag-t3007-bfs.ts
 */
import { SeedBuilder, SeedConfiguration, VertexConfiguration, PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { Vector } from '@/classes/Vector';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const seedSet = ['3,12,12', '3,3,4,12', '3,4,6,4'];
const builder = new SeedBuilder() as any;

function makeInitialNode(name: string, set: string[]) {
	const vc = VertexConfiguration.fromName(name);
	vc.computeNeighboringVertices();
	const seed = new SeedConfiguration([vc]);
	return {
		seed,
		placedVCs: [{
			center: new Vector(0, 0),
			neighboringVertices: vc.neighboringVertices.map((v: Vector) => v.copy()),
			neighboringVerticesExact: vc.neighboringVerticesExact.slice(),
		}],
		remaining: set.slice(1),
	};
}

const node0 = makeInitialNode(seedSet[0], seedSet);
console.log(`layer0: 1 node (${seedSet[0]}), remaining=[${node0.remaining}]`);

const layer1 = builder.expandNode(node0, seedSet);
console.log(`layer1 (place 2nd VC): ${layer1.length} children`);
const summary = new Map<string, number>();
for (const ch of layer1) {
	const names = ch.seed.vertexConfigurations.map((v: VertexConfiguration) => v.name).join(';');
	summary.set(names, (summary.get(names) ?? 0) + 1);
}
for (const [names, n] of summary) console.log(`   ${names} ×${n}`);

const layer1d = builder.deduplicateLayer(layer1);
console.log(`layer1 deduped: ${layer1d.length}`);

let layer2: any[] = [];
for (const node of layer1d) layer2.push(...builder.expandNode(node, seedSet));
console.log(`layer2 (place 3rd VC): ${layer2.length} children`);
const summary2 = new Map<string, number>();
for (const ch of layer2) {
	const names = ch.seed.vertexConfigurations.map((v: VertexConfiguration) => v.name).join(';');
	summary2.set(names, (summary2.get(names) ?? 0) + 1);
}
for (const [names, n] of summary2) console.log(`   ${names} ×${n}`);

const layer2d = builder.deduplicateLayer(layer2);
console.log(`layer2 deduped: ${layer2d.length}`);

let pass = 0;
for (const node of layer2d) {
	const ok = builder.passesFinalVertexCheck(node, seedSet);
	if (ok) pass++;
}
console.log(`final vertex check: ${pass}/${layer2d.length} pass`);

// If layer1 is already empty, drill into the A→B transition manually.
if (layer1.length === 0) {
	console.log('\n--- drill: placing 3,3,4,12 (and mirror) at neighbors of 3,12,12 ---');
	const availableVertices = builder.computeAvailableVertices(node0.placedVCs);
	console.log(`available vertices: ${availableVertices.length}`);
	// forward check first (expandNode prunes the whole branch if any vertex has entropy 0)
	for (const { vertex, vertexExact, directions } of availableVertices) {
		const fits = builder.canAnyVCFitAtVertex(vertex, vertexExact, directions, node0.seed, seedSet);
		console.log(`  fwd-check at (${vertex.x.toFixed(3)},${vertex.y.toFixed(3)}) dirs=${directions.length}: ${fits}`);
	}
}
