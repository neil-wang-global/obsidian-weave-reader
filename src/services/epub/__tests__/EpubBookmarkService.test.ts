import { beforeEach, describe, expect, it, vi } from "vitest";

const getCompatiblePlugin = vi.fn();

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../../../tests/mocks/obsidian")>(
		"../../../tests/mocks/obsidian"
	);
	return actual;
});

vi.mock("../../../utils/plugin-access", () => ({
	getCompatiblePlugin,
}));

vi.mock("../epub-runtime", () => ({
	EPUB_RUNTIME: {
		pluginId: "weave-epub-reader",
		pluginDirName: "weave-epub-reader",
		viewTypes: {
			reader: "weave-epub-reader-standalone",
			sidebar: "weave-epub-sidebar-standalone",
			bookshelfSidebar: "weave-epub-bookshelf-sidebar-standalone",
		},
		protocol: {
			allNames: ["weave-epub-reader", "weave-epub"],
		},
		events: {
			bookshelfDataChanged: "test:bookshelf-data-changed",
			bookshelfRefreshRequest: "test:bookshelf-refresh-request",
			bookshelfDisplaySettingsChanged: "test:bookshelf-display-settings-changed",
			excerptSettingsChanged: "test:excerpt-settings-changed",
			navigate: "test:epub-navigate",
		},
		globals: {
			pendingNavigationKey: "__testPendingNav",
		},
	},
	getEpubRuntime: () => ({
		pluginId: "weave-epub-reader",
		pluginDirName: "weave-epub-reader",
		viewTypes: {
			reader: "weave-epub-reader-standalone",
			sidebar: "weave-epub-sidebar-standalone",
			bookshelfSidebar: "weave-epub-bookshelf-sidebar-standalone",
		},
		protocol: {
			allNames: ["weave-epub-reader", "weave-epub"],
		},
		events: {
			bookshelfDataChanged: "test:bookshelf-data-changed",
			bookshelfRefreshRequest: "test:bookshelf-refresh-request",
			bookshelfDisplaySettingsChanged: "test:bookshelf-display-settings-changed",
			excerptSettingsChanged: "test:excerpt-settings-changed",
			navigate: "test:epub-navigate",
		},
		globals: {
			pendingNavigationKey: "__testPendingNav",
		},
	}),
}));

