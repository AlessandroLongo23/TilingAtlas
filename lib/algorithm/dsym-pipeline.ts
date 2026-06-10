/**
 * Delaney–Dress orchestration — the ONLY fs-touching file of the D-D engine (the pure
 * `lib/classes/algorithm/delaney/` module never touches the filesystem). Reached only via
 * the `USE_DSYM=1` branch in run-pipeline.ts.
 *
 * For M0/M1 this runs the Stage-1 WALL PROBE (no realization — the geometric realizer is M2,
 * gated on this measurement) and writes the gate table. The polygon set P is derived from the
 * admissible vertex alphabet (the VCs) — the existing pipeline parameter, no new plumbing.
 */
import fs from 'node:fs';
import { generateCandidateSymbols } from '@/classes/algorithm/delaney';
import type { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';

interface Logger {
  log: (s: string) => void;
}

export function dsymPipeline(
  vertexConfigurations: VertexConfiguration[],
  paramsFolder: string,
  maxK: number,
  log: Logger,
): void {
  // P = the tile degrees present in the angle-valid vertex alphabet (the regular polygon set).
  const P = [...new Set(vertexConfigurations.flatMap((vc) => vc.polygons.map((p) => p.n)))].sort(
    (a, b) => a - b,
  );
  const budgetM = process.env.DSYM_BUDGET_M ? parseInt(process.env.DSYM_BUDGET_M, 10) : 300;

  log.log(
    `Delaney–Dress Stage-1 probe — P={${P.join(',')}}  budget=${budgetM}M nodes/k ` +
      `(USE_DSYM; no realization — M2 gated on this curve)`,
  );

  const rows: Array<Record<string, unknown>> = [];
  for (let k = 1; k <= maxK; k++) {
    const sizeBound = 12 * k; // B1: δ ≤ 12k (the proven completeness envelope)
    const t0 = Date.now();
    const r = generateCandidateSymbols(k, P, sizeBound, { maxNodes: budgetM * 1_000_000 });
    const ms = Date.now() - t0;
    const status = r.completed
      ? 'COMPLETE'
      : `⚑ WALLED @ δ≤${sizeBound} — LOWER BOUND, NOT provably complete`;
    log.log(
      `  k=${k} δ≤${sizeBound}: candidateSymbols=${r.candidateSymbols} ${status} ` +
        `dsets=${r.dsetsGenerated} nodes=${r.nodesUsed} ${(ms / 1000).toFixed(1)}s`,
    );
    rows.push({
      k,
      sizeBound,
      candidateSymbols: r.candidateSymbols,
      completed: r.completed,
      dsetsGenerated: r.dsetsGenerated,
      nodesUsed: r.nodesUsed,
      ms,
    });
  }

  const outDir = `pipeline-output/${paramsFolder}`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/dsym-probe.json`, JSON.stringify({ P, rows }, null, 2));
  log.log(`  wrote ${outDir}/dsym-probe.json`);
}
