"use client";

import { usePathname } from "next/navigation";
import { Home, Library, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/error-screen";

export default function NotFound() {
	const pathname = usePathname();

	return (
		<ErrorScreen
			eyebrow="error 404"
			title="This page is not in the atlas"
			body="Nothing in the catalogue answers to that address. It may have moved, or it may never have existed."
			detail={pathname ? <p>{pathname}</p> : null}
			actions={
				<>
					<Button href="/" variant="primary" size="sm" icon={Home} label="Back to the atlas" />
					<Button href="/library" variant="secondary" size="sm" icon={Library} label="Library" />
					<Button href="/play" variant="secondary" size="sm" icon={Play} label="Play" />
				</>
			}
		/>
	);
}
