"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Download, Grid3x3, Palette } from "lucide-react";
import { ParquetStrip } from "@/components/parquet-strip";
import { CornerControls } from "@/components/ui/corner-controls";
import { PageSidebar } from "@/components/page-sidebar";
import { PeekTitle } from "@/components/dock-peek";
import { Slider } from "@/components/ui/slider";
import { OptionWall } from "@/components/ui/option-wall";
import { InfoDot } from "@/components/ui/info-dot";
import { FloatingToolbar, ToolbarButton, ToolbarDivider } from "@/components/ui/floating-toolbar";
import { VelocityPad } from "@/components/ui/velocity-pad";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { onViewReset, useTouchGestures } from "@/lib/render/touchGestures";
import { MODE_PATCH, useParquet } from "@/lib/stores/parquet";
import { useImmersive } from "@/stores/immersive";
import type { EdgeProfile, Pt } from "@/lib/render/parquetStrip";
import { parquetToSvgString, parquetViewBox } from "@/lib/render/parquetSvg";
import {
  DRIFT_MARGIN,
  TILINGS,
  buildDeformedTiling,
  keyframeExtremes,
  translateInstance,
  wrapOffset,
  type TilingId,
} from "@/lib/render/parquetTiling";
import {
  CORNER_KEYS,
  CORNER_LABELS,
  blendFill,
  buildBlendField,
  type FieldKind,
  type FieldSpec,
  type ParquetMode,
  type Vec2,
} from "@/lib/render/parquetField";
import {
  PARQUET_PRESETS,
  D_PROFILE_META,
  type DProfileId,
  type ParquetPresetId,
} from "@/lib/render/parquetPresets";

const MODE_OPTIONS = [
  { value: "1d" as ParquetMode, label: "1D strip" },
  { value: "2d" as ParquetMode, label: "2D patch" },
];
const FIELD_OPTIONS = [
  { value: "profile" as FieldKind, label: "Profile" },
  { value: "noise" as FieldKind, label: "Noise" },
];
const TILING_OPTIONS = (Object.keys(TILINGS) as TilingId[]).map((id) => ({
  value: id,
  label: TILINGS[id].label,
}));
const PRESET_OPTIONS = Object.values(PARQUET_PRESETS).map((p) => ({ value: p.id, label: p.label }));
const D_OPTIONS = (Object.keys(D_PROFILE_META) as DProfileId[]).map((id) => ({
  value: id,
  label: D_PROFILE_META[id].label,
}));

/** Patch-fractions per second at full deflection: ~4 s to cross the patch, slow enough to read. */
const MAX_DRIFT = 0.25;

const isMoving = (v: Vec2) => v.x !== 0 || v.y !== 0;
const fmtDrift = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

/** A sidebar row: a field label in the Slider's own type (with an optional info dot and a right-hand
 *  slot) over its control. Mono caps are kept for the group headings above the rows. */
function Row({ label, info, right, children }: { label: ReactNode; info?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-medium text-fg-secondary">{label}</span>
        {info && <InfoDot>{info}</InfoDot>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/** A titled group of rows; every group after the first gets a hairline above it. */
function Group({ title, first, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <section className={`grid gap-4 ${first ? "" : "border-t border-line-subtle pt-5"}`}>
      <h2 className="ta-label font-semibold text-fg!">{title}</h2>
      {children}
    </section>
  );
}

/** Pinch-zoom range on the phone, as a multiple of the fitted drawing. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

/**
 * Fingers on the phone's drawing: one pans, two pinch-zoom about their midpoint, a double-tap (or the
 * Reset view button) fits it again. The drawing is SVG, so the view is a CSS transform on the box that
 * holds it, written straight to the element: a pan must not re-render a few hundred paths per frame.
 * Mouse and pen are ignored, so the desktop's drawing stays a still picture as it always was. `home`
 * changing (a new mode, tiling or size) fits the drawing again.
 */
function usePinchView(home: unknown) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const t = useRef({ s: 1, x: 0, y: 0 });
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const apply = useCallback(() => {
    const el = viewRef.current;
    const { s, x, y } = t.current;
    if (el) el.style.transform = s === 1 && x === 0 && y === 0 ? "" : `translate(${x}px, ${y}px) scale(${s})`;
  }, []);
  const reset = useCallback(() => {
    t.current = { s: 1, x: 0, y: 0 };
    apply();
  }, [apply]);
  // Two fingers, through the shared tracker bound to the frame; its native listeners run before the
  // React handlers below, so `pinching` is already set when the one-finger pan asks.
  const touch = useTouchGestures(frameRef, {
    pinchStart: () => {
      pan.current = null;
    },
    pinch: ({ from, to, scale }) => {
      const v = t.current;
      const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s * scale));
      const k = s / v.s;
      t.current = { s, x: to.x - k * (from.x - v.x), y: to.y - k * (from.y - v.y) };
      apply();
    },
    doubleTap: reset,
  });
  useEffect(() => onViewReset(reset), [reset]);
  useEffect(reset, [home, reset]);

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pan.current?.id === e.pointerId) pan.current = null;
  };
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch" || touch.pinching) return;
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = pan.current;
      if (touch.pinching || !p || p.id !== e.pointerId) return;
      t.current = { ...t.current, x: t.current.x + e.clientX - p.x, y: t.current.y + e.clientY - p.y };
      p.x = e.clientX;
      p.y = e.clientY;
      apply();
    },
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
  return { viewRef, frameRef, handlers };
}

