// The flat /play camera as a timeline driver (cameraPose.ts). Its state is the configuration store's
// `controls` (pan, zoom, live angle) and, for a parametric family, the familyAlphas store's sliders.

import { Vector } from "@/classes/Vector";
import type { CameraDriver, Pose, WorldPt } from "@/lib/render/cameraPose";
import { isIdentityDeform, screenLatticeVectors } from "@/lib/render/flatView";
import { evalWithHue } from "@/lib/render/paramCellRender";
import { flatModel, screenOf, worldOf, type View } from "@/lib/render/viewPath";
import { renderAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";
import { resolveDeform, useConfiguration } from "@/stores/configuration";
import { useFamilyAlphas } from "@/stores/familyAlphas";

/** The live camera, as a pose; with `alphas`, also the family's angle sliders. */
function currentView(alphas: boolean): View {
	const c = useConfiguration.getState().controls;
	const fa = useFamilyAlphas.getState();
	const a = alphas ? (fa.live ?? fa.values) : null;
	return { x: c.offset.x, y: c.offset.y, zoom: c.zoom, rotation: c.rotation || 0, alphas: a ? [...a] : null };
}

/**
 * Put the /play camera on `v` for the next frame the canvases draw. Live and target fields are written
 * alike so no ease runs, and `pivotRotation` is set to the new angle so the draw loop's pivot-about-centre
 * compensation sees no angle change and leaves the pan alone.
 *
 * Playback calls this every frame, so it writes in place: the draw loops read the stores imperatively,
 * and a setState per frame would re-render every subscriber (the sidebar's catalogue among them) at the
 * display rate. `commitView` publishes the result to React once the camera stops.
 */
function applyView(v: View) {
	const cfg = useConfiguration.getState();
	const ctrl = cfg.controls;
	ctrl.offset.x = ctrl.targetOffset.x = v.x;
	ctrl.offset.y = ctrl.targetOffset.y = v.y;
	ctrl.zoom = ctrl.targetZoom = v.zoom;
	ctrl.rotation = ctrl.pivotRotation = v.rotation;
	cfg.rotation = v.rotation;
	if (v.alphas) {
		const fa = useFamilyAlphas.getState();
		fa.values = v.alphas;
		fa.live = [...v.alphas];
	}
}

/** Publish the camera `applyView` wrote in place, so the rotation slider and angle sliders catch up. */
function commitView() {
	const fa = useFamilyAlphas.getState();
	useConfiguration.setState({ rotation: useConfiguration.getState().rotation });
	if (fa.values) useFamilyAlphas.setState({ values: [...fa.values] });
}

/**
 * The flat driver. `box` is the canvas host's size; `cells` the tiling's cell and parametric family,
 * read when a Drift loop needs the lattice.
 */
export function flatDriver(
	box: () => { w: number; h: number },
	cells: () => { cell: TranslationalCellData | null; paramCell: ParametricCellData | null },
): CameraDriver {
	return {
		kind: "flat",
		model: flatModel,
		read: () => currentView(!!cells().paramCell),
		apply: (p) => applyView(p as View),
		commit: commitView,
		project(p, w) {
			const b = box(),
				s = screenOf(p as View, w);
			return { x: b.w / 2 + s.x, y: b.h / 2 + s.y, front: true };
		},
		unproject(p, x, y) {
			const b = box();
			return worldOf(p as View, { x: x - b.w / 2, y: y - b.h / 2 });
		},
		probes() {
			const { w, h } = box();
			return [
				{ x: w / 2, y: h / 2 },
				{ x: 0, y: 0 },
				{ x: w, y: 0 },
				{ x: w, y: h },
				{ x: 0, y: h },
			];
		},
		/**
		 * The cell's corners, side midpoints and tile centroids, in every lattice copy around `w`. The
		 * camera's world is the flipped one (y down), so cell points enter as (x, −y). None under a basis
		 * deformation, which moves the drawn tiling off these coordinates.
		 */
		snapCandidates(w) {
			const { cell, paramCell } = cells();
			const live = paramCell
				? evalWithHue(
						paramCell,
						renderAlphaDegs(paramCell, useFamilyAlphas.getState().live, useFamilyAlphas.getState().values),
					)
				: cell;
			const base = live ? parseBaseCell(live) : null;
			if (!base || !isIdentityDeform(resolveDeform(useConfiguration.getState()))) return [];
			const feats: { x: number; y: number }[] = [];
			for (const p of base.polys) {
				const cs = (p.corners ?? p.vertices.map((_, i) => i)).map((i) => p.vertices[i]);
				cs.forEach((c, i) => {
					const d = cs[(i + 1) % cs.length];
					feats.push(c, { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 });
				});
				feats.push({ x: cs.reduce((s, c) => s + c.x, 0) / cs.length, y: cs.reduce((s, c) => s + c.y, 0) / cs.length });
			}
			// w in lattice coordinates (flipped), to pick the copies around it.
			const [[ax, ay], [bx, by]] = base.basis;
			const det = ax * -by - bx * -ay;
			const lat = (x: number, y: number) => [(x * -by - bx * y) / det, (ax * y - x * -ay) / det];
			// Counted from the cell's own position: cells sit wherever the pipeline left them.
			const [ca, cb] = lat((base.minX + base.maxX) / 2, -(base.minY + base.maxY) / 2);
			const [wa, wb] = lat(w.x, w.y);
			const a = wa - ca,
				b = wb - cb;
			const out: WorldPt[] = [];
			for (let i = Math.floor(a) - 2; i <= Math.floor(a) + 2; i++)
				for (let j = Math.floor(b) - 2; j <= Math.floor(b) + 2; j++)
					for (const f of feats) out.push({ x: f.x + i * ax + j * bx, y: -(f.y + i * ay + j * by) });
			return out;
		},
		// The first view moved by the shorter lattice period on screen: the shader draws the pan modulo
		// the period, so that view renders identically to the first. The period is the cell's at the first
		// keyframe's angles, which the closing view shares.
		drift(first: Pose) {
			const v = first as View;
			const { cell, paramCell } = cells();
			const fa = useFamilyAlphas.getState();
			const live = paramCell
				? evalWithHue(paramCell, renderAlphaDegs(paramCell, v.alphas ?? fa.live, v.alphas ?? fa.values))
				: cell;
			const base = live ? parseBaseCell(live) : null;
			if (!base) return undefined;
			const [[ax, ay], [bx, by]] = base.basis;
			const { e1, e2 } = screenLatticeVectors(
				new Vector(ax, ay),
				new Vector(bx, by),
				v.zoom,
				(v.rotation * Math.PI) / 180,
				resolveDeform(useConfiguration.getState()),
			);
			const e = Math.hypot(e1.x, e1.y) <= Math.hypot(e2.x, e2.y) ? e1 : e2;
			return { ...v, x: v.x + e.x, y: v.y + e.y };
		},
	};
}
