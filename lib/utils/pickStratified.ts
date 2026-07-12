// Two-stage (stratified) uniform sampling: pick a bucket uniformly at random, then pick an item
// uniformly within it. This makes every *bucket* equally likely rather than every *item* — so a
// bucket holding one tiling is as likely to be drawn as a bucket holding two hundred. Used by /play's
// "random tiling" so a fat class×k group (e.g. regular k=10) doesn't swamp a thin one (star k=1).
//
// `excludeKey` drops one item (the current selection) from its bucket so the pick always changes the
// view; a bucket left empty by that exclusion becomes ineligible. Returns null when nothing qualifies.
export function pickStratified<T>(
	items: readonly T[],
	opts: {
		bucketOf: (item: T) => string;
		keyOf: (item: T) => string;
		excludeKey?: string | null;
		rng?: () => number;
	},
): T | null {
	const { bucketOf, keyOf, excludeKey = null, rng = Math.random } = opts;

	// Insertion-ordered buckets → deterministic indexing for a given rng sequence (testability).
	const buckets = new Map<string, T[]>();
	for (const item of items) {
		if (excludeKey !== null && keyOf(item) === excludeKey) continue;
		const b = bucketOf(item);
		const list = buckets.get(b);
		if (list) list.push(item);
		else buckets.set(b, [item]);
	}

	const eligible = Array.from(buckets.values());
	if (eligible.length === 0) return null;

	const bucket = eligible[Math.floor(rng() * eligible.length)];
	return bucket[Math.floor(rng() * bucket.length)];
}
