import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { get } from "svelte/store";
import {
	currentLanguage,
	flattenTranslationLeafKeys,
	initI18n,
	translationCatalog,
} from "../i18n";
import {
	assertOverlayDoesNotCopyChinese,
	isAcceptableCuratedTranslation,
	listCuratedOverlayCandidateKeys,
} from "../i18n/locale-policy";
import { PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
import { getEpubPremiumFeaturePreviewContent } from "../../services/epub/epub-premium";
import enTemplate from "../i18n/flat-locales/en-US.template.json";
import jaOverlay from "../i18n/overlays/ja-JP.json";
import koOverlay from "../i18n/overlays/ko-KR.json";

const zhSnapshot = JSON.parse(
	readFileSync(resolve("scripts/curated-overlay-data/zh-CN.snapshot.json"), "utf8")
) as Record<string, string>;

const premiumKeys = Object.keys(enTemplate).filter((key) => key.startsWith("epub.premium."));

const bookshelfModalKeys = Object.keys(enTemplate).filter(
	(key) =>
		key.startsWith("epub.bookshelf.importModal.") ||
		key.startsWith("epub.bookshelf.bookDeleteModal.") ||
		key.startsWith("epub.bookshelf.bookInfoModal.") ||
		key.startsWith("epub.bookshelf.rename.")
);

describe("i18n locales", () => {
	it("detects Japanese and Korean from locale tags", () => {
		initI18n();
		currentLanguage.set("ja-JP");
		expect(get(currentLanguage)).toBe("ja-JP");
		currentLanguage.set("ko-KR");
		expect(get(currentLanguage)).toBe("ko-KR");
	});

	it("ships full bookshelf modal overlays for ja-JP and ko-KR", () => {
		for (const key of bookshelfModalKeys) {
			const english = (enTemplate as Record<string, string>)[key];
			const japanese = (jaOverlay as Record<string, string>)[key];
			const korean = (koOverlay as Record<string, string>)[key];
			const chinese = zhSnapshot[key];

			expect(japanese, key).toBeTruthy();
			expect(korean, key).toBeTruthy();
			expect(japanese).not.toBe(english);
			expect(korean).not.toBe(english);
			expect(isAcceptableCuratedTranslation("ko-KR", korean, english, chinese)).toBe(true);
			if (chinese && chinese !== english) {
				expect(korean).not.toBe(chinese);
			}
		}
	});

	it("ships full premium overlays for ja-JP and ko-KR", () => {
		for (const key of premiumKeys) {
			const english = (enTemplate as Record<string, string>)[key];
			const japanese = (jaOverlay as Record<string, string>)[key];
			const korean = (koOverlay as Record<string, string>)[key];
			const chinese = zhSnapshot[key];

			expect(japanese, key).toBeTruthy();
			expect(korean, key).toBeTruthy();
			expect(isAcceptableCuratedTranslation("ja-JP", japanese, english, chinese)).toBe(true);
			expect(isAcceptableCuratedTranslation("ko-KR", korean, english, chinese)).toBe(true);
		}
	});

	it("uses localized premium preview copy for ko-KR and ja-JP", () => {
		initI18n();
		const readingReferenceTitleKey = "epub.premium.premiumFeatures.readingReference.title";
		const englishTitle = (enTemplate as Record<string, string>)[readingReferenceTitleKey];

		currentLanguage.set("ko-KR");
		const korean = getEpubPremiumFeaturePreviewContent(
			PREMIUM_FEATURES.EPUB_READING_REFERENCE
		);
		expect(korean.title).toBe((koOverlay as Record<string, string>)[readingReferenceTitleKey]);
		expect(korean.title).not.toBe(englishTitle);
		expect(korean.title).not.toBe("参考阅读点与顶部贴纸");

		currentLanguage.set("ja-JP");
		const japanese = getEpubPremiumFeaturePreviewContent(
			PREMIUM_FEATURES.EPUB_READING_REFERENCE
		);
		expect(japanese.title).toBe((jaOverlay as Record<string, string>)[readingReferenceTitleKey]);
		expect(japanese.title).not.toBe(englishTitle);
		expect(japanese.title).not.toBe("参考阅读点与顶部贴纸");
	});

	it("keeps curated overlays within policy prefixes", () => {
		for (const [key, value] of Object.entries(jaOverlay)) {
			expect(listCuratedOverlayCandidateKeys(enTemplate as Record<string, string>)).toContain(
				key
			);
			expect(value).not.toBe((enTemplate as Record<string, string>)[key]);
		}
	});

	it("does not copy zh-CN text into curated overlays", () => {
		expect(
			assertOverlayDoesNotCopyChinese(
				jaOverlay as Record<string, string>,
				zhSnapshot,
				enTemplate as Record<string, string>,
				"ja-JP"
			)
		).toEqual([]);
		expect(
			assertOverlayDoesNotCopyChinese(
				koOverlay as Record<string, string>,
				zhSnapshot,
				enTemplate as Record<string, string>,
				"ko-KR"
			)
		).toEqual([]);
	});

	it("keeps ja/ko catalogs the same shape as English", () => {
		const enLeafCount = Object.keys(
			flattenTranslationLeafKeys(translationCatalog["en-US"])
		).length;
		const jaLeafCount = Object.keys(
			flattenTranslationLeafKeys(translationCatalog["ja-JP"])
		).length;
		const koLeafCount = Object.keys(
			flattenTranslationLeafKeys(translationCatalog["ko-KR"])
		).length;

		expect(jaLeafCount).toBe(enLeafCount);
		expect(koLeafCount).toBe(enLeafCount);
	});
});
