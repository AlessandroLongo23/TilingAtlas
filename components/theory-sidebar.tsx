"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils/cn";

export interface TheorySection {
	id: string;
	title: string;
	level: number;
	subsections?: TheorySection[];
}

interface TheorySidebarProps {
	sections: TheorySection[];
	activeSection?: string;
	onSectionSelect: (sectionId: string) => void;
	isLoading?: boolean;
	error?: string | null;
}

export function TheorySidebar({
	sections,
	activeSection = "",
	onSectionSelect,
	isLoading = false,
	error = null,
}: TheorySidebarProps) {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (sections.length > 0 && Object.keys(expanded).length === 0) {
			const initial: Record<string, boolean> = {};
			for (const s of sections) {
				initial[s.id] = true;
				s.subsections?.forEach((sub) => {
					if (sub.id) initial[sub.id] = true;
				});
			}
			setExpanded(initial);
		}
	}, [sections, expanded]);

	const toggle = (id: string) => {
		setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const hasSubs = (s: TheorySection) => !!s.subsections && s.subsections.length > 0;

	return (
		<div className="h-full flex flex-col">
			<div className="px-4 pt-4 pb-2">
				<h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
					Contents
				</h3>
			</div>
			<div className="flex-1 overflow-y-auto px-2 pb-4">
				{isLoading ? (
					<div className="px-3 py-2 text-xs text-fg-muted">Loading…</div>
				) : error ? (
					<div className="px-3 py-2 text-xs text-danger">{error}</div>
				) : sections.length === 0 ? (
					<div className="px-3 py-2 text-xs text-fg-muted">No sections</div>
				) : (
					<nav className="flex flex-col gap-0.5">
						{sections.map((section) => (
							<SectionItem
								key={section.id}
								section={section}
								depth={0}
								activeSection={activeSection}
								expanded={expanded}
								onToggle={toggle}
								onSelect={onSectionSelect}
								hasSubs={hasSubs}
							/>
						))}
					</nav>
				)}
			</div>
		</div>
	);
}

interface SectionItemProps {
	section: TheorySection;
	depth: number;
	activeSection: string;
	expanded: Record<string, boolean>;
	onToggle: (id: string) => void;
	onSelect: (id: string) => void;
	hasSubs: (s: TheorySection) => boolean;
}

function SectionItem({
	section,
	depth,
	activeSection,
	expanded,
	onToggle,
	onSelect,
	hasSubs,
}: SectionItemProps) {
	const isActive = activeSection === section.id;
	const isOpen = !!expanded[section.id];
	const showToggle = hasSubs(section);

	return (
		<div>
			<div
				className={cn(
					"group flex items-center rounded-control transition-colors",
					isActive ? "bg-accent-subtle" : "hover:bg-surface-overlay/60",
				)}
			>
				<button
					type="button"
					onClick={() => (showToggle ? onToggle(section.id) : undefined)}
					className={cn(
						"flex items-center justify-center shrink-0 w-5 h-7 text-fg-muted hover:text-fg transition-colors",
						!showToggle && "invisible",
					)}
					aria-label={isOpen ? "Collapse" : "Expand"}
					tabIndex={showToggle ? 0 : -1}
				>
					<ChevronRight
						size={12}
						className={cn("transition-transform duration-150", isOpen && "rotate-90")}
					/>
				</button>
				<button
					type="button"
					onClick={() => onSelect(section.id)}
					className={cn(
						"flex-1 min-w-0 text-left py-1.5 pr-2 text-xs leading-snug wrap-break-word transition-colors",
						depth === 0 ? "font-medium" : "font-normal",
						isActive ? "text-accent" : "text-fg-secondary group-hover:text-fg",
					)}
				>
					{section.title}
				</button>
			</div>

			<AnimatePresence initial={false}>
				{showToggle && isOpen ? (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="overflow-hidden"
					>
						<div className="ml-3 mt-0.5 flex flex-col gap-0.5">
							{section.subsections!.map((sub) => (
								<SectionItem
									key={sub.id}
									section={sub}
									depth={depth + 1}
									activeSection={activeSection}
									expanded={expanded}
									onToggle={onToggle}
									onSelect={onSelect}
									hasSubs={hasSubs}
								/>
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
