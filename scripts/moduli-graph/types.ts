export type Vec = number[];                 // [a0,a1,a2,a3] over {1,ω,ω²,ω³}
export interface FloatPoly { n: number; star?: boolean; verts: [number, number][]; }
export interface FloatTiling { polys: FloatPoly[]; basis: [[number, number], [number, number]]; }
export type Chirality = 'achiral' | 'L' | 'R';
export type NodeKind = 'uniform' | 'uncatalogued' | 'degenerate';
// Structural role in the moduli space, orthogonal to `kind` (which records catalogue status). A node is
// a `branch` point (crossroad) when ≥3 family-arcs meet there — the deformation can leave in more than
// one independent direction; a `landmark` is a degree-2 pass-through kept because it is a named tiling
// (topologically an edge subdivision, inessential to H₁); `boundary` is the degenerate ⊥ limit. At small
// k branch and landmark overlap heavily but not perfectly, and only branch nodes carry the topology.
export type NodeRole = 'boundary' | 'landmark' | 'branch';
export interface NodeState { alpha: number; tiling: FloatTiling; kind: 'endpoint' | 'interior'; regular: boolean; }
export interface ResolvedNode { key: string; label: string; chirality: Chirality; resolved: boolean; kind: NodeKind; }
