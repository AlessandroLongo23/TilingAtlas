export const queryKeys = {
  tilings: (filter?: unknown) => ["tilings", filter] as const,
  campaigns: () => ["campaigns"] as const,
  campaign: (hash: string) => ["campaign", hash] as const,
  polygons: (hash: string) => ["polygons", hash] as const,
  vcs: (hash: string) => ["vcs", hash] as const,
  seeds: (hash: string, k?: number, m?: number) => ["seeds", hash, k, m] as const,
  expandedSeeds: (hash: string, k?: number, m?: number) =>
    ["expandedSeeds", hash, k, m] as const,
  translationalCells: (hash: string, k?: number, m?: number) =>
    ["translationalCells", hash, k, m] as const,
  theoryContent: (slug: string) => ["theory", slug] as const,
};
