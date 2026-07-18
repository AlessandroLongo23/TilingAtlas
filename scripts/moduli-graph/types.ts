export type Vec = number[];                 // [a0,a1,a2,a3] over {1,ω,ω²,ω³}
export interface FloatPoly { n: number; star?: boolean; verts: [number, number][]; }
export interface FloatTiling { polys: FloatPoly[]; basis: [[number, number], [number, number]]; }
export type Chirality = 'achiral' | 'L' | 'R';
// `uniform`: an edge-to-edge catalogue tiling. `uncatalogued`: an edge-to-edge genuine tiling with no
// catalogue match (the excluded octagon 4.8.8). `flattened`: a non-edge-to-edge genuine tiling of
// regular polygons of two sizes, reached when a tile's corner flattens to 180° (a real tiling, merged
// up to direct similarity). `degenerate`: the ⊥ non-tiling — a tile collapsed to zero area, nothing left.
export type NodeKind = 'uniform' | 'uncatalogued' | 'flattened' | 'degenerate';
// Structural role in the moduli space, orthogonal to `kind` (which records catalogue status). A node is
// a `branch` point (crossroad) when ≥3 family-arcs meet there — the deformation can leave in more than
// one independent direction; a `landmark` is a degree-2 pass-through kept because it is a named tiling
// (topologically an edge subdivision, inessential to H₁); `boundary` is the degenerate ⊥ limit. At small
// k branch and landmark overlap heavily but not perfectly, and only branch nodes carry the topology.
export type NodeRole = 'boundary' | 'landmark' | 'branch';
export interface NodeState { alpha: number; tiling: FloatTiling; kind: 'endpoint' | 'interior'; regular: boolean; }
export interface ResolvedNode { key: string; label: string; chirality: Chirality; resolved: boolean; kind: NodeKind; }
// A 2-cell: a two-parameter family developed as a square. `boundary` is the ordered closed cycle of
// node keys around the square (corners plus any interior nodes a side subdivides into). `family` is the
// atlas id. `productOK` records whether the (α₁,α₂) grid validity check passed (false ⇒ non-product,
// flagged for exact stratification, out of this slice's scope).
export interface Cell2 { family: string; boundary: string[]; productOK: boolean; }

// The assembled k=2 sub-complex plus its homology, as emitted by complexAssembler / buildModuliComplex.
// No validity flag: `homology` throws on a malformed boundary (∂1∂2 ≠ 0), so a returned complex is valid
// by construction; a χ = b0−b1+b2 field would be a tautology and is deliberately omitted.
//
// Homology is reported twice, mirroring the k=1 convention (H1 with and without ⊥). The HEADLINE `chi`
// and `betti` are the GENUINE-tiling subcomplex: the ⊥ non-tiling node, every edge incident to it, and
// every face touching such an edge are removed, so a 2-cell bounded entirely by degenerate limits (which
// would otherwise read as a spurious sphere) contributes nothing. `full` keeps the with-⊥ numbers.
export interface ModuliComplex {
  nodes: { key: string; label: string; kind: NodeKind; handed: boolean }[];
  edges: { family: string; from: string; to: string }[];
  faces: Cell2[];
  chi: number;                                       // genuine subcomplex (⊥ removed) — the headline
  betti: [number, number, number];                   // genuine subcomplex
  full: { chi: number; betti: [number, number, number] }; // with ⊥ and its incident cells
  // Families whose 2-cell has a zero ∂₂ column: its boundary edges cancel, so the square folds onto
  // itself (an internal parameter-symmetry) OR it genuinely closes a surface by itself (a one-face
  // torus). The two are indistinguishable without per-generator verification, so each such face
  // contributes an UNVERIFIED b₂ generator — surfaced here rather than silently trusted in the count.
  degenerateFaces: string[];
}

export interface VerificationReport {
  nodeMargin: number;   // min L∞ distance between distinct-key nodes' canonicalCoords (∞ if none comparable)
  edgeMargin: number;   // min # of differing samples between distinct edges sharing an endpoint pair (∞ if none)
  nearCollisions: string[];               // human notes on any margin within a few ε / a single sample
  h2: { faces: string[]; surface: string; chi: number }[];  // families per generator + classified surface
  h1: { edges: number; nodeLoop: string[] }[];              // size + the node loop it traces
  chi: number; betti: [number, number, number];
}
