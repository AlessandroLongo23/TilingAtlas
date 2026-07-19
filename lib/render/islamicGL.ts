// GLSL for the Islamic WebGL view (components/islamic-canvas.tsx). Draws the origin-cell A/B/C arrangement
// mesh (lib/render/buildIslamicMesh.ts) INSTANCED across the viewport: the CPU builds one cell's faces,
// the vertex shader replicates it by aInst = (i,j) lattice offset, so a slider rebuild costs one cell, not
// the whole zoom. The world→clip transform (after the aInst offset) is byte-identical to the flat
// renderer's FILL_VERT (lib/render/flatTilingGL.ts) — keep the two in step so the WebGL fill registers
// exactly under p5's overlays and matches drawIslamicStarFill.

// Fill: per-vertex hue + class. Class 0 = A → the tile hue (rotated by the global hue ring, same s/b as
// every other fill path). Class 1 = B, class 2 = C → the two shared background colours (uniforms, so
// recolouring never touches the mesh).
export const ISLAMIC_FILL_VERT = `#version 300 es
in vec2 aPos;
in float aHue;
in float aClass;
in vec2 aInst;          // per-instance lattice cell (i,j)
uniform vec2 uOffset;   // wrapped pan, centred CSS px, y down
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform vec2 uHalf;     // canvas CSS half-size (w/2, h/2)
out float vHue;
out float vClass;
void main() {
	vec2 world = aPos + aInst.x * uV1 + aInst.y * uV2;
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vHue = aHue;
	vClass = aClass;
}
`;

export const ISLAMIC_FILL_FRAG = `#version 300 es
precision highp float;
in float vHue;
in float vClass;
uniform float uHueOffset;
uniform vec3 uColorA;   // checkerboard colour A (uMode 1); unused in plain mode
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform int uMode;      // 0 = plain A/B/C, 1 = checkerboard two-colour
uniform float uOpacity;
out vec4 frag;
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}
void main() {
	vec3 rgb;
	if (uMode == 1) {
		rgb = vClass < 0.5 ? uColorA : uColorB;                                        // checkerboard 0/1
	} else if (vClass < 0.5) rgb = hsb2rgb(mod(vHue + uHueOffset, 360.0) / 360.0, 0.40, 1.0); // A: tile hue
	else if (vClass < 1.5) rgb = uColorB;                                              // B: side field
	else rgb = uColorC;                                                                // C: edge diamond
	frag = vec4(rgb, uOpacity);
}
`;

// Stroke: butt quads pushed by half the screen stroke width along the (screen-space) edge normal, so the
// border stays a constant CSS width at any zoom. Same math as flatTilingGL's STROKE_VERT, instanced by
// aInst like the fill above (the normal is a direction, so aInst does not shift it).
export const ISLAMIC_STROKE_VERT = `#version 300 es
in vec2 aPos;
in vec2 aNorm;
in float aSide;
in vec2 aInst;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform vec2 uHalf;
uniform float uHalfStrokePx;
void main() {
	vec2 world = aPos + aInst.x * uV1 + aInst.y * uV2;
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	float nsx = uZoom * (c * aNorm.x + s * aNorm.y);
	float nsy = uZoom * (s * aNorm.x - c * aNorm.y);
	float nl = length(vec2(nsx, nsy));
	vec2 n = nl > 0.0 ? vec2(nsx, nsy) / nl : vec2(0.0);
	sx += aSide * uHalfStrokePx * n.x;
	sy += aSide * uHalfStrokePx * n.y;
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
}
`;

export const ISLAMIC_STROKE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uStroke;
uniform float uOpacity;
out vec4 frag;
void main() { frag = vec4(uStroke, uOpacity); }
`;

// Parse a CSS hex colour (#rgb or #rrggbb) to normalised [r,g,b] in 0..1. Falls back to mid-grey.
export function hexToRgb(hex: string): [number, number, number] {
	let h = hex.trim().replace(/^#/, "");
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0.5, 0.5, 0.5];
	return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
