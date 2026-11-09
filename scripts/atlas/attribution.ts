/** Who found a Čtrnáct-engine regular tiling, and what the Atlas claims for it: through k = 14 a reproduction of
 *  Čtrnáct's published counts, above that the Atlas's own enumeration, a candidate until someone else confirms it. */
export const ctrnactAttribution = (k: number): { discoverer: string; certification: "reproduced" | "candidate" } =>
	k <= 14
		? { discoverer: "Marek Čtrnáct", certification: "reproduced" }
		: { discoverer: "Alessandro Longo", certification: "candidate" };
