"use client";

import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { useConfiguration } from "@/stores/configuration";

interface BehaviorData {
	increasing: number;
	chaotic: number;
	decreasing: number;
}

interface LiveChartProps {
	alivePercentage: number;
	iterationCount: number;
	behaviorData: BehaviorData;
}

type ChartMode = "count" | "behavior";

const MAX_DATA_POINTS = 100;

export function LiveChart({ alivePercentage, iterationCount, behaviorData }: LiveChartProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const chartRef = useRef<Chart | null>(null);

	const [chartMode, setChartMode] = useState<ChartMode>("count");
	const setLiveChartMode = useConfiguration((s) => s.set);

	const countDataRef = useRef<number[]>(Array(MAX_DATA_POINTS).fill(0));
	const behaviorHistoryRef = useRef<BehaviorData[]>(
		Array(MAX_DATA_POINTS).fill({ increasing: 0, chaotic: 0, decreasing: 0 }),
	);

	const [averageBehavior, setAverageBehavior] = useState<BehaviorData>({
		increasing: 0,
		chaotic: 0,
		decreasing: 0,
	});

	const lastIteration = useRef<number>(-1);

	useEffect(() => {
		if (!canvasRef.current) return;
		chartRef.current?.destroy();
		chartRef.current =
			chartMode === "count"
				? createCountChart(canvasRef.current, countDataRef.current)
				: createBehaviorChart(canvasRef.current, behaviorHistoryRef.current);
		return () => {
			chartRef.current?.destroy();
			chartRef.current = null;
		};
	}, [chartMode]);

	useEffect(() => {
		if (iterationCount === lastIteration.current) return;
		lastIteration.current = iterationCount;

		if (chartMode === "count") {
			const next = [...countDataRef.current.slice(1), alivePercentage];
			countDataRef.current = next;
			const chart = chartRef.current;
			if (chart) {
				chart.data.datasets[0].data = [...next];
				if (chart.options.scales?.y) {
					(chart.options.scales.y as { max: number }).max = Math.min(
						Math.max(...next) * 2,
						100,
					);
				}
				chart.update("none");
			}
		} else {
			const next = [...behaviorHistoryRef.current.slice(1), { ...behaviorData }];
			behaviorHistoryRef.current = next;
			const n = next.length;
			const avg = next.reduce(
				(acc, d) => ({
					increasing: acc.increasing + d.increasing / n,
					chaotic: acc.chaotic + d.chaotic / n,
					decreasing: acc.decreasing + d.decreasing / n,
				}),
				{ increasing: 0, chaotic: 0, decreasing: 0 },
			);
			setAverageBehavior(avg);

			const chart = chartRef.current;
			if (chart) {
				chart.data.datasets[0].data = next.map((d) => d.increasing);
				chart.data.datasets[1].data = next.map((d) => d.chaotic);
				chart.data.datasets[2].data = next.map((d) => d.decreasing);
				chart.update("none");
			}
		}
	}, [iterationCount, alivePercentage, behaviorData, chartMode]);

	const switchMode = (mode: ChartMode) => {
		setChartMode(mode);
		setLiveChartMode({ liveChartMode: mode });
	};

	return (
		<div className="w-full h-48 bg-surface-overlay/60 backdrop-blur-sm rounded-lg overflow-hidden border border-line shadow-lg">
			<div className="px-4 py-2 text-xs font-medium text-fg-secondary flex justify-between items-center border-b border-line">
				<div className="flex items-center gap-2">
					<span>{chartMode === "count" ? "Live Population" : "Behavior Distribution"}</span>
					<div className="flex rounded-md overflow-hidden border border-line-strong">
						<button
							className={`px-2 py-1 text-xs ${
								chartMode === "count" ? "bg-fg-muted text-fg" : "bg-transparent text-fg-muted hover:text-fg"
							}`}
							onClick={() => switchMode("count")}
						>
							Count
						</button>
						<button
							className={`px-2 py-1 text-xs ${
								chartMode === "behavior" ? "bg-fg-muted text-fg" : "bg-transparent text-fg-muted hover:text-fg"
							}`}
							onClick={() => switchMode("behavior")}
						>
							Behavior
						</button>
					</div>
				</div>
				{chartMode === "count" ? (
					<span className="text-accent font-bold">{alivePercentage.toFixed(1)}%</span>
				) : null}
			</div>
			<div className="p-2 h-[calc(100%-32px)] relative">
				<canvas ref={canvasRef} />
				{chartMode === "behavior" ? (
					<>
						<div className="absolute bottom-8 left-0 right-0 mx-4 flex justify-between text-[10px] text-fg-secondary">
							<span className="flex items-center gap-1">
								<div className="w-2 h-2 bg-black rounded-sm" />
								Increasing
							</span>
							<span className="flex items-center gap-1">
								<div className="w-2 h-2 bg-accent rounded-sm" />
								Chaotic
							</span>
							<span className="flex items-center gap-1">
								<div className="w-2 h-2 bg-white rounded-sm" />
								Decreasing
							</span>
						</div>
						<div className="absolute bottom-4 left-0 right-0 mx-4 h-1">
							<div className="relative w-full h-full flex rounded-md overflow-hidden">
								<div className="h-full bg-black" style={{ width: `${averageBehavior.increasing}%` }} />
								<div className="h-full bg-accent" style={{ width: `${averageBehavior.chaotic}%` }} />
								<div className="h-full bg-white" style={{ width: `${averageBehavior.decreasing}%` }} />
							</div>
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}

function createCountChart(el: HTMLCanvasElement, data: number[]) {
	return new Chart(el, {
		type: "line",
		data: {
			labels: Array(MAX_DATA_POINTS).fill(""),
			datasets: [
				{
					label: "Alive Cells (%)",
					data: [...data],
					fill: true,
					backgroundColor: "rgba(34, 197, 94, 0.2)",
					borderColor: "rgba(34, 197, 94, 0.8)",
					borderWidth: 2,
					pointRadius: 0,
					tension: 0.4,
					cubicInterpolationMode: "monotone",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: { padding: 10 },
			animation: { duration: 0 },
			plugins: {
				legend: { display: false },
				tooltip: { enabled: false },
			},
			scales: {
				x: { display: false, grid: { display: false } },
				y: {
					min: 0,
					max: 100,
					position: "right",
					ticks: {
						color: "rgba(255, 255, 255, 0.8)",
						font: { size: 10, family: "system-ui, sans-serif" },
						padding: 8,
						maxTicksLimit: 5,
						callback: (value) => Math.round(Number(value)) + "%",
					},
					grid: { color: "rgba(255, 255, 255, 0.1)" },
				},
			},
		},
	});
}

function createBehaviorChart(el: HTMLCanvasElement, history: BehaviorData[]) {
	return new Chart(el, {
		type: "line",
		data: {
			labels: Array(MAX_DATA_POINTS).fill(""),
			datasets: [
				{
					label: "Increasing",
					data: history.map((d) => d.increasing),
					fill: "origin",
					backgroundColor: "rgba(0, 0, 0, 0.2)",
					borderColor: "rgba(0, 0, 0, 0.8)",
					borderWidth: 2,
					pointRadius: 0,
					tension: 0.4,
					cubicInterpolationMode: "monotone",
				},
				{
					label: "Chaotic",
					data: history.map((d) => d.chaotic),
					fill: "-1",
					backgroundColor: "rgba(38, 220, 38, 0.2)",
					borderColor: "rgba(38, 220, 38, 0.8)",
					borderWidth: 2,
					pointRadius: 0,
					tension: 0.4,
					cubicInterpolationMode: "monotone",
				},
				{
					label: "Decreasing",
					data: history.map((d) => d.decreasing),
					fill: "-1",
					backgroundColor: "rgba(255, 255, 255, 0.2)",
					borderColor: "rgba(255, 255, 255, 0.8)",
					borderWidth: 2,
					pointRadius: 0,
					tension: 0.4,
					cubicInterpolationMode: "monotone",
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: { padding: { top: 10, right: 10, bottom: 40, left: 10 } },
			animation: { duration: 0 },
			plugins: {
				legend: { display: false },
				tooltip: { enabled: false },
			},
			scales: {
				x: { display: false, stacked: true, grid: { display: false } },
				y: {
					min: 0,
					max: 100,
					stacked: true,
					position: "right",
					ticks: {
						color: "rgba(255, 255, 255, 0.8)",
						font: { size: 10, family: "system-ui, sans-serif" },
						padding: 8,
						maxTicksLimit: 5,
						callback: (value) => Math.round(Number(value)) + "%",
					},
					grid: { color: "rgba(255, 255, 255, 0.1)" },
				},
			},
		},
	});
}
