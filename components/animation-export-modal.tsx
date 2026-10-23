"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Download, Loader2 } from "lucide-react";
import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { SectionHeading } from "@/components/ui/section-heading";
import { ASPECTS, download, type AspectId } from "@/components/export-image-modal";
import { useAnimation, type Ending } from "@/stores/animation";
import { moveLength, type CameraDriver, type Pose } from "@/lib/render/cameraPose";
import { captureFrame, freezeView, playSurfaceColor } from "@/lib/render/capture";
import { MAX_DPR, measureBox } from "@/lib/render/canvasSize";
import { sanitizeForStorage } from "@/utils/storageKey";

// The animation timeline's export dialog, opened by its Done button: the GIF preview on the left, the
// options on the right, as in the still-image dialog. The preview is a real render through the same
// pipeline as the download, only smaller, so it cannot disagree with the file.

export const FPS = 25; // GIF delays are in 10 ms units; 40 ms is exact
const SIZES = [480, 640, 960];
const PREVIEW_LONG_EDGE = 360;
const PREVIEW_DEBOUNCE_MS = 200;
const STROBE_PX = 40;

const ENDINGS: { value: Ending; label: string; note: string }[] = [
	{ value: "hold", label: "Hold", note: "Plays through the keyframes once and holds on the last one until the end." },
	{ value: "return", label: "Return", note: "Flies back to the first keyframe by the end, so the GIF loops." },
	{
		value: "drift",
		label: "Drift",
		note: "Flies to the first keyframe moved by one period of the tiling. That view looks identical to the first, so the GIF loops with the pattern still travelling.",
	},
];

type Token = { stale: boolean };