function downloadSvg(svg: string, name: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ParquetClient() {
  const {
    mode,
    fieldKind,
    tiling,
    fromPreset,
    toPreset,
    cornerPresets,
    dProfile,
    dProfileY,
    noiseFrequency,
    noiseContrast,
    noiseSpeed,
    noiseSeed,
    gridDrift,
    fieldDrift,
    amount,
    cols,
    rows,
    showGuides,
    colour,
    set,
  } = useParquet();

  const twoD = mode === "2d";
  const noise = fieldKind === "noise";
  const corners = twoD && !noise;

  // Anything that makes the picture move: either drift channel, or noise evolving in its own time
  // axis. When nothing moves the rAF loop is never started, so a static strip costs zero frames.
  const animating =
    isMoving(gridDrift) || isMoving(fieldDrift) || (noise && noiseSpeed !== 0);

  // One clock in SECONDS drives every motion, so the drifts stay comparable to each other and to the
  // noise speed however the frame rate wobbles. (The old per-frame phase increment tied the speed of
  // the animation to the display's refresh rate.)
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current += (now - last) / 1000;
      last = now;
      setTime(timeRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  // A drifting grid needs tiles beyond the frame to stream in; a static one is drawn exactly as
  // before, ragged boundary and all (which is what the SVG export wants).
  const margin = isMoving(gridDrift) ? DRIFT_MARGIN : 0;
  const base = useMemo(
    () => TILINGS[tiling].build(cols, rows, margin),
    [tiling, cols, rows, margin],
  );

  // Grid drift, reduced onto the tiling's own period. Translating a periodic patch by a whole period
  // maps it onto itself, so the wrap is invisible: tiles stream through a frame that never moves,
  // and the whole motion is an exact loop.
  const instance = useMemo(() => {
    if (!isMoving(gridDrift)) return base;
    return translateInstance(
      base,
      wrapOffset(gridDrift.x * time * base.width, base.period.x),
      wrapOffset(gridDrift.y * time * base.height, base.period.y),
    );
  }, [base, gridDrift, time]);

  const keyframes: EdgeProfile[] = useMemo(
    () =>
      corners
        ? cornerPresets.map((id) => PARQUET_PRESETS[id].edge)
        : [PARQUET_PRESETS[fromPreset].edge, PARQUET_PRESETS[toPreset].edge],
    [corners, cornerPresets, fromPreset, toPreset],
  );

  const spec: FieldSpec = useMemo(
    () => ({
      mode,
      kind: fieldKind,
      profileX: dProfile,
      profileY: dProfileY,
      noise: {
        frequency: noiseFrequency,
        contrast: noiseContrast,
        speed: noiseSpeed,
        seed: noiseSeed,
      },
      drift: fieldDrift,
      time,
      width: base.width,
      height: base.height,
    }),
    [
      mode,
      fieldKind,
      dProfile,
      dProfileY,
      noiseFrequency,
      noiseContrast,
      noiseSpeed,
      noiseSeed,
      fieldDrift,
      time,
      base.width,
      base.height,
    ],
  );

  const field = useMemo(() => buildBlendField(spec), [spec]);

  const tiles = useMemo(
    () => buildDeformedTiling(instance, { keyframes, amount, weights: field }),
    [instance, keyframes, amount, field],
  );
  const tileOutlines: Pt[][] = useMemo(() => tiles.map((t) => t.outline), [tiles]);

  const guideOutlines: Pt[][] = useMemo(
    () => (showGuides ? instance.faces : []),
    [showGuides, instance],
  );

  // The patch's box, held fixed against everything the deformation does to it. Fitted to the frame
  // on screen it would breathe — tiles swing past the edges, the box follows, and the drawing
  // rescales under the very slider you are dragging.
  //
  // The envelope is exact, not sampled: the geometry is affine in `amount` and affine in the blend
  // weights, and the weights are convex, so the extremes sit at amount = 0 (the base faces) and at
  // each pure keyframe. Motion only moves the field's ARGUMENT, never its range, so the same box
  // also holds still for the whole animation.
  //
  // Deliberately not keyed on `amount`, `time` or either drift — reacting to those is the bug.
  const viewBox = useMemo(
    () => parquetViewBox([base.faces.slice(0, base.coreCount), ...keyframeExtremes(base, keyframes)]),
    [base, keyframes],
  );

  // Per-tile fill from the SAME weights that shape the tile, so the colour reads the field directly
  // (and a 4-corner patch gets four base hues blending across it, not a one-axis gradient).
  const fills = useMemo(() => {
    if (!colour) return undefined;
    return instance.faces.map((face) => {
      const cx = face.reduce((s, p) => s + p[0], 0) / face.length;
      const cy = face.reduce((s, p) => s + p[1], 0) / face.length;
      return blendFill(field(cx, cy));
    });
  }, [colour, instance, field]);

  // On a phone a 1D strip stands on end: 24 by 4 tiles fitted across a portrait screen is a 60px band,
  // and turned it runs the height of the canvas. The drawing pans and pinch-zooms there, and gets the
  // explorers' corner pair (reset view, fullscreen).
  const isPhone = useIsPhone();
  const vertical = isPhone && !twoD;
  const { frameRef, viewRef, handlers: pinchHandlers } = usePinchView(`${viewBox} ${vertical}`);
  useEffect(() => {
    if (!isPhone) useImmersive.getState().set(false);
  }, [isPhone]);
  useEffect(() => () => useImmersive.getState().set(false), []);

  // Every option row is one segmented track, a cell per option, so all rows share the sidebar's edge.
  const wall = <T,>(options: { value: T; label: string }[], selected: T, onChange: (v: T) => void) => (
    <OptionWall<T> options={options} columns={options.length} selected={selected} onChange={onChange} />
  );

  const presetGroup = (
    label: string,
    value: ParquetPresetId,
    onChange: (v: ParquetPresetId) => void,
  ) => (
    <Row label={label} key={label}>
      {wall(PRESET_OPTIONS, value, onChange)}
    </Row>
  );

  const driftControl = (
    label: string,
    hint: string,
    value: Vec2,
    onChange: (v: Vec2) => void,
  ) => {
    const stop = isMoving(value) && (
      <button
        type="button"
        className="text-xs text-fg-muted hover:text-fg underline underline-offset-2"
        onClick={() => onChange({ x: 0, y: 0 })}
      >
        stop
      </button>
    );
    // In 1D the slider carries the label and readout itself, so the row does not repeat it.
    return twoD ? (
      <Row label={label} info={hint} right={stop}>
        <VelocityPad
          value={value}
          onChange={onChange}
          maxRate={MAX_DRIFT}
          labelX="x"
          labelY="y"
          size={112}
          ariaLabel={`${label}: drag to hold a direction and speed`}
          formatValue={(v) => `x ${v.x.toFixed(2)}, y ${v.y.toFixed(2)}`}
        />
      </Row>
    ) : (
      <Slider
        id={`parquet-${label.toLowerCase().replace(" ", "-")}`}
        label={label}
        hint={<><InfoDot>{hint}</InfoDot>{stop}</>}
        min={-MAX_DRIFT}
        max={MAX_DRIFT}
        step={0.01}
        value={value.x}
        onChange={(v) => onChange({ x: v, y: 0 })}
        format={(v) => (v === 0 ? "still" : `${fmtDrift(v)} w/s`)}
      />
    );
  };

  // On a phone the controls are the dock sheet over a full-bleed drawing (PageSidebar mobile="dock"):
  // the peek row names the page and the current set-up, and the drawing keeps clear of the sheet and the
  // toolbar parked on top of it.
  // The panel scrolls itself, and on a desktop its bottom fade is laid over the whole column, border
  // included, the way this page has always drawn it.
  return (
    <div className="relative flex-1 min-h-0 flex flex-col md:flex-row max-md:flex-row">
      {/* The phone's corner pair over the drawing, whose corner is this box's; first in the DOM so it is
          read before the sheet. */}
      <CornerControls fullscreen="phone" />
      <div className="shrink-0 md:[mask-image:linear-gradient(to_bottom,#000_calc(100%-24px),transparent)]">
        <PageSidebar
          mobile="dock"
          title="Parquet"
          scrollable={false}
          peek={
            <PeekTitle
              title="Parquet deformation"
              sub={`${MODE_OPTIONS.find((o) => o.value === mode)?.label} · ${TILINGS[tiling].label} · ${FIELD_OPTIONS.find((o) => o.value === fieldKind)?.label}`}
            />
          }
        >
          <div className="h-full overflow-y-auto px-4 pt-4 pb-10 flex flex-col gap-6 max-md:pt-2 max-md:overflow-x-hidden max-md:overscroll-contain max-md:[mask-image:linear-gradient(to_bottom,#000_calc(100%-24px),transparent)]">
            <header>
              <h1 className="text-[15px] font-semibold text-fg max-md:hidden">Parquet deformation</h1>
              <p className="text-xs text-fg-muted mt-0.5">Edges evolve across the plane, yet every shape tiles.</p>
            </header>

            <Group title="Shape" first>
              <Row
                label="Deformation"
                info={
                  twoD
                    ? "D varies in both directions: a shape per corner of the patch, bilinearly blended."
                    : "D varies along the strip: one shape at each end."
                }
              >
                {wall(MODE_OPTIONS, mode, (v) => set({ mode: v, ...MODE_PATCH[v] }))}
              </Row>

              <Row label="Tiling">{wall(TILING_OPTIONS, tiling, (v) => set({ tiling: v }))}</Row>

              <Row
                label="Deformation field"
                info={
                  noise
                    ? `Perlin noise in ${twoD ? "3D (x, y, time)" : "2D (x, time)"}: the evolution wanders instead of running end to end.`
                    : "An analytic profile: ramp, tent or sine."
                }
              >
                {wall(FIELD_OPTIONS, fieldKind, (v) => set({ fieldKind: v }))}
              </Row>

              {/* Keyframe shapes: four corners for the 2-D bilinear patch, two otherwise. */}
              {corners
                ? CORNER_KEYS.map((k, i) =>
                    presetGroup(CORNER_LABELS[k], cornerPresets[i], (v) => {
                      const next = [...cornerPresets] as typeof cornerPresets;
                      next[i] = v;
                      set({ cornerPresets: next });
                    }),
                  )
                : [
                    presetGroup(noise ? "Shape A" : "From edge (left)", fromPreset, (v) =>
                      set({ fromPreset: v }),
                    ),
                    presetGroup(noise ? "Shape B" : "To edge (right)", toPreset, (v) =>
                      set({ toPreset: v }),
                    ),
                  ]}

              {noise ? (
                <div className="grid gap-4">
                  <Slider
                    id="parquet-noise-scale"
                    label="Noise scale"
                    min={0.5}
                    max={12}
                    step={0.5}
                    value={noiseFrequency}
                    onChange={(v) => set({ noiseFrequency: v })}
                    format={(v) => `${v} across`}
                  />
                  <Slider
                    id="parquet-contrast"
                    label="Contrast"
                    min={0.5}
                    max={4}
                    step={0.1}
                    value={noiseContrast}
                    onChange={(v) => set({ noiseContrast: v })}
                    format={(v) => v.toFixed(1)}
                  />
                  <Slider
                    id="parquet-evolve"
                    label="Evolve"
                    min={0}
                    max={1}
                    step={0.02}
                    value={noiseSpeed}
                    onChange={(v) => set({ noiseSpeed: v })}
                    format={(v) => (v === 0 ? "frozen" : v.toFixed(2))}
                  />
                  <Slider
                    id="parquet-seed"
                    label="Seed"
                    min={1}
                    max={99}
                    step={1}
                    value={noiseSeed}
                    onChange={(v) => set({ noiseSeed: v })}
                  />
                </div>
              ) : (
                <>
                  <Row label={twoD ? "Profile along x" : "Profile curve"}>
                    {wall(D_OPTIONS, dProfile, (v) => set({ dProfile: v }))}
                  </Row>
                  {twoD && <Row label="Profile along y">{wall(D_OPTIONS, dProfileY, (v) => set({ dProfileY: v }))}</Row>}
                </>
              )}
            </Group>

            <Group title="Motion">
              {driftControl(
                "Grid drift",
                "The tiles travel; the field stays nailed to the plane. Each tile re-reads D as it moves, so it changes shape while it slides.",
                gridDrift,
                (v) => set({ gridDrift: v }),
              )}
              {driftControl(
                "Field drift",
                "The tiles stay put; the field slides over them. The evolution flows across fixed tiles like a wave.",
                fieldDrift,
                (v) => set({ fieldDrift: v }),
              )}
              {!noise && !D_PROFILE_META[dProfile].periodic && isMoving(fieldDrift) && (
                <p className="text-xs text-fg-muted leading-relaxed">
                  {D_PROFILE_META[dProfile].label} runs end to end, so a drifting field sweeps it across
                  once and then holds. Pick a periodic D(x) to loop forever.
                </p>
              )}
            </Group>

            <Group title={twoD ? "Patch" : "Strip"}>
              <Slider
                id="parquet-amount"
                label="Amount"
                unit="%"
                min={0}
                max={100}
                step={1}
                value={Math.round(amount * 100)}
                onChange={(v) => set({ amount: v / 100 })}
              />
              <Slider id="parquet-columns" label="Columns" min={2} max={60} step={1} value={cols} onChange={(v) => set({ cols: v })} />
              <Slider id="parquet-rows" label="Rows" min={1} max={20} step={1} value={rows} onChange={(v) => set({ rows: v })} />
            </Group>
          </div>
        </PageSidebar>
      </div>

      {/* Patch, with the view-level actions (colour, base tiling, export) parked over it. */}
      <main className="relative flex-1 min-h-0 flex items-center justify-center bg-surface-raised px-10 pt-10 pb-20 overflow-auto text-fg max-md:touch-none max-md:px-3 max-md:pt-16 max-md:pb-[calc(var(--sheet-offset,64px)+68px)] max-md:transition-[padding] max-md:duration-300">
        <div ref={frameRef} className="w-full h-full max-md:overflow-hidden" {...pinchHandlers}>
          {/* The server cannot know it is drawing for a phone, so on one the desktop's horizontal strip
              would flash until hydration turns it upright: kept invisible until then. */}
          <div ref={viewRef} className={isPhone ? "w-full h-full" : "w-full h-full max-md:invisible"}>
            <ParquetStrip
              tileOutlines={tileOutlines}
              guideOutlines={guideOutlines}
              fills={fills}
              viewBox={viewBox}
              clip={margin > 0}
              vertical={vertical}
              className="w-full h-full"
            />
          </div>
        </div>
        <FloatingToolbar>
          <ToolbarButton
            label={colour ? "Colour off" : "Colour by field"}
            aria-pressed={colour}
            onClick={() => set({ colour: !colour })}
            className="max-md:w-auto max-md:px-3"
          >
            <Palette size={16} />
            <span className="md:hidden">Colour</span>
          </ToolbarButton>
          <ToolbarButton
            label={showGuides ? "Hide base tiling" : "Show base tiling"}
            aria-pressed={showGuides}
            onClick={() => set({ showGuides: !showGuides })}
            className="max-md:w-auto max-md:px-3"
          >
            <Grid3x3 size={16} />
            <span className="md:hidden">Base</span>
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="Export SVG"
            primary
            onClick={() =>
              downloadSvg(
                parquetToSvgString(tileOutlines, guideOutlines),
                `parquet-${mode}-${tiling}-${fieldKind}.svg`,
              )
            }
          >
            <Download size={14} />
            Export SVG
          </ToolbarButton>
        </FloatingToolbar>
      </main>
    </div>
  );
}
