"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParquetStrip } from "@/components/parquet-strip";
import { Slider } from "@/components/ui/slider";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useParquet } from "@/lib/stores/parquet";
import { cn } from "@/lib/utils/cn";
import type { DProfile, Pt } from "@/lib/render/parquetStrip";
import { parquetToSvgString, parquetViewBox } from "@/lib/render/parquetSvg";
import { TILINGS, buildDeformedTiling, type TilingId } from "@/lib/render/parquetTiling";
import {
  PARQUET_PRESETS,
  D_PROFILES,
  D_PROFILE_META,
  resolveDProfile,
  type DProfileId,
  type ParquetPresetId,
} from "@/lib/render/parquetPresets";

const TILING_OPTIONS = (Object.keys(TILINGS) as TilingId[]).map((id) => ({
  value: id,
  label: TILINGS[id].label,
}));
const PRESET_OPTIONS = Object.values(PARQUET_PRESETS).map((p) => ({ value: p.id, label: p.label }));
const D_OPTIONS = (Object.keys(D_PROFILE_META) as DProfileId[]).map((id) => ({
  value: id,
  label: D_PROFILE_META[id].label,
}));

// Blue → orange gradient across the strip (used when Colour is on). t ∈ [0,1].
function lerpColour(t: number): string {
  const hue = 210 - 185 * Math.max(0, Math.min(1, t));
  return `hsl(${hue.toFixed(0)} 68% 62%)`;
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
  const { tiling, fromPreset, toPreset, dProfile, amount, cols, rows, showGuides, colour, animate, set } =
    useParquet();

  // Sliding the phase treats the strip as a loop, so it only reads as motion (rather than as a seam
  // travelling across the tiles) when D(x) closes on itself. A non-periodic D is therefore static-only:
  // the switch below is disabled, and picking such a profile turns animation off.
  const canAnimate = D_PROFILE_META[dProfile].periodic;
  const animating = animate && canAnimate;

  // Animation phase: slides D(x) over the (static) tiles when animating (Kaplan's "static tiles,
  // moving interpolation function" effect). rAF advances a wrap-around phase in [0,1).
  const [phase, setPhase] = useState(0);
  const phaseRef = useRef(0);
  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    const tick = () => {
      phaseRef.current = (phaseRef.current + 0.004) % 1;
      setPhase(phaseRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  const instance = useMemo(() => TILINGS[tiling].build(cols, rows), [tiling, cols, rows]);

  // D(x) with the animation phase folded in. Static sampling must not wrap, or the rightmost edges
  // (nx = 1 exactly) alias back to D(0) and the last column comes out undeformed.
  const dFn: DProfile = useMemo(
    () => resolveDProfile(dProfile, { animate: animating, phase }),
    [dProfile, animating, phase],
  );

  const tileOutlines: Pt[][] = useMemo(
    () =>
      buildDeformedTiling(instance, {
        from: PARQUET_PRESETS[fromPreset].edge,
        to: PARQUET_PRESETS[toPreset].edge,
        amount,
        d: dFn,
      }).map((t) => t.outline),
    [instance, fromPreset, toPreset, amount, dFn],
  );

  const guideOutlines: Pt[][] = useMemo(
    () => (showGuides ? instance.faces : []),
    [showGuides, instance],
  );

  // The strip's box, held fixed against everything the deformation does to it. Fitted to the frame
  // on screen it would breathe — tiles swing past the strip's edges, the box follows, and the
  // drawing rescales under the very slider you are dragging.
  //
  // The envelope is exact, not sampled. A vertex sits at P + s·(P1−P0) + d·perp with
  // d = amount·(from + (to−from)·t) and t = D(x), so it is affine in `amount` and affine in `t`:
  // over the rectangle amount ∈ [0,1] × t ∈ [tMin, tMax] the extremes can only be at the corners.
  // Three builds cover them, and D's value range is phase-independent (animation only shifts D's
  // argument), so the box also holds still while the animation runs.
  //
  // Deliberately not keyed on `amount` or `phase` — reacting to those is the bug.
  const viewBox = useMemo(() => {
    const base = D_PROFILES[dProfile];
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let i = 0; i <= 256; i++) {
      const v = base(i / 256);
      if (v < tMin) tMin = v;
      if (v > tMax) tMax = v;
    }
    const cornerAt = (t: number) =>
      buildDeformedTiling(instance, {
        from: PARQUET_PRESETS[fromPreset].edge,
        to: PARQUET_PRESETS[toPreset].edge,
        amount: 1,
        d: () => t,
      }).map((tile) => tile.outline);
    // instance.faces is the amount = 0 corner: the undeformed tiling, and the guides.
    return parquetViewBox([instance.faces, cornerAt(tMin), cornerAt(tMax)]);
  }, [instance, fromPreset, toPreset, dProfile]);

  // Per-tile fill: colour by the tile's position along the strip (static; does not strobe with animation).
  const fills = useMemo(() => {
    if (!colour) return undefined;
    const base = D_PROFILES[dProfile];
    const w = instance.width || 1;
    return instance.faces.map((face) => {
      const cx = face.reduce((s, p) => s + p[0], 0) / face.length;
      return lerpColour(base(cx / w));
    });
  }, [colour, instance, dProfile]);

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
      {/* Controls */}
      <aside className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-line-subtle bg-surface-chrome p-4 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h1 className="text-lg font-bold text-fg">Parquet deformation</h1>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            A tiling whose edges evolve across the strip, driven by D(x).
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
          <span className="text-sm font-medium text-fg-secondary">From edge (left)</span>
          <ButtonGroup<ParquetPresetId>
            options={PRESET_OPTIONS}
            selected={fromPreset}
            onChange={(v) => set({ fromPreset: v })}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-fg-secondary">To edge (right)</span>
          <ButtonGroup<ParquetPresetId>
            options={PRESET_OPTIONS}
            selected={toPreset}
            onChange={(v) => set({ toPreset: v })}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-fg-secondary">D(x) profile</span>
          <ButtonGroup<DProfileId>
            options={D_OPTIONS}
            selected={dProfile}
            onChange={(v) =>
              set(D_PROFILE_META[v].periodic ? { dProfile: v } : { dProfile: v, animate: false })
            }
          />
        </div>

        <Slider
          label="Amount"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={Math.round(amount * 100)}
          onChange={(v) => set({ amount: v / 100 })}
        />
        <Slider
          label="Columns"
          min={2}
          max={60}
          step={1}
          value={cols}
          onChange={(v) => set({ cols: v })}
        />
        <Slider label="Rows" min={1} max={10} step={1} value={rows} onChange={(v) => set({ rows: v })} />

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-secondary">Colour</span>
          <Switch checked={colour} onCheckedChange={(v) => set({ colour: v })} />
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className={cn("text-sm font-medium", canAnimate ? "text-fg-secondary" : "text-fg-muted")}>
              Animate
            </span>
            <Switch
              checked={animating}
              disabled={!canAnimate}
              onCheckedChange={(v) => set({ animate: v })}
            />
          </div>
          {!canAnimate && (
            <p className="text-xs text-fg-muted leading-relaxed">
              {D_PROFILE_META[dProfile].label} runs end to end, so sliding it would drag a seam across
              the strip. Pick a periodic D(x) to animate.
            </p>
          )}
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
              `parquet-${tiling}-${fromPreset}-to-${toPreset}.svg`,
            )
          }
        >
          Export SVG
        </Button>
      </aside>

      {/* Strip */}
      <main className="flex-1 min-h-0 flex items-center justify-center bg-surface-raised p-6 overflow-auto text-fg">
        <ParquetStrip
          tileOutlines={tileOutlines}
          guideOutlines={guideOutlines}
          fills={fills}
          viewBox={viewBox}
          className="w-full h-full"
        />
      </main>
    </div>
  );
}
