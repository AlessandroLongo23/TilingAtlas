import { describe, it, expect } from "vitest";
import { buildSyncEntry, dateOf, shortId } from "@/lib/services/syncEntry";
import type { RunRow } from "@/lib/services/runsService";

function makeRun(over: Partial<RunRow> = {}): RunRow {
  return {
    id: "e6fcf403-ec93-4ddd-99af-a3983770df3c",
    started_at: "2026-06-04T10:00:00.000Z",
    finished_at: "2026-06-04T10:02:30.000Z",
    commit: "fdacd57",
    k: 1,
    family: "3.3.3.3.3.3",
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

describe("shortId / dateOf", () => {
  it("shortId is the first 8 chars", () => {
    expect(shortId("e6fcf403-ec93-4ddd")).toBe("e6fcf403");
  });
  it("dateOf prefers finished_at, falls back to started_at", () => {
    expect(dateOf({ started_at: "2026-06-04T10:00:00Z", finished_at: "2026-06-05T01:00:00Z" })).toBe("2026-06-05");
    expect(dateOf({ started_at: "2026-06-04T10:00:00Z", finished_at: null })).toBe("2026-06-04");
  });
});

describe("buildSyncEntry mirrors DB state (never manufactures a claim)", () => {
  it("a certified, complete run reads CERTIFIED", () => {
    const s = buildSyncEntry(makeRun({ certified: true }));
    expect(s).toContain("CERTIFIED (human-verified)");
    expect(s).toContain("**2026-06-04 — CC**");
    expect(s).toContain("k=1 {3.3.3.3.3.3}");
    expect(s).toContain("11 distinct");
    expect(s).toContain("`6f9ca9cf2d16c75f`");
    expect(s).toContain("commit fdacd57");
  });

  it("a not-yet-certified run never claims certification", () => {
    const s = buildSyncEntry(makeRun({ certified: false }));
    expect(s).toContain("not yet certified");
    expect(s).not.toContain("CERTIFIED");
  });

  // Load-bearing §0 invariant: incomplete DOMINATES — even a stale certified=true must NOT surface
  // a completeness claim. The copied text is explicitly flagged as not a claim.
  it("an INCOMPLETE run never reads CERTIFIED, even if certified=true slipped through", () => {
    const s = buildSyncEntry(makeRun({ incomplete: true, certified: true, timeouts: 2 }));
    expect(s).toContain("INCOMPLETE (timeouts/truncation) — NOT a completeness claim");
    expect(s).not.toContain("CERTIFIED (human-verified)");
    expect(s).toContain("2 timeouts");
  });

  it("missing digest/count/commit degrade gracefully", () => {
    const s = buildSyncEntry(makeRun({ digest: null, count: null, commit: null }));
    expect(s).toContain("? distinct");
    expect(s).toContain("digest `—`");
    expect(s).toContain("commit —");
  });
});
