"use client";

// The quotient view: a closed or half-closed board drawn as the surface it actually is.
//
// WHAT IT IS SHOWING. Gluing the board's edges is the quotient of the plane by a group of isometries, and
// that quotient IS the surface drawn here — this is the board's true topology, not a decoration. What the
// four differ in is how honestly ℝ³ can hold them:
//
//   CYLINDER   embeds isometrically. Tiles keep their true shape and size everywhere; nothing is a lie.
//   TORUS      embeds, but no flat torus embeds ISOMETRICALLY, so tiles stretch on the outer rim and
//              crowd on the inner. The topology is exact; the metric is not.
//   MÖBIUS     same: embedded, not isometric. The half twist is real — follow the band once round and the
//              tiles come back mirrored.
//   KLEIN      cannot embed in ℝ³ at all (it is non-orientable and closed; any closed surface in ℝ³ is
//              orientable). What is drawn is the figure-8 IMMERSION, which passes through itself along a
//              circle. The self-intersection is an artefact of three dimensions, not of the surface: the
//              automaton knows nothing about it and no cell is adjacent to the one it appears to touch.
//
// The plane view stays the honest picture of the geometry; this is the honest picture of the topology.
//
// HOW THE NON-ORIENTABLE ONES ARE DRAWN. The engine holds a Möbius or Klein board as its orientation
// double cover (see lib/automata/board.ts), so exactly half the cover's tiles are drawn: one from each
// orbit of the deck transformation ι. Every tile is placed from its OWN real lattice coordinates, so a
// tile straddling the seam simply has vertices at a slightly negative coordinate and the embedding, being
// periodic, closes the surface with no seam to stitch. That is also why an odd cover period — a tiling
// whose glide shifts by half a cell — needs no special case: nothing here is laid out column by column.
//
// The mesh is built once per (tiling, board) and only its COLOUR attribute changes per frame, so a
// running simulation costs one buffer upload, not a rebuild.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import type { BoardPlan } from "@/lib/automata/board";
import { automataPalette, hsbToRgb, stateColor } from "@/lib/automata/colors";
import type { AutomatonEngine } from "@/lib/automata/engine";
import { topologyDef, type TopologyId } from "@/lib/automata/topology";
import { useAutomata, type KleinShape } from "@/lib/stores/automata";
import { polygonFillHue, starApexAngleDeg, starHue } from "@/lib/utils/renderTiling";

/** Major radius shared by all four; the minor one is chosen per surface from the board's aspect ratio. */
const R_MAJOR = 1.0;
const R_MINOR = 0.42;

/** Arc length of the figure-8 cross-section (sin v, sin 2v), integrated numerically. Sets the Klein scale. */
const LEMNISCATE = 9.69;

/** Which surfaces this view can draw. Every closed or half-closed board, which is all but the plane. */
export const SURFACES_3D: TopologyId[] = ["cylinder", "torus", "mobius", "klein"];

interface SurfaceViewProps {
	plan: BoardPlan | null;
	engineRef: React.RefObject<AutomatonEngine | null>;
}

interface SurfaceMesh {
	positions: Float32Array;
	normals: Float32Array;
	/** Per vertex, the (lattice cell, slot) it reads its state from. */
	cellI: Int32Array;
	cellJ: Int32Array;
	slotIndex: Int32Array;
	baseHue: Float32Array;
	edgePositions: Float32Array;
	vertexCount: number;
	/** Camera framing: how far back to sit. */
	reach: number;
	lift: number;
}

type Embed = (a: number, b: number) => THREE.Vector3;

/**
 * The classic Klein bottle: a neck that punctures the wall and flares to meet the wide end.
 *
 * The usual parametrization, with $u$ running the LENGTH over $[0, \pi]$ and $v$ around the tube. It
 * closes as $(u, v) \sim (u + \pi,\ \pi - v)$: check $u = 0$ against $u = \pi$ and the two circles
 * agree only after $\cos v \mapsto -\cos v$. That reversal is exactly the board's flipped seam, which is
 * why this shape can carry the tiling at all.
 *
 * Its proportions are FIXED — the neck is thin, the body fat — so unlike the bagel it cannot be stretched
 * to the board's aspect ratio, and the caller normalizes the result to a usable size afterwards.
 */
