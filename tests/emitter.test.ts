import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeTaskQueue, makeEmitter, emitterFromEnv } from '../scripts/emitter';

// A controllable deferred — lets a test hold a task in-flight so the queue fills past capacity.
function defer<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// Minimal Supabase-shaped recording client. Records every .insert/.upsert/.update(...).eq(...).
function makeFakeClient(opts: { fail?: boolean } = {}) {
  const calls: Array<{ table: string; op: string; rows?: unknown; opts?: unknown; patch?: unknown; filters?: Record<string, unknown> }> = [];
  const result = opts.fail ? Promise.resolve({ error: { message: 'boom' } }) : Promise.resolve({ error: null });
  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) { calls.push({ table, op: 'insert', rows }); return result; },
        upsert(rows: unknown, o?: unknown) { calls.push({ table, op: 'upsert', rows, opts: o }); return result; },
        update(patch: unknown) {
          const rec = { table, op: 'update', patch, filters: {} as Record<string, unknown> };
          calls.push(rec);
          return { eq(col: string, val: unknown) { rec.filters[col] = val; return result; } };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('makeTaskQueue — the §0-critical fire-and-forget mechanics', () => {
  it('runs pushed tasks in FIFO order (never reorders — §0)', async () => {
    const q = makeTaskQueue();
    const ran: number[] = [];
    q.push(async () => { ran.push(1); });
    q.push(async () => { ran.push(2); });
    q.push(async () => { ran.push(3); });
    await q.flush();
    expect(ran).toEqual([1, 2, 3]);
  });

  it('swallows a throwing task and still runs the tasks after it', async () => {
    const q = makeTaskQueue({ retries: 0 });
    const ran: number[] = [];
    q.push(async () => { ran.push(1); });
    q.push(async () => { throw new Error('middle task fails'); });
    q.push(async () => { ran.push(3); });
    await expect(q.flush()).resolves.toBeUndefined(); // flush never rejects
    expect(ran).toEqual([1, 3]);
  });

  it('retries a transiently-failing task up to `retries` times, then succeeds', async () => {
    const q = makeTaskQueue({ retries: 2 });
    let attempts = 0;
    q.push(async () => { attempts++; if (attempts < 3) throw new Error('transient'); });
    await q.flush();
    expect(attempts).toBe(3); // first attempt + 2 retries
  });

  it('gives up after `retries` and swallows a permanently-failing task', async () => {
    const q = makeTaskQueue({ retries: 2 });
    let attempts = 0;
    q.push(async () => { attempts++; throw new Error('permanent'); });
    await expect(q.flush()).resolves.toBeUndefined();
    expect(attempts).toBe(3); // 1 + 2 retries, then given up
  });

  it('drops the oldest pending task and warns when maxQueue is exceeded', async () => {
    const warn = vi.fn();
    const q = makeTaskQueue({ maxQueue: 2, retries: 0, warn });
    const gate = defer();
    const ran: string[] = [];
    q.push(async () => { await gate.promise; ran.push('blocker'); });
    // let the drain loop pick up the blocker (now in-flight, off the queue)
    await Promise.resolve(); await Promise.resolve();
    q.push(async () => { ran.push('A'); }); // queue: [A]
    q.push(async () => { ran.push('B'); }); // queue: [A, B]
    q.push(async () => { ran.push('C'); }); // overflow: drop A, warn; queue: [B, C]
    expect(q.stats().dropped).toBe(1);
    expect(warn).toHaveBeenCalled();
    gate.resolve();
    await q.flush();
    expect(ran).toEqual(['blocker', 'B', 'C']); // A was dropped
  });
});

describe('makeEmitter — event → table translation, fire-and-forget', () => {
  const meta = { runId: 'run-1', k: 3, family: '3,4,6,12', params: { maxMs: 0, workers: 8 }, commit: 'abc1234' };

  it('is a no-op (and never throws) when the client is null', async () => {
    const emit = makeEmitter({ client: null });
    expect(() => emit.runStarted(meta)).not.toThrow();
    emit.seedClaimed(0, 1);
    emit.seedCompleted({ idx: 0, name: '3⁶', cells: [], timedOut: false, ms: 12, workerId: 1 });
    emit.runFinished({ count: 61, digest: 'eb34499d5fba3457', timeouts: 0, incomplete: false });
    await expect(emit.flush()).resolves.toBeUndefined();
  });

  it('runStarted inserts a runs row and emits a run_started event at seq 0', async () => {
    const { client, calls } = makeFakeClient();
    const emit = makeEmitter({ client });
    emit.runStarted(meta);
    await emit.flush();
    const runsInsert = calls.find((c) => c.table === 'runs' && c.op === 'insert');
    expect(runsInsert?.rows).toMatchObject({ id: 'run-1', k: 3, family: '3,4,6,12', status: 'running' });
    const ev = calls.find((c) => c.table === 'run_events');
    expect(ev?.rows).toMatchObject({ run_id: 'run-1', seq: 0, type: 'run_started' });
  });

  it('seedCompleted upserts run_seeds(done) with outcome + diag, idempotent on the seed PK', async () => {
    const { client, calls } = makeFakeClient();
    const emit = makeEmitter({ client });
    emit.runStarted(meta);
    emit.seedCompleted({ idx: 7, name: '3⁶;3⁶;3⁴.6', cells: [{}, {}], timedOut: false, ms: 372, workerId: 2,
      diag: { p0Skipped: 4, p1Pruned: 0, gateRejected: 11, obliqueCandidates: 2, obliqueTruncated: 0 } });
    await emit.flush();
    const seedUpsert = calls.find((c) => c.table === 'run_seeds' && c.op === 'upsert');
    expect(seedUpsert?.rows).toMatchObject({ run_id: 'run-1', seed_idx: 7, status: 'done', outcome: 2, ms: 372, timed_out: false });
    expect((seedUpsert?.rows as { diag: unknown }).diag).toMatchObject({ gateRejected: 11 });
  });

  it('seedCompleted writes one found_tilings row per cell when a canonicalKeyOf is provided', async () => {
    const { client, calls } = makeFakeClient();
    const emit = makeEmitter({ client, canonicalKeyOf: (c) => `key:${(c as { id: number }).id}` });
    emit.runStarted(meta);
    emit.seedCompleted({ idx: 7, name: 's', cells: [{ id: 1 }, { id: 2 }], timedOut: false, ms: 10, workerId: 0 });
    await emit.flush();
    const found = calls.filter((c) => c.table === 'found_tilings' && c.op === 'upsert');
    expect(found).toHaveLength(2);
    expect(found[0].rows).toMatchObject({ run_id: 'run-1', canonical_key: 'key:1', k: 3, seed_idx: 7 });
    expect(found[0].opts).toMatchObject({ onConflict: 'run_id,canonical_key' });
  });

  it('runFinished updates digest/count/timeouts/incomplete but NEVER certified (TA note 1)', async () => {
    const { client, calls } = makeFakeClient();
    const emit = makeEmitter({ client });
    emit.runStarted(meta);
    emit.runFinished({ count: 61, digest: 'eb34499d5fba3457', timeouts: 0, incomplete: false });
    await emit.flush();
    const upd = calls.find((c) => c.table === 'runs' && c.op === 'update');
    expect(upd?.patch).toMatchObject({ status: 'finished', count: 61, digest: 'eb34499d5fba3457', timeouts: 0, incomplete: false });
    expect(upd?.patch as object).not.toHaveProperty('certified'); // ⚑ the claim is never produced by the emitter
    expect(upd?.filters).toMatchObject({ id: 'run-1' });
  });

  it('never throws into the caller when a client op fails', async () => {
    const { client } = makeFakeClient({ fail: true });
    const emit = makeEmitter({ client, retries: 0 });
    emit.runStarted(meta);
    emit.runFinished({ count: 61, digest: 'x', timeouts: 0, incomplete: false });
    await expect(emit.flush()).resolves.toBeUndefined();
  });

  it('assigns monotonic event seq across the run lifecycle', async () => {
    const { client, calls } = makeFakeClient();
    const emit = makeEmitter({ client });
    emit.runStarted(meta);
    emit.seedClaimed(0, 1);
    emit.seedCompleted({ idx: 0, name: 's', cells: [], timedOut: false, ms: 5, workerId: 1 });
    await emit.flush();
    const seqs = calls.filter((c) => c.table === 'run_events').map((c) => (c.rows as { seq: number }).seq);
    expect(seqs).toEqual([0, 1, 2]);
  });

  // §0 guard: canonicalKeyOf runs at drain time inside the task, so a throw can never escape into the
  // scout's onResult. (Confirms the existing design is safe — a regression lock, not a new behavior.)
  it('swallows a throwing canonicalKeyOf and never throws into the caller', async () => {
    const { client } = makeFakeClient();
    const emit = makeEmitter({ client, retries: 0, canonicalKeyOf: () => { throw new Error('bad cell'); } });
    emit.runStarted(meta);
    expect(() => emit.seedCompleted({ idx: 0, name: 's', cells: [{}], timedOut: false, ms: 1, workerId: 0 })).not.toThrow();
    await expect(emit.flush()).resolves.toBeUndefined();
  });
});

describe('emitterFromEnv — EMIT gating', () => {
  const save = {
    EMIT: process.env.EMIT,
    URL: process.env.PUBLIC_SUPABASE_URL,
    KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  afterEach(() => {
    for (const [k, v] of [['EMIT', save.EMIT], ['PUBLIC_SUPABASE_URL', save.URL], ['SUPABASE_SERVICE_ROLE_KEY', save.KEY]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('is a no-op when EMIT is not set', async () => {
    delete process.env.EMIT;
    const emit = emitterFromEnv();
    expect(() => emit.runStarted({ runId: 'r', k: 1, family: '3', params: {} })).not.toThrow();
    await expect(emit.flush()).resolves.toBeUndefined();
  });

  it('is a no-op (disabled) when EMIT=1 but Supabase creds are missing', async () => {
    process.env.EMIT = '1';
    delete process.env.PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const emit = emitterFromEnv();
    expect(() => emit.runStarted({ runId: 'r', k: 1, family: '3', params: {} })).not.toThrow();
    await expect(emit.flush()).resolves.toBeUndefined();
  });
});
