"use client";

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, FlaskConical, Gamepad2, Volume2, VolumeX, Volume1, Volume } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
	{ href: "/theory", label: "Theory", icon: BookOpen },
	{ href: "/library", label: "Library", icon: Library },
	{ href: "/lab", label: "Lab", icon: FlaskConical },
	{ href: "/play", label: "Play", icon: Gamepad2 },
];

export function Nav({ audioSrc }: { audioSrc?: string }) {
	const pathname = usePathname();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [volume, setVolume] = useState(0.5);
	const [previousVolume, setPreviousVolume] = useState(0.5);
	const [isMuted, setIsMuted] = useState(false);
	const [showSlider, setShowSlider] = useState(false);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.loop = true;
		audio.volume = volume;
		const playPromise = audio.play();
		if (playPromise !== undefined) playPromise.catch(() => {});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (audioRef.current) audioRef.current.volume = volume;
	}, [volume]);

	const toggleMute = () => {
		if (isMuted) {
			setVolume(previousVolume > 0 ? previousVolume : 0.5);
			setIsMuted(false);
		} else {
			setPreviousVolume(volume);
			setVolume(0);
			setIsMuted(true);
		}
	};

	const updateVolume = (e: ChangeEvent<HTMLInputElement>) => {
		const v = Number(e.target.value) / 100;
		setVolume(v);
		setIsMuted(v === 0);
	};

	const percentage = volume * 100;
	const sliderStyle = {
		"--slider-fill": "var(--color-accent)",
		"--slider-track": "var(--color-border-strong)",
		background: `linear-gradient(to right,
			var(--slider-fill) 0%,
			var(--slider-fill) ${percentage}%,
			var(--slider-track) ${percentage}%,
			var(--slider-track) 100%)`,
	} as CSSProperties;

	const VolumeIcon =
		isMuted || volume === 0 ? VolumeX : volume < 0.33 ? Volume : volume < 0.66 ? Volume1 : Volume2;

	return (
		<nav className="w-full shrink-0 flex items-center bg-surface-chrome border-b border-line-subtle px-4 h-12">
			<Link href="/" className="flex items-center justify-center mr-4">
				<span className="text-accent font-bold text-lg leading-none">T</span>
			</Link>

			<div className="h-5 border-l border-line-subtle mr-3" />

			<div className="flex items-center gap-1">
				{LINKS.map((link) => {
					const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
					const Icon = link.icon;
					return (
						<Link
							key={link.href}
							href={link.href}
							className={cn(
								"group flex items-center gap-1.5 px-3 py-1.5 rounded-control transition-colors",
								isActive
									? "text-accent bg-accent-subtle"
									: "text-fg-muted hover:text-fg hover:bg-surface-overlay",
							)}
						>
							<Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
							<span className="text-xs font-medium">{link.label}</span>
						</Link>
					);
				})}
			</div>

			<div className="flex-1" />

			<div
				className="flex items-center gap-2"
				role="group"
				aria-label="Volume control"
				onMouseEnter={() => setShowSlider(true)}
				onMouseLeave={() => setShowSlider(false)}
			>
				<AnimatePresence>
					{showSlider ? (
						<motion.div
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 20 }}
							transition={{ duration: 0.15 }}
							className="h-8 bg-surface-overlay border border-line-subtle rounded-pill px-3 flex items-center backdrop-blur-sm"
						>
							<input
								type="range"
								min={0}
								max={100}
								value={percentage}
								onChange={updateVolume}
								style={sliderStyle}
								className="w-20 h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0"
							/>
						</motion.div>
					) : null}
				</AnimatePresence>
				<button
					onClick={toggleMute}
					className="flex items-center justify-center w-8 h-8 text-fg-muted hover:text-fg hover:bg-surface-overlay rounded-control transition-colors focus:outline-none"
					aria-label={isMuted ? "Unmute audio" : "Mute audio"}
				>
					<VolumeIcon className="w-4 h-4" />
				</button>
			</div>

			<ThemeToggle />

			{audioSrc ? (
				<audio ref={audioRef} src={audioSrc} preload="auto">
					<track kind="captions" />
				</audio>
			) : null}
		</nav>
	);
}
