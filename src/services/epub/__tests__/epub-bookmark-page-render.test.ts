import { describe, expect, it } from "vitest";
import { EpubLinkService } from "../EpubLinkService";
import {
	EPUB_BOOKMARK_PAGE_CALLOUT,
	renderEpubBookmarkFileContent,
	resolveEpubBookmarkReadingStatus,
} from "../epub-bookmark-page-render";

describe("epub-bookmark-page-render", () => {
	const linkService = new EpubLinkService({} as any);

	it("renders v2 frontmatter, flat properties, and overview body", () => {
		const content = renderEpubBookmarkFileContent(
			{
				stableKey: "epubsrc-demo",
				bookId: "book-1",
				bookPath: "Books/demo.epub",
				bookTitle: "示例书籍",
				bookAuthor: "作者甲",
				updatedAt: 1_700_000_000_000,
				bookmarks: [],
				readingState: {
					currentPosition: { chapterIndex: 1, cfi: "epubcfi(/6/2)", percent: 24 },
					readingStats: {
						totalReadTime: 180_000,
						lastReadTime: 1_700_000_000_000,
						createdTime: 1_699_000_000_000,
						bookWpm: 280,
					},
				},
				analytics: {
					updatedAt: 1_700_000_000_000,
					highlightCount: 2,
					highlightsByColor: { yellow: 2 },
					excerptNoteCount: 1,
					commentCount: 0,
					concealedCount: 0,
					topChaptersByHighlights: [{ title: "第一章", count: 2 }],
					linkedNotePaths: ["Notes/demo.md"],
					recentExcerpts: [
						{
							chapterTitle: "第一章",
							preview: "摘录预览",
							notePath: "Notes/demo.md",
							createdTime: 1,
						},
					],
				},
				user: {
					tags: ["测试"],
					notes: "用户备注",
				},
			},
			linkService
		);

		expect(content).toContain("weave-epub-bookmarks/v2");
		expect(content).toContain("reading-progress: 24");
		expect(content).toContain('reading-status: "reading"');
		expect(content).toContain("highlight-count: 2");
		expect(content).toContain(EPUB_BOOKMARK_PAGE_CALLOUT);
		expect(content).toContain("## 概览");
		expect(content).toContain("## 摘录索引");
		expect(content).toContain("## 我的标注");
		expect(content).not.toContain("recentIntervalWpms");
	});

	it("resolves finished status when completedTime is set", () => {
		expect(
			resolveEpubBookmarkReadingStatus({
				currentPosition: { chapterIndex: 0, cfi: "", percent: 50 },
				readingStats: {
					totalReadTime: 0,
					lastReadTime: 1,
					createdTime: 1,
					completedTime: 99,
				},
			})
		).toBe("finished");
	});
});
