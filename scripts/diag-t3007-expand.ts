/* Probe 7: replicate expandNode's inner loop (placing C=3,4,6,4 onto the A+B cluster) with
 * per-candidate logging: vertex, rotation, merge result, isValid result.
 *   pnpm tsx scripts/diag-t3007-expand.ts
 */
import { SeedBuilder, SeedConfiguration, VertexConfiguration, PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { Vector } from '@/classes/Vector';
import { deduplicatePolygons } from '@/utils';

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
console.log(`layer1: ${layer1.length} nodes`);

layer1.forEach((node: any, ni: number) => {
	const names = node.seed.vertexConfigurations.map((v: VertexConfiguration) => v.name).join(';');
	console.log(`\n=== layer1 node ${ni}: ${names}`);
	console.log(`  centers: ${node.placedVCs.map((p: any) => `(${p.center.x.toFixed(3)},${p.center.y.toFixed(3)})`).join(' ')}`);
	const { seed, placedVCs, remaining } = node;
	const availableVertices = builder.computeAvailableVertices(placedVCs);
	const seedCount = seed.polygons.length;

	for (const { vertex: v, vertexExact: vExact, directions } of availableVertices) {
		for (const vcName of remaining) {
			const mirrorName = (() => {
				const reversed = vcName.split(',').reverse().join(',');
				return VertexConfiguration.fromName(reversed).getName();
			})();
			const namesToTry = [...new Set([vcName, mirrorName])];
			for (const nameToTry of namesToTry) {
				const { vc: templateVC, neighboringVertices } = builder.getCachedVC(nameToTry);
				const triedRotations = new Set<string>();
				for (const dirCtoV of directions) {
					for (let nvI = 0; nvI < neighboringVertices.length; nvI++) {
						const nv = neighboringVertices[nvI];
						const rotation = dirCtoV - nv.heading() + Math.PI;
						const normalizedRot = (rotation + 2 * Math.PI) % (2 * Math.PI);
						const rotKey = normalizedRot.toFixed(4);
						const dup = triedRotations.has(rotKey);
						if (!dup) triedRotations.add(rotKey);

						const clonedVC = templateVC.clone();
						builder.placeVCExact(clonedVC, rotation, vExact);
						clonedVC.computeNeighboringVertices();
						const vcCount = clonedVC.polygons.length;
						const merged = deduplicatePolygons([...seed.polygons, ...clonedVC.polygons]);
						const shares = merged.length < seedCount + vcCount;
						let valid: boolean | string = '-';
						if (!dup && shares) {
							const newSeed = new SeedConfiguration([...seed.vertexConfigurations, clonedVC]);
							valid = newSeed.isValid();
						}
						console.log(
							`  v=(${v.x.toFixed(3)},${v.y.toFixed(3)}) ${nameToTry} nv#${nvI} rot=${(normalizedRot * 180 / Math.PI).toFixed(1)}°` +
							`${dup ? ' DUP-SKIP' : ''} shares=${shares} valid=${valid}` +
							`${!dup && shares && valid === true ? '   ← CHILD' : ''}`
						);
					}
				}
			}
		}
	}
});
