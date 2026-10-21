// The hyperbolic /play camera as a timeline driver (cameraPose.ts). The three disk canvases each own a
// HypCamera; they publish this driver around it so the timeline can read and seek its absolute pose.

import type { CameraDriver, DiskPose } from "@/lib/render/cameraPose";
import { diskModel } from "@/lib/render/diskPath";
import { DISK_PAD_PX, diskFrame } from "@/lib/render/diskFrame";
import type { HypCamera } from "@/lib/render/hypCamera";
import {
	hypDist,
	su11Apply,
	su11ApplyInverse,
	su11Inverse,
	su11Mul,
	su11Normalize,
	type Complex,
} from "@/lib/render/hyperbolic";

const O: Complex = { x: 0, y: 0 };

/**
 * `cam` and `el` are read on every call (the camera is rebuilt per pattern); `pad` is the canvas's gap
 * between the disk and its edge, the same one its draw loop takes off the radius.
 */
export function diskDriver(cam: () => HypCamera | null, el: () => HTMLElement | null, pad = DISK_PAD_PX): CameraDriver {
	const frame = () => diskFrame(el()?.clientWidth ?? 0, el()?.clientHeight ?? 0, pad);
	const m = (p: unknown) => (p as DiskPose).m;
	return {
		kind: "disk",
		model: diskModel,
		read() {
			const c = cam();
			return c ? { kind: "disk", m: c.pose() } : null;
		},
		apply: (p) => cam()?.setPose(m(p)),
		// The disk's pose lives in the canvas, not in a store: nothing to publish to React.
		commit() {},
		project(p, w) {
			const z = su11Apply(m(p), { x: w.x, y: w.y });
			const { r, cx, cy } = frame();
			return { x: cx + r * z.x, y: cy - r * z.y, front: true };
		},
		unproject(p, x, y) {
			const { r, cx, cy } = frame();
			const z = { x: (x - cx) / r, y: -(y - cy) / r };
			return z.x * z.x + z.y * z.y < 0.995 ? su11ApplyInverse(m(p), z) : null;
		},
		probes() {
			// The centre and four points halfway to the rim: corners are off the disk.
			const { r: R, cx, cy } = frame(),
				r = R / 2;
			return [
				{ x: cx, y: cy },
				{ x: cx + r, y: cy },
				{ x: cx - r, y: cy },
				{ x: cx, y: cy + r },
				{ x: cx, y: cy - r },
			];
		},
		snapCandidates(w) {
			const s = cam()?.snapAt({ x: w.x, y: w.y });
			return s ? [s] : [];
		},
		/**
		 * The first pose moved by a deck symmetry of the tiling toward the right of the screen: walk the
		 * centre and points further and further right to their faces of the quotient, and take the first
		 * point whose face matches the centre's but whose copy is another tile. k = W_c⁻¹·W_w carries that
		 * tile onto the centre's, so A·k draws the same picture with its centre over there.
		 */
		drift(first) {
			const c = cam(),
				A = m(first);
			const centre = su11ApplyInverse(A, O);
			const wc = c?.walkAt(centre);
			if (!c || !wc) return undefined;
			for (let r = 0.2; r < 0.99; r += 0.04) {
				const w = su11ApplyInverse(A, { x: r, y: 0 });
				const ww = c.walkAt(w);
				if (!ww || ww.f !== wc.f) continue;
				const k = su11Normalize(su11Mul(su11Inverse(wc.W), ww.W));
				if (hypDist(su11ApplyInverse(k, centre), centre) < 0.05) continue;
				return { kind: "disk", m: su11Normalize(su11Mul(A, k)) };
			}
			return undefined;
		},
	};
}
