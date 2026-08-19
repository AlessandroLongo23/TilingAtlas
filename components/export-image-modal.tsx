"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, RotateCcw } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Slider } from "@/components/ui/slider";
import { useExportImage } from "@/stores/exportImage";
import { useConfiguration } from "@/stores/configuration";
import { captureFrame, MAX_CAPTURE_EDGE, playSurfaceColor } from "@/lib/render/capture";
import { measureBox } from "@/lib/render/canvasSize";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/render/viewControls";
import { parseBaseCell } from "@/lib/utils/renderTiling";
import { isIdentityDeform, wrapOffset } from "@/lib/render/flatView";
import { resolveDeform } from "@/stores/configuration";
import { Vector } from "@/classes/Vector";
import { tilingToSvg } from "@/lib/render/tilingSvg";
import { evalWithHue } from "@/lib/render/paramCellRender";
import { renderAlphaDegs } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { sanitizeForStorage } from "@/utils/storageKey";

// The /play image export.
//
// The shape of this dialog follows from one fact about the subject: a tiling is UNBOUNDED. Excalidraw and
// Figma export a bounded artwork, so "fit to content" is well defined and a scale multiplier is the only
// knob anyone needs. Here there is no content to fit and the frame is a free choice, which splits that one
// knob in two — how much pattern is in frame (Frame + Zoom) and how many pixels that frame gets (Size).
// They are separate rows on purpose. A "2x" that also showed twice as much pattern would be the obvious
// way to get this wrong.
//
// The preview runs the SAME pipeline as the download, at a 480px long edge. One code path means the
// preview cannot lie about the crop; the small size means dragging the zoom slider does not run a 4K
// capture per frame.

const PREVIEW_LONG_EDGE = 480;
const PREVIEW_DEBOUNCE_MS = 120;

type AspectId = "screen" | "square" | "wide" | "portrait" | "a4";

