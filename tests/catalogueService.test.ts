import { describe, it, expect } from "vitest";
import { dedupeCatalogue } from "@/lib/services/catalogueService";
import type { RunRow, FoundTiling } from "@/lib/services/runsService";

function makeRun(over: Partial<RunRow> = {}): RunRow {
  return {
    id: "run-A",
    started_at: "2026-06-04T10:00:00.000Z",
    finished_at: "2026-06-04T10:02:30.000Z",
    commit: "fdacd57",
    k: 1,
    family: "3,4,6,8,12",
    params: {},
    status: "finished",
    count: 11,
    digest: "6f9ca9cf2d16c75f",
    timeouts: 0,
    incomplete: false,
    certified: false,
    ...over,
  };
}

function makeFound(over: Partial<FoundTiling> = {}): FoundTiling {
  return {
    run_id: "run-A",
    canonical_key: "key-1",
    render_cell: { stub: true },
    k: 1,
    seed_idx: 0,
    first_seen_at: "2026-06-04T10:00:00.000Z",
    ...over,
  };
}

describe("dedupeCatalogue — the method-agnostic read transform", () => {
  it("collapses found_tilings to one entry per canonical_key across runs", () => {
    // The real k=1 shape: 3 runs each rediscovering the same keys → distinct set, not 3x.
    const runs = [makeRun({ id: "r1" }), makeRun({ id: "r2" }), makeRun({ id: "r3" })];
    const found = [
      makeFound({ run_id: "r1", canonical_key: "a" }),
      makeFound({ run_id: "r2", canonical_key: "a" }),
      makeFound({ run_id: "r3", canonical_key: "a" }),
      makeFound({ run_id: "r1", canonical_key: "b" }),
    ];
    const cat = dedupeCatalogue(found, runs);
    expect(cat.map((t) => t.canonicalKey).sort()).toEqual(["a", "b"]);
  });

  it("marks a tiling certified iff at least one contributing run is certified", () => {
    const runs = [makeRun({ id: "rc", certified: true }), makeRun({ id: "ru", certified: false })];
    const found = [
      makeFound({ run_id: "rc", canonical_key: "proven" }),
      makeFound({ run_id: "ru", canonical_key: "proven" }), // also seen in an uncertified run
      makeFound({ run_id: "ru", canonical_key: "candidate" }), // only ever in an uncertified run
    ];
    const byKey = Object.fromEntries(dedupeCatalogue(found, runs).map((t) => [t.canonicalKey, t]));
    expect(byKey["proven"].certified).toBe(true);
    expect(byKey["candidate"].certified).toBe(false);
  });

  it("carries k and family from the contributing run", () => {
    const runs = [makeRun({ id: "r1", k: 3, family: "3,4,6,12" })];
    const found = [makeFound({ run_id: "r1", canonical_key: "x", k: 3 })];
    const [t] = dedupeCatalogue(found, runs);
    expect(t.k).toBe(3);
    expect(t.family).toBe("3,4,6,12");
  });

  it("records every contributing run id as provenance", () => {
    const runs = [makeRun({ id: "r1" }), makeRun({ id: "r2" })];
    const found = [
      makeFound({ run_id: "r1", canonical_key: "a" }),
      makeFound({ run_id: "r2", canonical_key: "a" }),
    ];
    const [t] = dedupeCatalogue(found, runs);
    expect(t.runIds.sort()).toEqual(["r1", "r2"]);
  });

  it("uses the first non-null render_cell among contributing rows", () => {
    const runs = [makeRun({ id: "r1" }), makeRun({ id: "r2" })];
    const found = [
      makeFound({ run_id: "r1", canonical_key: "a", render_cell: null }),
      makeFound({ run_id: "r2", canonical_key: "a", render_cell: { real: 1 } }),
    ];
    const [t] = dedupeCatalogue(found, runs);
    expect(t.renderCell).toEqual({ real: 1 });
  });

  it("ignores found rows whose run is missing from the runs set (cannot derive trust)", () => {
    const runs = [makeRun({ id: "r1", certified: true })];
    const found = [
      makeFound({ run_id: "r1", canonical_key: "a" }),
      makeFound({ run_id: "orphan", canonical_key: "b" }), // no matching run → unknowable certification
    ];
    const cat = dedupeCatalogue(found, runs);
    expect(cat.map((t) => t.canonicalKey)).toEqual(["a"]);
  });
});
