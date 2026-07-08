import type { SymmetryData, Vec2 } from "@/lib/classes/symmetry/types";

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
