"use client";

// Solids for the /play articles: a polyhedron from the spherical shelf, turned by dragging, with its
// counts and its total angle defect under it. The faces, colours and edges are the shelf's own
// (buildFlatSolid, the same builder the thumbnails and the /play view use); the box, the controls and
// the readout are the article kit's, so a solid reads like every other figure on the page.
//
//   <geo-solid solids="icosahedron,noble-i-2" labels="Icosahedron|Small stellated" caption="…">
//   <geo-noble-family caption="…">   the disphenoids and the two stephanoid families, live

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Figure } from "@/components/about/figure";
import { Segmented } from "@/components/shelf";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Polyhedron } from "@/lib/render/platonicSolids";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { buildFlatSolid } from "@/lib/render/sphericalPolyhedron";
import { applyStudioMaterials, installLookRig } from "@/lib/render/sphericalLook";
import {
	NOBLE_FAMILY_DEFAULTS,
	STEPHANOID_MAX_N,
	nobleFamilySolid,
	stephanoidChoices,
	type NobleFamily,
} from "@/lib/render/nobleSolids";

const TURN_PER_MS = 0.00028; // the thumbnails' pace: a full turn in about 22 s
const CAMERA_DISTANCE = 3.2;

/** A WebGL view of one solid: drag to turn it, the button to stop or start the slow turn. */
export function SolidView({ poly }: { poly: Polyhedron | null }) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [turning, setTurning] = useState(true);
	const [failed, setFailed] = useState(false);
	const turningRef = useRef(turning);
	const polyRef = useRef(poly);
	const resetRef = useRef<() => void>(() => {});
	const setSolidRef = useRef<((p: Polyhedron | null) => void) | null>(null);
	useEffect(() => {
		turningRef.current = turning;
	}, [turning]);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		} catch {
			queueMicrotask(() => setFailed(true));
			return;
		}
		renderer.setClearColor(0x000000, 0);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		const canvas = renderer.domElement;
		canvas.className = "block h-full w-full cursor-grab";
		canvas.style.touchAction = "pan-y";
		host.appendChild(canvas);

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		camera.position.set(0, 0, CAMERA_DISTANCE);
		camera.lookAt(0, 0, 0);
		const rig = installLookRig(renderer, scene, "tiling", 1024);
		const holder = new THREE.Group();
		const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, -0.6, 0));
		holder.quaternion.copy(rest);
		scene.add(holder);
		let solid: ReturnType<typeof buildFlatSolid> = null;
		let visible = true;
		let dirty = true;
		let shown: Polyhedron | null | undefined;
		setSolidRef.current = (p) => {
			if (p === shown) return;
			shown = p;
			if (solid) {
				holder.remove(solid.object);
				solid.dispose();
			}
			solid = buildFlatSolid(p, { lineWidth: 1.5, dark: document.documentElement.classList.contains("dark") });
			if (solid) {
				applyStudioMaterials(solid.object);
				holder.add(solid.object);
			}
			dirty = true;
		};
		setSolidRef.current(polyRef.current);
		let frame = 0;
		let last = performance.now();
		let drawn = 0;
		const draw = (now: number) => {
			frame = requestAnimationFrame(draw);
			const dt = Math.min(now - last, 100);
			last = now;
			if (!visible) return;
			if (turningRef.current) {
				holder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * TURN_PER_MS));
				// The slow turn reads the same at 30 fps; a drag or a new solid still draws at once.
				if (now - drawn >= 33) dirty = true;
			}
			if (!dirty) return;
			dirty = false;
			drawn = now;
			rig.follow(camera);
			renderer.render(scene, camera);
		};
		frame = requestAnimationFrame(draw);

		const resize = () => {
			const w = host.clientWidth,
				h = host.clientHeight;
			if (!w || !h) return;
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			dirty = true;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(host);
		const io = new IntersectionObserver(([e]) => {
			visible = e.isIntersecting;
			dirty = true;
		});
		io.observe(host);

		// Drag: horizontal motion turns about the vertical axis, vertical motion tips it toward you.
		let drag: { x: number; y: number } | null = null;
		const down = (e: PointerEvent) => {
			drag = { x: e.clientX, y: e.clientY };
			canvas.setPointerCapture(e.pointerId);
			canvas.style.cursor = "grabbing";
			setTurning(false);
		};
		const move = (e: PointerEvent) => {
			if (!drag) return;
			const k = 4 / Math.max(host.clientWidth, 1);
			const dx = (e.clientX - drag.x) * k,
				dy = (e.clientY - drag.y) * k;
			drag = { x: e.clientX, y: e.clientY };
			holder.quaternion
				.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx))
				.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy));
			dirty = true;
		};
		const up = () => {
			drag = null;
			canvas.style.cursor = "";
		};
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		resetRef.current = () => {
			holder.quaternion.copy(rest);
			dirty = true;
		};

		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
			io.disconnect();
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			solid?.dispose();
			setSolidRef.current = null;
			rig.dispose();
			renderer.dispose();
			canvas.remove();
		};
	}, []);

	useEffect(() => {
		polyRef.current = poly;
		setSolidRef.current?.(poly);
	}, [poly]);

	if (failed) return <div className="flex h-48 items-center justify-center text-sm text-fg-muted">This figure needs WebGL.</div>;
	return (
		<div className="relative mx-auto aspect-square w-full max-w-[340px]">
			<div ref={hostRef} className="absolute inset-0" />
			{!poly && (
				<div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">No solid for these values.</div>
			)}
			<div className="absolute right-0 bottom-0 flex">
				<Button
					variant="ghost"
					size="icon"
					icon={RotateCcw}
					aria-label="Reset the view"
					onClick={() => resetRef.current()}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={turning ? Pause : Play}
					aria-label={turning ? "Stop turning" : "Turn"}
					onClick={() => setTurning(!turning)}
				/>
			</div>
		</div>
	);
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const angle = (u: V3, v: V3) => {
	const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
	return (Math.acos(Math.max(-1, Math.min(1, d / (Math.hypot(...u) * Math.hypot(...v))))) * 180) / Math.PI;
};

