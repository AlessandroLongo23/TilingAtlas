/**
 * Deterministic 16-character experiment hash.
 * Input: sorted polygon names + sorted k-values + isExhaustive flag.
 * Uses Web Crypto SubtleCrypto — isomorphic (browser + Node 18+ server).
 */
export async function computeExperimentHash(
	polygonNames: string[],
	kValues: number[],
	isExhaustive: boolean
): Promise<string> {
	const sorted = [...polygonNames].sort();
	const sortedK = [...kValues].sort((a, b) => a - b);
	const input = `polygons:${sorted.join(',')};k:${sortedK.join(',')};exhaustive:${isExhaustive}`;

	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	return hashHex.slice(0, 16);
}
