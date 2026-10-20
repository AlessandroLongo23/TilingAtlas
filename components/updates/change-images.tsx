import Link from "next/link";

// A change's screenshots (Change.images), for what no atlas id can stand for: a page, a census, a
// curved board. Static files, so they cost no WebGL context in the modal and nothing on a visit that
// opens no notes. Each opens the change's page when it has one.
export function ChangeImages({
	images,
	href,
	className = "",
}: {
	images: string[];
	href?: string;
	className?: string;
}) {
	return (
		<div className={`mt-2 grid grid-cols-2 gap-2 ${className}`}>
			{images.map((src) => {
				// eslint-disable-next-line @next/next/no-img-element
				const img = <img src={src} alt="" loading="lazy" className="block aspect-[8/5] w-full object-cover" />;
				return href ? (
					<Link
						key={src}
						href={href}
						className="block overflow-hidden border border-line transition-colors hover:border-accent"
					>
						{img}
					</Link>
				) : (
					<div key={src} className="overflow-hidden border border-line">
						{img}
					</div>
				);
			})}
		</div>
	);
}
