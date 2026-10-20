import { aboutRoute } from "@/lib/about/route";

const route = aboutRoute("/colors");
export const dynamicParams = false;
export const { generateStaticParams, generateMetadata } = route;
export default route.Page;