describe("EpubBookmarkService", () => {
	beforeEach(() => {
		getCompatiblePlugin.mockReset();
	});

	it("prefers the current runtime plugin settings when resolving bookmark folder", async () => {
		const { EpubBookmarkService } = await import("../EpubBookmarkService");
		const app = {
			plugins: {
				getPlugin: vi.fn((pluginId: string) =>
					pluginId === "weave-epub-reader"
						? { settings: { bookmarkFolder: "Bookmarks/EPUB" } }
						: null
				),
			},
		} as any;

		const service = new EpubBookmarkService(app);

		expect(service.getBookmarkFolder()).toBe("Bookmarks/EPUB");
		expect(app.plugins.getPlugin).toHaveBeenCalledWith("weave-epub-reader");
		expect(getCompatiblePlugin).not.toHaveBeenCalled();
	});

	it("falls back to a compatible plugin host when the runtime plugin is unavailable", async () => {
		const { EpubBookmarkService, DEFAULT_EPUB_BOOKMARK_FOLDER } = await import(
			"../EpubBookmarkService"
		);
		getCompatiblePlugin.mockReturnValue({
			settings: {
				bookmarkFolder: "Shared/Bookmarks",
			},
		});
		const app = {
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;

		const service = new EpubBookmarkService(app);

		expect(service.getBookmarkFolder()).toBe("Shared/Bookmarks");
		expect(getCompatiblePlugin).toHaveBeenCalledWith(app);

		getCompatiblePlugin.mockReturnValue({ settings: {} });
		expect(new EpubBookmarkService(app).getBookmarkFolder()).toBe(DEFAULT_EPUB_BOOKMARK_FOLDER);
	});

	it("builds bookmark stableKey from sourceFingerprint before sourceId", async () => {
		const { EpubBookmarkService } = await import("../EpubBookmarkService");
		const service = new EpubBookmarkService({ plugins: { getPlugin: vi.fn(() => null) } } as any);

		const stableKey = (service as any).buildStableKey({
			id: "epub-book-local",
			filePath: "Books/demo.epub",
			sourceId: "epubsrc-volatile",
			sourceFingerprint: "4a9ad58db18a2176c9c0f16335a0a7502a4f3a7eaab3af39",
			metadata: { title: "Demo" },
		});

		expect(stableKey).toContain("4a9ad58db18a2176c9c0f16335a0a7502a4f3a7eaab3af39");
		expect(stableKey).not.toContain("epubsrc-volatile");
	});

	it("migrates legacy bookmark files onto the canonical stableKey path", async () => {
		const { EpubBookmarkService } = await import("../EpubBookmarkService");
		const app = {
			vault: {
				adapter: {
					exists: vi.fn(async () => false),
					remove: vi.fn(async () => undefined),
				},
				getFiles: vi.fn(() => [
					{
						path: "weave/epub-bookmarks/Demo--epubsrc-legacy.md",
						name: "Demo--epubsrc-legacy.md",
						extension: "md",
					},
				]),
			},
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;
		const service = new EpubBookmarkService(app);
		const writeBookmarkFile = vi
			.spyOn(service as any, "writeBookmarkFile")
			.mockResolvedValue(undefined);
		vi.spyOn(service as any, "readBookmarkFileByPath").mockImplementation(
			async (...args: unknown[]) => {
				const [filePath] = args as [string];
			if (filePath !== "weave/epub-bookmarks/Demo--epubsrc-legacy.md") {
				return null;
			}
			return {
				format: "weave-epub-bookmarks/v1",
				weave_epub_bookmark_file: true,
				stableKey: "epubsrc-legacy",
				bookId: "epub-old-runtime",
				sourceId: "epubsrc-legacy",
				sourceFingerprint: undefined,
				bookPath: "Books/demo.epub",
				bookTitle: "Demo",
				bookAuthor: "Author",
				updatedAt: 1,
				bookmarks: [],
			};
			}
		);

		const result = await (service as any).migrateBookmarkFileForBook(
			{
				id: "epub-book-canonical",
				filePath: "Books/demo.epub",
				sourceId: "epubsrc-4a9ad58db18a2176c9c0f163",
				sourceFingerprint: "4a9ad58db18a2176c9c0f16335a0a7502a4f3a7eaab3af39",
				metadata: {
					title: "Demo",
					author: "Author",
				},
			},
			"weave/epub-bookmarks/Demo--epubsrc-legacy.md"
		);
		const expectedStableKey = (service as any).buildStableKey({
			id: "epub-book-canonical",
			filePath: "Books/demo.epub",
			sourceId: "epubsrc-4a9ad58db18a2176c9c0f163",
			sourceFingerprint: "4a9ad58db18a2176c9c0f16335a0a7502a4f3a7eaab3af39",
			metadata: {
				title: "Demo",
				author: "Author",
			},
		});
		const expectedPath = `weave/epub-bookmarks/Demo--${expectedStableKey}.md`;

		expect(result).toBe(expectedPath);
		expect(writeBookmarkFile).toHaveBeenCalledWith(
			expectedPath,
			expect.objectContaining({
				stableKey: expectedStableKey,
				bookId: "epub-book-canonical",
				sourceId: "epubsrc-4a9ad58db18a2176c9c0f163",
			})
		);
		expect(app.vault.adapter.remove).toHaveBeenCalledWith(
			"weave/epub-bookmarks/Demo--epubsrc-legacy.md"
		);
	});

	it("ignores ENOENT when removing a stale bookmark file during migration", async () => {
		const { EpubBookmarkService } = await import("../EpubBookmarkService");
		const app = {
			vault: {
				adapter: {
					exists: vi.fn(async (path: string) => path === "weave/epub-bookmarks/Demo--legacy.md"),
					remove: vi.fn(async () => {
						const error = new Error("ENOENT: no such file or directory") as Error & { code?: string };
						error.code = "ENOENT";
						throw error;
					}),
				},
				getFiles: vi.fn(() => []),
			},
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;
		const service = new EpubBookmarkService(app);
		const writeBookmarkFile = vi.spyOn(service as any, "writeBookmarkFile").mockResolvedValue(undefined);
		vi.spyOn(service as any, "readBookmarkFileByPath").mockResolvedValue({
			format: "weave-epub-bookmarks/v1",
			weave_epub_bookmark_file: true,
			stableKey: "legacy",
			bookId: "epub-demo",
			bookPath: "Books/demo.epub",
			bookTitle: "Demo",
			updatedAt: 1,
			bookmarks: [],
		});

		await expect(
			(service as any).migrateBookmarkFileForBook(
				{
					id: "epub-demo",
					filePath: "Books/demo.epub",
					sourceFingerprint: "fp-demo-123",
					metadata: { title: "Demo", author: "Author" },
				},
				"weave/epub-bookmarks/Demo--legacy.md"
			)
		).resolves.toBe("weave/epub-bookmarks/Demo--fp-demo-123.md");

		expect(writeBookmarkFile).toHaveBeenCalled();
		expect(app.vault.adapter.remove).toHaveBeenCalledWith("weave/epub-bookmarks/Demo--legacy.md");
	});

	it("writes readingState into bookmark frontmatter with Obsidian warning callout", async () => {
		const { EpubBookmarkService, EPUB_BOOKMARK_AUTO_MAINTAINED_CALLOUT } = await import(
			"../EpubBookmarkService"
		);
		const written: string[] = [];
		const app = {
			vault: {
				adapter: {
					exists: vi.fn(async () => false),
				},
				getFiles: vi.fn(() => []),
			},
			plugins: {
				getPlugin: vi.fn(() => null),
			},
		} as any;
		const service = new EpubBookmarkService(app);
		vi.spyOn(service as any, "resolveBookmarkFilePath").mockResolvedValue(
			"weave/epub-bookmarks/Demo--fp-demo-123.md"
		);
		vi.spyOn(service as any, "readBookmarkFileByPath").mockResolvedValue(null);
		vi.spyOn(service as any, "writeBookmarkFile").mockImplementation(
			async (_path: string, frontmatter: { readingState?: unknown }) => {
				written.push(
					(service as any).renderBookmarkFileContent(frontmatter)
				);
			}
		);
		const book = {
			id: "epub-demo",
			filePath: "Books/demo.epub",
			sourceFingerprint: "fp-demo-123",
			metadata: { title: "Demo", author: "Author", chapterCount: 1 },
			currentPosition: { chapterIndex: 0, cfi: "epubcfi(/6/2!/4/2,/1:0,/1:4)", percent: 12 },
			readingStats: {
				totalReadTime: 120_000,
				lastReadTime: 1_700_000_000_000,
				createdTime: 1_699_000_000_000,
				bookWpm: 280,
				paceSampleCount: 8,
			},
		} as any;

		await service.writeReadingState(book, {
			currentPosition: book.currentPosition,
			readingStats: book.readingStats,
		});

		expect(written).toHaveLength(1);
		const content = written[0] || "";
		expect(content).toContain("readingState:");
		expect(content).toContain("totalReadTime: 120000");
		expect(content).toContain(EPUB_BOOKMARK_AUTO_MAINTAINED_CALLOUT);
		expect(content).toContain("> [!warning]");
		expect(content).toContain("阅读状态摘要");
	});
});
