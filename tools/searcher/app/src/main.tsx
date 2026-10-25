import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useConfiguration } from "@/stores/configuration";
import { App } from "./App";
import "./app.css";

// The site's theme rule (app/layout.tsx): a saved choice, else the system's.
try {
	const t = localStorage.getItem("theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
	document.documentElement.classList.toggle("dark", t === "dark");
} catch {}

// The site's drawings read their style from its store. The app has no Options tab, so it picks once: flat
// tiles filled by shape (squares one colour, triangles another), as the site's freedraw shelf does on Shape.
useConfiguration.setState({ freedrawFill: "shape" });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
