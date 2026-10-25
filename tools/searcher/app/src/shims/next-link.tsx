// next/link for the Electron window (vite.config.ts aliases it): a plain anchor, which main.ts opens
// in the browser.
import type { AnchorHTMLAttributes } from "react";

export default function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
	return <a href={href} target="_blank" rel="noreferrer" {...rest} />;
}
