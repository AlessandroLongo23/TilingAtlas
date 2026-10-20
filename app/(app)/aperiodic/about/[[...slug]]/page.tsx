import { aboutRoute } from "@/lib/about/route";

const route = aboutRoute("/aperiodic");
export const dynamicParams = false;
export const { generateStaticParams, generateMetadata } = route;
export default route.Page;
