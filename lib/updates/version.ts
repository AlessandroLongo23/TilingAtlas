// Version arithmetic for the update notes. MAJOR.MINOR.PATCH, all three numeric.
//
// No `semver` dependency: the format is entirely ours, every version in lib/updates/entries.ts is
// hand-written by the release ritual, and tests/updates.test.ts asserts the shape. A ~20-line
// comparator is less to carry than a package.
//
//   MINOR — a new capability: a page, a tile class, an editor, a geometry.
//   PATCH — more tilings in a family that already shipped, fixes, perf, restructuring.
//   MAJOR — a change in what the Atlas is. Reserved.

export type VersionBump = "major" | "minor" | "patch" | "none";

const PARTS = /^(\d+)\.(\d+)\.(\d+)$/;

/** [major, minor, patch]; throws on anything that is not exactly three dot-separated integers. */
export function parseVersion(v: string): [number, number, number] {
	const m = PARTS.exec(v);
	if (!m) throw new Error(`Not a version: ${JSON.stringify(v)} (want MAJOR.MINOR.PATCH)`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isVersion(v: string): boolean {
	return PARTS.test(v);
}

/** Negative if a < b, positive if a > b, 0 if equal. Sorts newest-first with `.sort((x, y) => compareVersions(y, x))`. */
export function compareVersions(a: string, b: string): number {
	const [am, an, ap] = parseVersion(a);
	const [bm, bn, bp] = parseVersion(b);
	return am - bm || an - bn || ap - bp;
}

/**
 * What KIND of release a version is, read off the version alone.
 *
 * Each release bumps exactly one component, so the trailing zeros say which: a non-zero patch means
 * a patch release, else a non-zero minor means a feature release, else it is a major. That agrees
 * with `bumpBetween(previous, this)` on every pair, and unlike the diff it also answers for the
 * oldest entry, which has no predecessor to compare against.
 */
export function releaseLevel(version: string): Exclude<VersionBump, "none"> {
	const [major, minor, patch] = parseVersion(version);
	if (patch !== 0) return "patch";
	if (minor !== 0) return "minor";
	// 0.0.0 is not a release anyone cuts, but it is a major by this rule, not a crash.
	void major;
	return "major";
}

/** Which component changed between `from` and `to`. Only the most significant one is reported. */
export function bumpBetween(from: string, to: string): VersionBump {
	const [fm, fn, fp] = parseVersion(from);
	const [tm, tn, tp] = parseVersion(to);
	if (tm !== fm) return "major";
	if (tn !== fn) return "minor";
	if (tp !== fp) return "patch";
	return "none";
}
