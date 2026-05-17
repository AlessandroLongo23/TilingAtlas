"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { useDebug, debugManager, updateDebugStore } from "@/stores/debug";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { Vector } from "@/classes/Vector";
import { Tiling } from "@/classes/Tiling";
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { TilingInfo } from "./tiling-info";
import { PieChart } from "./pie-chart";
import { Input } from "./ui/input";
import { ColorPad } from "./ui/color-pad";
import { useP5 } from "@/lib/hooks/useP5";

interface CanvasProps {
	width?: number;
	height?: number;
	translationalCell?: TranslationalCellData | null;
	translationalCellId?: string | null;
	showTilingRuleInput?: boolean;
}

function buildTilingFromCell(cellData: TranslationalCellData, radius: number): Tiling {
	const r = Math.max(2, Math.min(8, radius || 4));
	const polyArray = cellData.p ?? cellData.cellPolygons ?? [];
	const basisRaw = cellData.b ?? cellData.basis ?? [[1, 0], [0, 1]];
	const [v1x, v1y] = basisRaw[0];
	const [v2x, v2y] = basisRaw[1];

	const t = new Tiling();
	t.nodes = [];

	for (let i = -r; i <= r; i++) {
		for (let j = -r; j <= r; j++) {
			const ox = i * v1x + j * v2x;
			const oy = i * v1y + j * v2y;
			for (const polyData of polyArray) {
				const rawVerts = polyData.v ?? polyData.vertices ?? [];
				const vertices = rawVerts.map((v) =>
					Array.isArray(v)
						? new Vector(v[0] + ox, v[1] + oy)
						: new Vector(v.x + ox, v.y + oy),
				);
				if (vertices.length >= 3) {
					t.nodes.push(GenericPolygon.fromVertices(vertices));
				}
			}
		}
	}
	return t;
}