function kleinBottle(u: number, v: number): THREE.Vector3 {
	const cu = Math.cos(u);
	const su = Math.sin(u);
	const cv = Math.cos(v);
	const sv = Math.sin(v);
	const cu2 = cu * cu;
	const cu3 = cu2 * cu;
	const cu4 = cu2 * cu2;
	const cu5 = cu4 * cu;
	const cu6 = cu4 * cu2;
	const cu7 = cu6 * cu;
	const x =
		-(2 / 15) * cu * (3 * cv - 30 * su + 90 * cu4 * su - 60 * cu6 * su + 5 * cu * cv * su);
	const y =
		-(1 / 15) *
		su *
		(3 * cv -
			3 * cu2 * cv -
			48 * cu4 * cv +
			48 * cu6 * cv -
			60 * su +
			5 * cu * cv * su -
			5 * cu3 * cv * su -
			80 * cu5 * cv * su +
			80 * cu7 * cv * su);
	const z = (2 / 15) * (3 + 5 * cu * su) * sv;
	// The formula's own y is the bottle's long axis; three.js has y up, so it already stands upright.
	return new THREE.Vector3(x, y, z);
}

/**
 * Where lattice coordinates (a, b) of the REFINED cell land on the surface.
 *
 * `W` is the period along a in cells — for the two flipped surfaces that is the quotient's width, half
 * the cover's — and `H` the period (or drawn extent) along b. `axis` is where the reflection's fixed line
 * sits in b, so the flip reads as b ↦ 2·axis − b and the embedding's own symmetry lines up with it.
 */
function makeEmbed(
	topology: TopologyId,
	W: number,
	H: number,
	axis: number,
	rho: number,
	kleinShape: KleinShape,
): Embed {
	const TAU = Math.PI * 2;
	if (topology === "cylinder") {
		// Height scaled so the drawn band keeps the board's aspect: circumference 2πR ↔ W cells.
		const scale = (TAU * R_MAJOR) / W;
		return (a, b) => {
			const u = (TAU * a) / W;
			return new THREE.Vector3(R_MAJOR * Math.cos(u), (b - axis) * scale, R_MAJOR * Math.sin(u));
		};
	}
	if (topology === "torus") {
		return (a, b) => {
			const u = (TAU * a) / W;
			const v = (TAU * b) / H;
			const ring = R_MAJOR + rho * Math.cos(v);
			return new THREE.Vector3(ring * Math.cos(u), rho * Math.sin(v), ring * Math.sin(u));
		};
	}
	if (topology === "mobius") {
		// (u, t) ↦ ((R + t·ρ·cos(u/2))·cos u, t·ρ·sin(u/2), …). At u + 2π the cosine and sine of u/2 both
		// change sign, so the point at −t is reached: one lap round the band is the flip.
		return (a, b) => {
			const u = (TAU * a) / W;
			const t = (b - axis) / (H / 2);
			const rad = R_MAJOR + t * rho * Math.cos(u / 2);
			return new THREE.Vector3(rad * Math.cos(u), t * rho * Math.sin(u / 2), rad * Math.sin(u));
		};
	}
	if (kleinShape === "bottle") {
		// One lap of the board is a HALF turn of u here, and v is phase-shifted by π/2 so that
		// b ↦ 2·axis − b lands on v ↦ π − v, which is what this parametrization glues by.
		return (a, b) => kleinBottle((Math.PI * a) / W, Math.PI / 2 + (2 * Math.PI * (b - axis)) / H);
	}
	// Klein, figure-8 immersion. Same identity: at u + 2π the half-angle terms flip sign, which sends v
	// to −v, so (u, v) ~ (u + 2π, −v) — exactly the board's gluing.
	return (a, b) => {
		const u = (TAU * a) / W;
		const v = (TAU * (b - axis)) / H;
		const cu = Math.cos(u / 2);
		const su = Math.sin(u / 2);
		const rad = R_MAJOR + rho * (cu * Math.sin(v) - su * Math.sin(2 * v));
		return new THREE.Vector3(
			rad * Math.cos(u),
			rho * (su * Math.sin(v) + cu * Math.sin(2 * v)),
			rad * Math.sin(u),
		);
	};
}

