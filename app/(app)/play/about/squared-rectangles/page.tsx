import { aboutArticleRoute } from "@/lib/about/route";

// The squared-rectangles article, on a route of its own because its folder also holds the pipeline.
const route = aboutArticleRoute("/play", "squared-rectangles");
export const dynamic = "force-static";
export const metadata = route.metadata;
export default route.Page;
