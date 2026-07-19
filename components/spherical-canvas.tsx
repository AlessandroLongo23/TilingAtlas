"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { createSphere, type Sphere } from "@/lib/render/sphericalScene";
import { buildWireframe, type Wireframe } from "@/lib/render/sphericalWireframe";
import { buildIslamicPattern, type IslamicPattern } from "@/lib/render/sphericalIslamicMesh";
import { buildIslamicFill, type IslamicFill } from "@/lib/render/sphericalIslamicFill";
import { buildIslamicWeave, type IslamicWeave } from "@/lib/render/sphericalIslamicWeaveMesh";

// The spherical tiling renderer: a real 3D three.js scene with the tiling on a centred sphere, rotated
// FREELY by quaternion (ArcballControls — a virtual trackball, no gimbal lock, no up-vector constraint, so
// there are no poles). It owns its own input — z-10 above the p5 layer's z-[1], ArcballControls consumes
// drag (rotate) + wheel (zoom); panning is off so the sphere stays centred.
//
// Three looks: the SOLID sphere (the tiling drawn procedurally per fragment on a UV sphere — flat surface
// edges, stroke slider, pixel-sharp at any zoom); the WIREFRAME skeleton (the tiling edges as hollow 3D tube bars); and
// the ISLAMIC construction (the star pattern as a hollow line structure, no base surface — flat ribbons, or
// rigid tube bars when Wireframe is also on, which makes the LINES rigid rather than adding tiling edges).
// The <canvas> is created imperatively per mount (a canvas holds one WebGL context for life; forceContextLoss
// on teardown would poison a reused node across a StrictMode remount).

interface SphericalCanvasProps {
	width: number;
	height: number;
	/** Stable solid id ("tetrahedron", "cuboctahedron", …) — the routing key for Platonic + Archimedean. */
	solidId: string;
}

const CAMERA_DISTANCE = 3.2;
// Maps the shared islamicBandWidth slider (a fraction, flat default 0.25) to the sphere strap's arc width in
// radians — 0.25 → 0.09 rad, the tuned default look.
const WEAVE_WIDTH_FACTOR = 0.36;

type Content = { kind: "sphere"; sphere: Sphere } | { kind: "wire"; wire: Wireframe };

