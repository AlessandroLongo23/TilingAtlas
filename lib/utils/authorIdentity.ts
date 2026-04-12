/** Browser-only localStorage helpers for author attribution and campaign ownership. */

const AUTHOR_KEY = 'tilingatlas.authorName';
const CAMPAIGN_IDS_KEY = 'tilingatlas.campaignIds';

export function getAuthorName(): string {
	try {
		return localStorage.getItem(AUTHOR_KEY) ?? '';
	} catch {
		return '';
	}
}

export function setAuthorName(name: string): void {
	try {
		localStorage.setItem(AUTHOR_KEY, name);
	} catch {
		// ignore (e.g. private browsing with storage blocked)
	}
}

export function getOwnCampaignIds(): string[] {
	try {
		return JSON.parse(localStorage.getItem(CAMPAIGN_IDS_KEY) ?? '[]');
	} catch {
		return [];
	}
}

export function addOwnCampaignId(id: string): void {
	try {
		const ids = getOwnCampaignIds();
		if (!ids.includes(id)) {
			ids.push(id);
			localStorage.setItem(CAMPAIGN_IDS_KEY, JSON.stringify(ids));
		}
	} catch {
		// ignore
	}
}
