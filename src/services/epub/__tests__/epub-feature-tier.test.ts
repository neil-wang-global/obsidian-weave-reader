import { beforeEach, describe, expect, it } from "vitest";
import {
	EPUB_CORE_FEATURE_ID_SET,
	EPUB_FEATURE_IDS,
	EPUB_PREMIUM_FEATURE_ID_SET,
	isEpubCoreFeature,
	isEpubPremiumFeature,
} from "../../../config/epub-feature-tier";
import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../premium/PremiumFeatureGuard";

describe("epub-feature-tier", () => {
	it("treats excerpt notes as core and reading progress as premium", () => {
		expect(isEpubCoreFeature(EPUB_FEATURE_IDS.EXCERPT_NOTES)).toBe(true);
		expect(isEpubCoreFeature(EPUB_FEATURE_IDS.READING_PROGRESS)).toBe(false);
		expect(isEpubCoreFeature(EPUB_FEATURE_IDS.READING_REFERENCE)).toBe(false);
	});

	it("lists premium epub capabilities separately from core", () => {
		expect(isEpubPremiumFeature(EPUB_FEATURE_IDS.READING_PROGRESS)).toBe(true);
		expect(isEpubPremiumFeature(EPUB_FEATURE_IDS.READING_REFERENCE)).toBe(true);
		expect(isEpubPremiumFeature(EPUB_FEATURE_IDS.PARAGRAPH_MODE)).toBe(true);
		expect(EPUB_CORE_FEATURE_ID_SET.size).toBeGreaterThan(0);
		expect(EPUB_PREMIUM_FEATURE_ID_SET.size).toBeGreaterThan(0);
	});
});

describe("PremiumFeatureGuard epub tier", () => {
	beforeEach(() => {
		PremiumFeatureGuard.getInstance().isPremiumActive.set(false);
		PremiumFeatureGuard.getInstance().premiumFeaturesPreviewEnabled.set(false);
	});

	it("blocks reading progress until a license is active", () => {
		const guard = PremiumFeatureGuard.getInstance();
		expect(guard.canUseFeature(PREMIUM_FEATURES.EPUB_READING_PROGRESS)).toBe(false);
		expect(guard.isPremiumFeature(PREMIUM_FEATURES.EPUB_READING_PROGRESS)).toBe(true);
	});

	it("blocks reading reference until licensed or previewed in UI", () => {
		const guard = PremiumFeatureGuard.getInstance();
		expect(guard.canUseFeature(PREMIUM_FEATURES.EPUB_READING_REFERENCE)).toBe(false);
		expect(guard.shouldShowFeatureEntry(PREMIUM_FEATURES.EPUB_READING_REFERENCE)).toBe(false);

		guard.premiumFeaturesPreviewEnabled.set(true);
		expect(guard.shouldShowFeatureEntry(PREMIUM_FEATURES.EPUB_READING_REFERENCE)).toBe(true);
		expect(guard.canUseFeature(PREMIUM_FEATURES.EPUB_READING_REFERENCE)).toBe(false);
	});
});
