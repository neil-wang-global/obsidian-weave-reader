import { App, Notice } from "obsidian";
import {
	FEATURE_METADATA,
	PremiumFeatureGuard,
	PREMIUM_FEATURES,
} from "../premium/PremiumFeatureGuard";
import { i18n } from "../../utils/i18n";
import { getBookExtensionFromPath, getBookFormatDisplayLabel } from "./book-format";
import { resolveEpubHost } from "./epub-host";

export interface EpubFeatureTierPreviewItem {
	title: string;
	description: string;
	featureId?: string;
}

const EPUB_FREE_FEATURE_PREVIEW_ITEMS: EpubFeatureTierPreviewItem[] = [
	{
		title: i18n.t("epub.premium.freeFeatures.basicReading.title"),
		description: i18n.t("epub.premium.freeFeatures.basicReading.description"),
	},
	{
		title: i18n.t("epub.premium.freeFeatures.bookmarksAndNavigation.title"),
		description: i18n.t("epub.premium.freeFeatures.bookmarksAndNavigation.description"),
	},
	{
		title: i18n.t("epub.premium.freeFeatures.typographyAndView.title"),
		description: i18n.t("epub.premium.freeFeatures.typographyAndView.description"),
	},
	{
		title: i18n.t("epub.premium.freeFeatures.aiAndTutorial.title"),
		description: i18n.t("epub.premium.freeFeatures.aiAndTutorial.description"),
	},
	{
		title: i18n.t("epub.premium.freeFeatures.cardCreation.title"),
		description: i18n.t("epub.premium.freeFeatures.cardCreation.description"),
	},
	{
		title: i18n.t("epub.premium.freeFeatures.excerptNotes.title"),
		description: i18n.t("epub.premium.freeFeatures.excerptNotes.description"),
	},
];

const EPUB_PREMIUM_FEATURE_PREVIEW_ITEMS: EpubFeatureTierPreviewItem[] = [
	{
		featureId: PREMIUM_FEATURES.EPUB_NON_EPUB_FORMATS,
		title: i18n.t("epub.premium.premiumFeatures.nonEpubFormats.title"),
		description: i18n.t("epub.premium.premiumFeatures.nonEpubFormats.description"),
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_READING_PROGRESS,
		title: i18n.t("epub.premium.premiumFeatures.readingProgress.title"),
		description: i18n.t("epub.premium.premiumFeatures.readingProgress.description"),
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE,
		title: i18n.t("epub.premium.premiumFeatures.paragraphMode.title"),
		description: i18n.t("epub.premium.premiumFeatures.paragraphMode.description"),
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS,
		title: "高级摘录样式",
		description: "下划线、删除线、波浪线及相关摘录显示控制",
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_SOURCE_LOCATION,
		title: i18n.t("epub.premium.premiumFeatures.sourceLocation.title"),
		description: i18n.t("epub.premium.premiumFeatures.sourceLocation.description"),
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_CANVAS_EXCERPTS,
		title: "脑图摘录联动",
		description: "自动关联 Canvas 脑图摘录并在阅读器中管理绑定状态",
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_FOOTNOTE_PREVIEW,
		title: i18n.t("epub.premium.premiumFeatures.footnotePreview.title"),
		description: i18n.t("epub.premium.premiumFeatures.footnotePreview.description"),
	},
	{
		featureId: PREMIUM_FEATURES.EPUB_CHAPTER_EXPORT,
		title: i18n.t("epub.premium.premiumFeatures.chapterExport.title"),
		description: i18n.t("epub.premium.premiumFeatures.chapterExport.description"),
	},
];

export function getEpubFeatureTierPreview(): {
	freeFeatures: EpubFeatureTierPreviewItem[];
	premiumFeatures: EpubFeatureTierPreviewItem[];
} {
	return {
		freeFeatures: EPUB_FREE_FEATURE_PREVIEW_ITEMS,
		premiumFeatures: EPUB_PREMIUM_FEATURE_PREVIEW_ITEMS,
	};
}

export function getEpubPremiumFeaturePreviewContent(featureId: string): {
	title: string;
	description: string;
	freeFeatures: EpubFeatureTierPreviewItem[];
	premiumFeatures: EpubFeatureTierPreviewItem[];
} {
	const metadata = FEATURE_METADATA[featureId];
	return {
		title: metadata?.name || i18n.t("epub.premium.defaultTitle"),
		description: metadata?.description || i18n.t("epub.premium.defaultDescription"),
		freeFeatures: EPUB_FREE_FEATURE_PREVIEW_ITEMS,
		premiumFeatures: EPUB_PREMIUM_FEATURE_PREVIEW_ITEMS,
	};
}

export function canUseEpubPremiumFeature(app: App, featureId: string): boolean {
	void app;
	return PremiumFeatureGuard.getInstance().canUseFeature(featureId, {
		page: "epub-reader",
	});
}

export function canOpenBookWithCurrentLicense(filePath: string): boolean {
	return (
		getBookExtensionFromPath(filePath) === "epub" ||
		PremiumFeatureGuard.getInstance().canUseFeature(PREMIUM_FEATURES.EPUB_NON_EPUB_FORMATS, {
			page: "epub-reader",
		})
	);
}

export function canOpenEpubFile(app: App, filePath: string): boolean {
	return (
		getBookExtensionFromPath(filePath) === "epub" ||
		canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_NON_EPUB_FORMATS)
	);
}

export function canUseEpubReadingProgress(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_READING_PROGRESS);
}

export function canUseEpubParagraphMode(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE);
}

export function canUseEpubExcerptNotes(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
}

export function canUseEpubStyledExcerpts(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS);
}

export function canUseEpubSourceLocation(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_SOURCE_LOCATION);
}

export function canUseEpubCanvasExcerpts(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_CANVAS_EXCERPTS);
}

export function canUseEpubFootnotePreview(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_FOOTNOTE_PREVIEW);
}

export function canUseEpubChapterExport(app: App): boolean {
	return canUseEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_CHAPTER_EXPORT);
}

export function ensureEpubFileAccess(app: App, filePath: string, noticeMessage?: string): boolean {
	if (canOpenEpubFile(app, filePath)) {
		return true;
	}

	const formatLabel = getBookFormatDisplayLabel(filePath);
	new Notice(noticeMessage ?? i18n.t("epub.premium.lockedFormatNotice", { format: formatLabel }));
	resolveEpubHost(app)?.openEpubPremiumSettings?.();
	return false;
}

export function ensureEpubPremiumFeature(
	app: App,
	featureId: string,
	noticeMessage: string
): boolean {
	if (canUseEpubPremiumFeature(app, featureId)) {
		return true;
	}

	new Notice(noticeMessage);
	resolveEpubHost(app)?.openEpubPremiumSettings?.();
	return false;
}
