"use client";

import { useEffect } from "react";
import { Home, Library, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/error-screen";

// Next 16 renames the recovery prop to `unstable_retry` (it re-fetches as well as re-renders);
// `reset` is still passed and still works. Take whichever the runtime hands us.
export default function ErrorBoundary({
	error,
	reset,
	unstable_retry,
}: {
	error: Error & { digest?: string };
	reset?: () => void;
	unstable_retry?: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	const retry = unstable_retry ?? reset;

	return (
		<ErrorScreen
			eyebrow="error"
			title="Something went wrong"
			body="This page failed to render. Trying again often clears it. If it doesn't, the rest of the atlas is still there."
			detail={
				<>
					{error.message ? <p>{error.message}</p> : <p>No message was attached to the error.</p>}
					{error.digest ? <p className="mt-1 text-fg-muted">digest {error.digest}</p> : null}
				</>
			}
			actions={
				<>
					{retry ? (
						<Button variant="primary" size="sm" icon={RotateCw} label="Try again" onClick={retry} />
					) : null}
					<Button href="/" variant="secondary" size="sm" icon={Home} label="Atlas" />
					<Button href="/library" variant="secondary" size="sm" icon={Library} label="Library" />
				</>
			}
		/>
	);
}
