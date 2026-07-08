import type { Center, SymmetryData, Vec2 } from "@/lib/classes/symmetry/types";

// p5 is the same untyped instance canvas.tsx uses. Every draw here runs INSIDE the canvas world
// transform (…translate·rotate·scale·scale(1,-1)), so geometry is in WORLD units and follows
// pan/zoom/rotate for free. Colour mode is HSB(360,100,100) with alpha 0..1 (set in canvas.tsx setup).
// World-unit stroke weights ≈ pixels/zoom; the canvas draws at zoom≈40–150, so 0.02–0.05 → ~1–4 px.
type P5 = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const add = (a: Vec2, b: Vec2, c?: Vec2): Vec2 => ({
	x: a.x + b.x + (c?.x ?? 0),
	y: a.y + b.y + (c?.y ?? 0),
});

function polygon(p5: P5, pts: Vec2[]) {
	p5.beginShape();
	for (const q of pts) p5.vertex(q.x, q.y);
	p5.endShape(p5.CLOSE);
}

export function drawFundamentalDomain(p5: P5, data: SymmetryData) {
	const o = data.cellOrigin;
	const [c1, c2] = data.cell;
	p5.push();
	// primitive lattice cell — thin neutral parallelogram outline
	p5.noFill();
	p5.stroke(0, 0, 55);
	p5.strokeWeight(0.02);
	polygon(p5, [o, add(o, c1), add(o, c1, c2), add(o, c2)]);
	// fundamental domain — translucent yellow fill + orange edge
	p5.fill(48, 85, 100, 0.5);
	p5.stroke(28, 90, 90);
	p5.strokeWeight(0.03);
	polygon(p5, data.fd);
	p5.pop();
}

// Standard crystallographic rotation-center marks. Hue by order; drawn at a fixed PIXEL size (unscaled
// by zoom, y-flip undone) so they stay legible and upright at any zoom.
const CENTER_HUE: Record<number, number> = { 2: 300, 3: 210, 4: 120, 6: 40 };

function ngon(p5: P5, n: number, r: number, start: number) {
	p5.beginShape();
	for (let i = 0; i < n; i++) {
		const a = start + (2 * Math.PI * i) / n;
		p5.vertex(r * Math.cos(a), r * Math.sin(a));
	}
	p5.endShape(p5.CLOSE);
}

function drawCenter(p5: P5, c: Center, zoom: number) {
	const r = 6; // px
	p5.push();
	p5.translate(c.z.x, c.z.y);
	p5.scale(1 / zoom, -1 / zoom); // pixel units, undo the world y-flip so glyphs are upright
	p5.stroke(0, 0, 0);
	p5.strokeWeight(1);
	p5.fill(CENTER_HUE[c.order] ?? 0, 80, 95);
	if (c.order === 2) p5.ellipse(0, 0, r, 2 * r); // 2-fold: pointed oval / lens
	else if (c.order === 3) ngon(p5, 3, r, Math.PI / 2); // triangle, point up
	else if (c.order === 4) ngon(p5, 4, r, Math.PI / 4); // square, flat sides
	else ngon(p5, 6, r, 0); // hexagon, flat top
	p5.pop();
}

// Mirror axes solid crimson, glide axes dashed royal-blue. Each line runs through its point `p` along
// `d`, extended well past the cell so it crosses the viewport. Stroke weight and dash length are scaled
// by 1/zoom to stay ~constant in pixels.
function drawAxes(p5: P5, data: SymmetryData, zoom: number) {
	const [c1, c2] = data.cell;
	const L = (Math.hypot(c1.x, c1.y) + Math.hypot(c2.x, c2.y)) * 8;
	for (const ax of data.axes) {
		p5.push();
		p5.strokeWeight(2 / zoom);
		if (ax.kind === "glide") {
			p5.stroke(220, 85, 90);
			p5.drawingContext.setLineDash([8 / zoom, 5 / zoom]);
		} else {
			p5.stroke(348, 90, 85);
		}
		p5.line(ax.p.x - ax.d.x * L, ax.p.y - ax.d.y * L, ax.p.x + ax.d.x * L, ax.p.y + ax.d.y * L);
		p5.drawingContext.setLineDash([]);
		p5.pop();
	}
}

export function drawSymmetryElements(p5: P5, data: SymmetryData, zoom: number) {
	drawAxes(p5, data, zoom); // axes first, so the rotation-center marks sit on top
	for (const c of data.centers) drawCenter(p5, c, zoom);
}
