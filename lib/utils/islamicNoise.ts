import type { Vector } from '@/classes';

export const ISLAMIC_NOISE = {
    spatialScale: 0.05,
    timeScale: 0.005,
    stretch: 2,
    shapeExponent: 0.55,
};

const shape = (n: number): number => {
    const y = (n - 0.5) * ISLAMIC_NOISE.stretch + 0.5;
    const d = 2 * (y - 0.5);
    const curved = 0.5 + 0.5 * Math.sign(d) * Math.pow(Math.abs(d), ISLAMIC_NOISE.shapeExponent);
    return Math.min(1, Math.max(0, curved));
};

// World-space offset added to noise sample coordinates so the animated motif tracks panning.
// The /play canvas wraps the pan modulo the lattice (drawn content snaps back by whole periods); the
// noise field is NOT lattice-periodic, so without this it would stay glued to world-origin and snap at
// every cell boundary. Set per-frame (by the canvas draw loop) to -L, where L is the world lattice
// vector the wrap removed, so the noise is sampled at the true (unwrapped) world position.
let noiseWorldOffsetX = 0;
let noiseWorldOffsetY = 0;
export const setIslamicNoiseWorldOffset = (x: number, y: number): void => {
    noiseWorldOffsetX = x;
    noiseWorldOffsetY = y;
};

export const islamicAngleAt = (ctx: { noise: (x: number, y: number, z: number) => number; frameCount: number }, p: Vector): number => {
    const raw = ctx.noise(
        (p.x + noiseWorldOffsetX) * ISLAMIC_NOISE.spatialScale + 1000,
        (p.y + noiseWorldOffsetY) * ISLAMIC_NOISE.spatialScale + 1000,
        ctx.frameCount * ISLAMIC_NOISE.timeScale,
    );
    return shape(raw) * Math.PI;
};

export const islamicAnglesForHalfways = (ctx: { noise: (x: number, y: number, z: number) => number; frameCount: number }, halfways: Vector[]): number[] => {
    return halfways.map(h => islamicAngleAt(ctx, h));
};
