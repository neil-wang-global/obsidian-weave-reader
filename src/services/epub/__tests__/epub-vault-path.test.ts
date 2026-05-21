import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { epubVaultPathsReferToSameBook, resolveEpubVaultPath } from "../epub-vault-path";

function createEpubFile(path: string) {
	return Object.assign(new TFile(), {
		path,
		name: path.split("/").pop() || path,
		extension: "epub",
	});
}

describe("epub-vault-path", () => {
	it("resolves shortest wikilink paths using the source markdown context", () => {
		const app = {
			vault: {
				getAbstractFileByPath: vi.fn((path: string) => {
					if (path === "Books/demo.epub") {
						return createEpubFile("Books/demo.epub");
					}
					return null;
				}),
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn((linkpath: string, sourcePath: string) => {
					if (linkpath === "demo.epub" && sourcePath === "Notes/demo.md") {
						return createEpubFile("Books/demo.epub");
					}
					return null;
				}),
			},
		} as any;

		expect(resolveEpubVaultPath(app, "demo.epub", "Notes/demo.md")).toBe("Books/demo.epub");
		expect(resolveEpubVaultPath(app, "Books/demo.epub", "Notes/demo.md")).toBe("Books/demo.epub");
	});

	it("matches nested and exact vault paths for the same book", () => {
		expect(epubVaultPathsReferToSameBook("Books/demo.epub", "Books/demo.epub")).toBe(true);
		expect(epubVaultPathsReferToSameBook("demo.epub", "Books/demo.epub")).toBe(true);
		expect(epubVaultPathsReferToSameBook("Books/demo.epub", "Archive/demo.epub")).toBe(false);
	});
});
