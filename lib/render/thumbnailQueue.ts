// A serial, frame-paced queue for thumbnail renders.
//
// Every thumbnail (euclidean 2D, hyperbolic per-pixel, spherical three.js) bakes its preview
// SYNCHRONOUSLY on the main thread when its IntersectionObserver fires. That is survivable one at a
// time and hostile in bulk: a library page mounts ~25 cards whose observers all fire in the SAME
// callback batch, so the browser runs 25 bakes back-to-back inside one task and cannot paint until
// the last finishes. The hyperbolic bake alone is a 512² reduction field — prepareShaderTiling's own
// comment budgets "the worst k=2 domain < ~1.5 s". Twenty-five of those is a multi-second freeze
// during which the grid is blank white and nothing (including a loading skeleton) can paint.
//
// This queue drains ONE job per animation frame, which hands the browser a paint opportunity between
// every bake: skeletons show up immediately, previews resolve one-by-one, scrolling stays alive.
//
// One-per-frame rather than a time budget on purpose — a single hyperbolic bake overruns any budget
// no matter how it is measured, so budgeting only adds bookkeeping. For the cheap euclidean thumbs
// one-per-frame still clears a 25-card page in ~0.2 s on a 120 Hz panel.
//
// Jobs run in enqueue order, which is viewport order: the observers carry a 300px rootMargin, so
// what the user is looking at was enqueued first.

type Job = () => void;

const queue: Job[] = [];
let frame: number | null = null;

function drain() {
	frame = null;
	const job = queue.shift();
	if (job) {
		try {
			job();
		} catch (e) {
			// A single bad tiling must not wedge the queue for every other card on the page.
			console.warn("thumbnailQueue: job threw —", e);
		}
	}
	if (queue.length > 0) frame = requestAnimationFrame(drain);
}

/**
 * Queue a synchronous thumbnail render. Returns a canceller — call it from effect cleanup so that
 * paginating or filtering away mid-batch drops the pending bakes instead of running them to
 * completion for cards that no longer exist.
 */
export function enqueueThumbnailRender(job: Job): () => void {
	queue.push(job);
	if (frame === null) frame = requestAnimationFrame(drain);
	return () => {
		const i = queue.indexOf(job);
		if (i >= 0) queue.splice(i, 1);
	};
}
