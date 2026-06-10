/**
 * Delaney–Dress module barrel — DEEP-IMPORT ONLY (`@/classes/algorithm/delaney`).
 *
 * ⚑ Do NOT add this to the client-facing `@/classes` barrel. The module is pure and
 * fs-free today, but keeping it off the barrel preserves the same server-only-import
 * discipline as TilingGenerator and guards against a future fs-importing sibling.
 */
export * from './DSymbol';
export * from './DSymGenerator';