/**
 * V, E, F, the Euler characteristic, and the total angle defect. The defect is the sum over vertices of
 * 360° minus the face angles there; it is reported only when every face is a simple polygon whose
 * corners add up to (n - 2)·180°, which is when Descartes' count applies. Star and crossed faces fail
 * that test, and the readout says so.
 */
export function solidStats(p: Polyhedron) {
	const edges = new Set<string>();
	const at = new Array<number>(p.vertices.length).fill(0);
	let simple = true;
	for (const f of p.faces) {
		let sum = 0;
		f.forEach((v, i) => {
			const a = f[(i + f.length - 1) % f.length],
				b = f[(i + 1) % f.length];
			const t = angle(sub(p.vertices[a], p.vertices[v]), sub(p.vertices[b], p.vertices[v]));
			at[v] += t;
			sum += t;
			edges.add(v < b ? `${v}-${b}` : `${b}-${v}`);
		});
		if (Math.abs(sum - (f.length - 2) * 180) > 1e-3) simple = false;
	}
	const V = p.vertices.length,
		E = edges.size,
		F = p.faces.length;
	const defect = simple ? at.reduce((s, a) => s + (360 - a), 0) : null;
	return { V, E, F, chi: V - E + F, defect };
}

function Stats({ poly }: { poly: Polyhedron }) {
	const s = useMemo(() => solidStats(poly), [poly]);
	const cell = (k: string, v: string) => (
		<div className="flex flex-col items-center px-2">
			<span className="text-[11px] tracking-wide text-fg-muted uppercase">{k}</span>
			<span className="font-mono text-sm text-fg tabular-nums">{v}</span>
		</div>
	);
	return (
		<div className="mt-3 flex flex-wrap justify-center gap-y-2 border-t border-line pt-3">
			{cell("Vertices", String(s.V))}
			{cell("Edges", String(s.E))}
			{cell("Faces", String(s.F))}
			{cell("V − E + F", String(s.chi))}
			{cell("Total defect", s.defect == null ? "n/a" : `${Math.round(s.defect)}°`)}
		</div>
	);
}

