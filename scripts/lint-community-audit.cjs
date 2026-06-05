/**
 * Community review gate: Obsidian recommended rules (errors must be zero).
 * Warnings are reported but do not fail the gate (matches typical bot blocking behavior).
 */
const { spawnSync } = require("node:child_process");

const result = spawnSync(process.execPath, ["scripts/run-obsidian-community-lint.cjs"], {
	stdio: "inherit",
	shell: false,
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
