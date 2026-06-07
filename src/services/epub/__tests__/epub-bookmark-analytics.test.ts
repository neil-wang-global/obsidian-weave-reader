import { describe, expect, it } from "vitest";
import { buildEpubBookmarkAnalytics } from "../epub-bookmark-analytics";

describe("buildEpubBookmarkAnalytics", () => {
	it("aggregates highlight colors, notes, and recent excerpts", () => {
		const analytics = buildEpubBookmarkAnalytics(
			[
				{
					cfiRange: "epubcfi(/6/2)",
					color: "yellow",
					text: "间隔练习比集中练习更有效",
					chapterTitle: "间隔重复",
					sourceFile: "Notes/a.md",
					createdTime: 20,
					referenceHeat: 3,
				},
				{
					cfiRange: "epubcfi(/6/4)",
					color: "green",
					text: "睡眠巩固记忆",
					chapterTitle: "睡眠与记忆",
					sourceFile: "Notes/b.md",
					commentText: "重点",
					createdTime: 30,
				},
				{
					cfiRange: "epubcfi(/6/6)",
					color: "mask",
					text: "隐藏片段",
					presentation: "conceal",
					createdTime: 10,
				},
			],
			1000
		);

		expect(analytics.highlightCount).toBe(2);
		expect(analytics.highlightsByColor).toEqual({ yellow: 1, green: 1 });
		expect(analytics.excerptNoteCount).toBe(2);
		expect(analytics.commentCount).toBe(1);
		expect(analytics.concealedCount).toBe(1);
		expect(analytics.referenceHeatMax).toBe(3);
		expect(analytics.topChaptersByHighlights).toHaveLength(2);
		expect(analytics.recentExcerpts?.[0]?.preview).toContain("睡眠巩固记忆");
	});
});
