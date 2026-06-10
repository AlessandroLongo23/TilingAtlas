/* Probe 6: instrumented passesFinalVertexCheck on every RAW layer-2 child of
 * [3,12,12;3,3,4,12;3,4,6,4] — which vertex/check produces the false negative.
 *   pnpm tsx scripts/diag-t3007-finalcheck.ts
 */
import { SeedBuilder, SeedConfiguration, VertexConfiguration, PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { Vector } from '@/classes/Vector';
import { isWithinAngularTolerance } from '@/utils';

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
const layer1 = builder.expandNode(node0, seedSet);
let layer2: any[] = [];
for (const node of layer1) layer2.push(...builder.expandNode(node, seedSet));
console.log(`raw layer2: ${layer2.length} children (no dedup)`);

layer2.forEach((node, ci) => {
	const names = node.seed.vertexConfigurations.map((v: VertexConfiguration) => v.name).join(';');
	console.log(`\n=== child ${ci}: ${names} — polygons: ${node.seed.polygons.map((p: any) => p.getName()).sort().join(',')}`);
	const availableVertices = builder.computeAvailableVertices(node.placedVCs);
	let pass = true;
	for (const { vertex, vertexExact, directions } of availableVertices) {
		const polysAt = builder.getPolygonsAtVertex(vertex, node.seed.polygons);
		const angleSum = polysAt.reduce((s: number, p: any) => s + p.getAngleAtVertex(vertex), 0);
		const surrounded = isWithinAngularTolerance(angleSum, 2 * Math.PI);
		if (surrounded) {
			const emerging = builder.getEmergingVCNameAtVertex(vertex, polysAt);
			const inSet = emerging !== null && builder.isVCNameInSet(emerging, seedSet);
			if (!inSet) { pass = false; }
			console.log(`  (${vertex.x.toFixed(3)},${vertex.y.toFixed(3)}) SURROUNDED emerging=${emerging} inSet=${inSet}${inSet ? '' : '   ← FAIL'}`);
		} else {
			const fits = builder.canAnyVCFitAtVertex(vertex, vertexExact, directions, node.seed, seedSet);
			if (!fits) { pass = false; }
			console.log(`  (${vertex.x.toFixed(3)},${vertex.y.toFixed(3)}) open angle=${(angleSum * 180 / Math.PI).toFixed(1)}° polysAt=${polysAt.map((p: any) => p.getName()).join('+') || 'none'} fits=${fits}${fits ? '' : '   ← FAIL'}`);
		}
	}
	console.log(`  → child ${ci} ${pass ? 'PASSES' : 'fails'}`);
});
