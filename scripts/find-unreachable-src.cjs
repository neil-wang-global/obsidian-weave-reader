const fs = require("fs");
const path = require("path");

const root = path.resolve("src");
const exts = [".ts", ".tsx", ".svelte", ".js"];

function resolveImport(fromFile, spec) {
	if (spec.startsWith("@/")) {
		const aliasBase = path.join(root, spec.slice(2));
		const aliasCandidates = [
			aliasBase,
			`${aliasBase}.ts`,
			`${aliasBase}.tsx`,
			`${aliasBase}.svelte`,
			path.join(aliasBase, "index.ts"),
		];
		for (const candidate of aliasCandidates) {
			if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
				return candidate;
			}
		}
		return null;
	}

	if (!spec.startsWith(".")) {
		return null;
	}

	const base = path.resolve(path.dirname(fromFile), spec);
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.svelte`,
		`${base}.js`,
		path.join(base, "index.ts"),
		path.join(base, "index.svelte"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return candidate;
		}
	}

	return null;
}

function parseImports(file) {
	const text = fs.readFileSync(file, "utf8");
	const specs = [];
	const patterns = [/from\s+['"]([^'"]+)['"]/g, /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g];

	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			specs.push(match[1]);
		}
	}

	return specs;
}

const entryPoints = [
	"main.ts",
	"views/EpubView.ts",
	"views/EpubBookshelfSidebarView.ts",
	"views/EpubSidebarView.ts",
	"components/settings/EpubSettingsTab.ts",
	"components/modals/EpubBookshelfImportModal.ts",
].map((relativePath) => path.join(root, relativePath));

const queue = entryPoints.filter((entry) => fs.existsSync(entry));
const seen = new Set();

while (queue.length > 0) {
	const file = queue.shift();
	if (!file || seen.has(file)) {
		continue;
	}

	seen.add(file);

	for (const spec of parseImports(file)) {
		const resolved = resolveImport(file, spec);
		if (resolved && resolved.startsWith(root) && !seen.has(resolved)) {
			queue.push(resolved);
		}
	}
}

const all = [];

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(entryPath);
			continue;
		}

		if (/\.(ts|tsx|svelte)$/.test(entry.name)) {
			all.push(path.resolve(entryPath));
		}
	}
}

walk(root);

const unreachable = all.filter((file) => !seen.has(file)).sort();
const topDirs = new Map();

for (const file of unreachable) {
	const relative = path.relative(root, file).replace(/\\/g, "/");
	const top = relative.split("/").slice(0, 2).join("/");
	topDirs.set(top, (topDirs.get(top) || 0) + 1);
}

console.log(
	JSON.stringify(
		{
			reachable: seen.size,
			total: all.length,
			unreachable: unreachable.length,
			topUnreachableDirs: Object.fromEntries(
				[...topDirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
			),
		},
		null,
		2
	)
);