/** Surface normal by finite difference — one formula for four embeddings, and exact enough to shade. */
function normalAt(embed: Embed, a: number, b: number): THREE.Vector3 {
	const h = 1e-3;
	const p = embed(a, b);
	const da = embed(a + h, b).sub(p);
	const db = embed(a, b + h).sub(p);
	const n = da.cross(db);
	return n.lengthSq() > 1e-18 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

function buildSurfaceMesh(plan: BoardPlan | null, displayH: number, kleinShape: KleinShape): SurfaceMesh | null {
	if (!plan) return null;
	const adj = plan.adj;
	const polys = adj.polys.filter((p) => !p.open);
	if (polys.length === 0) return null;
	const [[v1x, v1y], [v2x, v2y]] = adj.basis;
	const det = v1x * v2y - v2x * v1y;
	if (Math.abs(det) < 1e-9) return null;
	const toLattice = (x: number, y: number): [number, number] => [
		(x * v2y - y * v2x) / det,
		(-x * v1y + y * v1x) / det,
	];

	const def = topologyDef(plan.topology);
	const flipped = plan.involution != null;
	const n = adj.n;

	// The range of cells to walk, and the period the embedding wraps by. On a flipped board the walk
	// covers the whole double cover and half of it is thrown away below; the embedding's period is the
	// QUOTIENT's width, which is what the surface actually closes up by.
	const coverW = plan.wrapI ?? 1;
	const periodA = flipped ? plan.domainW : coverW;
	const openJ = def.j === "open";
	const spanB = openJ ? Math.max(4, Math.min(64, displayH)) : (plan.wrapJ ?? displayH);
	// Centre an open axis on the flip's own line of symmetry, so ι maps the drawn band onto itself.
	const j0 = openJ ? Math.round(plan.axisB - (spanB - 1) / 2) : 0;
	const axis = flipped ? plan.axisB : openJ ? j0 + (spanB - 1) / 2 : 0;

	// Minor radius from the board's aspect ratio. v₁ and the refined v₂ are perpendicular on a flipped
	// board (they are the ±1 eigenvectors of a reflection), so the fundamental domain really is a
	// rectangle and this ratio is the honest one. Clamped: a very wide band would pass through itself.
	const len1 = Math.hypot(v1x, v1y);
	const len2 = Math.hypot(v2x, v2y);
	const aspect = (spanB * len2) / Math.max(1e-6, periodA * len1);
	let rho = R_MINOR;
	if (plan.topology === "torus") rho = R_MINOR;
	// Band half-width from 2ρ / 2πR = aspect. Capped well below R: a band much wider than that folds
	// through itself, and a Möbius strip that intersects is a worse picture than a squashed one.
	else if (plan.topology === "mobius") rho = Math.min(0.5, Math.max(0.1, Math.PI * R_MAJOR * aspect));
	else if (plan.topology === "klein") rho = Math.min(0.48, Math.max(0.1, (2 * Math.PI * R_MAJOR * aspect) / LEMNISCATE));

	const embed = makeEmbed(plan.topology, periodA, spanB, axis, rho, kleinShape);

	const positions: number[] = [];
	const normals: number[] = [];
	const cellI: number[] = [];
	const cellJ: number[] = [];
	const slotIndex: number[] = [];
	const baseHue: number[] = [];
	const edgePositions: number[] = [];

	// One extra level of subdivision keeps a tile sitting ON the surface instead of chording through it.
	// The Klein immersion bends hardest, so it gets one more.
	const SUB = plan.topology === "klein" ? 3 : 2;

	/** Is this the member of its ι-orbit that gets drawn? Exactly one of the two is. */
	const canonical = (i: number, j: number, t: number): boolean => {
		const inv = plan.involution;
		if (!inv) return true;
		const [ri, rj, rt] = inv(i, j, t);
		const i2 = ((ri % coverW) + coverW) % coverW;
		const j2 = openJ ? rj : ((rj % spanB) + spanB) % spanB;
		if (i !== i2) return i < i2;
		if (j !== j2) return j < j2;
		return t < rt;
	};

	for (let j = j0; j < j0 + spanB; j++) {
		for (let i = 0; i < coverW; i++) {
			for (let t = 0; t < n; t++) {
				if (!canonical(i, j, t)) continue;
				const p = polys[t];
				const hue = p.hue ?? (p.star ? starHue(p.n, starApexAngleDeg(p.vertices)) : polygonFillHue(p.vertices));
				const lat = p.vertices.map((v) => {
					const [a, b] = toLattice(v.x, v.y);
					return [a + i, b + j] as [number, number];
				});
				let ca = 0;
				let cb = 0;
				for (const [a, b] of lat) {
					ca += a;
					cb += b;
				}
				ca /= lat.length;
				cb /= lat.length;

				const emitTri = (A: [number, number], B: [number, number], C: [number, number]) => {
					for (let r = 0; r < SUB; r++) {
						for (let c = 0; c + r < SUB; c++) {
							const corner = (rr: number, cc: number): [number, number] => {
								const w0 = 1 - (rr + cc) / SUB;
								const w1 = cc / SUB;
								const w2 = rr / SUB;
								return [A[0] * w0 + B[0] * w1 + C[0] * w2, A[1] * w0 + B[1] * w1 + C[1] * w2];
							};
							const tris: [number, number][][] = [[corner(r, c), corner(r, c + 1), corner(r + 1, c)]];
							if (c + r + 1 < SUB) tris.push([corner(r, c + 1), corner(r + 1, c + 1), corner(r + 1, c)]);
							for (const tri of tris) {
								for (const [a, b] of tri) {
									const pos = embed(a, b);
									const nrm = normalAt(embed, a, b);
									positions.push(pos.x, pos.y, pos.z);
									normals.push(nrm.x, nrm.y, nrm.z);
									cellI.push(i);
									cellJ.push(j);
									slotIndex.push(t);
									baseHue.push(hue);
								}
							}
						}
					}
				};

				// Fan from the centroid. Unlike the flat renderer this does not need the centroid to lie in
				// the tile's kernel: the fan is only a SUBDIVISION for shading here, and a tile whose
				// centroid sits outside it (a deep star point) folds a sliver that the surface hides.
				for (let e = 0; e < lat.length; e++) {
					const A = lat[e];
					const B = lat[(e + 1) % lat.length];
					emitTri([ca, cb], A, B);
					// Outline: the tile edge, subdivided the same way so it hugs the surface. It sits exactly ON
					// the surface and the FILL is pushed back instead, by polygon offset — nudging the line
					// along the normal would have been orientation-dependent, and the finite-difference normal
					// points inward on the torus's parametrization, which hid every outline there.
					for (let s = 0; s < SUB * 2; s++) {
						const t0 = s / (SUB * 2);
						const t1 = (s + 1) / (SUB * 2);
						for (const tt of [t0, t1]) {
							const q = embed(A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt);
							edgePositions.push(q.x, q.y, q.z);
						}
					}
				}
			}
		}
	}

	if (positions.length === 0) return null;

	// The bottle's parametrization has its own scale, several times the others', and is not centred on the
	// origin. Normalize it here instead of folding constants into the formula: a uniform scale plus a
	// translation leaves the finite-difference normals pointing exactly where they did.
	if (plan.topology === "klein" && kleinShape === "bottle") {
		const lo = [Infinity, Infinity, Infinity];
		const hi = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < positions.length; i += 3) {
			for (let k = 0; k < 3; k++) {
				if (positions[i + k] < lo[k]) lo[k] = positions[i + k];
				if (positions[i + k] > hi[k]) hi[k] = positions[i + k];
			}
		}
		const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
		const half = Math.max(...[0, 1, 2].map((k) => (hi[k] - lo[k]) / 2), 1e-6);
		const k = 1.25 / half;
		for (const buf of [positions, edgePositions]) {
			for (let i = 0; i < buf.length; i += 3) {
				buf[i] = (buf[i] - mid[0]) * k;
				buf[i + 1] = (buf[i + 1] - mid[1]) * k;
				buf[i + 2] = (buf[i + 2] - mid[2]) * k;
			}
		}
	}

	// Framing. The cylinder is drawn isometrically, so its height is whatever the aspect ratio says and can
	// be many times the radius; the others live inside R + ρ.
	let reach = 2.6;
	let lift = 2.1;
	if (plan.topology === "cylinder") {
		const height = ((2 * Math.PI * R_MAJOR) / periodA) * spanB;
		// A 45° field of view shows 2·d·tan(22.5°) ≈ 0.83·d of height at distance d, and the near face of
		// the cylinder is one radius closer than its axis. Divide by less than that for margin: a tall band
		// framed exactly to the fov loses its two ends to the viewport edges.
		reach = Math.max(2.8, height / 0.66 + R_MAJOR * 1.2);
		lift = height * 0.08;
	} else if (plan.topology === "mobius") {
		// Higher and closer than the closed surfaces: a flat band read edge-on says nothing, and the twist
		// is what there is to see.
		reach = 2.2 + rho;
		lift = 2.3 + rho;
	} else if (plan.topology === "klein" && kleinShape === "bottle") {
		// Normalized to a half-extent of 1.25 above, and worth looking at from nearer the equator than the
		// bagel: the neck entering the body is the whole point of this shape.
		reach = 3.7;
		lift = 0.9;
	} else {
		reach = 2.6 + rho;
		lift = 2.1;
	}

	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals),
		cellI: Int32Array.from(cellI),
		cellJ: Int32Array.from(cellJ),
		slotIndex: Int32Array.from(slotIndex),
		baseHue: new Float32Array(baseHue),
		edgePositions: new Float32Array(edgePositions),
		vertexCount: positions.length / 3,
		reach,
		lift,
	};
}