export function Canvas({
	width = 600,
	height = 600,
	translationalCell = null,
	translationalCellId = null,
	showTilingRuleInput = true,
}: CanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	const tilingRef = useRef<Tiling | null>(null);
	const grabRef = useRef(false);

	const prevRef = useRef({
		rulestring: "",
		transformSteps: -1,
		parameter: -1,
		ruleType: "" as string,
		translationalCellId: null as string | null,
		width,
		height,
	});

	const propsRef = useRef({ width, height, translationalCell, translationalCellId });
	useEffect(() => {
		propsRef.current = { width, height, translationalCell, translationalCellId };
	}, [width, height, translationalCell, translationalCellId]);

	const [canvasError, setCanvasError] = useState<string | null>(null);
	const [tileCount, setTileCount] = useState(0);
	const [vcs, setVcs] = useState<Tiling["vcs"]>([]);

	const debugEnabled = useDebug((s) => s.isEnabled);
	const debugPhases = useDebug((s) => s.timingData.phases.length);
	const openScreenshotPreview = useScreenshotPreview((s) => s.open);
	const selectedRule = useConfiguration((s) => s.selectedTiling.rulestring);
	const colorParams = useConfiguration((s) => s.colorParams);
	const setCfg = useConfiguration((s) => s.set);
	const isDualRule = selectedRule.includes("*");

	useP5(
		containerRef,
		() => (p5Raw: unknown) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const p5 = p5Raw as any;
			const readCfg = () => useConfiguration.getState();

			const ensureTiling = () => {
				const cfg = readCfg();
				const { translationalCell: tc, translationalCellId: tcId } = propsRef.current;
				const prev = prevRef.current;

				const ruleChanged =
					!tc &&
					(cfg.selectedTiling.rulestring !== prev.rulestring ||
						cfg.transformSteps !== prev.transformSteps ||
						cfg.parameter !== prev.parameter);
				const cellChanged = !!tc && (prev.translationalCellId !== tcId || cfg.transformSteps !== prev.transformSteps);

				if (!tilingRef.current || ruleChanged || cellChanged) {
					try {
						if (cfg.debugView) debugManager.reset();

						const t = buildTilingFromCell(tc, cfg.transformSteps)
						tilingRef.current = t;

						const regularOnly = t.nodes.length > 0 && t.nodes.every((n) => n instanceof RegularPolygon);
						useConfiguration.setState({
							isTilingRegularOnly: regularOnly,
							...(regularOnly ? {} : { circlePacking: false }),
						});
						if (cfg.debugView) updateDebugStore();
						setCanvasError(null);
						setTileCount(t.nodes.length);
						setVcs(t.vcs ?? []);

						prev.rulestring = cfg.selectedTiling.rulestring;
						prev.transformSteps = cfg.transformSteps;
						prev.parameter = cfg.parameter;
						prev.translationalCellId = tcId;
					} catch (e) {
						setCanvasError(e instanceof Error ? e.message : String(e));
					}
				}
			};

			const drawTiling = (cfg: ReturnType<typeof readCfg>, tiling: Tiling) => {
				if (cfg.exportGraphButtonHover) tiling.showGraph(p5);
				else tiling.show(p5, cfg.showPolygonPoints, 1, cfg.circlePacking);
				if (cfg.showConstructionPoints) tiling.drawConstructionPoints(p5);
			};

			const drawScreenshotOverlay = () => {
				p5.push();
				p5.resetMatrix();
				const sss = 600;
				p5.noStroke();
				p5.fill(0, 0, 0, 0.5);
				p5.rect(0, 0, p5.width / 2 - sss / 2, p5.height);
				p5.rect(p5.width / 2 + sss / 2, 0, p5.width / 2 - sss / 2, p5.height);
				p5.rect(p5.width / 2 - sss / 2, 0, sss, p5.height / 2 - sss / 2);
				p5.rect(p5.width / 2 - sss / 2, p5.height / 2 + sss / 2, sss, p5.height / 2 - sss / 2);
				p5.pop();
			};

			const takeScreenshotImpl = (cfg: ReturnType<typeof readCfg>, tiling: Tiling) => {
				const filename = `${cfg.selectedTiling.rulestring}.png`;
				const g = p5.createGraphics(300, 300);
				g.pixelDensity(1);
				g.colorMode(p5.HSB, 360, 100, 100);
				g.translate(0, 300);
				g.scale(0.5, -0.5);
				g.background(240, 7, 16);
				g.translate(300, 300);
				g.stroke(0);
				g.strokeWeight(2 / cfg.controls.zoom);

				let maxX = 0, maxY = 0, minX = 0, minY = 0;
				for (const n of tiling.nodes) {
					for (const v of n.vertices) {
						if (v.x > maxX) maxX = v.x;
						if (v.y > maxY) maxY = v.y;
						if (v.x < minX) minX = v.x;
						if (v.y < minY) minY = v.y;
					}
				}
				g.scale(cfg.controls.zoom);
				g.translate(-(maxX + minX) / 2, -(maxY + minY) / 2);

				for (const n of tiling.nodes) {
					g.push();
					g.fill(n.hue ?? 0, 40, 100, 0.8);
					g.beginShape();
					for (const v of n.vertices) g.vertex(v.x, v.y);
					g.endShape(g.CLOSE);
					g.pop();
				}
				const imageDataUrl = g.elt.toDataURL("image/png");
				g.remove();

				const baseRule = cfg.selectedTiling.rulestring.replace(/\*$/, "");
				const store = useLegacyTilingStore.getState();
				const db =
					store.getTilingByRulestring(cfg.selectedTiling.rulestring) ??
					store.getTilingByRulestring(baseRule);
				openScreenshotPreview({
					imageDataUrl,
					filename,
					rulestring: cfg.selectedTiling.rulestring,
					groupId: db?.group_id ?? null,
					allowSupabaseUpload: true,
				});
			};

			p5.setup = () => {
				const { width: w, height: h } = propsRef.current;
				p5.createCanvas(w, h);
				p5.colorMode(p5.HSB, 360, 100, 100);
				const cfg = readCfg();
				useConfiguration.setState({
					controls: {
						...cfg.controls,
						targetZoom: cfg.controls.zoom,
						targetOffset: cfg.controls.offset.copy(),
					},
				});
				ensureTiling();
			};

			p5.draw = () => {
				const cfg = readCfg();
				const ctrl = cfg.controls;
				ctrl.zoom += (ctrl.targetZoom - ctrl.zoom) * ctrl.dampening;
				ctrl.offset.add(Vector.sub(ctrl.targetOffset, ctrl.offset).scale(ctrl.dampening));

				p5.clear();
				ensureTiling();
				const tiling = tilingRef.current;

				const { width: w, height: h } = propsRef.current;
				if (w !== prevRef.current.width || h !== prevRef.current.height) {
					p5.resizeCanvas(w, h);
					prevRef.current.width = w;
					prevRef.current.height = h;
				}

				try {
					p5.push();
					p5.translate(p5.width / 2, p5.height / 2);
					p5.translate(ctrl.offset.x, ctrl.offset.y);
					p5.scale(ctrl.zoom);
					p5.scale(1, -1);
					drawTiling(cfg, tiling);
					p5.pop();

					if (cfg.screenshotButtonHover) drawScreenshotOverlay();
				} catch (e) {
					setCanvasError(e instanceof Error ? e.message : String(e));
				}

				if (grabRef.current) {
					const mouse = new Vector(p5.mouseX, p5.mouseY);
					const prevMouse = new Vector(p5.pmouseX, p5.pmouseY);
					ctrl.targetOffset.add(Vector.sub(mouse, prevMouse));
				}

				if (cfg.takeScreenshot) {
					takeScreenshotImpl(cfg, tiling);
					useConfiguration.setState({ takeScreenshot: false });
				}
				if (cfg.exportGraph) {
					tiling.exportGraph();
					useConfiguration.setState({ exportGraph: false });
				}
			};

			p5.mousePressed = (event?: MouseEvent) => {
				if (event && event.target !== p5.canvas) return;
				const cfg = readCfg();
				const ctrl = cfg.controls;
				if (event?.button === 1) {
					const mouse = new Vector(p5.mouseX - p5.width / 2, p5.mouseY - p5.height / 2);
					const world = Vector.sub(mouse, ctrl.targetOffset).scale(1 / ctrl.targetZoom);
					ctrl.targetOffset.set(Vector.sub(new Vector(0, 0), Vector.scale(world, ctrl.targetZoom)));
					return;
				}
				if (event?.button === 2) {
					event.preventDefault();
					event.stopPropagation();
					ctrl.targetOffset.set(new Vector(0, 0));
					useConfiguration.setState({ controls: { ...ctrl, targetZoom: 50 } });
					return;
				}
				grabRef.current = true;
			};

			p5.mouseReleased = () => {
				grabRef.current = false;
			};

			p5.mouseWheel = (event?: WheelEvent) => {
				if (event && event.target !== p5.canvas) return;
				const cfg = readCfg();
				const ctrl = cfg.controls;
				const mouse = new Vector(p5.mouseX - p5.width / 2, p5.mouseY - p5.height / 2);
				const world = Vector.sub(mouse, ctrl.targetOffset).scale(1 / ctrl.targetZoom);
				let z = ctrl.targetZoom;
				if (event && event.deltaY > 0) z = Math.max(z / 1.1, 10);
				else if (event && event.deltaY < 0) z = Math.min(z * 1.1, 150);
				const newScreen = Vector.add(Vector.scale(world, z), ctrl.targetOffset);
				ctrl.targetOffset.add(Vector.sub(mouse, newScreen));
				useConfiguration.setState({ controls: { ...ctrl, targetZoom: z } });
			};
		},
		[],
	);

	return (
		<div className="relative h-full w-full bg-surface-base">
			<div
				ref={containerRef}
				className="cursor-pointer"
				role="application"
				onContextMenu={(e) => e.preventDefault()}
			/>
			<div className="absolute top-4 left-4 z-20">
				<TilingInfo tileCount={tileCount} vcs={vcs} />
			</div>

			{!translationalCell && isDualRule ? (
				<div className="absolute bottom-4 right-4 z-20">
					<ColorPad value={colorParams} onChange={(v) => setCfg({ colorParams: v })} />
				</div>
			) : null}

			{showTilingRuleInput && !translationalCell ? (
				<div className="absolute bottom-8 right-[50%] translate-x-[50%] z-20 w-80">
					<div className="flex flex-col gap-3 bg-surface-overlay/90 rounded-lg p-2 pt-3 justify-center items-center w-full">
						<label htmlFor="tilingRule" className="text-lg text-center font-bold leading-none text-fg">
							Tiling Rule
						</label>
						<Input
							id="tilingRule"
							align="center"
							value={selectedRule}
							placeholder="4/m90/r(h1)"
							onChange={(e) =>
								setCfg({
									selectedTiling: { ...useConfiguration.getState().selectedTiling, rulestring: e.target.value },
								})
							}
						/>
					</div>
				</div>
			) : null}

			{canvasError ? (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center text-fg text-sm px-8">
					{canvasError}
				</div>
			) : null}

			{debugEnabled ? (
				<div className="absolute bottom-4 right-4 w-96 z-20">
					<PieChart />
					{debugPhases === 0 ? (
						<div className="mt-2 p-3 bg-warning-subtle text-fg text-sm rounded-lg">
							No timing data available.
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
