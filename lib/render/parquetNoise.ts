// Seeded Perlin gradient noise, 2D and 3D, for the parquet deformation's noise D-field.
//
// Why hand-rolled and not a dependency: the field must be DETERMINISTIC across reloads and across
// the SVG exporter, so a fixed seed reproduces a figure exactly. A seeded permutation table gives
// that in ~60 lines, and the deformation only ever needs one octave.
//
// Why gradient (Perlin) noise and not value noise: the D-field is read at every edge midpoint and
// the tiling only stays smooth if D is C¹. Value noise has visible axis-aligned creases; Perlin's
// quintic fade (6t⁵−15t⁴+10t³) has zero first AND second derivative at the lattice points, so the
// deformed edges bend continuously across cell boundaries.
//
// Range: Perlin noise is NOT bounded by ±1. The practical amplitudes below are measured by
// parquetNoise.test.ts over a dense sample and asserted there, so the [0,1] remap in parquetField.ts
// is calibrated rather than guessed.

/** Measured peak |noise2| (see parquetNoise.test.ts). Unit gradients ⇒ ~√2/2. */
export const NOISE_AMP_2D = 0.72;
/** Measured peak |noise3| (see parquetNoise.test.ts). */
export const NOISE_AMP_3D = 0.78;

/** xorshift32 — small, fast, and enough to shuffle 256 entries reproducibly. */
function makeRandom(seed: number): () => number {
  let s = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 0x100000000) / 0x100000000;
  };
}

/** A seeded 0..255 permutation, doubled to 512 so the hash lookups never need a modulo. */
function makePermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const rnd = makeRandom(seed);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const doubled = new Uint8Array(512);
  doubled.set(p, 0);
  doubled.set(p, 256);
  return doubled;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

// 8 unit gradients at 45° steps: an even spread with no preferred axis, and unit length so the
// amplitude is predictable.
const R2 = Math.SQRT1_2;
const GRAD2: readonly (readonly [number, number])[] = [
  [1, 0],
  [R2, R2],
  [0, 1],
  [-R2, R2],
  [-1, 0],
  [-R2, -R2],
  [0, -1],
  [R2, -R2],
];

// Perlin's 12 edge-of-cube gradients, normalized to unit length (his originals have length √2,
// which inflates the range and makes the [0,1] remap harder to calibrate).
const GRAD3: readonly (readonly [number, number, number])[] = (
  [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
  ] as const
).map((g) => [g[0] * R2, g[1] * R2, g[2] * R2] as const);

export interface NoiseField {
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
}

const cache = new Map<number, NoiseField>();

/** A noise field for `seed`. Cached: the field is rebuilt on every render otherwise, and the
 *  permutation shuffle is the only expensive part. */
export function noiseField(seed: number): NoiseField {
  const key = seed | 0;
  const hit = cache.get(key);
  if (hit) return hit;

  const perm = makePermutation(key);

  const field: NoiseField = {
    noise2(x, y) {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);

      const dot = (gx: number, gy: number, dx: number, dy: number) => gx * dx + gy * dy;
      const g = (h: number) => GRAD2[h & 7];

      const aa = g(perm[perm[xi] + yi]);
      const ba = g(perm[perm[xi + 1] + yi]);
      const ab = g(perm[perm[xi] + yi + 1]);
      const bb = g(perm[perm[xi + 1] + yi + 1]);

      const x1 = lerp(dot(aa[0], aa[1], xf, yf), dot(ba[0], ba[1], xf - 1, yf), u);
      const x2 = lerp(dot(ab[0], ab[1], xf, yf - 1), dot(bb[0], bb[1], xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    },

    noise3(x, y, z) {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const zi = Math.floor(z) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const zf = z - Math.floor(z);
      const u = fade(xf);
      const v = fade(yf);
      const w = fade(zf);

      const g = (h: number) => GRAD3[h % 12];
      const dot = (
        gr: readonly [number, number, number],
        dx: number,
        dy: number,
        dz: number,
      ) => gr[0] * dx + gr[1] * dy + gr[2] * dz;

      const a = perm[xi] + yi;
      const aa = perm[a] + zi;
      const ab = perm[a + 1] + zi;
      const b = perm[xi + 1] + yi;
      const ba = perm[b] + zi;
      const bb = perm[b + 1] + zi;

      const x1 = lerp(
        dot(g(perm[aa]), xf, yf, zf),
        dot(g(perm[ba]), xf - 1, yf, zf),
        u,
      );
      const x2 = lerp(
        dot(g(perm[ab]), xf, yf - 1, zf),
        dot(g(perm[bb]), xf - 1, yf - 1, zf),
        u,
      );
      const y1 = lerp(x1, x2, v);

      const x3 = lerp(
        dot(g(perm[aa + 1]), xf, yf, zf - 1),
        dot(g(perm[ba + 1]), xf - 1, yf, zf - 1),
        u,
      );
      const x4 = lerp(
        dot(g(perm[ab + 1]), xf, yf - 1, zf - 1),
        dot(g(perm[bb + 1]), xf - 1, yf - 1, zf - 1),
        u,
      );
      const y2 = lerp(x3, x4, v);

      return lerp(y1, y2, w);
    },
  };

  cache.set(key, field);
  return field;
}

/**
 * Map raw noise to the deformation time t ∈ [0,1].
 *
 * A single octave of Perlin, linearly remapped, clusters hard around 0.5 — the tiles then never
 * reach either keyframe and the whole strip reads as one mushy mid-shape. `contrast` stretches the
 * distribution about 0.5 so the field actually saturates; the clamp is what keeps t inside [0,1],
 * which the viewBox envelope and the convex blend both rely on.
 */
export function remapNoise(raw: number, amplitude: number, contrast: number): number {
  const t = 0.5 + (contrast * raw) / (2 * amplitude);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
