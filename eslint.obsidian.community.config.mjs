/**
 * Full Obsidian community recommended rules audit (recommendedWithLocalesEn).
 * Used for prioritization metrics across all production src TypeScript files.
 */
import { defineConfig } from "eslint/config";
import globals from "globals";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

const obsidianBrowserGlobals = {
	...globals.browser,
	activeDocument: "readonly",
	activeWindow: "readonly",
};

const vendorRuleExemptions = {
	"@typescript-eslint/no-explicit-any": "off",
	"@typescript-eslint/no-unsafe-assignment": "off",
	"@typescript-eslint/no-unsafe-return": "off",
	"@typescript-eslint/no-unsafe-member-access": "off",
	"@typescript-eslint/no-unsafe-call": "off",
	"@typescript-eslint/no-unsafe-argument": "off",
	"@typescript-eslint/no-unnecessary-type-assertion": "off",
	"@typescript-eslint/no-unsafe-enum-comparison": "off",
	"@typescript-eslint/await-thenable": "off",
	"@typescript-eslint/no-misused-promises": "off",
	"@typescript-eslint/restrict-template-expressions": "off",
	"@typescript-eslint/no-redundant-type-constituents": "off",
	"@typescript-eslint/no-base-to-string": "off",
	"@typescript-eslint/no-unsafe-function-type": "off",
	"@typescript-eslint/no-duplicate-type-constituents": "off",
	"@typescript-eslint/no-deprecated": "off",
	"no-restricted-globals": "off",
};

export default defineConfig([
	{
		ignores: [
			"dist/**",
			"backup-before-migration/**",
			"src/**/*.test.ts",
			"src/**/*.spec.ts",
			"src/**/__tests__/**",
			"src/demo/**",
			"src/tests/**",
			"src/test-integration.ts",
		],
	},
	...obsidianmd.configs.recommendedWithLocalesEn,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.eslint.obsidian.json",
				tsconfigRootDir: import.meta.dirname,
			},
			globals: obsidianBrowserGlobals,
		},
	},
	{
		files: ["src/services/epub/vendor/**/*.ts"],
		rules: vendorRuleExemptions,
	},
	{
		files: ["src/config/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ["src/services/epub/foliate-runtime-patches.ts"],
		rules: {
			// Prototype descriptor patching must call native iframe.src accessors via Reflect.apply.
			"@typescript-eslint/unbound-method": "off",
		},
	},
]);
