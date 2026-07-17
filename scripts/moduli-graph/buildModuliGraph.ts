import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CyclotomicRing } from '@/classes/Cyclotomic';
import { loadCatalogueKeys } from './catalogueKeys';
import { assembleGraph, type FamilyRecord } from './graphAssembler';

const atlas = JSON.parse(readFileSync('public/reference-atlas-isotoxal.json', 'utf8'));
const records = (Array.isArray(atlas) ? atlas : atlas.records) as FamilyRecord[];
const families = records.filter(
  (r) => (r as { k?: number }).k === 1 && (r as { source?: string }).source === 'isotoxal' && r.paramCell?.params?.length === 1,
);

const graph = assembleGraph(families, loadCatalogueKeys(CyclotomicRing.create(24)));
mkdirSync('experiments/results', { recursive: true });
writeFileSync('experiments/results/moduli-graph.json', JSON.stringify(graph, null, 2));
const chiral = graph.nodes.filter((n) => n.chirality !== 'achiral').length;
const degenerate = graph.nodes.filter((n) => n.kind === 'degenerate').length;
console.log(
  `families=${families.length} nodes=${graph.nodes.length} edges=${graph.edges.length} ` +
  `H1(with ⊥)=${graph.h1} H1(without ⊥)=${graph.h1NoDegenerate} degenerate=${degenerate} chiral=${chiral}`,
);
