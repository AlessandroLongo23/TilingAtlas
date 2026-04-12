"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { useDebug, updateDebugStore } from "@/stores/debug";

function formatTime(ms: number) {
	if (ms < 1) return "<1ms";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

const COLOR_PALETTE = [
	"rgba(99, 102, 241, 0.8)",
	"rgba(239, 68, 68, 0.8)",
	"rgba(34, 197, 94, 0.8)",
	"rgba(249, 115, 22, 0.8)",
	"rgba(16, 185, 129, 0.8)",
	"rgba(217, 70, 239, 0.8)",
	"rgba(14, 165, 233, 0.8)",
	"rgba(234, 179, 8, 0.8)",
	"rgba(236, 72, 153, 0.8)",
	"rgba(168, 85, 247, 0.8)",
];

export function PieChart() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const chartRef = useRef<Chart | null>(null);
	const timingData = useDebug((s) => s.timingData);
	const currentPath = timingData.currentPath ?? [];
	const breadcrumbs = timingData.breadcrumbs ?? [];

	useEffect(() => {
		if (!canvasRef.current || !timingData || timingData.phases.length === 0) {
			chartRef.current?.destroy();
			chartRef.current = null;
			return;
		}

		chartRef.current?.destroy();
		chartRef.current = createChart(canvasRef.current, timingData);

		return () => {
			chartRef.current?.destroy();
			chartRef.current = null;
		};
	}, [timingData]);

	const navigateTo = (path: string[]) => updateDebugStore(path);
	const navigateBack = () => {
		if (currentPath.length === 0) return;
		navigateTo(currentPath.slice(0, -1));
	};

	return (
		<div className="w-full h-64 bg-zinc-800/60 backdrop-blur-sm rounded-lg overflow-hidden border border-zinc-700/50 shadow-lg">
			<div className="px-4 py-2 text-xs font-medium text-white/80 flex justify-between items-center border-b border-zinc-700/50">
				<div className="flex items-center gap-2">
					{currentPath.length > 0 ? (
						<button className="text-white/60 hover:text-white/90 flex items-center" onClick={navigateBack}>
							<span className="text-lg leading-none mr-1">←</span>
							<span>Back</span>
						</button>
					) : (
						<button className="text-blue-300 hover:text-blue-100" onClick={() => navigateTo([])}>
							Root
						</button>
					)}
					{currentPath.length > 0 ? (
						<>
							<span className="text-white/50 mx-1">›</span>
							<div className="flex items-center">
								{breadcrumbs.map((crumb, i) => (
									<span key={crumb.label + i} className="flex items-center">
										<button className="text-blue-300 hover:text-blue-100" onClick={() => navigateTo(crumb.path)}>
											{crumb.label}
										</button>
										{i < breadcrumbs.length - 1 ? <span className="text-white/50 mx-1">›</span> : null}
									</span>
								))}
							</div>
						</>
					) : null}
				</div>
			</div>
			<div className="p-2 h-[calc(100%-32px)]">
				<canvas ref={canvasRef} />
			</div>
		</div>
	);
}

function createChart(el: HTMLCanvasElement, data: { phases: { label: string; value: number; directTime: number; totalTime: number; percentage: number; hasChildren: boolean }[]; totalTime: number }) {
	const labels = data.phases.map((p) => p.label);
	const values = data.phases.map((p) => p.value);
	const colors = data.phases.map((p, i) =>
		p.label === "Self time" ? "rgba(100, 100, 100, 0.5)" : COLOR_PALETTE[i % COLOR_PALETTE.length],
	);

	return new Chart(el, {
		type: "doughnut",
		data: {
			labels,
			datasets: [
				{
					data: values,
					backgroundColor: colors,
					borderColor: "rgba(30, 30, 30, 0.8)",
					borderWidth: 1,
					hoverOffset: 5,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: { padding: 10 },
			onClick: (event, elements, chart) => {
				const active = chart.getElementsAtEventForMode(event as unknown as Event, "nearest", { intersect: true }, false);
				if (active.length === 0) return;
				const i = active[0].index;
				const phase = data.phases[i];
				if (phase?.hasChildren) {
					const next = [...(useDebug.getState().timingData.currentPath ?? []), phase.label];
					updateDebugStore(next);
				}
			},
			plugins: {
				legend: {
					position: "right",
					labels: {
						color: "rgba(255, 255, 255, 0.8)",
						font: { size: 10, family: "system-ui, sans-serif" },
						boxWidth: 10,
						padding: 8,
						generateLabels: (chart) => {
							const original = Chart.overrides.doughnut.plugins.legend.labels.generateLabels;
							const labels = original.call(chart.legend as unknown as Chart, chart);
							return labels.map((label, i) => {
								const phase = data.phases[i];
								if (!phase) return label;
								let text = `${label.text}: ${formatTime(phase.value)} (${phase.percentage.toFixed(1)}%)`;
								if (phase.hasChildren) text += " →";
								label.text = text;
								return label;
							});
						},
					},
				},
				tooltip: {
					callbacks: {
						label: (context) => {
							const phase = data.phases[context.dataIndex];
							const value = formatTime(phase.value);
							const directValue = formatTime(phase.directTime);
							const pct = phase.percentage.toFixed(1);
							if (phase.directTime < phase.totalTime) {
								return [
									`${context.label}: ${value} (${pct}%)`,
									`Self time: ${directValue} (${((phase.directTime / data.totalTime) * 100).toFixed(1)}%)`,
								];
							}
							return `${context.label}: ${value} (${pct}%)`;
						},
					},
				},
			},
		},
	});
}
