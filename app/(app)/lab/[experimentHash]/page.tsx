import { redirect } from "next/navigation";

export default async function ExperimentIndexPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	redirect(`/lab/${experimentHash}/polygons`);
}
