import { create } from "zustand";

interface TimingNode {
	label: string;
	children: Record<string, TimingNode>;
	time: number;
	totalTime: number;
	isRoot?: boolean;
	parentPath?: string[];
}

interface PhaseData {
	label: string;
	value: number;
	directTime: number;
	totalTime: number;
	percentage: number;
	hasChildren: boolean;
}

interface TimingData {
	currentPath: string[];
	breadcrumbs: { label: string; path: string[] }[];
	phases: PhaseData[];
	totalTime: number;
}

class DebugManager {
	timingTree: TimingNode;
	currentPath: string[];
	startTimes: { [key: string]: { startTime: number; path: string[] } };
	isEnabled: boolean;
	pendingTimers: Set<string>;

	constructor() {
		this.timingTree = { label: "root", children: {}, time: 0, totalTime: 0, isRoot: true };
		this.currentPath = [];
		this.startTimes = {};
		this.isEnabled = false;
		this.pendingTimers = new Set();
	}

	enable() {
		this.isEnabled = true;
		this.reset();
	}

	disable() {
		this.isEnabled = false;
	}

	reset() {
		this.pendingTimers.forEach((label) => {
			if (this.startTimes[label]) {
				console.warn(`Timer "${label}" was not properly ended before reset. Cleaning up.`);
				delete this.startTimes[label];
			}
		});
		this.pendingTimers.clear();
		this.timingTree = { label: "root", children: {}, time: 0, totalTime: 0, isRoot: true };
		this.currentPath = [];
		this.startTimes = {};
	}

	getNode(path: string[] = []): TimingNode {
		let node = this.timingTree;
		for (const label of path) {
			if (!node.children[label]) {
				node.children[label] = {
					label,
					children: {},
					time: 0,
					totalTime: 0,
					parentPath: [...path.slice(0, path.indexOf(label))],
				};
			}
			node = node.children[label];
		}
		return node;
	}

	startTimer(label: string) {
		if (!this.isEnabled) return;
		if (this.pendingTimers.has(label)) {
			console.warn(`Timer "${label}" already started.`);
			return;
		}
		const timerPath = [...this.currentPath, label];
		this.startTimes[label] = { startTime: performance.now(), path: timerPath };
		this.pendingTimers.add(label);
		this.currentPath.push(label);
	}

	endTimer(label: string) {
		if (!this.isEnabled) return;
		if (!this.startTimes[label]) {
			console.warn(`Tried to end timer "${label}" but it was never started.`);
			return;
		}
		const endTime = performance.now();
		const { startTime, path } = this.startTimes[label];
		const duration = endTime - startTime;
		if (duration < 0) {
			console.warn(`Timer "${label}" has negative duration: ${duration}ms.`);
			return;
		}
		const node = this.getNode(path);
		node.time += duration;
		this.recalculateTotalTimes();
		while (this.currentPath.length > 0 && this.currentPath[this.currentPath.length - 1] !== label) {
			this.currentPath.pop();
		}
		if (this.currentPath.length > 0) this.currentPath.pop();
		this.pendingTimers.delete(label);
		delete this.startTimes[label];
	}

	recalculateTotalTimes() {
		const calc = (node: TimingNode) => {
			let childrenTime = 0;
			Object.values(node.children).forEach((child) => {
				calc(child);
				childrenTime += child.totalTime;
			});
			node.totalTime = node.time + childrenTime;
		};
		calc(this.timingTree);
	}

	getTimingData(path: string[] = []): TimingData {
		const node = this.getNode(path);
		const directTime = node.time;
		const totalTime = node.totalTime;
		const selfTime = directTime;
		const childrenData: PhaseData[] = Object.values(node.children)
			.map((child) => ({
				label: child.label,
				value: child.totalTime,
				directTime: child.time,
				totalTime: child.totalTime,
				percentage: totalTime > 0 ? (child.totalTime / totalTime) * 100 : 0,
				hasChildren: Object.keys(child.children).length > 0,
			}))
			.sort((a, b) => b.value - a.value);
		if (selfTime > 0) {
			childrenData.unshift({
				label: "Self time",
				value: selfTime,
				directTime: selfTime,
				totalTime: selfTime,
				percentage: totalTime > 0 ? (selfTime / totalTime) * 100 : 0,
				hasChildren: false,
			});
		}
		const breadcrumbs = path.map((label, index) => ({
			label,
			path: path.slice(0, index + 1),
		}));
		return { currentPath: path, breadcrumbs, phases: childrenData, totalTime };
	}
}

export const debugManager = new DebugManager();

interface DebugStoreState {
	isEnabled: boolean;
	timingData: TimingData;
}

export const useDebug = create<DebugStoreState>()(() => ({
	isEnabled: false,
	timingData: { phases: [], totalTime: 0, currentPath: [], breadcrumbs: [] },
}));

export function updateDebugStore(path: string[] = []) {
	const data = debugManager.getTimingData(path);
	useDebug.setState({ isEnabled: debugManager.isEnabled, timingData: data });
}
