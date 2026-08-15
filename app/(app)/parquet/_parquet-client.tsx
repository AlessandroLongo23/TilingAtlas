"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParquetStrip } from "@/components/parquet-strip";
import { Slider } from "@/components/ui/slider";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { VelocityPad } from "@/components/ui/velocity-pad";
import { MODE_PATCH, useParquet } from "@/lib/stores/parquet";
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

  const presetGroup = (
    label: string,
    value: ParquetPresetId,
    onChange: (v: ParquetPresetId) => void,
  ) => (
    <div className="grid gap-2" key={label}>
      <span className="text-sm font-medium text-fg-secondary">{label}</span>
      <ButtonGroup<ParquetPresetId> options={PRESET_OPTIONS} selected={value} onChange={onChange} />
    </div>
  );

  const driftControl = (
    label: string,
    hint: string,
    value: Vec2,
    onChange: (v: Vec2) => void,
    axisLabel: string,
  ) => (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg-secondary">{label}</span>
        {isMoving(value) && (
          <button
            type="button"
            className="text-xs text-fg-muted hover:text-fg underline underline-offset-2"
            onClick={() => onChange({ x: 0, y: 0 })}
          >
            stop
          </button>
        )}
      </div>
      <p className="text-xs text-fg-muted leading-relaxed">{hint}</p>
      {twoD ? (
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
      ) : (
        <Slider
          label={axisLabel}
          min={-MAX_DRIFT}
          max={MAX_DRIFT}
          step={0.01}
          value={value.x}
          onChange={(v) => onChange({ x: v, y: 0 })}
          format={(v) => (v === 0 ? "still" : `${fmtDrift(v)} w/s`)}
        />
      )}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
      {/* Controls */}
      <aside className="md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-line-subtle bg-surface-chrome p-4 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h1 className="text-lg font-bold text-fg">Parquet deformation</h1>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            A tiling whose edges evolve across the plane, driven by a field D. Every intermediate
            shape still tiles.
          </p>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-fg-secondary">Deformation</span>
          <ButtonGroup<ParquetMode>
            options={MODE_OPTIONS}
            selected={mode}
            onChange={(v) => set({ mode: v, ...MODE_PATCH[v] })}
          />
          <p className="text-xs text-fg-muted leading-relaxed">
            {twoD
              ? "D varies in both directions: a shape per corner of the patch, bilinearly blended."
              : "D varies along the strip: one shape at each end."}
          </p>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-fg-secondary">Tiling</span>
          <ButtonGroup<TilingId>
            options={TILING_OPTIONS}
            selected={tiling}
            onChange={(v) => set({ tiling: v })}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-fg-secondary">D field</span>
          <ButtonGroup<FieldKind>
            options={FIELD_OPTIONS}
            selected={fieldKind}
            onChange={(v) => set({ fieldKind: v })}
          />
          <p className="text-xs text-fg-muted leading-relaxed">
            {noise
              ? `Perlin noise in ${twoD ? "3D (x, y, time)" : "2D (x, time)"} — the evolution wanders instead of running end to end.`
              : "An analytic profile: ramp, tent or sine."}
          </p>
        </div>

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
              label="Noise scale"
              min={0.5}
              max={12}
              step={0.5}
              value={noiseFrequency}
              onChange={(v) => set({ noiseFrequency: v })}
              format={(v) => `${v} across`}
            />
            <Slider
              label="Contrast"
              min={0.5}
              max={4}
              step={0.1}
              value={noiseContrast}
              onChange={(v) => set({ noiseContrast: v })}
              format={(v) => v.toFixed(1)}
            />
            <Slider
              label="Evolve"
              min={0}
              max={1}
              step={0.02}
              value={noiseSpeed}
              onChange={(v) => set({ noiseSpeed: v })}
              format={(v) => (v === 0 ? "frozen" : v.toFixed(2))}
            />
            <Slider
              label="Seed"
              min={1}
              max={99}
              step={1}
              value={noiseSeed}
              onChange={(v) => set({ noiseSeed: v })}
            />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-fg-secondary">
                {twoD ? "D along x" : "D(x) profile"}
              </span>
              <ButtonGroup<DProfileId>
                options={D_OPTIONS}
                selected={dProfile}
                onChange={(v) => set({ dProfile: v })}
              />
            </div>
            {twoD && (
              <div className="grid gap-2">
                <span className="text-sm font-medium text-fg-secondary">D along y</span>
                <ButtonGroup<DProfileId>
                  options={D_OPTIONS}
                  selected={dProfileY}
                  onChange={(v) => set({ dProfileY: v })}
                />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 border-t border-line-subtle pt-4">
          <span className="text-sm font-semibold text-fg">Motion</span>
          {driftControl(
            "Grid drift",
            "The tiles travel; the field stays nailed to the plane. Each tile re-reads D as it moves, so it changes shape while it slides.",
            gridDrift,
            (v) => set({ gridDrift: v }),
            "Along the strip",
          )}
          {driftControl(
            "Field drift",
            "The tiles stay put; the field slides over them. The evolution flows across fixed tiles like a wave.",
            fieldDrift,
            (v) => set({ fieldDrift: v }),
            "Along the strip",
          )}
          {!noise && !D_PROFILE_META[dProfile].periodic && isMoving(fieldDrift) && (
            <p className="text-xs text-fg-muted leading-relaxed">
              {D_PROFILE_META[dProfile].label} runs end to end, so a drifting field sweeps it across
              once and then holds. Pick a periodic D(x) to loop forever.
            </p>
          )}
        </div>

        <div className="grid gap-4 border-t border-line-subtle pt-4">
          <Slider
            label="Amount"
            unit="%"
            min={0}
            max={100}
            step={1}
            value={Math.round(amount * 100)}
            onChange={(v) => set({ amount: v / 100 })}
          />
          <Slider label="Columns" min={2} max={60} step={1} value={cols} onChange={(v) => set({ cols: v })} />
          <Slider label="Rows" min={1} max={20} step={1} value={rows} onChange={(v) => set({ rows: v })} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-secondary">Colour</span>
          <Switch checked={colour} onCheckedChange={(v) => set({ colour: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-secondary">Show base tiling</span>
          <Switch checked={showGuides} onCheckedChange={(v) => set({ showGuides: v })} />
        </div>

        <Button
          variant="secondary"
          onClick={() =>
            downloadSvg(
              parquetToSvgString(tileOutlines, guideOutlines),
              `parquet-${mode}-${tiling}-${fieldKind}.svg`,
            )
          }
        >
          Export SVG
        </Button>
      </aside>

      {/* Patch */}
      <main className="flex-1 min-h-0 flex items-center justify-center bg-surface-raised p-6 overflow-auto text-fg">
        <ParquetStrip
          tileOutlines={tileOutlines}
          guideOutlines={guideOutlines}
          fills={fills}
          viewBox={viewBox}
          clip={margin > 0}
          className="w-full h-full"
        />
      </main>
    </div>
  );
}
