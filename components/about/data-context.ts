"use client";

import { createContext, useContext } from "react";
import type { AboutData } from "@/lib/about/load";

/** The article's server-loaded records, for figures that pick among tilings the markdown names. */
export const AboutDataContext = createContext<Pick<AboutData, "cells" | "sources">>({ cells: {}, sources: {} });
export const useAboutData = () => useContext(AboutDataContext);
