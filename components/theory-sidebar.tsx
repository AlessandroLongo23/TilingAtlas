"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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

	// Initialize expansion state when sections arrive.
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

	const toggle = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const hasSubs = (s: TheorySection) => !!s.subsections && s.subsections.length > 0;

	return (
		<div className="h-full flex flex-col">
			<div className="flex-1 overflow-y-auto p-3 bg-zinc-800/30">
				<h3 className="font-medium text-xs text-white/80 uppercase tracking-wider mb-4">
					Table of Contents
				</h3>
				{isLoading ? (
					<div className="p-3 text-sm text-zinc-400">Loading content...</div>
				) : error ? (
					<div className="p-3 text-sm text-red-400">Error loading content: {error}</div>
				) : sections.length === 0 ? (
					<div className="p-3 text-sm text-zinc-400">No sections available</div>
				) : (
					<div>
						{sections.map((section) => (
							<div key={section.id} className="mb-4">
								<div className="flex items-center">
									<button
										onClick={() => onSectionSelect(section.id)}
										className={cn(
											"text-left flex-1 py-1.5 px-2 rounded text-sm",
											section.level === 1 ? "font-bold" : "font-medium",
											activeSection === section.id ? "text-green-400" : "text-zinc-400 hover:text-white",
										)}
									>
										{section.title}
									</button>
									{hasSubs(section) ? (
										<button
											onClick={(e) => toggle(section.id, e)}
											className="p-1 rounded-md hover:bg-zinc-700/70 transition-all text-white/80 hover:text-white/100"
											aria-label={expanded[section.id] ? "Collapse section" : "Expand section"}
										>
											<ChevronDown
												size={14}
												className={cn(
													"transition-transform duration-200",
													expanded[section.id] ? "rotate-180" : "",
												)}
											/>
										</button>
									) : null}
								</div>

								<AnimatePresence initial={false}>
									{hasSubs(section) && expanded[section.id] ? (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.15 }}
											className="ml-3 border-l border-zinc-700/50 pl-2 mt-1 overflow-hidden"
										>
											{section.subsections!.map((sub) => (
												<div key={sub.id} className="my-2">
													<div className="flex items-center">
														<button
															onClick={() => onSectionSelect(sub.id)}
															className={cn(
																"text-left flex-1 py-1 px-2 rounded text-xs font-medium",
																activeSection === sub.id
																	? "text-green-400"
																	: "text-zinc-400 hover:text-white",
															)}
														>
															{sub.title}
														</button>
														{hasSubs(sub) ? (
															<button
																onClick={(e) => toggle(sub.id, e)}
																className="p-1 rounded-md hover:bg-zinc-700/70 transition-all text-white/80 hover:text-white/100"
																aria-label={expanded[sub.id] ? "Collapse section" : "Expand section"}
															>
																<ChevronDown
																	size={12}
																	className={cn(
																		"transition-transform duration-200",
																		expanded[sub.id] ? "rotate-180" : "",
																	)}
																/>
															</button>
														) : null}
													</div>
													<AnimatePresence initial={false}>
														{hasSubs(sub) && expanded[sub.id] ? (
															<motion.div
																initial={{ height: 0, opacity: 0 }}
																animate={{ height: "auto", opacity: 1 }}
																exit={{ height: 0, opacity: 0 }}
																transition={{ duration: 0.15 }}
																className="ml-3 border-l border-zinc-700/50 pl-2 mt-1 overflow-hidden"
															>
																{sub.subsections!.map((subsub) => (
																	<button
																		key={subsub.id}
																		onClick={() => onSectionSelect(subsub.id)}
																		className={cn(
																			"text-left w-full py-1 px-2 rounded text-xs",
																			activeSection === subsub.id
																				? "text-green-400"
																				: "text-zinc-400 hover:text-white",
																		)}
																	>
																		{subsub.title}
																	</button>
																))}
															</motion.div>
														) : null}
													</AnimatePresence>
												</div>
											))}
										</motion.div>
									) : null}
								</AnimatePresence>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
