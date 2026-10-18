import { comparePolygonNames } from "./geometry";

export const compareArrays = (a: readonly (string | number)[], b: readonly (string | number)[]): number => {
	if (a.length !== b.length) return a.length - b.length;

	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (x !== y) {
			if (typeof x === "string" && typeof y === "string") {
				return x.localeCompare(y);
			} else {
				return (x as number) - (y as number);
			}
		}
	}

	return 0;
};

export const cyclicallyInclude = (a: string[], b: string[]): boolean => {
	const aString = a.concat(a).join(",");
	const bString = b.join(",");
	return aString.includes(bString);
};

export const cycleToMinimumLexicographicalOrder = (array: number[]): number[] => {
	let min = array.slice(0);
	for (let i = 0; i < array.length; i++) {
		const rotated = array.slice(i).concat(array.slice(0, i));
		if (compareArrays(rotated, min) < 0) {
			min = rotated;
		}
	}
	return min;
};

export const isEqual = (arrayA: number[], arrayB: number[]): boolean => {
	if (arrayA.length !== arrayB.length) return false;
	for (let i = 0; i < arrayA.length; i++) if (arrayA[i] !== arrayB[i]) return false;
	return true;
};

export const isEqualOrChiral = (arrayA: number[], arrayB: number[]): boolean => {
	if (arrayA.length !== arrayB.length) return false;

	for (let i = 0; i < arrayA.length; i++) {
		const rotated = arrayA.slice(i).concat(arrayA.slice(0, i));
		if (isEqual(rotated, arrayB)) return true;
	}

	const reversed = arrayA.slice().reverse();
	for (let i = 0; i < arrayA.length; i++) {
		const rotated = reversed.slice(i).concat(reversed.slice(0, i));
		if (isEqual(rotated, arrayB)) return true;
	}

	return false;
};

/**
 * Recursively rounds all numbers in a JSON-serializable value to the given decimal places.
 * Used to reduce file size when storing vertex configurations, seeds, and tilings.
 */
export const roundNumbersInJson = (value: unknown, decimals: number = 6): unknown => {
	if (typeof value === "number") {
		return Math.round(value * 10 ** decimals) / 10 ** decimals;
	}
	if (Array.isArray(value)) {
		return value.map((item) => roundNumbersInJson(item, decimals));
	}
	if (value !== null && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			result[k] = roundNumbersInJson(v, decimals);
		}
		return result;
	}
	return value;
};

export const compareVCNames = (polygonNamesA: string[], polygonNamesB: string[]): number => {
	for (let i = 0; i < polygonNamesA.length; i++) {
		if (!polygonNamesB[i]) return 1;
		if (!polygonNamesA[i]) return -1;

		const result = comparePolygonNames(polygonNamesA[i], polygonNamesB[i]);
		if (result !== 0) return result;
	}
	return 0;
};