const ASPECTS: { value: AspectId; label: string; ratio: number | null }[] = [
	{ value: "screen", label: "Screen", ratio: null },
	{ value: "square", label: "1:1", ratio: 1 },
	{ value: "wide", label: "16:9", ratio: 16 / 9 },
	{ value: "portrait", label: "4:5", ratio: 4 / 5 },
	{ value: "a4", label: "A4", ratio: Math.SQRT2 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	// Revoking synchronously races the download in Safari; one turn of the event loop is enough.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

const toBlob = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

export function ExportImageModal() {
	const isOpen = useExportImage((s) => s.isOpen);
	const target = useExportImage((s) => s.target);
	const close = useExportImage((s) => s.close);

	const [aspect, setAspect] = useState<AspectId>("screen");
	const [zoom, setZoom] = useState(50);
	const [longEdge, setLongEdge] = useState(1920);
	// Non-null while the size follows a multiplier chip; cleared the moment the px field is typed into,
	// so an explicit number is never silently overwritten by an aspect change.
	const [scaleChip, setScaleChip] = useState<number | null>(2);
	const [opaque, setOpaque] = useState(true);
	const [format, setFormat] = useState<"png" | "svg">("png");

	// Why SVG is unavailable, or null when it is. Snapshotted on open: every input is a sidebar control,
	// and the sidebar is behind the dialog, so none of them can change while it is up.
	const [svgBlockedBy, setSvgBlockedBy] = useState<string | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Bumped by every settings change; a preview run that finds the counter moved on drops its result.
	const genRef = useRef(0);

	const baseCell = target?.cell ?? null;
	const paramCell = target?.paramCell ?? null;
	/**
	 * The cell to RENDER, which for a parametric family is not the one on the target: that is the
	 * alpha-independent base, and the shader derives the live shape per frame from the familyAlphas
	 * store. Evaluated through the very function the flat canvas uses, so a vector export and the pixels
	 * beside it cannot land on different parameters. Read imperatively at call time for the same reason
	 * the canvases do — the eased `live` tuple never passes through React.
	 */
	const liveCell = useCallback(() => {
		if (!paramCell) return baseCell;
		const fa = useFamilyAlphas.getState();
		return evalWithHue(paramCell, renderAlphaDegs(paramCell, fa.live, fa.values));
	}, [paramCell, baseCell]);
	const cell = baseCell;
	const canSvg = !!cell && !svgBlockedBy;
	// The zoom control drives `controls.zoom`, which only the flat Euclidean canvases read — the
	// hyperbolic disk and the three.js sphere each own their camera. Offering a slider there would be a
	// control that does nothing, so it is hidden instead.
	const canZoom = !!cell;

	const hostBox = useMemo(() => {
		if (!isOpen) return { w: 0, h: 0 };
		const { w, h } = measureBox(target?.host ?? null);
		return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
		// hostBox is measured once per open: the sidebar and header do not move while the dialog is up.
	}, [isOpen, target]);

	const ratio = useMemo(() => {
		const found = ASPECTS.find((a) => a.value === aspect);
		return found?.ratio ?? hostBox.w / hostBox.h;
	}, [aspect, hostBox]);

	// The CSS-pixel box the frame is projected through. Height is held at the on-screen height so tiles
	// keep the size they have on screen and only the framing changes; "Screen" reproduces the host box
	// exactly, which is what makes the dialog open showing what is behind it.
	const frame = useMemo(
		() => ({ w: Math.max(1, Math.round(hostBox.h * ratio)), h: hostBox.h }),
		[hostBox, ratio],
	);

	const baseLongEdge = Math.max(frame.w, frame.h);

	// Seed everything from the live view each time the dialog opens.
	useEffect(() => {
		if (!isOpen) return;
		setZoom(useConfiguration.getState().controls.zoom);
		setAspect("screen");
		setScaleChip(2);
		setOpaque(true);
		setFormat("png");
		// SVG renders the plain periodic tiling from the cell. Where the picture on screen is something
		// else in kind — not merely the same tiling with extra marks on it — offering SVG would hand over
		// a different image without saying so, so it is refused with the reason named.
		const c = useConfiguration.getState();
		setSvgBlockedBy(
			c.inversive ? "the conformal lens"
			: c.isIslamic ? "Islamic decoration"
			: c.truchetActive ? "Truchet figures"
			: c.circlePacking ? "circle packing"
			: !c.showPolygonFill ? "the tile fill being off"
			: !isIdentityDeform(resolveDeform(c)) ? "the basis deformation"
			: null,
		);
		setPreview(null);
		setError(null);
		setCopied(false);
	}, [isOpen]);

	// A multiplier chip is a rule, not a value: re-derive the px whenever the frame it multiplies changes.
	useEffect(() => {
		if (scaleChip == null) return;
		setLongEdge(clamp(Math.round(baseLongEdge * scaleChip), 64, MAX_CAPTURE_EDGE));
	}, [scaleChip, baseLongEdge]);

	const out = useMemo(() => {
		const long = clamp(Math.round(longEdge) || 1, 64, MAX_CAPTURE_EDGE);
		const w = frame.w >= frame.h ? long : Math.max(1, Math.round(long * ratio));
		const h = frame.w >= frame.h ? Math.max(1, Math.round(long / ratio)) : long;
		return { w, h, dpr: w / frame.w };
	}, [longEdge, frame, ratio]);

	const edgesAcross = useMemo(() => {
		if (!cell) return null;
		const base = parseBaseCell(liveCell() ?? cell);
		if (!base || base.medianEdge <= 0 || zoom <= 0) return null;
		return frame.w / (zoom * base.medianEdge);
	}, [cell, liveCell, frame.w, zoom]);

	const background = opaque ? playSurfaceColor() : null;

	/** One capture at the requested output width, with the export zoom held for its duration. Only the
	 *  width is needed: the frame box fixes the aspect, so the height follows from it. */
	const runCapture = useCallback(
		async (outW: number) => {
			const ctrl = useConfiguration.getState().controls;
			const savedZoom = ctrl.zoom;
			const savedTarget = ctrl.targetZoom;
			// Mutated in place, not through setState: the render loops ease `zoom` toward `targetZoom` by
			// mutating this same object every frame, so that is the only write they will actually see.
			// Setting BOTH defeats the ease, which is what makes the captured frame land on exactly this
			// zoom instead of somewhere along a glide. The live view is behind the dialog's backdrop for
			// the three frames this lasts.
			if (canZoom) {
				ctrl.zoom = zoom;
				ctrl.targetZoom = zoom;
			}
			try {
				return await captureFrame(
					{ w: frame.w, h: frame.h, dpr: outW / frame.w },
					{ background },
				);
			} finally {
				if (canZoom) {
					ctrl.zoom = savedZoom;
					ctrl.targetZoom = savedTarget;
				}
			}
		},
		[frame, background, zoom, canZoom],
	);

	// Debounced preview. Every dependency here is a setting the user can move, so a drag coalesces into
	// one capture instead of one per frame.
	useEffect(() => {
		if (!isOpen) return;
		const gen = ++genRef.current;
		const timer = setTimeout(async () => {
			const long = PREVIEW_LONG_EDGE;
			const pw = frame.w >= frame.h ? long : Math.round(long * ratio);
			try {
				const canvas = await runCapture(pw);
				if (gen !== genRef.current) return;
				if (!canvas) {
					setError("Nothing was drawn on this view.");
					return;
				}
				setPreview(canvas.toDataURL("image/png"));
				setError(null);
			} catch (e) {
				if (gen === genRef.current) setError(e instanceof Error ? e.message : String(e));
			}
		}, PREVIEW_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [isOpen, frame, ratio, runCapture]);

	const filename = `${sanitizeForStorage(target?.rulestring || "tiling")}-${out.w}x${out.h}`;

	const buildSvg = useCallback((): Blob | null => {
		const live = liveCell();
		const base = live ? parseBaseCell(live) : null;
		if (!live || !base || zoom <= 0) return null;
		const cfg = useConfiguration.getState();

		// The frame in world units. viewW/viewH are what the viewBox will be; the PATCH has to be bigger
		// than that, because the content is rotated and panned into place afterwards and the corners
		// would otherwise come up empty.
		const viewW = frame.w / zoom;
		const viewH = frame.h / zoom;
		const rot = ((cfg.rotation || 0) * Math.PI) / 180;

		// The pan, wrapped against the same screen lattice the shader wraps against (both read their
		// basis from parseBaseCell, so this is the identical reduction) and converted to world units.
		// Wrapping is what keeps the over-cover bounded: a raw pan grows without limit as you drag.
		const [[v1x, v1y], [v2x, v2y]] = base.basis;
		const det = v1x * v2y - v2x * v1y;
		const o = cfg.controls.offset;
		const { draw } = wrapOffset(
			new Vector(o.x, o.y), new Vector(v1x, v1y), new Vector(v2x, v2y), det, zoom, rot,
		);
		const tx = draw.x / zoom;
		const ty = draw.y / zoom;

		// tilingToSvg centres its patch on the CELL CENTROID; the shader centres the view on the world
		// ORIGIN. Left alone that is a constant offset between the two exports of the same view — not a
		// lattice vector in general, so it really is a different crop, not the same picture shifted by a
		// whole tile. The innermost transform below cancels it, and the coverage has to grow by it.
		const cx = (base.minX + base.maxX) / 2;
		const cy = (base.minY + base.maxY) / 2;

		// Half-extents of the frame pulled back through the transform: un-translate, then un-rotate.
		const ca = Math.abs(Math.cos(rot));
		const sa = Math.abs(Math.sin(rot));
		const bx = Math.cos(rot) * tx + Math.sin(rot) * ty;
		const by = -Math.sin(rot) * tx + Math.cos(rot) * ty;
		const hx = (viewW / 2) * ca + (viewH / 2) * sa + Math.abs(bx) + Math.abs(cx);
		const hy = (viewW / 2) * sa + (viewH / 2) * ca + Math.abs(by) + Math.abs(cy);

		const svg = tilingToSvg(live, (2 * hx) / base.medianEdge, hx / hy, cfg.hueOffset || 0);
		if (!svg) return null;

		// The tile outline, matched to what the shader draws rather than to the preview cards' softer
		// 45% grey: opaque, `lineWidth` CSS px wide. viewW maps to frame.w CSS px, so that ratio turns a
		// screen width into viewBox units.
		const lineWidth = cfg.lineWidth ?? 0;
		const sw = (lineWidth * viewW) / frame.w;
		const viewBox = `${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`;
		const bg = background
			? `<rect x="${-viewW / 2}" y="${-viewH / 2}" width="100%" height="100%" fill="${background}"/>`
			: "";
		const body = svg.paths.map((q) => `<path d="${q.d}" fill="${q.fill}"/>`).join("");
		// pan ∘ rotate ∘ recentre, innermost first: recentre moves the patch from centroid-relative to
		// true y-flipped world coordinates, then rotate and pan reproduce screen = pan + R·(flipped world),
		// the composition FILL_VERT applies. SVG's rotate() is clockwise in a y-down frame, which is the
		// sense the shader's [[c,-s],[s,c]] already has after the flip, so no sign correction is needed.
		const inner =
			`<g transform="translate(${tx},${ty}) rotate(${cfg.rotation || 0}) translate(${cx},${-cy})">${body}</g>`;
		const tiles =
			lineWidth > 0
				? `<g stroke="#000000" stroke-width="${sw}">${inner}</g>`
				: `<g>${inner}</g>`;
		const doc =
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${out.w}" height="${out.h}">` +
			bg +
			tiles +
			`</svg>`;
		return new Blob([doc], { type: "image/svg+xml" });
	}, [liveCell, zoom, out.w, out.h, frame.w, frame.h, background]);

	const handleDownload = async () => {
		setBusy(true);
		setError(null);
		try {
			if (format === "svg") {
				const blob = buildSvg();
				if (!blob) {
					setError("This view has no cell to render as SVG.");
					return;
				}
				download(blob, `${filename}.svg`);
				close();
				return;
			}
			const canvas = await runCapture(out.w);
			const blob = canvas ? await toBlob(canvas) : null;
			if (!blob) {
				setError("The capture came back empty.");
				return;
			}
			download(blob, `${filename}.png`);
			close();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const handleCopy = async () => {
		setBusy(true);
		setError(null);
		try {
			const canvas = await runCapture(out.w);
			const blob = canvas ? await toBlob(canvas) : null;
			if (!blob) {
				setError("The capture came back empty.");
				return;
			}
			await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const canCopy = typeof window !== "undefined" && typeof ClipboardItem !== "undefined";

	return (
		<Modal
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open && !busy) close();
			}}
			title="Export image"
			description="Choose a frame, zoom and output size, then download the current view as a PNG or SVG."
			size="lg"
		>
			<div className="p-4">
				<div className="flex flex-col md:flex-row gap-6">
					{/* The preview is the instrument, not a confirmation: you are choosing a crop of something
					    infinite, so it gets the space. Checkerboard shows through a transparent export. */}
					<div className="md:flex-1 min-w-0 flex flex-col gap-2">
						<div
							className="relative flex items-center justify-center rounded-md border border-line bg-surface-raised/60 overflow-hidden min-h-[260px] md:min-h-[340px]"
							style={
								opaque
									? undefined
									: {
											backgroundImage:
												"repeating-conic-gradient(var(--color-surface-raised) 0% 25%, var(--color-surface-base) 0% 50%)",
											backgroundSize: "16px 16px",
										}
							}
						>
							{preview ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={preview}
									alt="Export preview"
									className="max-w-full max-h-[340px] object-contain"
								/>
							) : (
								<Loader2 size={28} className="animate-spin text-fg-muted" />
							)}
						</div>
						<p className="text-xs text-fg-muted tabular-nums">
							{out.w} × {out.h} · {format.toUpperCase()}
						</p>
					</div>

					<div className="md:w-72 shrink-0 flex flex-col gap-5">
						<div className="flex flex-col gap-2">
							<SectionHeading>Frame</SectionHeading>
							<ButtonGroup
								options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))}
								selected={aspect}
								onChange={(v) => setAspect(v)}
							/>
							{canZoom ? (
								<div className="pt-1 flex flex-col gap-1">
									<Slider
										label="Zoom"
										value={Math.round(zoom)}
										onChange={setZoom}
										min={ZOOM_MIN}
										max={ZOOM_MAX}
										step={1}
										format={() =>
											edgesAcross != null ? `≈ ${edgesAcross.toFixed(1)} edges across` : ""
										}
									/>
									<button
										type="button"
										onClick={() => setZoom(useConfiguration.getState().controls.zoom)}
										className="self-start inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
									>
										<RotateCcw size={12} />
										Match current view
									</button>
								</div>
							) : (
								<p className="text-xs text-fg-muted">
									This view owns its own camera; the export uses the zoom on screen.
								</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<SectionHeading>Size</SectionHeading>
							<div className="flex items-center gap-2">
								<ButtonGroup
									options={[1, 2, 4].map((n) => ({ value: n, label: `${n}×` }))}
									selected={scaleChip}
									onChange={(n) => setScaleChip(n)}
								/>
								<div className="w-24">
									<Input
										type="number"
										value={longEdge}
										min={64}
										max={MAX_CAPTURE_EDGE}
										step={1}
										size="sm"
										align="center"
										onChange={(e) => {
											setScaleChip(null);
											setLongEdge(clamp(Number(e.target.value) || 0, 64, MAX_CAPTURE_EDGE));
										}}
									/>
								</div>
							</div>
							<p className="text-xs text-fg-muted">Long edge in pixels, up to {MAX_CAPTURE_EDGE}.</p>
						</div>

						<div className="flex flex-col gap-2">
							<SectionHeading>Background</SectionHeading>
							<ButtonGroup
								options={[
									{ value: true, label: "Theme" },
									{ value: false, label: "Transparent" },
								]}
								selected={opaque}
								onChange={(v) => setOpaque(v)}
							/>
						</div>
					</div>
				</div>

				{error ? (
					<p className="mt-4 text-sm text-danger bg-danger-subtle border border-danger/30 rounded-md px-3 py-2">
						{error}
					</p>
				) : null}

				<div className="mt-5 pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center gap-3">
					<div className="flex items-center gap-3">
						<ButtonGroup
							options={[
								{ value: "png" as const, label: "PNG" },
								{ value: "svg" as const, label: "SVG", disabled: !canSvg },
							]}
							selected={format}
							onChange={(v) => setFormat(v)}
						/>
						{svgBlockedBy ? (
							<p className="text-xs text-fg-muted max-w-[24rem]">
								SVG is unavailable with {svgBlockedBy}.
							</p>
						) : format === "svg" ? (
							<p className="text-xs text-fg-muted max-w-[24rem]">
								SVG carries the tiling, its colours, the framing and the rotation. Overlays — points,
								symmetry elements, orbits — are PNG only.
							</p>
						) : null}
					</div>
					<div className="sm:ml-auto flex items-center gap-2">
						{canCopy && format === "png" ? (
							<Button
								variant="secondary"
								onClick={handleCopy}
								disabled={busy}
								icon={copied ? Check : Copy}
								label={copied ? "Copied" : "Copy"}
							/>
						) : null}
						<Button
							variant="primary"
							onClick={handleDownload}
							disabled={busy}
							icon={busy ? Loader2 : Download}
							label={busy ? "Rendering…" : "Download image"}
						/>
					</div>
				</div>
			</div>
		</Modal>
	);
}
