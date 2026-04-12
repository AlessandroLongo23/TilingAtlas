"use client";

import { useRef, type DependencyList, type HTMLAttributes } from "react";
import { useP5 } from "@/lib/hooks/useP5";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P5Sketch = (p5: any) => void;

interface P5CanvasProps extends HTMLAttributes<HTMLDivElement> {
	sketch: () => P5Sketch;
	/** Dependency list for the sketch factory. Changing any of these tears down and recreates the p5 instance. */
	deps?: DependencyList;
}

export function P5Canvas({ sketch, deps = [], ...rest }: P5CanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	useP5(containerRef, sketch, deps);
	return <div ref={containerRef} {...rest} />;
}