/** <geo-solid solids="a,b" labels="A|B" caption="…">: one or several solids of the spherical shelf. */
export function GeoSolid({ solids, labels, caption }: { solids?: string; labels?: string; caption?: string }) {
	const ids = (solids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	const names = (labels ?? "").split("|").map((s) => s.trim());
	const [id, setId] = useState(ids[0] ?? "");
	const poly = useMemo(() => polyhedronForId(id), [id]);
	return (
		<Figure caption={caption}>
			{ids.length > 1 && (
				<div className="mx-auto mb-3 max-w-lg">
					<Segmented
						options={ids.map((v, i) => ({ v, label: names[i] || v }))}
						value={id}
						onChange={setId}
						cols={ids.length === 4 || ids.some((v, i) => (names[i] || v).length > 16) ? 2 : Math.min(ids.length, 3)}
					/>
				</div>
			)}
			<SolidView poly={poly} />
			{poly && <Stats poly={poly} />}
		</Figure>
	);
}

/** <geo-noble-family>: the two infinite families of noble polyhedra, drawn from their parameters. */
export function GeoNobleFamily({ caption }: { caption?: string }) {
	const [family, setFamily] = useState<NobleFamily>("noble-disphenoid");
	const [p, setP] = useState(NOBLE_FAMILY_DEFAULTS);
	const anti = family === "noble-stephanoid-antiprismatic";
	const choices = family === "noble-disphenoid" ? [] : stephanoidChoices(anti, p.n);
	const member = Math.min(p.member, Math.max(choices.length - 1, 0));
	const poly = useMemo(() => nobleFamilySolid(family, { ...p, member }), [family, p, member]);
	const pq = choices[member];
	return (
		<Figure caption={caption}>
			<div className="mx-auto mb-3 max-w-lg">
				<Segmented
					options={[
						{ v: "noble-disphenoid", label: "Disphenoid" },
						{ v: "noble-stephanoid-prismatic", label: "Prismatic", sub: "stephanoid" },
						{ v: "noble-stephanoid-antiprismatic", label: "Antiprismatic", sub: "stephanoid" },
					]}
					value={family}
					onChange={(v) => setFamily(v as NobleFamily)}
					cols={3}
				/>
			</div>
			<SolidView poly={poly} />
			<div className="mx-auto mt-3 grid max-w-md gap-3">
				{family === "noble-disphenoid" ? (
					<>
						<Slider label="Box width" value={p.boxB} min={0.3} max={2.5} step={0.05} onChange={(boxB) => setP({ ...p, boxB })} />
						<Slider label="Box depth" value={p.boxC} min={0.3} max={2.5} step={0.05} onChange={(boxC) => setP({ ...p, boxC })} />
					</>
				) : (
					<>
						<Slider label="n" value={p.n} min={5} max={STEPHANOID_MAX_N} onChange={(n) => setP({ ...p, n, member: 0 })} />
						<Slider
							label="Member"
							value={member}
							min={0}
							max={Math.max(choices.length - 1, 0)}
							disabled={choices.length < 2}
							format={() => (pq ? `${anti ? "AC" : "PC"}(${p.n},${pq[0]},${pq[1]})` : "none")}
							onChange={(m) => setP({ ...p, member: m })}
						/>
						<Slider label="Height" value={p.height} min={0.2} max={3} step={0.05} onChange={(height) => setP({ ...p, height })} />
					</>
				)}
			</div>
			{poly && <Stats poly={poly} />}
		</Figure>
	);
}