export function SphericalCanvas({ width, height, solidId }: SphericalCanvasProps) {
	const poly = useMemo(() => polyhedronForId(solidId), [solidId]);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const controlsRef = useRef<ArcballControls | null>(null);
	const rafRef = useRef<number | null>(null);
	const contentRef = useRef<Content | null>(null);
	const islamicRef = useRef<IslamicPattern | null>(null);
	const fillRef = useRef<IslamicFill | null>(null);
	const weaveRef = useRef<IslamicWeave | null>(null);
	const [errored, setErrored] = useState(false);

	// Scene + renderer + controls: created once per mount (fresh canvas), torn down on unmount.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let canvas: HTMLCanvasElement | null = null;
		let renderer: THREE.WebGLRenderer;
		try {
			canvas = document.createElement("canvas");
			canvas.className = "absolute inset-0 h-full w-full";
			canvas.style.touchAction = "none";
			host.appendChild(canvas);
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		} catch (e) {
			console.warn("SphericalCanvas: WebGL unavailable —", e);
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			setErrored(true);
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setClearColor(0x000000, 0); // transparent — the app theme background shows through
		rendererRef.current = renderer;

		const scene = new THREE.Scene();
		sceneRef.current = scene;

		const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		// A three-quarter start so the solid reads as 3D on first paint (before the user rotates).
		camera.position.set(1.35, 1.05, 2.6).setLength(CAMERA_DISTANCE);
		camera.lookAt(0, 0, 0);
		cameraRef.current = camera;

		// Light rig — shades every lit material: the wireframe/weave tubes and, in Realistic mode, the carved
		// sphere and the raised Islamic relief tiles. Boosted from the original 0.55/0.55 (+ a small ambient)
		// so lit tile hues read as brightly as the unlit flat modes; roughness 0.9 keeps specular soft so the
		// extra intensity doesn't clip on saturated hues. Inert on the unlit solid sphere / flat Islamic fill
		// (their RawShaderMaterial / MeshBasicMaterial ignore lights). Starting values — tuned by eye.
		const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.85);
		const dir = new THREE.DirectionalLight(0xffffff, 0.8);
		dir.position.set(3, 4, 5);
		const ambient = new THREE.AmbientLight(0xffffff, 0.2);
		scene.add(hemi, dir, ambient);

		const controls = new ArcballControls(camera, canvas, scene);
		controls.enablePan = false; // keep the sphere centred (no panning, per design)
		controls.enableZoom = true; // wheel / pinch dolly
		controls.enableRotate = true; // free quaternion trackball rotation
		controls.enableFocus = false; // no double-click recentre jump
		controls.enableGrid = false;
		controls.cursorZoom = false;
		controls.minDistance = 1.6;
		controls.maxDistance = 8;
		controls.setGizmosVisible(false); // hide the trackball rings for a clean grab-and-spin feel
		controlsRef.current = controls;

		const animate = () => {
			controls.update();
			renderer.render(scene, camera);
			rafRef.current = requestAnimationFrame(animate);
		};
		rafRef.current = requestAnimationFrame(animate);

		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			controls.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			controlsRef.current = null;
		};
	}, []);

	// The BASE surface — rebuilt when the solid or a mode changes. Islamic wins: with it on there is NO base
	// (no sphere, no tiling-edge wireframe) — the star construction lines are the whole picture, drawn by the
	// overlay effect. Otherwise Wireframe gives the hollow tiling-edge tube skeleton, else the solid sphere.
	const wireframe = useConfiguration((s) => s.sphericalWireframe);
	const isIslamic = useConfiguration((s) => s.isIslamic);
	const realistic = useConfiguration((s) => s.sphericalRealistic);
	useEffect(() => {
		const renderer = rendererRef.current;
		const scene = sceneRef.current;
		if (!renderer || !scene) return;
		const cfg = useConfiguration.getState();
		const dark = document.documentElement.classList.contains("dark");
		let content: Content | null = null;
		if (cfg.isIslamic) {
			// No base surface — the overlay effect below draws the star lines (flat ribbons, or rigid tubes
			// when Wireframe is also on; the Wireframe toggle makes the LINES rigid, it does not add edges).
			content = null;
		} else if (cfg.sphericalWireframe) {
			const wire = buildWireframe(poly, {
				section: cfg.sphericalWireSection,
				thickness: cfg.sphericalWireThickness,
				height: cfg.sphericalWireHeight,
				bevel: cfg.sphericalWireBevel,
				hueOffset: cfg.hueOffset,
			});
			if (wire) {
				scene.add(wire.object);
				content = { kind: "wire", wire };
			}
		} else {
			const sphere = createSphere(renderer, poly, { hueOffset: cfg.hueOffset, lineWidth: cfg.lineWidth, dark, realistic: cfg.sphericalRealistic });
			if (sphere) {
				scene.add(sphere.mesh);
				content = { kind: "sphere", sphere };
			}
		}
		contentRef.current = content;
		return () => {
			if (!content) return;
			if (content.kind === "sphere") {
				scene.remove(content.sphere.mesh);
				content.sphere.dispose();
			} else {
				scene.remove(content.wire.object);
				content.wire.dispose();
			}
			contentRef.current = null;
		};
	}, [poly, wireframe, isIslamic, realistic]);

	// Wireframe geometry controls: rebuild the tubes in place when section / thickness / height change.
	const section = useConfiguration((s) => s.sphericalWireSection);
	const thickness = useConfiguration((s) => s.sphericalWireThickness);
	const wireHeight = useConfiguration((s) => s.sphericalWireHeight);
	const bevel = useConfiguration((s) => s.sphericalWireBevel);
	useEffect(() => {
		const c = contentRef.current;
		if (!c || c.kind !== "wire") return;
		c.wire.setGeometry({ section, thickness, height: wireHeight, bevel });
	}, [section, thickness, wireHeight, bevel]);

	// Resize with the parent's measured width/height (guard the 0×0 first paint).
	useEffect(() => {
		const renderer = rendererRef.current;
		const camera = cameraRef.current;
		if (!renderer || !camera || width <= 0 || height <= 0) return;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}, [width, height]);

	// Hue ring + Line-stroke slider. Solid sphere: re-bake the surface texture in place. Wireframe: recolour
	// the tubes (stroke doesn't apply — thickness is its own control). Both are cheap, so drags stay live.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	useEffect(() => {
		const dark = document.documentElement.classList.contains("dark");
		const c = contentRef.current;
		if (c) {
			if (c.kind === "sphere") c.sphere.recolor({ hueOffset, lineWidth, dark });
			else c.wire.setColor(hueOffset);
		}
		// The Islamic overlay + cell fill live in their own refs (independent of the base content) — recolour too.
		if (islamicRef.current) islamicRef.current.setColor(hueOffset, dark);
		if (fillRef.current) fillRef.current.setColor(hueOffset);
		if (weaveRef.current) weaveRef.current.setColor(dark);
	}, [hueOffset, lineWidth]);

	// Islamic star-pattern overlay: the construction as great-circle ribbons — a hollow structure with no base
	// surface behind it. Independent of the base: it stands alone (Islamic only) OR sits over the wireframe
	// tubes (both toggles on). Rebuilt when a construction param or the stroke width changes, torn down when
	// Islamic turns off.
	const islamicAngle = useConfiguration((s) => s.islamicAngle);
	const islamicEdgeOffset = useConfiguration((s) => s.islamicEdgeOffset);
	const islamicIntersectionCount = useConfiguration((s) => s.islamicIntersectionCount);
	const islamicStyle = useConfiguration((s) => s.islamicStyle);
	const islamicBandWidth = useConfiguration((s) => s.islamicBandWidth);
	const weaveFlat = useConfiguration((s) => s.sphericalWeaveFlat);
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const clear = () => {
			if (islamicRef.current) {
				scene.remove(islamicRef.current.object);
				islamicRef.current.dispose();
				islamicRef.current = null;
			}
		};
		clear();
		// Interlace draws its own dark strap borders — the plain star-line ribbons would double them, so skip.
		if (!isIslamic || islamicStyle === "interlace") return;
		const pattern = buildIslamicPattern(poly, {
			angleRad: (Math.min(Math.max(islamicAngle, 0), 90) * Math.PI) / 180,
			edgeOffsetFrac: Math.min(Math.max(islamicEdgeOffset, 0), 100) / 100,
			intersectionCount: islamicIntersectionCount,
			// Wireframe ON ⇒ the star lines become rigid tube/rect bars (same sweep as the tiling wireframe,
			// shaped by Section / Thickness / Height / Bevel); OFF ⇒ flat surface ribbons sized by the stroke.
			rigid: wireframe,
			section,
			thickness,
			height: wireHeight,
			bevel,
			lineWidth,
			hueOffset: useConfiguration.getState().hueOffset,
			dark: document.documentElement.classList.contains("dark"),
		});
		if (pattern) {
			scene.add(pattern.object);
			islamicRef.current = pattern;
		}
		return clear;
	}, [poly, isIslamic, islamicStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, lineWidth, wireframe, section, thickness, wireHeight, bevel]);

	// Islamic cell fill: the regions the star lines cut, coloured by cell shape and laid on the sphere just
	// under the lines. Gated by the spherical Fill/Wireframe toggle (the two are mutually exclusive): Fill
	// (wireframe off) ⇒ filled cells + flat ribbon lines; Wireframe (on) ⇒ hollow just-lines look with rigid
	// tube lines and no fill. Only the construction params rebuild it, so it does NOT rebuild on the
	// wireframe/stroke/thickness drags that only reshape the lines — the wireframe flag flips it on/off.
	const islamicFill = !wireframe;
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const clear = () => {
			if (fillRef.current) {
				scene.remove(fillRef.current.object);
				fillRef.current.dispose();
				fillRef.current = null;
			}
			if (weaveRef.current) {
				scene.remove(weaveRef.current.object);
				weaveRef.current.dispose();
				weaveRef.current = null;
			}
		};
		clear();
		if (!isIslamic) return;
		const cfg = useConfiguration.getState();
		const angleRad = (Math.min(Math.max(islamicAngle, 0), 90) * Math.PI) / 180;
		const edgeOffsetFrac = Math.min(Math.max(islamicEdgeOffset, 0), 100) / 100;

		if (islamicStyle === "interlace") {
			// Woven straps + trimmed borders. Not gated by Polygon fill — the borders always show; the fill
			// toggle only decides whether the cream strap BODIES are drawn (filled weave) or just the outlines.
			const weave = buildIslamicWeave(poly, {
				angleRad,
				edgeOffsetFrac,
				intersectionCount: islamicIntersectionCount,
				width: Math.max(0.02, islamicBandWidth * WEAVE_WIDTH_FACTOR), // strap width in radians of arc
				showBodies: islamicFill,
				// Wireframe ON ⇒ extrude the straps into lit 3D ribbons, over/under separated radially.
				solid: wireframe,
				solidFlat: weaveFlat, // flat coplanar ribbons instead of the woven relief
				dark: document.documentElement.classList.contains("dark"),
			});
			if (weave) {
				scene.add(weave.object);
				weaveRef.current = weave;
			}
			return clear;
		}

		if (!islamicFill) return;
		const fill = buildIslamicFill(poly, {
			angleRad,
			edgeOffsetFrac,
			intersectionCount: islamicIntersectionCount,
			hueOffset: cfg.hueOffset,
			style: cfg.islamicStyle, // "checkerboard" 2-colours the cells; otherwise A/B/C plain
			fillColorB: cfg.islamicFillColorB, // A/B/C background fields — the same store colours the flat fill uses
			fillColorC: cfg.islamicFillColorC,
			checkerColorA: cfg.islamicCheckerColorA,
			checkerColorB: cfg.islamicCheckerColorB,
			relief: cfg.sphericalRealistic, // Realistic + Islamic ⇒ raised, lit tiles instead of the flat shell
		});
		if (fill) {
			scene.add(fill.object);
			fillRef.current = fill;
		}
		return clear;
	}, [poly, isIslamic, islamicFill, islamicStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, islamicBandWidth, wireframe, weaveFlat, realistic]);

	if (errored) {
		return (
			<div className="absolute inset-0 z-10 flex items-center justify-center">
				<p className="text-sm text-fg-muted max-w-xs text-center">
					3D view unavailable — the browser ran out of WebGL contexts. Reload the page to free them.
				</p>
			</div>
		);
	}

	// z-10 sits ABOVE the p5 input layer (canvas.tsx container is z-[1]) so ArcballControls receives the
	// drag/wheel, while staying below the z-20 canvas badges/buttons so those remain clickable.
	return <div ref={hostRef} className="absolute inset-0 z-10 h-full w-full" style={{ touchAction: "none" }} />;
}
