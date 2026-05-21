import { describe, expect, it } from "vitest";
import {
	hashWorkspaceCacheManifest,
	normalizeWorkspaceCacheManifest,
} from "../ir-workspace-manifest";

describe("ir-workspace-manifest", () => {
	it("normalizes manifest shape for stable hashing", () => {
		const left = normalizeWorkspaceCacheManifest({
			pointIndexPath: "weave/cache/incremental-reading/point-files-index.json",
			pointIndexMtime: 100,
			pointIndexSize: 20,
			pointFilePathsRevision: "rev-a",
			pointFiles: [{ path: "weave/ir/points/a.irdeck", mtime: 1, size: 2 }],
			auxiliaryFiles: [],
		});
		const right = normalizeWorkspaceCacheManifest({
			pointIndexPath: "weave/cache/incremental-reading/point-files-index.json",
			pointIndexMtime: 100,
			pointIndexSize: 20,
			pointFilePathsRevision: "rev-a",
			pointFiles: [{ path: "weave/ir/points/a.irdeck", mtime: 1, size: 2 }],
			auxiliaryFiles: [],
		});

		expect(hashWorkspaceCacheManifest(left)).toBe(hashWorkspaceCacheManifest(right));
	});

	it("changes fingerprint when a point file stamp drifts", () => {
		const baseline = normalizeWorkspaceCacheManifest({
			pointIndexPath: "weave/cache/incremental-reading/point-files-index.json",
			pointIndexMtime: 100,
			pointIndexSize: 20,
			pointFilePathsRevision: "rev-a",
			pointFiles: [{ path: "weave/ir/points/a.irdeck", mtime: 1, size: 2 }],
			auxiliaryFiles: [],
		});
		const changed = normalizeWorkspaceCacheManifest({
			...baseline,
			pointFilePathsRevision: "rev-b",
			pointFiles: [{ path: "weave/ir/points/a.irdeck", mtime: 2, size: 2 }],
		});

		expect(hashWorkspaceCacheManifest(baseline)).not.toBe(hashWorkspaceCacheManifest(changed));
	});
});
