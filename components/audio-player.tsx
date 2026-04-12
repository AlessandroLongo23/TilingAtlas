"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Volume2, VolumeX, Volume1, Volume } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AudioPlayerProps {
	src?: string;
}

export function AudioPlayer({ src }: AudioPlayerProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [volume, setVolume] = useState(0.5);
	const [previousVolume, setPreviousVolume] = useState(0.5);
	const [isMuted, setIsMuted] = useState(false);
	const [showSlider, setShowSlider] = useState(false);

	// Attach autoplay / loop behavior when the audio element appears.
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.loop = true;
		audio.volume = volume;
		const playPromise = audio.play();
		if (playPromise !== undefined) {
			playPromise.catch((err) => console.log("Autoplay prevented:", err));
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Apply volume changes.
	useEffect(() => {
		if (audioRef.current) audioRef.current.volume = volume;
	}, [volume]);

	const toggleMute = () => {
		if (isMuted) {
			const restored = previousVolume > 0 ? previousVolume : 0.5;
			setVolume(restored);
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
		background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${percentage}%, #4b5563 ${percentage}%, #4b5563 100%)`,
	} as const;

	const VolumeIcon =
		isMuted || volume === 0 ? VolumeX : volume < 0.33 ? Volume : volume < 0.66 ? Volume1 : Volume2;

	return (
		<div
			className="fixed top-5 right-5 z-[1000] flex items-center gap-2"
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
						className="h-10 bg-surface-overlay/70 border border-line rounded-full px-3 flex items-center backdrop-blur-sm"
					>
						<input
							type="range"
							min={0}
							max={100}
							value={percentage}
							onChange={updateVolume}
							style={sliderStyle}
							className="w-24 h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0"
						/>
					</motion.div>
				) : null}
			</AnimatePresence>

			<button
				onClick={toggleMute}
				aria-label={isMuted ? "Unmute audio" : "Mute audio"}
				className="flex items-center justify-center w-10 h-10 bg-surface-overlay/70 hover:bg-surface-overlay/80 text-fg-secondary hover:text-fg rounded-full transition-all duration-200 border border-line hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-focus/40 shadow-md backdrop-blur-sm"
			>
				<VolumeIcon className="w-5 h-5" />
			</button>

			{src ? (
				<audio ref={audioRef} src={src} preload="auto">
					<track kind="captions" />
				</audio>
			) : null}
		</div>
	);
}
