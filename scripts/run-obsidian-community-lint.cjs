const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { OBSIDIAN_LINT_TARGETS } = require("./obsidian-lint-targets.cjs");

const extraArgs = process.argv.slice(2);
const eslintPackagePath = require.resolve("eslint/package.json");
const eslintBinPath = path.join(path.dirname(eslintPackagePath), "bin", "eslint.js");

const disableCheck = spawnSync(process.execPath, ["scripts/check-forbidden-eslint-disables.cjs"], {
	stdio: "inherit",
	shell: false,
});
if (disableCheck.status !== 0) {
	process.exit(disableCheck.status ?? 1);
}

const result = spawnSync(
	process.execPath,
	[
		eslintBinPath,
		"-c",
		"eslint.obsidian.community-gate.config.mjs",
		...OBSIDIAN_LINT_TARGETS.filter((target) => target.endsWith(".ts") || target.includes("/")),
		"--max-warnings",
		"9999",
		...extraArgs,
	],
	{
		stdio: "inherit",
		shell: false,
	}
);

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
