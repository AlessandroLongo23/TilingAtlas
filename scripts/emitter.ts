/* Fire-and-forget EMITTER for the live research console (frontend M1, docs/FRONTEND_LAB_PLAN.md §3).
 *
 * §0 doctrine: the website NEVER joins the claim-carrying path. This module is a one-way mirror —
 * the local scout hands it decisive events; it pushes them to Supabase on a bounded background queue.
 * It must NEVER block, reorder, throw into the scout, or affect the digest. Every Supabase call is
 * wrapped + swallowed; on queue overflow the oldest event is dropped with a local warning.
 *
 * Composition: a generic `makeTaskQueue` (the §0-critical mechanics) + `makeEmitter` (event → table
 * translation). The coordinator injects the service-role client; a null client makes the emitter a
 * no-op (EMIT off / no creds), so the certified path runs byte-identical with the emitter absent.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Task = () => Promise<void>;

export interface TaskQueue {
  push(task: Task): void;
  flush(): Promise<void>;
  stats(): { dropped: number; pending: number };
}

/** Single-consumer FIFO (no reorder) with bounded length (drop-oldest + warn on overflow) and
 *  per-task retry. Errors are swallowed — `flush()` never rejects. */
export function makeTaskQueue(opts: { maxQueue?: number; retries?: number; warn?: (m: string) => void } = {}): TaskQueue {
  const maxQueue = opts.maxQueue ?? 1000;
  const retries = opts.retries ?? 2;
  const warn = opts.warn ?? ((m: string) => console.error(m));
  const queue: Task[] = [];
  let dropped = 0;
  let draining: Promise<void> | null = null;

  async function runWithRetry(task: Task): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try { await task(); return; }
      catch { if (attempt === retries) return; /* swallow; retry until budget exhausted */ }
    }
  }
  function drain(): Promise<void> {
    if (draining) return draining;
    draining = (async () => {
      while (queue.length) await runWithRetry(queue.shift()!);
      draining = null;
    })();
    return draining;
  }
  return {
    push(task) {
      if (queue.length >= maxQueue) {
        queue.shift();
        dropped++;
        warn(`[emitter] queue overflow (max ${maxQueue}) — dropped oldest event (total dropped ${dropped})`);
      }
      queue.push(task);
      void drain();
    },
    async flush() { while (draining) await draining; },
    stats() { return { dropped, pending: queue.length }; },
  };
}

export interface EmitterRunMeta { runId: string; k: number; family: string; params: unknown; commit?: string }
export interface SeedResult {
  idx: number; name: string; cells: unknown[]; timedOut: boolean; ms: number; workerId: number; diag?: unknown;
}
export interface RunSummary { count: number; digest: string; timeouts: number; incomplete: boolean }

export interface Emitter {
  runStarted(meta: EmitterRunMeta): void;
  seedClaimed(seedIdx: number, workerId: number): void;
  seedCompleted(r: SeedResult): void;
  runFinished(s: RunSummary): void;
  flush(): Promise<void>;
}

export function makeEmitter(opts: {
  client: SupabaseClient | null;
  queue?: TaskQueue;
  retries?: number;
  warn?: (m: string) => void;
  /** When provided, each certified cell is mirrored to found_tilings keyed by this canonical key.
   *  Injected by the coordinator (which owns the ring + extractor) — keeps this module decoupled. */
  canonicalKeyOf?: (cell: unknown) => string;
  /** When provided, a render-ready float cell (TranslationalCellData) is stored alongside the exact
   *  cell_codec so the browser gallery (M2) renders without bundling Cyclotomic. */
  renderCellOf?: (cell: unknown) => unknown;
}): Emitter {
  const client = opts.client;
  if (!client) {
    const noop = () => {};
    return { runStarted: noop, seedClaimed: noop, seedCompleted: noop, runFinished: noop, flush: async () => {} };
  }
  const queue = opts.queue ?? makeTaskQueue({ retries: opts.retries, warn: opts.warn });
  const canonicalKeyOf = opts.canonicalKeyOf;
  const renderCellOf = opts.renderCellOf;
  let runId = '';
  let runK = 0;
  let seq = 0;

  const push = (fn: () => PromiseLike<{ error: { message: string } | null }>) =>
    queue.push(async () => { const { error } = await fn(); if (error) throw new Error(error.message); });

  const event = (type: string, payload: unknown) => {
    const row = { run_id: runId, seq: seq++, type, payload };
    push(() => client.from('run_events').insert(row));
  };

  return {
    runStarted(meta) {
      runId = meta.runId;
      runK = meta.k;
      push(() => client.from('runs').insert({
        id: meta.runId, k: meta.k, family: meta.family, params: meta.params, commit: meta.commit ?? null, status: 'running',
      }));
      event('run_started', { k: meta.k, family: meta.family, params: meta.params, commit: meta.commit });
    },
    seedClaimed(seedIdx, workerId) {
      push(() => client.from('run_seeds').upsert(
        { run_id: runId, seed_idx: seedIdx, status: 'active', worker_id: workerId },
        { onConflict: 'run_id,seed_idx' },
      ));
      event('seed_claimed', { seedIdx, workerId });
    },
    seedCompleted(r) {
      push(() => client.from('run_seeds').upsert(
        { run_id: runId, seed_idx: r.idx, name: r.name, status: 'done', worker_id: r.workerId,
          outcome: r.cells.length, ms: r.ms, timed_out: r.timedOut, diag: r.diag ?? null },
        { onConflict: 'run_id,seed_idx' },
      ));
      if (canonicalKeyOf) {
        for (const cell of r.cells) {
          push(() => client.from('found_tilings').upsert(
            {
              run_id: runId,
              canonical_key: canonicalKeyOf(cell),
              cell_codec: cell,
              render_cell: renderCellOf ? renderCellOf(cell) : null,
              k: runK,
              seed_idx: r.idx,
            },
            { onConflict: 'run_id,canonical_key' },
          ));
        }
      }
      event('seed_done', { idx: r.idx, cells: r.cells.length, ms: r.ms, timedOut: r.timedOut });
    },
    runFinished(s) {
      // ⚑ TA note 1: digest/count/timeouts/incomplete only — NEVER `certified` (the emitter must not
      // produce the claim). A human flips `certified` via scripts/certify-run.ts.
      push(() => client.from('runs').update(
        { status: 'finished', finished_at: new Date().toISOString(),
          count: s.count, digest: s.digest, timeouts: s.timeouts, incomplete: s.incomplete },
      ).eq('id', runId));
      event('run_finished', { count: s.count, digest: s.digest, timeouts: s.timeouts, incomplete: s.incomplete });
    },
    flush: () => queue.flush(),
  };
}

/** Build an emitter from the environment — the coordinator's entry point. The emitter is OFF unless
 *  `EMIT=1`; with `EMIT=1` but missing creds it logs once and stays a no-op. This is the §0 opt-in:
 *  default-off ⇒ the certified path runs byte-identical with the emitter absent. */
export function emitterFromEnv(
  opts: { canonicalKeyOf?: (cell: unknown) => string; renderCellOf?: (cell: unknown) => unknown } = {},
): Emitter {
  if (process.env.EMIT !== '1') return makeEmitter({ client: null });
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[emitter] EMIT=1 but PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing — emitter disabled');
    return makeEmitter({ client: null });
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  console.error('[emitter] EMIT=1 — mirroring run events to Supabase (fire-and-forget)');
  return makeEmitter({ client, canonicalKeyOf: opts.canonicalKeyOf, renderCellOf: opts.renderCellOf });
}
