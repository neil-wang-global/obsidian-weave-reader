vi.mock("obsidian", () => ({
	App: class MockApp {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	normalizePath: (value: string) =>
		String(value || "")
			.replace(/\\/g, "/")
			.replace(/\/+/g, "/")
			.replace(/\/$/, ""),
}));

const {
	openBookForSourceNavigationMock,
	openEpubInPreferredLeafMock,
	ensureEpubFileAccessMock,
	ensureEpubPremiumFeatureMock,
	resolveSourceFilePathMock,
} = vi.hoisted(() => ({
	openBookForSourceNavigationMock: vi.fn(),
	openEpubInPreferredLeafMock: vi.fn(),
	ensureEpubFileAccessMock: vi.fn(() => true),
	ensureEpubPremiumFeatureMock: vi.fn(() => true),
	resolveSourceFilePathMock: vi.fn(async () => "Books/demo.epub"),
}));

vi.mock("../../../utils/epub-leaf-utils", () => ({
	openBookForSourceNavigation: openBookForSourceNavigationMock,
	openEpubInPreferredLeaf: openEpubInPreferredLeafMock,
}));

vi.mock("../../epub/epub-premium", () => ({
	ensureEpubFileAccess: ensureEpubFileAccessMock,
	ensureEpubPremiumFeature: ensureEpubPremiumFeatureMock,
}));

vi.mock("../../epub/epub-storage-access", () => ({
	getEpubStorageService: () => ({
		resolveSourceFilePath: resolveSourceFilePathMock,
	}),
}));

vi.mock("../../epub/epub-vault-path", () => ({
	resolveEpubVaultPath: (_app: unknown, path: string) => path,
}));

vi.mock("../../../utils/i18n", () => ({
	i18n: { t: (key: string) => key },
}));

import { NavigationHub } from "../NavigationHub";

describe("NavigationHub", () => {
	const app = { vault: { getAbstractFileByPath: () => null } } as any;

	beforeEach(() => {
		openBookForSourceNavigationMock.mockReset();
		openEpubInPreferredLeafMock.mockReset();
		openBookForSourceNavigationMock.mockResolvedValue({ id: "leaf-source" });
		openEpubInPreferredLeafMock.mockResolvedValue({ id: "leaf-preferred" });
		ensureEpubPremiumFeatureMock.mockReturnValue(true);
		resolveSourceFilePathMock.mockResolvedValue("Books/demo.epub");
	});

	it("opens books for source navigation with pendingLocate in view state", async () => {
		const hub = new NavigationHub(app);
		const result = await hub.navigate({
			kind: "book",
			resourcePath: "Books/demo.epub",
			locate: { cfi: "epubcfi(/6/2)", text: "Hello" },
			policy: { reuseLeaf: true, focus: true },
		});

		expect(result.success).toBe(true);
		expect(openBookForSourceNavigationMock).toHaveBeenCalledWith(
			app,
			"Books/demo.epub",
			expect.objectContaining({
				filePath: "Books/demo.epub",
				pendingLocate: { cfi: "epubcfi(/6/2)", text: "Hello" },
				pendingCfi: "epubcfi(/6/2)",
				pendingText: "Hello",
			}),
			{ focus: true }
		);
	});

	it("uses preferred leaf policy for bookshelf-style opens", async () => {
		const hub = new NavigationHub(app);
		await hub.navigate({
			kind: "book",
			resourcePath: "Books/demo.epub",
			policy: { preferredLeaf: true, focus: true },
		});

		expect(openEpubInPreferredLeafMock).toHaveBeenCalledWith(
			app,
			"Books/demo.epub",
			expect.objectContaining({ filePath: "Books/demo.epub" })
		);
		expect(openBookForSourceNavigationMock).not.toHaveBeenCalled();
	});

	it("blocks located book navigation when premium source location is unavailable", async () => {
		ensureEpubPremiumFeatureMock.mockReturnValueOnce(false);
		const hub = new NavigationHub(app);
		const result = await hub.navigate({
			kind: "book",
			resourcePath: "Books/demo.epub",
			locate: { cfi: "epubcfi(/6/2)", text: "Hello" },
		});

		expect(result.success).toBe(false);
		expect(openBookForSourceNavigationMock).not.toHaveBeenCalled();
	});
});
