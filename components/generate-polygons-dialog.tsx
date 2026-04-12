"use client";

import { useState } from "react";
import { PolygonType } from "@/classes/polygons/PolygonType";
import { Modal } from "./ui/modal";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";

interface GeneratePolygonsDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	secret?: string;
	onSuccess?: (paramsFolder: string, polygonCount: number) => void;
	onError?: (message: string) => void;
}

interface TypeConfig {
	enabled: boolean;
	n_max: number;
	angle: number;
}

const TYPES = [
	{ id: PolygonType.REGULAR, label: "Regular", hasAngle: false },
	{ id: PolygonType.STAR_REGULAR, label: "Star Regular", hasAngle: true },
	{ id: PolygonType.STAR_PARAMETRIC, label: "Star Parametric", hasAngle: false },
	{ id: PolygonType.EQUILATERAL, label: "Equilateral", hasAngle: true },
] as const;

export function GeneratePolygonsDialog({
	isOpen,
	onOpenChange,
	secret = "",
	onSuccess,
	onError,
}: GeneratePolygonsDialogProps) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [config, setConfig] = useState<Record<string, TypeConfig>>({
		[PolygonType.REGULAR]: { enabled: true, n_max: 12, angle: 30 },
		[PolygonType.STAR_REGULAR]: { enabled: true, n_max: 12, angle: 30 },
		[PolygonType.STAR_PARAMETRIC]: { enabled: false, n_max: 12, angle: 30 },
		[PolygonType.EQUILATERAL]: { enabled: false, n_max: 5, angle: 30 },
	});

	const updateConfig = (id: string, patch: Partial<TypeConfig>) => {
		setConfig((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
	};

	const handleSubmit = async () => {
		setError(null);
		const body: Record<string, unknown> = {};
		for (const t of TYPES) {
			if (config[t.id].enabled) {
				const c = config[t.id];
				body[t.id] = { enabled: true, n_max: c.n_max, angle: t.hasAngle ? c.angle : undefined };
			}
		}
		if (Object.keys(body).length === 0) {
			setError("Enable at least one polygon type");
			return;
		}

		setLoading(true);
		try {
			const headers: Record<string, string> = { "Content-Type": "application/json" };
			if (secret) headers["Authorization"] = `Bearer ${secret}`;
			const res = await fetch("/api/pipeline/generate-polygons", {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Request failed");
			onOpenChange(false);
			onSuccess?.(data.paramsFolder, data.polygonCount);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			setError(msg);
			onError?.(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Modal isOpen={isOpen} onOpenChange={onOpenChange} title="Generate Polygons" maxWidth="max-w-lg">
			<div className="p-4 flex flex-col gap-5">
				<p className="text-sm text-fg-muted">
					Choose polygon types and parameters. Results will be saved to Supabase and added to the polygon
					collection.
				</p>

				<div className="flex flex-col gap-4">
					{TYPES.map((t) => {
						const cfg = config[t.id];
						return (
							<div
								key={t.id}
								className="flex flex-wrap items-center gap-4 p-3 rounded-lg border border-line bg-surface-overlay/30"
							>
								<Checkbox
									id={`gen-${t.id}`}
									label={t.label}
									checked={cfg.enabled}
									onCheckedChange={(checked) => updateConfig(t.id, { enabled: checked })}
								/>
								{cfg.enabled ? (
									<>
										<label className="flex items-center gap-2 text-sm text-fg-muted">
											<span>Max sides</span>
											<input
												type="number"
												min={3}
												max={24}
												className="w-16 px-2 py-1 rounded border border-line-strong bg-surface-overlay text-fg-secondary text-sm"
												value={cfg.n_max}
												onChange={(e) => updateConfig(t.id, { n_max: Number(e.target.value) })}
											/>
										</label>
										{t.hasAngle ? (
											<label className="flex items-center gap-2 text-sm text-fg-muted">
												<span>Angle increment (°)</span>
												<input
													type="number"
													min={1}
													max={180}
													className="w-16 px-2 py-1 rounded border border-line-strong bg-surface-overlay text-fg-secondary text-sm"
													value={cfg.angle}
													onChange={(e) => updateConfig(t.id, { angle: Number(e.target.value) })}
												/>
											</label>
										) : null}
									</>
								) : null}
							</div>
						);
					})}
				</div>

				{error ? <p className="text-sm text-danger">{error}</p> : null}

				<div className="flex justify-end gap-2 pt-2">
					<Button
						variant="secondary"
						size="md"
						onClick={() => onOpenChange(false)}
						disabled={loading}
						label="Cancel"
					/>
					<Button
						variant="primary"
						size="md"
						onClick={handleSubmit}
						disabled={loading}
						label={loading ? "Generating…" : "Generate"}
					/>
				</div>
			</div>
		</Modal>
	);
}
