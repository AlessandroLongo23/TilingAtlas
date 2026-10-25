import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
		// Gitignored: Marek's chat vault, not part of the repo.
		"marek-vault/**",
		// Vendored as shipped.
		"lib/isohedral/vendor/**",
		// Emscripten's output (tools/heesch/build_wasm.sh).
		"public/heesch/engine/**",
		// CommonJS Node scripts the frames census drivers run (tools/frames/*.py).
		"tools/frames/*.js",
		// TileSearch's build output and packaged apps (tools/searcher/app/build.sh).
		"tools/searcher/app/{dist,release,node_modules}/**",
	]),
	{
		rules: {
			// A leading underscore marks a binding kept on purpose: a callback's positional argument, the
			// rest sibling that strips a key, a caught error nobody reads.
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					ignoreRestSiblings: true,
				},
			],
		},
	},
]);

export default eslintConfig;
