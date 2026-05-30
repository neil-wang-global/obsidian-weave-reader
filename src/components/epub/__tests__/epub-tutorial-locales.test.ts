import { describe, expect, it } from "vitest";
import { EPUB_TUTORIAL_CONTENT_BY_LANG, EPUB_TUTORIAL_TABS_BY_LANG } from "../epub-tutorial-content";

const TAB_IDS = ["basics", "highlight", "workflow", "tools", "credits"] as const;

describe("EPUB tutorial locales", () => {
	it("keeps the same tab structure across languages", () => {
		for (const lang of ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const) {
			expect(Object.keys(EPUB_TUTORIAL_CONTENT_BY_LANG[lang]).sort()).toEqual([...TAB_IDS].sort());
			expect(EPUB_TUTORIAL_TABS_BY_LANG[lang]).toHaveLength(TAB_IDS.length);
		}
	});

	it("aligns ja/ko tutorial sections with English", () => {
		const englishCount = TAB_IDS.reduce(
			(total, tabId) => total + EPUB_TUTORIAL_CONTENT_BY_LANG["en-US"][tabId].length,
			0
		);
		const japaneseCount = TAB_IDS.reduce(
			(total, tabId) => total + EPUB_TUTORIAL_CONTENT_BY_LANG["ja-JP"][tabId].length,
			0
		);
		const koreanCount = TAB_IDS.reduce(
			(total, tabId) => total + EPUB_TUTORIAL_CONTENT_BY_LANG["ko-KR"][tabId].length,
			0
		);
		expect(japaneseCount).toBe(englishCount);
		expect(koreanCount).toBe(englishCount);
	});

	it("uses English tutorial body for ja and ko until dedicated copy exists", () => {
		expect(EPUB_TUTORIAL_CONTENT_BY_LANG["ja-JP"]).toBe(
			EPUB_TUTORIAL_CONTENT_BY_LANG["en-US"]
		);
		expect(EPUB_TUTORIAL_CONTENT_BY_LANG["ko-KR"]).toBe(
			EPUB_TUTORIAL_CONTENT_BY_LANG["en-US"]
		);
	});

	it("keeps localized tutorial tab labels for ja and ko", () => {
		expect(EPUB_TUTORIAL_TABS_BY_LANG["ja-JP"][0]?.label).not.toBe(
			EPUB_TUTORIAL_TABS_BY_LANG["en-US"][0]?.label
		);
		expect(EPUB_TUTORIAL_TABS_BY_LANG["ko-KR"][0]?.label).toMatch(/[\uac00-\ud7af]/);
	});
});
