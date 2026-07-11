import { describe, it, expect, vi, afterEach } from "vitest";
import { loadReferenceAtlasShard } from "@/lib/services/referenceAtlas";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

const sample: ReferenceTiling[] = [
  {
    id: "ctrnact-08_stub",
    source: "ctrnact",
    k: 8,
    family: "3.4.6",
    renderCell: { cellPolygons: [], basis: [] } as unknown as ReferenceTiling["renderCell"],
    discoverer: "Marek Čtrnáct",
    certification: "reproduced",
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("loadReferenceAtlasShard", () => {
  it("fetches /reference-atlas-k{k}.json and caches per-k (one fetch for repeat calls)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(sample) });
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadReferenceAtlasShard(8);
    const second = await loadReferenceAtlasShard(8);

    expect(first).toEqual(sample);
    expect(second).toBe(first); // cache hit returns the same reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/reference-atlas-k8.json");
  });

  it("rejects and does not cache on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadReferenceAtlasShard(9)).rejects.toThrow("reference-atlas-k9.json: HTTP 404");
  });
});
