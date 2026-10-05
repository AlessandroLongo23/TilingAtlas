"use client";

import { useEffect, useRef, useState } from "react";
import { drivePlayPan } from "@/lib/render/playView";
import { useGamepadState } from "@/lib/stores/gamepad";
import { VelocityPad } from "@/components/ui/velocity-pad";

// Joystick for travelling through a hyperbolic disk: hold the knob toward where you want to go and the
// view glides that way; let go and it coasts to a stop. It writes the pan target the p5 input layer
// writes on a drag (controls.targetOffset), so every disk canvas follows it through HypCamera with no
// change of its own, and a joystick push cancels a click-to-centre glide exactly as a drag does.
// With a controller in use the knob mirrors its left stick, which drives the same pan (useGamepad).

export function HyperbolicJoystick() {
	const rootRef = useRef<HTMLDivElement>(null);
	const [stick, setStick] = useState({ x: 0, y: 0 });
	const stickRef = useRef(stick);
	stickRef.current = stick;
	const vel = useRef({ x: 0, y: 0 });
	const held = stick.x !== 0 || stick.y !== 0;
	const pad = useGamepadState((s) => s.family);
	const padStick = useGamepadState((s) => s.stick);

	// The loop starts on a push and ends itself once the released view has coasted to rest. Release
	// must not cancel it (the coast IS the loop), so only unmount does.
	const raf = useRef(0);
	useEffect(() => {
		if (!held || raf.current) return;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			const box = rootRef.current?.offsetParent;
			const R = box ? 0.5 * Math.min(box.clientWidth, box.clientHeight) : 0;
			raf.current = drivePlayPan(vel.current, stickRef.current, dt, R) ? requestAnimationFrame(tick) : 0;
		};
		raf.current = requestAnimationFrame(tick);
	}, [held]);
	useEffect(() => () => cancelAnimationFrame(raf.current), []);

	return (
		<div ref={rootRef} className="ta-float absolute bottom-4 right-4 z-20 p-1.5 max-md:hidden">
			<VelocityPad
				value={held ? stick : padStick}
				onChange={setStick}
				size={96}
				springBack
				knobLabel={pad ? "L" : undefined}
				ariaLabel="Travel through the disk: hold a direction"
			/>
		</div>
	);
}
