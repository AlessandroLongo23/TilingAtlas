"use client";

import { useMemo } from "react";
import {
	Activity,
	Grid3x3 as Grid,
	Pilcrow,
	Maximize,
	Compass,
	Workflow,
	Heart,
	Bomb,
	Sparkles,
} from "lucide-react";
import { sounds } from "@/lib/utils/sounds";

interface GolRuleCardProps {
	name: string;
	rule: string;
	description: string;
	onClick: (rule: string) => void;
}

type Stability = "stable" | "explosive" | "chaotic";

interface RuleCharacteristics {
	isGenerations: boolean;
	isLargerThanLife: boolean;
	isTotalistic: boolean;
	isNonTotalistic: boolean;
	isIsotropic: boolean;
	isAnisotropic: boolean;
	stability: Stability;
}

function parseRuleString(ruleString: string): RuleCharacteristics {
	const c: RuleCharacteristics = {
		isGenerations: false,
		isLargerThanLife: false,
		isTotalistic: true,
		isNonTotalistic: false,
		isIsotropic: true,
		isAnisotropic: false,
		stability: "chaotic",
	};

	if (ruleString.split("/").length > 2) {
		const thirdPart = ruleString.split("/")[2];
		if (thirdPart && !Number.isNaN(parseInt(thirdPart))) c.isGenerations = true;
	}
	if (ruleString.startsWith("R")) c.isLargerThanLife = true;
	if (/[0-9][a-z]/i.test(ruleString)) {
		c.isTotalistic = false;
		c.isNonTotalistic = true;
	}
	if (ruleString.includes("MAP") || /[a-z]{5,}/i.test(ruleString)) {
		c.isIsotropic = false;
		c.isAnisotropic = true;
	}

	let birthConditions: number[] = [];
	if (ruleString.startsWith("B")) {
		const birthPart = ruleString.split("/")[0].substring(1);
		birthConditions = birthPart.split("").filter((x) => /[0-9]/.test(x)).map(Number);
	} else if (ruleString.includes("/")) {
		const birthPart = ruleString.split("/")[1];
		birthConditions = birthPart.split("").filter((x) => /[0-9]/.test(x)).map(Number);
	}
	if (birthConditions.includes(1) || birthConditions.includes(2)) {
		c.stability = "explosive";
	} else if (birthConditions.some((n) => n >= 4)) {
		c.stability = "stable";
	}

	return c;
}

export function GolRuleCard({ name, rule, description, onClick }: GolRuleCardProps) {
	const characteristics = useMemo(() => parseRuleString(rule), [rule]);

	return (
		<button
			onClick={() => {
				sounds.button();
				onClick(rule);
			}}
			className="w-full p-4 border border-zinc-700/50 bg-zinc-800/40 hover:bg-zinc-700/60 transition-all rounded-lg mb-2 text-left group"
		>
			<div className="flex flex-col">
				<span className="text-base font-medium mb-1 text-white/90 group-hover:text-white">{name}</span>
				<span className="text-xs font-mono text-green-300/80 mb-2">{rule}</span>
				<p className="text-xs text-white/70 mb-3 line-clamp-2">{description}</p>
				<div className="flex space-x-2 mt-auto">
					{characteristics.stability === "stable" ? (
						<Heart className="w-4 h-4 text-blue-400" />
					) : characteristics.stability === "explosive" ? (
						<Bomb className="w-4 h-4 text-red-400" />
					) : (
						<Sparkles className="w-4 h-4 text-yellow-400" />
					)}
					{characteristics.isGenerations ? <Activity className="w-4 h-4 text-purple-400" /> : null}
					{characteristics.isLargerThanLife ? <Maximize className="w-4 h-4 text-green-400" /> : null}
					{characteristics.isTotalistic ? (
						<Grid className="w-4 h-4 text-blue-400" />
					) : characteristics.isNonTotalistic ? (
						<Pilcrow className="w-4 h-4 text-orange-400" />
					) : null}
					{characteristics.isIsotropic ? (
						<Compass className="w-4 h-4 text-teal-400" />
					) : characteristics.isAnisotropic ? (
						<Workflow className="w-4 h-4 text-pink-400" />
					) : null}
				</div>
			</div>
		</button>
	);
}