export function AnimationExportModal({
	open,
	onClose,
	hostRef,
	scope,
	viewAt,
	driver,
}: {
	open: boolean;
	onClose: () => void;
	hostRef: RefObject<HTMLElement | null>;
	/** Names the file. */
	scope: string;
	/** The camera at a time on the timeline. */
	viewAt: (t: number) => Pose | null;
	/** The camera the frames are rendered through; null while no canvas has published one. */
	driver: CameraDriver | null;
}) {
	const { keys, duration, ending, set } = useAnimation();
	const [size, setSize] = useState(640);
	const [aspect, setAspect] = useState<AspectId>("screen");
	// Seeded on open the way the still dialog seeds it: a disk opens square, everything else as on screen.
	useEffect(() => {
		if (open) setAspect(driver?.kind === "disk" ? "square" : "screen");
	}, [open, driver?.kind]);
	const [preview, setPreview] = useState<string | null>(null);
	const [progress, setProgress] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	// Renders share the live canvases, so they run one after another; a newer request marks the older
	// one stale and it stops at its next frame.
	const chain = useRef<Promise<unknown>>(Promise.resolve());
	const previewUrl = useRef<string | null>(null);

	const frameCount = Math.round(duration * FPS) + (ending === "hold" ? 1 : 0);
	const canRender = !!driver && keys.length > 0 && (keys.length > 1 || ending === "drift") && frameCount > 1;

	/**
	 * The fastest frame, in CSS px of picture motion. At 25 fps a pattern that jumps more than about a
	 * tile per frame strobes: the eye pairs each tile with the wrong one in the next frame. The disk is
	 * where this bites, since a short hyperbolic move near the centre sweeps the whole screen.
	 */
	const fastest = useMemo(() => {
		if (!open || !driver || !canRender) return 0;
		let max = 0;
		for (let i = 0; i + 1 < frameCount; i++) {
			const a = viewAt(i / FPS),
				b = viewAt((i + 1) / FPS);
			if (a && b) max = Math.max(max, moveLength(driver, a, b, null, 1));
		}
		return max;
	}, [open, driver, canRender, frameCount, viewAt]);

	async function render(longEdge: number, token: Token, verb: string): Promise<Blob | null> {
		const host = hostRef.current;
		if (!host) return null;
		const m = measureBox(host);
		const box = { w: Math.max(1, Math.round(m.w)), h: Math.max(1, Math.round(m.h)) };
		// The frame: the on-screen height, the chosen shape's width, so tiles keep their on-screen size and
		// only the framing changes (export-image-modal does the same).
		const ratio = ASPECTS.find((a) => a.value === aspect)?.ratio ?? box.w / box.h;
		const frame = { w: Math.max(1, Math.round(box.h * ratio)), h: box.h };
		const outW = frame.w >= frame.h ? longEdge : Math.round((longEdge * frame.w) / frame.h);
		if (!driver) return null;
		const saved = driver.read();
		// A still of the view covers the canvases while they draw the frames at export size underneath.
		const lift = await freezeView(host, { ...box, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR) });
		const enc = GIFEncoder();
		const grab = async (i: number) => {
			driver.apply(viewAt(i / FPS)!);
			const canvas = await captureFrame({ ...frame, dpr: outW / frame.w }, { background: playSurfaceColor() });
			const ctx = canvas?.getContext("2d", { willReadFrequently: true });
			if (!canvas || !ctx) throw new Error("A frame came back empty.");
			return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
		};
		try {
			// ONE palette for the whole animation (a per-frame palette makes flat tiles shimmer as it shifts),
			// sampled from frames across it. It used to come from the first frame alone, so an animation that
			// opens on one colour lost every other: a star family keyframed near α = 0 is nearly all
			// triangles, and its purple and green stars came out red and white for the rest of the GIF.
			const SAMPLES = Math.min(8, frameCount);
			const pool: number[] = [];
			for (let s = 0; s < SAMPLES; s++) {
				if (token.stale) return null;
				setProgress(`${verb}: colours ${s + 1} / ${SAMPLES}`);
				const { data } = await grab(Math.round((s * (frameCount - 1)) / Math.max(1, SAMPLES - 1)));
				for (let k = 0; k < data.length; k += 4 * 7) pool.push(data[k], data[k + 1], data[k + 2], data[k + 3]);
			}
			const palette: Palette = quantize(new Uint8Array(pool), 256);
			for (let i = 0; i < frameCount; i++) {
				if (token.stale) return null;
				setProgress(`${verb} ${i + 1} / ${frameCount}`);
				const { data, w, h } = await grab(i);
				enc.writeFrame(applyPalette(data, palette), w, h, { palette: i === 0 ? palette : undefined, delay: 1000 / FPS });
			}
			enc.finish();
			return new Blob([enc.bytes() as BlobPart], { type: "image/gif" });
		} finally {
			if (saved) driver.apply(saved);
			driver.commit();
			lift();
			setProgress(null);
		}
	}

	const queue = (fn: () => Promise<void>) => {
		chain.current = chain.current.then(fn).catch((e) => setError(e instanceof Error ? e.message : String(e)));
		return chain.current;
	};

	// The preview follows every option, debounced so clicking through them renders once.
	useEffect(() => {
		if (!open || !canRender) return;
		const token: Token = { stale: false };
		const timer = setTimeout(
			() =>
				queue(async () => {
					if (token.stale) return;
					setError(null);
					const blob = await render(PREVIEW_LONG_EDGE, token, "Rendering preview");
					if (!blob || token.stale) return;
					if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
					previewUrl.current = URL.createObjectURL(blob);
					setPreview(previewUrl.current);
				}),
			PREVIEW_DEBOUNCE_MS,
		);
		return () => {
			token.stale = true;
			clearTimeout(timer);
		};
		// render/queue close over the props listed; they are recreated each render on purpose.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, canRender, viewAt, frameCount, aspect]);

	useEffect(() => () => void (previewUrl.current && URL.revokeObjectURL(previewUrl.current)), []);

	const save = () => {
		setSaving(true);
		const token: Token = { stale: false };
		void queue(async () => {
			const blob = await render(size, token, "Rendering");
			if (blob) {
				download(blob, `${sanitizeForStorage(scope || "tiling")}.gif`);
				onClose();
			}
		}).finally(() => setSaving(false));
	};

	return (
		<Modal
			isOpen={open}
			onOpenChange={(o) => {
				if (!o && !saving) onClose();
			}}
			title="Export animation"
			description="Preview the animation, choose how it ends and its size, then download it as a GIF. Speed curves are set per move on the timeline."
			size="lg"
		>
			<div className="p-4">
				<div className="flex flex-col gap-6 md:flex-row">
					<div className="flex min-w-0 flex-col gap-2 md:flex-1">
						<div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md border border-line bg-surface-raised/60 md:min-h-[340px]">
							{preview ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img src={preview} alt="Animation preview" className="max-h-[340px] max-w-full object-contain" />
							) : !canRender ? (
								<p className="max-w-xs px-4 text-center text-sm text-fg-muted">
									Add a second keyframe, or choose Drift, to have something to animate.
								</p>
							) : null}
							{progress ? (
								<p className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded bg-surface-raised/90 px-2 py-1 text-xs text-fg-muted tabular-nums">
									<Loader2 size={12} className="animate-spin" />
									{progress}
								</p>
							) : null}
						</div>
						<p className="text-xs text-fg-muted tabular-nums">
							{frameCount} frames · {(frameCount / FPS).toFixed(1)} s · {FPS} fps · GIF
						</p>
						{fastest > STROBE_PX ? (
							<p className="text-xs text-warning">
								The fastest frame moves the picture {Math.round(fastest)} px. Above about {STROBE_PX} px a frame the
								pattern can strobe; give that move more time, or turn on Time by distance.
							</p>
						) : null}
					</div>

					<div className="flex shrink-0 flex-col gap-5 md:w-72">
						<div className="flex flex-col gap-2">
							<SectionHeading>After the last keyframe</SectionHeading>
							<ButtonGroup
								options={ENDINGS.map((e) => ({ value: e.value, label: e.label }))}
								selected={ending}
								onChange={(v) => set({ ending: v })}
							/>
							<p className="text-xs text-fg-muted">{ENDINGS.find((e) => e.value === ending)?.note}</p>
						</div>

						<div className="flex flex-col gap-2">
							<SectionHeading>Frame</SectionHeading>
							<ButtonGroup
								options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))}
								selected={aspect}
								onChange={setAspect}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<SectionHeading>Size</SectionHeading>
							<ButtonGroup
								options={SIZES.map((n) => ({ value: n, label: `${n}px` }))}
								selected={size}
								onChange={setSize}
							/>
							<p className="text-xs text-fg-muted">Long edge in pixels.</p>
						</div>
					</div>
				</div>

				{error ? (
					<p className="mt-4 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
						{error}
					</p>
				) : null}

				<div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:-mb-4 max-md:bg-surface-raised max-md:px-4 max-md:pb-4">
					<Button
						variant="primary"
						onClick={save}
						disabled={!canRender || saving}
						icon={saving ? Loader2 : Download}
						label={saving ? "Rendering…" : "Download GIF"}
					/>
				</div>
			</div>
		</Modal>
	);
}
