export type Vec = number[];                 // [a0,a1,a2,a3] over {1,ω,ω²,ω³}
export interface FloatPoly { n: number; star?: boolean; verts: [number, number][]; }
export interface FloatTiling { polys: FloatPoly[]; basis: [[number, number], [number, number]]; }
export type Chirality = 'achiral' | 'L' | 'R';
export type NodeKind = 'uniform' | 'uncatalogued' | 'degenerate';
export interface NodeState { alpha: number; tiling: FloatTiling; kind: 'endpoint' | 'interior'; regular: boolean; }
export interface ResolvedNode { key: string; label: string; chirality: Chirality; resolved: boolean; kind: NodeKind; }
