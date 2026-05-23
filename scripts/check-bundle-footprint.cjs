const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const bundlePath = path.join(PROJECT_ROOT, "dist", "main.js");

const FORBIDDEN_STRINGS = [
	"IRStorageService",
	"IREpubBookmarkTaskService",
	"kanban",
	"AnkiConnect",
	"sql.js",
	"BatchParsingManager",
];

function fail(message) {
	console.error(`[check-bundle-footprint] ${message}`);
	process.exit(1);
}

function main() {
	if (!fs.existsSync(bundlePath)) {
		fail("dist/main.js not found. Run `npm run build` first.");
	}

	const bundle = fs.readFileSync(bundlePath, "utf8");
	const gzipKb = (zlib.gzipSync(bundle).length / 1024).toFixed(1);
	const hits = FORBIDDEN_STRINGS.filter((needle) => bundle.includes(needle));

	if (hits.length > 0) {
		fail(`forbidden legacy strings found in bundle: ${hits.join(", ")}`);
	}

	console.log(
		`[check-bundle-footprint] OK (gzip ${gzipKb} KB, ${(bundle.length / 1024).toFixed(1)} KB raw)`
	);
}

main();