export function SurfaceView({ plan, engineRef }: SurfaceViewProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const storeH = useAutomata((s) => s.boardH);
	const kleinShape = useAutomata((s) => s.kleinShape);
	const showEdges = useAutomata((s) => s.showEdges);
	const tintDead = useAutomata((s) => s.tintDead);
	// Latest display flags for the draw loop, written in an effect rather than during render (the loop
	// mounts once and must not be torn down every time a checkbox moves).
	const showEdgesRef = useRef(showEdges);
	const tintRef = useRef(tintDead);
	useEffect(() => {
		showEdgesRef.current = showEdges;
		tintRef.current = tintDead;
	}, [showEdges, tintDead]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const mesh = buildSurfaceMesh(plan, storeH, kleinShape);
		if (!mesh) return;

		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
		camera.position.set(0, mesh.lift, mesh.reach);
		scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
		const dir = new THREE.DirectionalLight(0xffffff, 0.7);
		dir.position.set(2, 3, 2);
		scene.add(dir);
		scene.add(new THREE.AmbientLight(0xffffff, 0.25));

		const geom = new THREE.BufferGeometry();
		geom.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
		geom.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
		const colors = new Float32Array(mesh.vertexCount * 3);
		const colorAttr = new THREE.BufferAttribute(colors, 3);
		colorAttr.setUsage(THREE.DynamicDrawUsage);
		geom.setAttribute("color", colorAttr);
		// DoubleSide is not a convenience here: a Möbius band and a Klein bottle have no consistent
		// outward side, so half the triangles necessarily face away from any camera.
		const material = new THREE.MeshLambertMaterial({
			vertexColors: true,
			side: THREE.DoubleSide,
			// Push the fill back in depth so the tile outlines, which lie exactly on the surface, win.
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1,
		});
		// Named for the mesh, not the topology: shadowing the surface identifier here once put an earlier
		// read of it in this local's temporal dead zone, which types do not catch.
		const surfaceMesh = new THREE.Mesh(geom, material);
		scene.add(surfaceMesh);

		const edgeGeom = new THREE.BufferGeometry();
		edgeGeom.setAttribute("position", new THREE.BufferAttribute(mesh.edgePositions, 3));
		const edges = new THREE.LineSegments(
			edgeGeom,
			new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
		);
		scene.add(edges);

		const controls = new ArcballControls(camera, renderer.domElement, scene);
		controls.enablePan = false;
		controls.setGizmosVisible(false);

		let raf = 0;
		const draw = () => {
			raf = requestAnimationFrame(draw);
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			if (w > 0 && h > 0 && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || camera.aspect !== w / h)) {
				renderer.setSize(w, h, false);
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
			}

			const eng = engineRef.current;
			if (eng) {
				const states = eng.stateCount;
				const pal = automataPalette();
				const tint = tintRef.current;
				for (let v = 0; v < mesh.vertexCount; v++) {
					const s = eng.getCell(mesh.cellI[v], mesh.cellJ[v], mesh.slotIndex[v]);
					let [r, g, b] = stateColor(s, states, pal);
					if (s === 0 && tint) {
						// Same blend the flat fragment shader applies: the tiling's own colour, muted, so
						// the geometry stays readable under a mostly-dead board.
						const [tr, tg, tb] = hsbToRgb(mesh.baseHue[v], 0.4, 1);
						r += (tr - r) * 0.18;
						g += (tg - g) * 0.18;
						b += (tb - b) * 0.18;
					}
					colors[v * 3] = r;
					colors[v * 3 + 1] = g;
					colors[v * 3 + 2] = b;
				}
				colorAttr.needsUpdate = true;
			}
			edges.visible = showEdgesRef.current;
			controls.update();
			renderer.render(scene, camera);
		};
		raf = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(raf);
			controls.dispose();
			geom.dispose();
			edgeGeom.dispose();
			material.dispose();
			renderer.dispose();
		};
	}, [plan, storeH, kleinShape, engineRef]);

	return <canvas ref={canvasRef} className="w-full h-full block touch-none" />;
}
