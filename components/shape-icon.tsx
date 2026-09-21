import { tileFill } from "@/lib/render/tilePalette";

// ⚑ getHue is NOT polygonHue: it is a LINEAR (n−3)/9 ramp over 0..300°, where the atlas' ramp is
// logarithmic over 0..360°, so a hexagon icon is not the hexagon colour the canvas paints beside it.
// Only the saturation and lightness are shared (tileFill). Left as it is deliberately — unifying the
// hue is a visible change to every icon in the UI and wants its own look.
interface ShapeIconProps {
	sides?: number;
	size?: number;
	color?: string;
}

function getHue(sides: number) {
	return Math.round(((sides - 3) / 9) * 300);
}

function getPolygonPoints(sides: number, radius: number, cx: number, cy: number) {
	const angleStep = (2 * Math.PI) / sides;
	const points: string[] = [];
	const rotation = sides === 3 ? -Math.PI / 2 : (2 * Math.PI) / sides / 2;
	for (let i = 0; i < sides; i++) {
		const angle = i * angleStep + rotation;
		points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
	}
	return points.join(" ");
}

export function ShapeIcon({ sides = 3, size = 32, color }: ShapeIconProps) {
	const fill = color ?? tileFill(getHue(sides), 0.8);
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className="block"
			aria-label="polygon"
		>
			<polygon points={getPolygonPoints(sides, size / 2 - 2, 16, 16)} fill={fill} />
			<text
				x="16"
				y="20"
				textAnchor="middle"
				fontSize="14"
				fill="white"
				fontWeight="bold"
				alignmentBaseline="middle"
				style={{ textShadow: "0 2px 5px rgba(0,0,0,1)" }}
			>
				{sides}
			</text>
		</svg>
	);
}
