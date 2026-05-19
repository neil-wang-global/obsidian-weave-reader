<script lang="ts">
        import type { App, WorkspaceLeaf, TAbstractFile, EventRef } from 'obsidian';
        import { setIcon, MarkdownView, Notice, Menu, TFile, Platform, normalizePath } from 'obsidian';
	import { onMount, untrack } from 'svelte';
	import EpubReaderView from './EpubReaderView.svelte';
	import BookshelfView from './BookshelfView.svelte';
	import BottomNav from './BottomNav.svelte';
	import SelectionToolbar from './SelectionToolbar.svelte';
	import ParagraphReadingOverlay from './ParagraphReadingOverlay.svelte';
	import ScreenshotOverlay from './ScreenshotOverlay.svelte';
	import EpubTutorial from './EpubTutorial.svelte';
	import EpubHighlightToolbar from './EpubHighlightToolbar.svelte';
	import EpubCommentEditorPopover from './EpubCommentEditorPopover.svelte';
	import EpubFootnotePreviewPopover from './EpubFootnotePreviewPopover.svelte';
	import ReferenceDetailModal from './ReferenceDetailModal.svelte';
	import EpubPremiumFeaturePopover from './EpubPremiumFeaturePopover.svelte';
	import EpubReadingReferenceSticker from './EpubReadingReferenceSticker.svelte';
	import EpubRemainingReadingSticker from './EpubRemainingReadingSticker.svelte';
	import { canUseEpubCanvasExcerpts, canUseEpubChapterExport, canUseEpubExcerptNotes, canUseEpubFootnotePreview, canUseEpubParagraphMode, canUseEpubReadingProgress, canUseEpubSourceLocation, canUseEpubStyledExcerpts, createEpubReaderEngine, DEFAULT_EPUB_EXCERPT_SETTINGS, ensureEpubPremiumFeature, EPUB_RUNTIME, EpubStorageService, EpubAnnotationService, EpubHighlightViewSnapshotService, EpubLinkService, EpubLocationMigrationService, resolveEpubHost, resolveEpubWeaveOfficialAPI } from '../../services/epub';
	import { EpubBookmarkService } from '../../services/epub/EpubBookmarkService';
	import { EpubBacklinkHighlightService } from '../../services/epub/EpubBacklinkHighlightService';
	import { EpubReferenceStatsService } from '../../services/epub/EpubReferenceStatsService';
	import {
		getDefaultEpubReaderSettings,
		normalizeEpubReaderSettingsForDevice,
		type EpubReaderSettingsDeviceKind,
	} from '../../services/epub/reader-settings';
	import type { ReferenceSourceInfo, ReferenceStats } from '../../services/epub/EpubReferenceStatsService';
	import type { BacklinkSourceMatch } from '../../services/epub/EpubBacklinkHighlightService';
	import { EpubScreenshotService } from '../../services/epub/EpubScreenshotService';
	import { EpubCanvasService } from '../../services/epub/EpubCanvasService';
	import type { EpubVisibleFrameLike, ScreenshotRect } from '../../services/epub/EpubScreenshotService';
	import type { EpubBook, EpubExcerptSettings, EpubFlowMode, EpubHighlightStyle, EpubHostCapabilities, EpubLastOpenBookmark, EpubLayoutMode, EpubParagraphModeReadingPosition, EpubParagraphModeTransitionStyle, EpubReaderEngine, EpubReaderSettings, EpubReadingReferencePoint, EpubWeaveExcerptRemovalMode, EpubWeaveOfficialAPI, EpubWeaveRemoveExcerptResult, FlashStyle, HighlightClickInfo, PaginationInfo, ReaderFootnotePreviewInfo, ReaderHighlight, ReaderParagraph, ReadingPosition, TocItem } from '../../services/epub';
	import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
	import { isSupportedBookFile } from '../../services/epub/book-format';
	import {
		getBookshelfDisplayModeOptions,
		getBookshelfDisplayModeOption,
		normalizeBookshelfDisplayMode,
		type BookshelfDisplayMode,
	} from '../../services/epub/bookshelf-display-mode';
	import { epubActiveDocumentStore } from '../../stores/epub-active-document-store';
	import { logger } from '../../utils/logger';
	import { tr } from '../../utils/i18n';
	import { isWeaveMainPluginEnabled } from '../../utils/weave-reader-access';
	import { showObsidianChoice } from '../../utils/obsidian-confirm';
	import { UnifiedThemeManager } from '../../utils/theme-detection';
	import { openFileWithExistingLeaf } from '../../utils/workspace-navigation';
	import { getSourceLocateOverlayService } from '../../services/ui/SourceLocateOverlayService';
	import { SourceNavigationService } from '../../services/ui/SourceNavigationService';
	import { buildEpubMarkdownLocateCandidates } from '../../services/ui/source-locate-candidates';
	import { attachExternalHighlightSyncReload } from './external-highlight-sync-reload';
	import {
		normalizeContinuousReadingPositionAutoSaveEnabled,
		normalizeContinuousReadingPositionAutoSavePages,
	} from '../../config/reading-position-auto-save';
	import '../../styles/epub/epub-reader.css';

	interface Props {
		app: App;
		filePath: string;
		pendingCfi?: string;
		pendingText?: string;
		autoInsertEnabled?: boolean;
		getLastActiveMarkdownLeaf?: () => WorkspaceLeaf | null;
		onTitleChange?: (title: string) => void;
		onChapterTitleChange?: (title: string) => void;
		onReadingReferencePointChange?: (point: EpubReadingReferencePoint | null) => void;
		onReaderSettingsLoaded?: (settings: EpubReaderSettings) => void;
		onBackFromBookshelf?: () => void | Promise<void>;
		onActionsReady?: (actions: {
			setAutoInsert: (enabled: boolean) => void;
			setScreenshotMode: (active: boolean) => void;
			setLayoutMode: (mode: EpubLayoutMode) => void;
			setFlowMode: (mode: EpubFlowMode) => void;
			toggleParagraphMode: () => void;
			openTypographyPanel: () => void;
			getReaderSettings: () => EpubReaderSettings;
			updateReaderSettings: (patch: Partial<EpubReaderSettings>) => Promise<void>;
			setScreenshotSaveMode: (saveAsImage: boolean) => void;
			navigateToCfi: (cfi: string, text: string) => void;
			toggleTutorial: () => void;
			addBookmark: () => Promise<void>;
			canUseReadingProgress?: () => boolean;
			canUseParagraphMode?: () => boolean;
			canUseExcerptNotes?: () => boolean;
			canUseStyledExcerpts?: () => boolean;
			canUseCanvasExcerpts?: () => boolean;
			canUseFootnotePreview?: () => boolean;
			isPremiumFeaturePreviewEnabled?: () => boolean;
			showPremiumFeaturePreview?: (featureId: string) => void;
			saveReadingReferencePoint?: () => Promise<void>;
			saveLastOpenBookmark?: () => Promise<void>;
			bindCanvasPath: (canvasPath: string) => void;
			unbindCanvas: () => void;
			getCanvasService: () => EpubCanvasService;
			canMarkIRResumePoint: () => boolean;
			markIRResumePoint: (event?: MouseEvent) => Promise<void>;
			exportCurrentChapterToMarkdown?: () => Promise<void>;
			exportBookHighlightsToMarkdown?: (event?: MouseEvent) => Promise<void>;
			getExcerptSettings: () => EpubExcerptSettings;
			updateExcerptSettings: (patch: Partial<EpubExcerptSettings>) => Promise<void>;
		}) => void;
		onSwitchBook?: (filePath: string) => void;
		onCanvasStateChange?: (active: boolean, canvasPath: string | null) => void;
	}

	let { 
		app, 
		filePath, 
		pendingCfi = '', 
		pendingText = '', 
		autoInsertEnabled: initialAutoInsert = false, 
		getLastActiveMarkdownLeaf, 
		onTitleChange, 
		onChapterTitleChange,
		onReadingReferencePointChange,
		onReaderSettingsLoaded, 
		onBackFromBookshelf,
		onActionsReady, 
		onSwitchBook, 
		onCanvasStateChange 
	}: Props = $props();
	let t = $derived($tr);

	function getDefaultReaderLineHeight(): number {
		return getDefaultReaderSettings().lineHeight;
	}

	function getDefaultReaderPageMargin(): number {
		return getDefaultReaderSettings().pageMargin;
	}

	function getDefaultReaderWidthMode(): EpubReaderSettings['widthMode'] {
		return getDefaultReaderSettings().widthMode;
	}

	function getDefaultReaderFlowMode(): EpubReaderSettings['flowMode'] {
		return getDefaultReaderSettings().flowMode;
	}

	function getDefaultTopStickerLayout(): EpubReaderSettings['topStickerLayout'] {
		return 'auto';
	}

	function getDefaultShowTopSticker(): boolean {
		return true;
	}

	function isDesktopScrolledSideNavVisible(): boolean {
		return settings.flowMode === 'scrolled' && settings.showScrolledSideNav && !isMobileReader();
	}

	function getEffectiveTopStickerLayout(): 'inline' | 'sidebar' {
		if (settings.topStickerLayout === 'inline' || settings.topStickerLayout === 'sidebar') {
			return settings.topStickerLayout;
		}
		return isDesktopScrolledSideNavVisible() ? 'sidebar' : 'inline';
	}

	function shouldShowTopSticker(): boolean {
		return settings.showTopSticker !== false;
	}

	function shouldRenderTopStickerRail(): boolean {
		return shouldShowTopSticker() && Boolean(
			getRemainingReadingStickerProps()
			|| (hasReadingProgressCapability() && readingReferencePoint)
		);
	}

	function getTopStickerLayoutState(): 'hidden' | 'inline' | 'sidebar' {
		return shouldRenderTopStickerRail() ? getEffectiveTopStickerLayout() : 'hidden';
	}

	function getReaderRootStyle(): string {
		const effectiveLineHeight = typeof settings.lineHeight === 'number' && settings.lineHeight > 0
			? settings.lineHeight
			: getDefaultReaderLineHeight();
		const pagedSafeInset = `${(effectiveLineHeight * 0.5).toFixed(3)}em`;
		return `--epub-line-height: ${effectiveLineHeight}; --epub-paged-safe-top: ${pagedSafeInset}; --epub-paged-safe-bottom: ${pagedSafeInset};`;
	}

	let readerService: EpubReaderEngine = untrack(() => createEpubReaderEngine(app));
	let storageService = untrack(() => new EpubStorageService(app));
	let bookmarkService = untrack(() => new EpubBookmarkService(app));
	let annotationService = untrack(() => new EpubAnnotationService(storageService));
	let highlightViewSnapshotService = untrack(() => new EpubHighlightViewSnapshotService());
	let locationMigrationService = untrack(() => new EpubLocationMigrationService(app, storageService, readerService));
	let linkService = untrack(() => new EpubLinkService(app));
	let screenshotService = untrack(() => new EpubScreenshotService(app));
	let canvasService = untrack(() => new EpubCanvasService(app));
	let backlinkService = untrack(() => new EpubBacklinkHighlightService(app));
	let referenceStatsService = untrack(() => new EpubReferenceStatsService(app, backlinkService));

	let book = $state<EpubBook | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let readingProgress = $state(0);
	let paginationInfo = $state<PaginationInfo>({ currentPage: 0, totalPages: 0 });
	let currentChapterIndex = $state(0);
	let showNextChapterAction = $state(false);
	let readerVersion = $state(0);
	let autoInsert = $state(untrack(() => initialAutoInsert));
	let screenshotMode = $state(false);
	let screenshotSaveAsImage = $state(true);
	let tutorialVisible = $state(false);
	let canvasMode = $state(false);
	let transientStatusText = $state('');
	let readingReferencePoint = $state<EpubReadingReferencePoint | null>(null);
	let sessionReadingStartPercent = $state<number | null>(null);
	let remainingReadingTime = $state<{ bookMs?: number; chapterMs?: number; wordsPerMinute?: number }>({});
	let premiumFeaturePreviewEnabled = $state(false);
	let premiumFeaturePreviewFeatureId = $state<string | null>(null);
	let paragraphModeSelection = $state<{
		text: string;
		cfiRange: string;
		rect: DOMRect;
		rects: DOMRect[];
		clear: () => void;
	} | null>(null);
	let paragraphModeLocation = $state<{ paragraphs: ReaderParagraph[]; currentIndex: number } | null>(null);
	let paragraphModeBusy = $state(false);
	let paragraphModeImmersive = $state(false);
	let paragraphModeAnchorParagraphId = '';
	let rootEl = $state<HTMLDivElement | null>(null);
	let viewportEl = $state<HTMLDivElement | null>(null);
	let topStickerRailEl = $state<HTMLDivElement | null>(null);
	let exportNotesPopoverEl = $state<HTMLDivElement | null>(null);
	let exportNotesPopoverOpen = $state(false);
	let exportNotesSubmitting = $state(false);
	let typographyPopoverOpen = $state(false);
	let readerReady = $state(false);
	let scrolledNavSyncFrame = 0;
	let scrolledNavResizeObserver: ResizeObserver | null = null;
	let highlightToolbarInfo = $state<HighlightClickInfo | null>(null);
	let commentEditorInfo = $state<HighlightClickInfo | null>(null);
	let footnotePreviewInfo = $state<ReaderFootnotePreviewInfo | null>(null);
	let referencePopoverInfo = $state<HighlightClickInfo | null>(null);
	let referencePopoverStats = $state<ReferenceStats | null>(null);
	let commentEditorDraft = $state('');
	let commentEditorSaving = $state(false);
	const SCROLLED_NAV_FRAME_INSET_VAR = '--epub-scrolled-side-nav-frame-inset-end';
	const SCROLLED_NAV_SCROLLBAR_VAR = '--epub-scrolled-side-nav-scrollbar-width';
	let excerptSettings = $state<EpubExcerptSettings>({
		...DEFAULT_EPUB_EXCERPT_SETTINGS,
	});
	let trackedHighlightSourceFiles = new Set<string>();
	let vaultEventRefs: EventRef[] = [];
	let pendingLoadedHighlights: ReaderHighlight[] | null = null;
	let highlightReloadToken = 0;
	let annotationRevision = $state(0);
	let bookmarkRevision = $state(0);
	let migratedLocationBookIds = new Set<string>();
	let migratingLocationBookId: string | null = null;
	let referenceBadgeClickCleanup: (() => void) | null = null;
	const sourceLocateOverlay = getSourceLocateOverlayService();
	const sourceNavigationService = untrack(() => new SourceNavigationService(app));

	type ReaderNavigationIntent = {
		cfi?: string;
		href?: string;
		text?: string;
		flashStyle?: FlashStyle;
		showLocateOverlay?: boolean;
	};

	// IR/navigation buffer: store navigation intent until the reader is ready
	let pendingIRNav = $state<ReaderNavigationIntent | null>(null);
	let transientStatusTimer: ReturnType<typeof setTimeout> | null = null;
	let deferredHighlightReloadTimer: ReturnType<typeof setTimeout> | null = null;
	let componentDisposed = false;
	let activeBookLoadToken = 0;
	let remainingReadingTimeRequestToken = 0;

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				// /skip innerHTML is used to clear the trusted icon container before setIcon rerenders it
				node.replaceChildren();
				setIcon(node, newName);
			}
		};
	}

	let settings = $state<EpubReaderSettings>({
		lineHeight: getDefaultReaderLineHeight(),
		letterSpacing: 0,
		pageMargin: getDefaultReaderPageMargin(),
		viewportSidePadding: Platform.isMobile ? 18 : 24,
		theme: 'default',
		widthMode: getDefaultReaderWidthMode(),
		layoutMode: 'paginated',
		flowMode: getDefaultReaderFlowMode(),
		showScrolledSideNav: true,
		footnoteClickAction: 'preview',
		showTopSticker: getDefaultShowTopSticker(),
		topStickerLayout: getDefaultTopStickerLayout(),
		topStickerWiggleEnabled: true,
		paragraphModeEnabled: false,
		paragraphModeFontSize: 'medium',
		paragraphModeFontScale: 100,
		paragraphModeSurfaceStyle: 'spotlight',
		paragraphModeTransitionStyle: 'settle',
	});

	const paragraphTransitionStyleOptions: Array<{
		value: EpubParagraphModeTransitionStyle;
		labelKey: string;
	}> = [
		{ value: 'steady', labelKey: 'epub.reader.paragraphMode.transitionStyleSteady' },
		{ value: 'fade', labelKey: 'epub.reader.paragraphMode.transitionStyleFade' },
		{ value: 'settle', labelKey: 'epub.reader.paragraphMode.transitionStyleSettle' },
		{ value: 'slide', labelKey: 'epub.reader.paragraphMode.transitionStyleSlide' },
	];
	let hostTheme = $state<'light' | 'dark'>(
		untrack(() => (UnifiedThemeManager.getInstance().isDarkMode() ? 'dark' : 'light'))
	);

	function isMobileReader(): boolean {
		return Platform.isMobile;
	}

	function getReaderDeviceKind(): EpubReaderSettingsDeviceKind {
		return isMobileReader() ? 'mobile' : 'desktop';
	}

	function getDefaultReaderSettings(): EpubReaderSettings {
		return getDefaultEpubReaderSettings(getReaderDeviceKind());
	}

	function hasReadingProgressCapability(): boolean {
		return canUseEpubReadingProgress(app);
	}

	function hasParagraphModeCapability(): boolean {
		return canUseEpubParagraphMode(app);
	}

	function hasExcerptNotesCapability(): boolean {
		return canUseEpubExcerptNotes(app);
	}

	function hasStyledExcerptCapability(): boolean {
		return canUseEpubStyledExcerpts(app);
	}

	function hasSourceLocationCapability(): boolean {
		return canUseEpubSourceLocation(app);
	}

	function hasCanvasExcerptCapability(): boolean {
		return canUseEpubCanvasExcerpts(app);
	}

	function hasFootnotePreviewCapability(): boolean {
		return canUseEpubFootnotePreview(app);
	}

	function hasChapterExportCapability(): boolean {
		return canUseEpubChapterExport(app);
	}

	function isPremiumFeaturePreviewEnabled(): boolean {
		return premiumFeaturePreviewEnabled;
	}

	function getPremiumFeatureEntryTitle(baseTitle: string, featureId: string): string {
		return PremiumFeatureGuard.getInstance().getFeatureEntryTitle(baseTitle, featureId, {
			page: 'epub-reader',
		});
	}

	function getReadingPositionLabel(percent: number): string {
		return t('epub.reader.readingPosition', { percent: Math.round(percent) });
	}

	function closePremiumFeaturePreview(): void {
		premiumFeaturePreviewFeatureId = null;
	}

	function openPremiumFeaturePreview(featureId: string): void {
		const normalizedFeatureId = String(featureId || '').trim();
		if (!normalizedFeatureId) {
			return;
		}
		clearParagraphModeSelection();
		highlightToolbarInfo = null;
		closeCommentEditor();
		footnotePreviewInfo = null;
		exportNotesPopoverOpen = false;
		typographyPopoverOpen = false;
		premiumFeaturePreviewFeatureId = normalizedFeatureId;
	}

	function requestParagraphModeFeatureAccess(): boolean {
		if (hasParagraphModeCapability()) {
			return true;
		}
		if (isPremiumFeaturePreviewEnabled()) {
			openPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE);
			return false;
		}
		return ensureEpubPremiumFeature(
			app,
			PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE,
			t('epub.reader.paragraphModeFeatureNotice')
		);
	}

	function normalizeFootnoteClickActionForAccess(
		action: EpubReaderSettings['footnoteClickAction'] | undefined
	): EpubReaderSettings['footnoteClickAction'] {
		const normalizedAction = action === 'navigate' || action === 'preview' ? action : 'preview';
		return normalizedAction === 'preview' && !hasFootnotePreviewCapability()
			? 'navigate'
			: normalizedAction;
	}

	function normalizeReaderSettings(readerSettings: EpubReaderSettings): EpubReaderSettings {
		const normalizedSettings = normalizeEpubReaderSettingsForDevice(getReaderDeviceKind(), {
			...readerSettings,
			footnoteClickAction: normalizeFootnoteClickActionForAccess(readerSettings.footnoteClickAction),
		});

		return normalizedSettings;
	}

	function setError(message: string) {
		clearTransientStatus();
		errorMsg = message;
		loading = false;
	}

	function clearTransientStatus() {
		if (transientStatusTimer) {
			clearTimeout(transientStatusTimer);
			transientStatusTimer = null;
		}
		transientStatusText = '';
	}

	function showTransientStatus(message: string, durationMs = 2200) {
		if (transientStatusTimer) {
			clearTimeout(transientStatusTimer);
			transientStatusTimer = null;
		}
		transientStatusText = message;
		if (durationMs > 0) {
			transientStatusTimer = setTimeout(() => {
				transientStatusTimer = null;
				transientStatusText = '';
			}, durationMs);
		}
	}

	function clampReaderSetting(value: number, min: number, max: number, digits = 2): number {
		const clamped = Math.min(Math.max(value, min), max);
		return Number(clamped.toFixed(digits));
	}

	function openTypographyPanel() {
		typographyPopoverOpen = true;
	}

	function closeTypographyPanel() {
		typographyPopoverOpen = false;
	}

	function clearParagraphModeSelection(): void {
		paragraphModeSelection?.clear?.();
		paragraphModeSelection = null;
	}

	function updateParagraphModeAnchorParagraphId(location: { paragraphs: ReaderParagraph[]; currentIndex: number } | null): void {
		const paragraph = location?.paragraphs?.[location.currentIndex];
		paragraphModeAnchorParagraphId = paragraph?.id || '';
	}

	async function persistParagraphModeReadingPositionFromLocation(): Promise<void> {
		const currentBook = book;
		const location = paragraphModeLocation;
		if (!currentBook || !location || location.paragraphs.length === 0) {
			return;
		}
		const activeIndex = Math.max(0, Math.min(location.currentIndex, location.paragraphs.length - 1));
		const paragraph = location.paragraphs[activeIndex];
		if (!paragraph?.id || !paragraph.cfiRange) {
			return;
		}
		const currentPosition = readerService.getCurrentPosition();
		const payload: EpubParagraphModeReadingPosition = {
			bookId: currentBook.id,
			filePath: currentBook.filePath,
			bookTitle: currentBook.metadata.title || '',
			chapterTitle: paragraph.chapterTitle || readerService.getCurrentChapterTitle() || '',
			chapterHref: paragraph.chapterHref || readerService.getCurrentChapterHref?.() || '',
			chapterIndex: paragraph.chapterIndex,
			cfi: paragraph.cfiRange,
			percent: Number.isFinite(currentPosition.percent) ? currentPosition.percent : 0,
			paragraphId: paragraph.id,
			paragraphIndex: activeIndex,
			paragraphTextPreview: paragraph.text.slice(0, 160),
			savedAt: Date.now(),
		};
		await storageService.saveParagraphModeReadingPosition(payload);
	}

	async function persistParagraphModeReadingProgress(): Promise<void> {
		await persistParagraphModeReadingPositionFromLocation();
		const currentBook = book;
		if (!currentBook?.id || !hasReadingProgressCapability()) {
			return;
		}
		const currentPosition = readerService.getCurrentPosition();
		if (!currentPosition?.cfi) {
			return;
		}
		readerService.flushReadingPace?.();
		const readingStats = readerService.getReadingStats?.() ?? currentBook.readingStats;
		if (readingStats) {
			currentBook.readingStats = readingStats;
		}
		currentBook.currentPosition = currentPosition;
		await storageService.saveProgress(currentBook.id, currentPosition, readingStats);
		await syncReadingReferencePointFromAutoSave(currentPosition);
	}

	async function showParagraphExitAnchor(paragraph: ReaderParagraph): Promise<void> {
		if (!paragraph.cfiRange || typeof readerService.navigateAndHighlight !== 'function') {
			return;
		}
		const anchorText = paragraph.text.slice(0, 120);
		try {
			await readerService.navigateAndHighlight({
				cfi: paragraph.cfiRange,
				text: anchorText,
				flashStyle: 'highlight',
			});
			window.setTimeout(() => {
				const rect = readerService.getNavigationTargetRect?.({
					cfi: paragraph.cfiRange,
					text: anchorText,
				});
				if (rect) {
					sourceLocateOverlay.showAtRect(rect, {
						label: t('epub.reader.paragraphMode.exitAnchor'),
						icon: 'bookmark',
						durationMs: 3200,
					});
				}
			}, 80);
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to show paragraph mode exit anchor:', error);
		}
	}

	async function exitParagraphModeToMainReader(options?: {
		persist?: boolean;
		disableSetting?: boolean;
		showExitAnchor?: boolean;
		notifySaved?: boolean;
	}): Promise<void> {
		const activeLocation = paragraphModeLocation;
		const activeIndex = activeLocation?.currentIndex ?? 0;
		const activeParagraph = activeLocation?.paragraphs?.[activeIndex];
		if (options?.persist !== false && activeParagraph) {
			try {
				await persistParagraphModeReadingProgress();
				if (options?.notifySaved) {
					showTransientStatus(t('epub.reader.paragraphMode.positionSaved'), 2200);
					new Notice(t('epub.reader.paragraphMode.positionSaved'));
				}
			} catch (error) {
				logger.warn('[EpubReaderApp] Failed to persist paragraph mode reading progress on exit:', error);
			}
		}
		clearParagraphModeSelection();
		paragraphModeLocation = null;
		paragraphModeAnchorParagraphId = '';
		await setParagraphModeImmersive(false);
		if (options?.disableSetting !== false && settings.paragraphModeEnabled) {
			applyAndPersistReaderSettings({
				...settings,
				paragraphModeEnabled: false,
			});
		}
		if (options?.showExitAnchor !== false && activeParagraph?.cfiRange) {
			await showParagraphExitAnchor(activeParagraph);
		}
	}

	function setParagraphModeImmersiveClass(active: boolean): void {
		document.body.classList.toggle('weave-epub-immersive-paragraph-mode', active);
		document.documentElement.classList.toggle('weave-epub-immersive-paragraph-mode', active);
	}

	async function setParagraphModeImmersive(active: boolean): Promise<void> {
		if (paragraphModeImmersive === active) {
			return;
		}
		paragraphModeImmersive = active;
		setParagraphModeImmersiveClass(active);
		if (active) {
			try {
				const fullscreenHost = document.documentElement;
				if (document.fullscreenElement !== fullscreenHost) {
					await fullscreenHost.requestFullscreen?.();
				}
			} catch (error) {
				logger.warn('[EpubReaderApp] Failed to enter immersive fullscreen paragraph mode:', error);
			}
			return;
		}
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen?.();
			}
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to exit immersive fullscreen paragraph mode:', error);
		}
	}

	function toggleParagraphModeImmersive(): void {
		void setParagraphModeImmersive(!paragraphModeImmersive);
	}

	function handleFullscreenChange(): void {
		const active = Boolean(document.fullscreenElement);
		if (!active && paragraphModeImmersive) {
			paragraphModeImmersive = false;
			setParagraphModeImmersiveClass(false);
		}
	}

	async function closeParagraphMode(options?: { persist?: boolean }): Promise<void> {
		await exitParagraphModeToMainReader({
			persist: options?.persist,
			disableSetting: options?.persist !== false,
			showExitAnchor: true,
			notifySaved: options?.persist !== false,
		});
	}

	async function refreshParagraphModeLocation(
		preferredIndex?: number,
		preferredParagraphId?: string
	): Promise<void> {
		if (!settings.paragraphModeEnabled || !readerReady || typeof readerService.getCurrentParagraphLocation !== 'function') {
			paragraphModeLocation = null;
			return;
		}
		paragraphModeBusy = true;
		try {
			const location = await readerService.getCurrentParagraphLocation({
				preferredIndex,
				preferredParagraphId,
			});
			if (!location || location.paragraphs.length === 0) {
				paragraphModeLocation = null;
				paragraphModeAnchorParagraphId = '';
				return;
			}
			paragraphModeLocation = location;
			updateParagraphModeAnchorParagraphId(location);
			await persistParagraphModeReadingProgress();
		} finally {
			paragraphModeBusy = false;
		}
	}

	async function setParagraphModeEnabled(enabled: boolean): Promise<void> {
		if (enabled && !requestParagraphModeFeatureAccess()) {
			return;
		}
		if (enabled === settings.paragraphModeEnabled) {
			if (enabled) {
				await refreshParagraphModeLocation(undefined, paragraphModeAnchorParagraphId || undefined);
			}
			return;
		}
		clearParagraphModeSelection();
		highlightToolbarInfo = null;
		closeCommentEditor();
		footnotePreviewInfo = null;
		referencePopoverInfo = null;
		referencePopoverStats = null;
		screenshotMode = false;
		if (!enabled) {
			await exitParagraphModeToMainReader({
				persist: true,
				disableSetting: true,
				showExitAnchor: true,
				notifySaved: false,
			});
			return;
		}
		applyAndPersistReaderSettings({
			...settings,
			paragraphModeEnabled: true,
		});
		const savedParagraphPosition = book
			? await storageService.loadParagraphModeReadingPosition(book.id)
			: null;
		if (savedParagraphPosition?.cfi) {
			try {
				await readerService.goToLocation(savedParagraphPosition.cfi);
			} catch (error) {
				logger.warn('[EpubReaderApp] Failed to restore paragraph mode reading position:', error);
			}
		}
		await refreshParagraphModeLocation();
		if (savedParagraphPosition?.paragraphId && paragraphModeLocation?.paragraphs?.length) {
			const restoredIndex = paragraphModeLocation.paragraphs.findIndex(
				(item) => item.id === savedParagraphPosition.paragraphId
			);
			if (restoredIndex >= 0) {
				await refreshParagraphModeLocation(restoredIndex);
			}
		}
	}

	function toggleParagraphMode(): void {
		void setParagraphModeEnabled(!settings.paragraphModeEnabled);
	}

	async function setParagraphModeTransitionStyle(nextStyle: EpubParagraphModeTransitionStyle): Promise<void> {
		if (nextStyle === settings.paragraphModeTransitionStyle) {
			return;
		}
		await updateReaderSettings({
			paragraphModeTransitionStyle: nextStyle,
		});
	}

	async function navigateParagraphRelative(direction: -1 | 1): Promise<void> {
		const currentLocation = paragraphModeLocation;
		if (!currentLocation || currentLocation.paragraphs.length === 0 || paragraphModeBusy) {
			return;
		}
		paragraphModeBusy = true;
		try {
			const targetIndex = currentLocation.currentIndex + direction;
			if (targetIndex < 0 || targetIndex >= currentLocation.paragraphs.length) {
				const targetChapterIndex = readerService.getCurrentChapterIndex() + direction;
				if (typeof readerService.getParagraphsForChapter !== 'function' || targetChapterIndex < 0) {
					return;
				}
				const nextChapterParagraphs = await readerService.getParagraphsForChapter(targetChapterIndex);
				if (nextChapterParagraphs.length === 0) {
					return;
				}
				const paragraph =
					direction > 0 ? nextChapterParagraphs[0] : nextChapterParagraphs[nextChapterParagraphs.length - 1];
				clearParagraphModeSelection();
				try {
					await readerService.goToLocation(paragraph.cfiRange);
				} catch (error) {
					logger.warn('[EpubReaderApp] Failed to navigate paragraph across chapters:', error);
				}
				await refreshParagraphModeLocation(direction > 0 ? 0 : nextChapterParagraphs.length - 1);
				return;
			}

			const paragraph = currentLocation.paragraphs[targetIndex];
			if (!paragraph) {
				return;
			}
			clearParagraphModeSelection();
			try {
				await readerService.goToLocation(paragraph.cfiRange);
			} catch (error) {
				logger.warn('[EpubReaderApp] Failed to navigate paragraph within chapter:', error);
			}
			await refreshParagraphModeLocation(targetIndex);
		} finally {
			paragraphModeBusy = false;
		}
	}

	async function handleParagraphOverlaySelectionChange(selection: {
		text: string;
		startOffset: number;
		endOffset: number;
		rect: DOMRect;
		rects: DOMRect[];
		clear: () => void;
	} | null): Promise<void> {
		if (!selection || !paragraphModeLocation || typeof readerService.resolveParagraphSelection !== 'function') {
			paragraphModeSelection = null;
			return;
		}

		const paragraph = paragraphModeLocation.paragraphs[paragraphModeLocation.currentIndex];
		if (!paragraph) {
			paragraphModeSelection = null;
			return;
		}

		const resolved = await readerService.resolveParagraphSelection(
			paragraph.id,
			selection.startOffset,
			selection.endOffset
		);
		if (!resolved?.cfiRange) {
			paragraphModeSelection = null;
			return;
		}

		paragraphModeSelection = {
			text: resolved.text || selection.text,
			cfiRange: resolved.cfiRange,
			rect: selection.rect,
			rects: selection.rects,
			clear: selection.clear,
		};
	}

	async function handleParagraphFootnoteActivate(info: {
		href: string;
		label?: string;
		pinned?: boolean;
		rect?: DOMRect;
	}): Promise<void> {
		if (typeof readerService.openParagraphFootnotePreview !== 'function' || !paragraphModeLocation) {
			return;
		}
		const paragraph = paragraphModeLocation.paragraphs[paragraphModeLocation.currentIndex];
		if (!paragraph?.id || !info?.href) {
			return;
		}
		try {
			await readerService.openParagraphFootnotePreview(paragraph.id, info.href, info.label, {
				pinned: info.pinned === true,
				rect: info.rect
					? {
							top: info.rect.top,
							left: info.rect.left,
							bottom: info.rect.bottom,
							right: info.rect.right,
							width: info.rect.width,
							height: info.rect.height,
						}
					: undefined,
			});
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to open paragraph footnote preview:', error);
		}
	}

	function dismissParagraphFootnotePreview(options?: { unpin?: boolean }): void {
		readerService.dismissParagraphFootnotePreview?.(options);
	}

	function handleParagraphHighlightActivate(info: {
		cfiRange: string;
		rect: DOMRect;
		rects: DOMRect[];
	}): void {
		if (!hasExcerptNotesCapability() || !readerService.getHighlightClickInfo) {
			return;
		}
		footnotePreviewInfo = null;
		referencePopoverInfo = null;
		referencePopoverStats = null;
		closeCommentEditor();
		highlightToolbarInfo = readerService.getHighlightClickInfo(info.cfiRange, 'highlight', {
			rect: {
				top: info.rect.top,
				left: info.rect.left,
				bottom: info.rect.bottom,
				right: info.rect.right,
				width: info.rect.width,
				height: info.rect.height,
			},
			rects: info.rects.map((rect) => ({
				top: rect.top,
				left: rect.left,
				bottom: rect.bottom,
				right: rect.right,
				width: rect.width,
				height: rect.height,
			})),
			anchorPoint: {
				x: info.rect.left + info.rect.width / 2,
				y: info.rect.top + info.rect.height / 2,
			},
		});
	}

	function applyReaderSettingsState(nextSettings: EpubReaderSettings, persist: boolean) {
		const normalizedSettings = normalizeReaderSettings(nextSettings);
		settings = normalizedSettings;
		readerService.setFootnoteClickAction?.(normalizedSettings.footnoteClickAction);
		onReaderSettingsLoaded?.(normalizedSettings);
		if (persist) {
			void storageService.saveReaderSettings(normalizedSettings);
		}
	}

	async function updateReaderSettings(patch: Partial<EpubReaderSettings>) {
		applyAndPersistReaderSettings({
			...settings,
			...patch,
		});
	}

	function previewReaderSettings(nextSettings: EpubReaderSettings) {
		applyReaderSettingsState(nextSettings, false);
	}

	function persistCurrentReaderSettings() {
		applyReaderSettingsState(settings, true);
	}

	function previewReaderLineHeight(value: string) {
		previewReaderSettings({
			...settings,
			lineHeight: clampReaderSetting(Number(value), 1.2, 2.4),
		});
	}

	function previewReaderLetterSpacing(value: string) {
		previewReaderSettings({
			...settings,
			letterSpacing: clampReaderSetting(Number(value), -0.02, 0.24, 3),
		});
	}

	function previewReaderPageMargin(value: string) {
		previewReaderSettings({
			...settings,
			pageMargin: clampReaderSetting(Number(value), 8, 96, 0),
		});
	}

	function setReaderWidthMode(mode: EpubReaderSettings['widthMode']) {
		if (settings.layoutMode === 'double' && mode !== 'fit') {
			return;
		}
		applyAndPersistReaderSettings({
			...settings,
			widthMode: mode,
		});
	}

	function setFootnoteClickAction(action: EpubReaderSettings['footnoteClickAction']) {
		applyAndPersistReaderSettings({
			...settings,
			footnoteClickAction: action,
		});
	}

	function resetReaderTypographySettings() {
		applyAndPersistReaderSettings({
			...settings,
			lineHeight: getDefaultReaderLineHeight(),
			letterSpacing: 0,
			pageMargin: getDefaultReaderPageMargin(),
			widthMode: settings.layoutMode === 'double' ? 'fit' : getDefaultReaderWidthMode(),
			showScrolledSideNav: true,
			footnoteClickAction: 'preview',
			showTopSticker: getDefaultShowTopSticker(),
			topStickerLayout: getDefaultTopStickerLayout(),
			topStickerWiggleEnabled: true,
			paragraphModeFontSize: 'medium',
			paragraphModeFontScale: 100,
			paragraphModeSurfaceStyle: 'spotlight',
			paragraphModeTransitionStyle: 'settle',
		});
	}

	function formatLetterSpacingValue(value: number): string {
		return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
	}

	function handleTypographyPointerDownOutside(event: MouseEvent) {
		if (!typographyPopoverOpen) {
			return;
		}
		const target = event.target as HTMLElement | null;
		if (target?.closest?.('.epub-settings-float')) {
			return;
		}
		closeTypographyPanel();
	}

	function updateReadingReferencePointState(point: EpubReadingReferencePoint | null) {
		readingReferencePoint = point;
		onReadingReferencePointChange?.(point);
	}

	function updateSessionReadingStartPercent(value: number | null | undefined) {
		sessionReadingStartPercent = typeof value === 'number' && Number.isFinite(value)
			? Math.max(0, value)
			: null;
	}

	async function refreshRemainingReadingTimeEstimate() {
		const requestToken = ++remainingReadingTimeRequestToken;
		if (!book || !readerReady || typeof readerService.getRemainingReadingTimeEstimate !== 'function') {
			remainingReadingTime = {};
			return;
		}

		try {
			const estimate = await readerService.getRemainingReadingTimeEstimate();
			if (componentDisposed || requestToken !== remainingReadingTimeRequestToken) {
				return;
			}
			remainingReadingTime = estimate || {};
		} catch (error) {
			if (componentDisposed || requestToken !== remainingReadingTimeRequestToken) {
				return;
			}
			logger.warn('[EpubReaderApp] Failed to refresh remaining reading time estimate:', error);
			remainingReadingTime = {};
		}
	}

	function isStaleBookLoad(loadToken: number): boolean {
		return componentDisposed || loadToken !== activeBookLoadToken;
	}

	function normalizeTrackedVaultPath(path?: string | null): string {
		return normalizePath(String(path || '').trim());
	}

	function rememberHighlightSourcePath(path?: string | null) {
		const normalizedPath = normalizeTrackedVaultPath(path);
		if (!normalizedPath) {
			return;
		}
		trackedHighlightSourceFiles.add(normalizedPath);
	}

	function collectTrackedHighlightSourceFiles(highlights: ReaderHighlight[]): Set<string> {
		const trackedPaths = new Set<string>();
		for (const highlight of highlights) {
			const primarySourceFile = normalizeTrackedVaultPath(highlight.sourceFile);
			if (primarySourceFile) {
				trackedPaths.add(primarySourceFile);
			}
			for (const locator of highlight.sourceLocators || []) {
				const locatorSourceFile = normalizeTrackedVaultPath(locator?.sourceFile);
				if (locatorSourceFile) {
					trackedPaths.add(locatorSourceFile);
				}
			}
		}
		return trackedPaths;
	}

	function getBoundCanvasPath(): string | null {
		const canvasPath = normalizeTrackedVaultPath(canvasService.getCanvasPath());
		return canvasPath || null;
	}

	function queueHighlightReload(delayMs = 350) {
		if (componentDisposed) {
			return;
		}
		if (deferredHighlightReloadTimer) {
			clearTimeout(deferredHighlightReloadTimer);
		}
		deferredHighlightReloadTimer = setTimeout(() => {
			deferredHighlightReloadTimer = null;
			if (!componentDisposed) {
				void reloadHighlights();
			}
		}, delayMs);
	}

	function getEpubActionHost() {
		return resolveEpubHost(app);
	}

	function getContinuousReadingPositionAutoSaveConfig(): { enabled: boolean; pages: number } {
		const host = getEpubActionHost() as {
			settings?: {
				continuousReadingPositionAutoSaveEnabled?: unknown;
				continuousReadingPositionAutoSavePages?: unknown;
			};
		} | null;

		return {
			enabled: normalizeContinuousReadingPositionAutoSaveEnabled(
				host?.settings?.continuousReadingPositionAutoSaveEnabled
			),
			pages: normalizeContinuousReadingPositionAutoSavePages(
				host?.settings?.continuousReadingPositionAutoSavePages
			),
		};
	}

	async function persistCurrentReadingProgress(targetBook: EpubBook | null = book): Promise<void> {
		if (!hasReadingProgressCapability()) {
			await storageService.flushPendingProgress();
			return;
		}
		if (!targetBook?.id) {
			await storageService.flushPendingProgress();
			return;
		}

		const fallbackPosition = targetBook.currentPosition;
		const livePosition = readerReady ? readerService.getCurrentPosition() : fallbackPosition;
		const currentCfi = String(
			livePosition?.cfi || readerService.getCurrentCFI() || fallbackPosition?.cfi || ''
		).trim();

		const position = currentCfi
			? {
				chapterIndex:
					typeof livePosition?.chapterIndex === 'number'
						? livePosition.chapterIndex
						: fallbackPosition?.chapterIndex || 0,
				cfi: currentCfi,
				percent:
					typeof livePosition?.percent === 'number' && Number.isFinite(livePosition.percent)
						? livePosition.percent
						: fallbackPosition?.percent || 0,
			}
			: fallbackPosition;

		if (!position?.cfi) {
			await storageService.flushPendingProgress();
			return;
		}

		readerService.flushReadingPace?.();
		const readingStats = readerService.getReadingStats?.() ?? targetBook.readingStats;
		if (readingStats) {
			targetBook.readingStats = readingStats;
		}
		targetBook.currentPosition = position;
		await storageService.saveProgress(targetBook.id, position, readingStats);
		await storageService.flushPendingProgress();
	}

	const BOOKSHELF_DATA_CHANGED_EVENT = EPUB_RUNTIME.events.bookshelfDataChanged;
	const BOOKSHELF_REFRESH_REQUEST_EVENT = EPUB_RUNTIME.events.bookshelfRefreshRequest;
	const EXCERPT_SETTINGS_CHANGED_EVENT = EPUB_RUNTIME.events.excerptSettingsChanged;
	const EPUB_PENDING_NAVIGATION_KEY = EPUB_RUNTIME.globals.pendingNavigationKey;
	const EPUB_NAVIGATE_EVENT = EPUB_RUNTIME.events.navigate;
	const LEGACY_EPUB_PENDING_NAVIGATION_KEY = EPUB_PENDING_NAVIGATION_KEY === '__weaveEpubStandalonePendingNav'
		? '__weaveEpubPendingNav'
		: null;
	const LEGACY_EPUB_NAVIGATE_EVENT = EPUB_NAVIGATE_EVENT === 'WeaveEpubStandalone:epub-navigate'
		? 'Weave:epub-navigate'
		: null;

	function notifyBookshelfChanged() {
		window.dispatchEvent(new CustomEvent(BOOKSHELF_DATA_CHANGED_EVENT));
		window.dispatchEvent(new CustomEvent(BOOKSHELF_REFRESH_REQUEST_EVENT));
	}

	async function openScanImportModal(scanEntries?: Awaited<ReturnType<typeof storageService.loadScanIndex>>) {
		const entries = scanEntries ?? await storageService.loadScanIndex();
		if (entries.length === 0) {
			new Notice(t('epub.bookshelf.vaultScanEmpty'));
			return;
		}

		const membership = await storageService.loadBookshelfMembership();
		const { EpubBookshelfImportModal } = await import('../modals/EpubBookshelfImportModal');
		const modal = new EpubBookshelfImportModal(app, {
			entries,
			membership,
			title: t('epub.bookshelf.vaultScanTitle'),
			onConfirm: async (paths: string[]) => {
				const addedEntries = await storageService.addBooksToBookshelf(paths);
				if (addedEntries.length === 0) {
					new Notice(t('epub.bookshelf.vaultScanAlreadyAdded'));
					return;
				}
				notifyBookshelfChanged();
				new Notice(t('epub.bookshelf.vaultScanAdded', { count: addedEntries.length }));
			},
		});
		modal.open();
	}

	async function scanVaultAndPromptImport() {
		try {
			const scanEntries = await storageService.scanVaultBooks();
			notifyBookshelfChanged();

			if (scanEntries.length === 0) {
				new Notice(t('epub.bookshelf.vaultScanEmpty'));
				return;
			}

			await openScanImportModal(scanEntries);
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to scan vault EPUB files:', error);
			new Notice(t('epub.bookshelf.vaultScanFailed'));
		}
	}

	async function requestBookshelfRefresh() {
		try {
			const result = await storageService.pruneMissingBooks();
			notifyBookshelfChanged();
			new Notice(
				result.removedPaths.length > 0
					? t('epub.bookshelf.refreshSuccessWithCleanup', { count: result.removedPaths.length })
					: t('epub.bookshelf.refreshSuccess')
			);
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to refresh EPUB bookshelf:', error);
			new Notice(t('epub.bookshelf.refreshFailed'));
		}
	}

	function getCreateCardPlugin(): { openCreateCardModal?: (input: { initialContent: string }) => Promise<void> } | null {
		const host = getEpubActionHost();
		if (!host?.openCreateCardModal) {
			new Notice(t('epub.reader.createCardUnavailable'));
			return null;
		}
		return host;
	}

	async function extractContentToCard(
		content: string,
		successMessage: string,
		errorLogLabel: string,
		failureMessage: string,
		onSuccess?: () => void
	) {
		try {
			const plugin = getCreateCardPlugin();
			if (!plugin?.openCreateCardModal) return;

			await plugin.openCreateCardModal({
				initialContent: `${content}\n---div---\n\n`
			});
			onSuccess?.();
			new Notice(successMessage);
		} catch (error) {
			logger.error(`[EpubReaderApp] ${errorLogLabel}:`, error);
			new Notice(failureMessage);
		}
	}

	function getMarkdownExportHost(): EpubHostCapabilities | null {
		const host = getEpubActionHost();
		if (!host) {
			return null;
		}
		return host;
	}

	function hasCreateReadingPointCapability(): boolean {
		return Boolean(getEpubActionHost()?.openIRReadingPointFromExternalSelection);
	}

	function hasScheduleChapterForIncrementalReadingCapability(): boolean {
		return Boolean(getEpubActionHost()?.scheduleEpubChapterForIncrementalReading);
	}

	function hasMarkIRResumePointCapability(): boolean {
		return Boolean(getEpubActionHost()?.markEpubResumePointFromReader);
	}

	function getIncrementalReadingHost(): EpubHostCapabilities | null {
		const host = getEpubActionHost();
		if (!host) {
			return null;
		}
		return host;
	}

	function applyAndPersistReaderSettings(nextSettings: EpubReaderSettings) {
		applyReaderSettingsState(nextSettings, true);
	}

	function canReuseExistingBook(existingBook: EpubBook | null, vaultFile: TFile): existingBook is EpubBook {
		if (!existingBook) {
			return false;
		}

		const storedSize = typeof existingBook.sourceSize === 'number' && Number.isFinite(existingBook.sourceSize)
			? existingBook.sourceSize
			: null;
		const storedMtime = typeof existingBook.sourceMtime === 'number' && Number.isFinite(existingBook.sourceMtime)
			? existingBook.sourceMtime
			: null;

		if (storedSize === null && storedMtime === null) {
			return true;
		}

		if (storedSize !== null && storedSize !== vaultFile.stat.size) {
			return false;
		}

		if (storedMtime !== null && storedMtime !== vaultFile.stat.mtime) {
			return false;
		}

		return true;
	}

	async function loadBook() {
		const loadToken = ++activeBookLoadToken;
		const targetFilePath = filePath;
		const previousBook = book;
		if (previousBook?.id) {
			await persistCurrentReadingProgress(previousBook);
		}
		loading = true;
		errorMsg = '';
		readerReady = false;
		pendingLoadedHighlights = null;
		highlightToolbarInfo = null;
		commentEditorInfo = null;
		footnotePreviewInfo = null;
		commentEditorDraft = '';
		commentEditorSaving = false;
		updateReadingReferencePointState(null);
		updateSessionReadingStartPercent(null);
		remainingReadingTime = {};
		remainingReadingTimeRequestToken += 1;
		try {
			const vaultFile = app.vault.getAbstractFileByPath(targetFilePath);
			if (!isSupportedBookFile(vaultFile)) {
				await storageService.pruneMissingBooks();
				throw new Error(t('epub.bookshelf.notFoundRemoved'));
			}

			const existingBook = await storageService.findBookByFilePath(targetFilePath);
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			const reusableBook = canReuseExistingBook(existingBook, vaultFile) ? existingBook : null;
			if (existingBook && !reusableBook) {
				await storageService.removeBookByFilePath(targetFilePath);
				showTransientStatus(t('epub.reader.fileUpdatedRebuilt'), 3200);
			}
			const loadedBook = await Promise.race([
				readerService.loadEpub(targetFilePath, reusableBook?.id),
				new Promise<never>((_, reject) => {
					window.setTimeout(() => reject(new Error(t('epub.reader.loadTimeout'))), 15000);
				})
			]);

			if (isStaleBookLoad(loadToken)) {
				return;
			}

			if (reusableBook) {
				loadedBook.readingStats = reusableBook.readingStats;
			}

			const migratedProgress = hasReadingProgressCapability()
				? await storageService.loadProgress(loadedBook.id)
				: null;
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			if (hasReadingProgressCapability() && migratedProgress) {
				loadedBook.currentPosition = migratedProgress;
				await readerService.setRestoredPosition?.(migratedProgress);
			} else if (hasReadingProgressCapability() && reusableBook?.currentPosition) {
				loadedBook.currentPosition = reusableBook.currentPosition;
				await readerService.setRestoredPosition?.(reusableBook.currentPosition);
			}

			const sourceEntry = await storageService.ensureSourceIdentity(targetFilePath, {
				preferredSourceId: reusableBook?.sourceId,
			});
			if (sourceEntry) {
				loadedBook.sourceId = sourceEntry.sourceId;
				loadedBook.sourceFingerprint = sourceEntry.sourceFingerprint;
				loadedBook.sourceSize = sourceEntry.sourceSize;
				loadedBook.sourceMtime = sourceEntry.sourceMtime;
				loadedBook.filePath = sourceEntry.filePath;
			} else if (reusableBook?.sourceId) {
				loadedBook.sourceId = reusableBook.sourceId;
			}

			book = loadedBook;
			currentChapterIndex = loadedBook.currentPosition?.chapterIndex ?? 0;
			updateSessionReadingStartPercent(loadedBook.currentPosition?.percent ?? 0);
			showNextChapterAction = false;
			bookmarkRevision = 0;
			await storageService.saveBook(loadedBook);
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			onTitleChange?.(loadedBook.metadata.title);
			await refreshReadingReferencePointState(loadedBook.id);
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			epubActiveDocumentStore.setSharedState({ filePath: targetFilePath, book: loadedBook });
			syncAsActiveEpubDocument();
			await initCanvasBinding();
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			void reloadHighlights();
		} catch (error) {
			if (isStaleBookLoad(loadToken)) {
				return;
			}
			logger.error('[EpubReaderApp] Failed to load EPUB:', error);
			setError(`${error instanceof Error ? error.message : t('epub.reader.unknownError')}`);
		} finally {
			if (!isStaleBookLoad(loadToken)) {
				loading = false;
			}
		}
	}

	async function refreshReadingReferencePointState(bookId?: string | null) {
		if (!hasReadingProgressCapability()) {
			updateReadingReferencePointState(null);
			return;
		}
		const normalizedBookId = String(bookId || '').trim();
		if (!normalizedBookId) {
			updateReadingReferencePointState(null);
			return;
		}

		try {
			const point = await storageService.loadReadingReferencePoint(normalizedBookId);
			updateReadingReferencePointState(point);
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to load reading reference point:', error);
			updateReadingReferencePointState(null);
		}
	}

	function toggleTutorial() {
		tutorialVisible = !tutorialVisible;
	}

	async function addBookmark() {
		if (!book) {
			new Notice(t('epub.reader.bookNotLoaded'));
			return;
		}
		try {
			const pos = readerService.getCurrentPosition();
			let currentCfi = EpubLinkService.normalizeCfi(
				pos.cfi || readerService.getCurrentCFI() || book.currentPosition?.cfi || ''
			);
			if (!currentCfi) {
				new Notice(t('epub.reader.readingPositionUnavailable'));
				return;
			}

			if (typeof readerService.canonicalizeLocation === 'function') {
				const canonicalCfi = await readerService.canonicalizeLocation(currentCfi);
				if (canonicalCfi) {
					currentCfi = canonicalCfi;
				}
			}

			const chapterTitle = readerService.getCurrentChapterTitle() || getReadingPositionLabel(pos.percent);
			const result = await bookmarkService.addBookmark(book, {
				cfi: currentCfi,
				chapterIndex: pos.chapterIndex,
				percent: pos.percent,
				chapterTitle,
				pageNumber: settings.flowMode !== 'scrolled' && paginationInfo.currentPage > 0
					? paginationInfo.currentPage
					: undefined,
				totalPages: settings.flowMode !== 'scrolled' && paginationInfo.totalPages > 0
					? paginationInfo.totalPages
					: undefined,
				createdAt: Date.now(),
				preview: chapterTitle,
			});
			bookmarkRevision += 1;
			epubActiveDocumentStore.setSharedState({ bookmarkRevision });
			new Notice(result.created ? t('epub.reader.bookmarkAdded') : t('epub.reader.bookmarkExists'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to add bookmark:', error);
			new Notice(t('epub.reader.bookmarkActionFailed'));
		}
	}

	async function deleteBookmarkById(bookmarkId: string): Promise<boolean> {
		if (!book) {
			new Notice(t('epub.reader.bookNotLoaded'));
			return false;
		}

		try {
			const deleted = await bookmarkService.deleteBookmark(book, bookmarkId);
			if (!deleted) {
				new Notice(t('epub.reader.bookmarkMissing'));
				return false;
			}
			bookmarkRevision += 1;
			epubActiveDocumentStore.setSharedState({ bookmarkRevision });
			new Notice(t('epub.reader.bookmarkDeleted'));
			return true;
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to delete bookmark:', error);
			new Notice(t('epub.reader.bookmarkDeleteFailed'));
			return false;
		}
	}

	async function saveLastOpenBookmark() {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_READING_PROGRESS, t('epub.reader.readingProgressFeatureNotice'))) {
			return;
		}
		if (!book) {
			new Notice(t('epub.reader.bookNotLoaded'));
			return;
		}

		try {
			const currentPosition = readerService.getCurrentPosition();
			let currentCfi = EpubLinkService.normalizeCfi(
				currentPosition.cfi || readerService.getCurrentCFI() || book.currentPosition?.cfi || ''
			);
			if (!currentCfi) {
				new Notice(t('epub.reader.readingPositionUnavailable'));
				return;
			}

			if (typeof readerService.canonicalizeLocation === 'function') {
				const canonicalCfi = await readerService.canonicalizeLocation(currentCfi);
				if (canonicalCfi) {
					currentCfi = canonicalCfi;
				}
			}

			const chapterTitle = readerService.getCurrentChapterTitle()
				|| getReadingPositionLabel(currentPosition.percent);
			const bookmark: EpubLastOpenBookmark = {
				chapterIndex: currentPosition.chapterIndex,
				cfi: currentCfi,
				percent: currentPosition.percent,
				title: chapterTitle,
				preview: chapterTitle,
				savedAt: Date.now(),
			};

			await storageService.saveLastOpenBookmark(book.id, bookmark);
			showTransientStatus(t('epub.reader.lastReadingPointSavedStatus', { title: chapterTitle }), 2600);
			new Notice(t('epub.reader.lastReadingPointSaved'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to save last open bookmark:', error);
			new Notice(t('epub.reader.lastReadingPointSaveFailed'));
		}
	}

	async function buildReadingReferencePoint(position?: ReadingPosition | null): Promise<EpubReadingReferencePoint | null> {
		if (!book) {
			return null;
		}

		const currentPosition = position ?? readerService.getCurrentPosition();
		let currentCfi = EpubLinkService.normalizeCfi(
			currentPosition.cfi || readerService.getCurrentCFI() || book.currentPosition?.cfi || ''
		);
		if (!currentCfi) {
			return null;
		}

		if (typeof readerService.canonicalizeLocation === 'function') {
			const canonicalCfi = await readerService.canonicalizeLocation(currentCfi);
			if (canonicalCfi) {
				currentCfi = canonicalCfi;
			}
		}

		const percent =
			typeof currentPosition.percent === 'number' && Number.isFinite(currentPosition.percent)
				? currentPosition.percent
				: book.currentPosition?.percent || 0;
		const chapterIndex =
			typeof currentPosition.chapterIndex === 'number' && Number.isFinite(currentPosition.chapterIndex)
				? currentPosition.chapterIndex
				: book.currentPosition?.chapterIndex || 0;
		const chapterTitle = readerService.getCurrentChapterTitle()
			|| getReadingPositionLabel(percent);

		return {
			chapterIndex,
			cfi: currentCfi,
			percent,
			title: chapterTitle,
			savedAt: Date.now(),
		};
	}

	async function saveReadingReferencePoint() {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_READING_PROGRESS, t('epub.reader.readingProgressFeatureNotice'))) {
			return;
		}
		if (!book) {
			new Notice(t('epub.reader.bookNotLoaded'));
			return;
		}

		try {
			const point = await buildReadingReferencePoint();
			if (!point) {
				new Notice(t('epub.reader.readingPositionUnavailable'));
				return;
			}

			await storageService.saveReadingReferencePoint(book.id, point);
			updateReadingReferencePointState(point);
			showTransientStatus(t('epub.reader.referenceSavedStatus', { title: point.title }), 2600);
			new Notice(t('epub.reader.referenceSaved'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to save reading reference point:', error);
			new Notice(t('epub.reader.referenceSaveFailed'));
		}
	}

	async function syncReadingReferencePointFromAutoSave(position: ReadingPosition): Promise<void> {
		if (!hasReadingProgressCapability()) {
			return;
		}
		if (!book) {
			return;
		}

		try {
			const point = await buildReadingReferencePoint(position);
			if (!point) {
				return;
			}

			await storageService.saveReadingReferencePoint(book.id, point);
			updateReadingReferencePointState(point);
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to sync reading reference point from auto-saved reading progress:', error);
		}
	}

	async function goToReadingReferencePoint() {
		if (!readingReferencePoint?.cfi) {
			new Notice(t('epub.reader.referenceMissing'));
			return;
		}
		try {
			const referenceTitle = readingReferencePoint.title || t('epub.reader.referenceFallbackTitle');
			requestIRNavigation({
				cfi: readingReferencePoint.cfi,
				text: referenceTitle,
				flashStyle: 'highlight',
				showLocateOverlay: true,
			});
			showTransientStatus(t('epub.reader.referenceJumpedStatus', { title: referenceTitle }), 2200);
			new Notice(t('epub.reader.referenceJumped'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to jump to reading reference point:', error);
			new Notice(t('epub.reader.referenceJumpFailed'));
		}
	}

	async function clearReadingReferencePoint() {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_READING_PROGRESS, t('epub.reader.readingProgressFeatureNotice'))) {
			return;
		}
		if (!book) {
			new Notice(t('epub.reader.bookNotLoaded'));
			return;
		}
		try {
			await storageService.deleteReadingReferencePoint(book.id);
			updateReadingReferencePointState(null);
			showTransientStatus(t('epub.reader.referenceCleared'), 2200);
			new Notice(t('epub.reader.referenceCleared'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to clear reading reference point:', error);
			new Notice(t('epub.reader.referenceClearFailed'));
		}
	}

	function openReadingReferencePointMenu(event: MouseEvent | KeyboardEvent) {
		if (!readingReferencePoint) {
			void saveReadingReferencePoint();
			return;
		}
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(getReadingReferenceTitleText());
			item.setIcon('flag');
			item.setDisabled(true);
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t('epub.reader.referenceJumpMenu'));
			item.setIcon('locate-fixed');
			item.onClick(() => {
				void goToReadingReferencePoint();
			});
		});
		menu.addItem((item) => {
			item.setTitle(t('epub.reader.referenceUpdateMenu'));
			item.setIcon('flag');
			item.onClick(() => {
				void saveReadingReferencePoint();
			});
		});
		menu.addItem((item) => {
			item.setTitle(t('epub.reader.referenceClearMenu'));
			item.setIcon('trash-2');
			item.onClick(() => {
				void clearReadingReferencePoint();
			});
		});
		showMenuAtAnchor(menu, event);
	}

	async function applyAndPersistExcerptSettings(patch: Partial<EpubExcerptSettings>) {
		const nextExcerptSettings = {
			...excerptSettings,
			...patch,
		};
		excerptSettings = nextExcerptSettings;
		epubActiveDocumentStore.setSharedState({ excerptSettings: nextExcerptSettings });
		await storageService.saveExcerptSettings(nextExcerptSettings);
	}

	async function syncExcerptSettingsFromStorage() {
		try {
			const savedExcerptSettings = await storageService.loadExcerptSettings();
			excerptSettings = savedExcerptSettings;
			epubActiveDocumentStore.setSharedState({ excerptSettings: savedExcerptSettings });
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to sync excerpt settings:', error);
		}
	}

	function handleGlobalExcerptSettingsChanged(event: Event) {
		const detail = event instanceof CustomEvent ? event.detail : null;
		const nextExcerptSettings = detail?.settings;
		if (!nextExcerptSettings || typeof nextExcerptSettings !== 'object') {
			void syncExcerptSettingsFromStorage();
			return;
		}
		excerptSettings = nextExcerptSettings as EpubExcerptSettings;
		epubActiveDocumentStore.setSharedState({ excerptSettings });
	}

	function showSettingsMenu(evt: MouseEvent) {
		const menu = new Menu();
		const bookshelfSettingsHost = resolveEpubHost(app) as
			| ({ settings?: Record<string, unknown>; saveSettings?: () => Promise<void> })
			| null;
		const currentBookshelfDisplayMode = normalizeBookshelfDisplayMode(
			bookshelfSettingsHost?.settings?.bookshelfDisplayMode
		);

		const applyBookshelfDisplayMode = (mode: BookshelfDisplayMode) => {
			void (async () => {
				if (!bookshelfSettingsHost?.settings) {
					return;
				}
				bookshelfSettingsHost.settings.bookshelfDisplayMode = mode;
				bookshelfSettingsHost.settings.bookshelfAutoViewByLocationEnabled = mode === 'adaptive';
				if (typeof bookshelfSettingsHost.saveSettings === 'function') {
					await bookshelfSettingsHost.saveSettings();
				}
				window.dispatchEvent(new CustomEvent(EPUB_RUNTIME.events.bookshelfDisplaySettingsChanged, {
					detail: {
						enabled: mode === 'adaptive',
						mode,
					},
				}));
				new Notice(t('epub.bookshelf.switchDisplayMode', { mode: getBookshelfDisplayModeOption(mode).label }));
			})();
		};

		menu.addItem((item) => {
			item.setTitle(t('epub.reader.displayFeatures'));
			item.setIcon('library');
			const subMenu = (item as any).setSubmenu();

			for (const option of getBookshelfDisplayModeOptions()) {
				subMenu.addItem((subItem: any) => {
					subItem.setTitle(option.label);
					subItem.setIcon(option.icon);
					subItem.setChecked(currentBookshelfDisplayMode === option.mode);
					subItem.onClick(() => {
						applyBookshelfDisplayMode(option.mode);
					});
				});
			}
		});

		menu.addItem((item) => {
			item.setTitle(t('epub.reader.scanVault'));
			item.setIcon('scan-search');
			item.onClick(() => {
				void scanVaultAndPromptImport();
			});
		});

		menu.addItem((item) => {
			item.setTitle(t('epub.reader.refreshBookshelf'));
			item.setIcon('refresh-cw');
			item.onClick(() => {
				void requestBookshelfRefresh();
			});
		});

		menu.showAtMouseEvent(evt);
	}

	function handleLayoutModeChange(mode: EpubLayoutMode) {
		if (isMobileReader()) {
			mode = 'paginated';
		}
		applyAndPersistReaderSettings({
			...settings,
			layoutMode: mode,
			widthMode: mode === 'double' ? 'fit' : settings.widthMode,
			flowMode: 'paginated'
		});
	}

	function handleFlowModeChange(mode: EpubFlowMode) {
		applyAndPersistReaderSettings({
			...settings,
			layoutMode: mode === 'scrolled' ? 'paginated' : settings.layoutMode,
			flowMode: mode
		});
	}

	function handleScrolledSideNavToggle(enabled: boolean) {
		applyAndPersistReaderSettings({
			...settings,
			showScrolledSideNav: enabled
		});
	}

	function showBottomNav() {
		return settings.flowMode !== 'scrolled' || (!isMobileReader() && settings.showScrolledSideNav);
	}

	function useVerticalNav() {
		return settings.flowMode === 'scrolled';
	}

	function getBottomNavStatusText(): string | undefined {
		if (transientStatusText.trim()) {
			if (!useVerticalNav()) {
				return undefined;
			}
			return transientStatusText;
		}
		if (!useVerticalNav()) {
			return undefined;
		}
		if (!hasReadingProgressCapability()) {
			return undefined;
		}
		return `${Math.max(0, Math.round(readingProgress))}%`;
	}

	function getBottomNavStatusDetail(): string | undefined {
		if (useVerticalNav()) {
			return undefined;
		}
		const detail = transientStatusText.trim();
		return detail || undefined;
	}

	function formatRemainingReadingStickerValue(ms: number): string {
		const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
		if (totalMinutes < 60) {
			return t('epub.reader.minutesOnly', { count: totalMinutes });
		}
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return minutes > 0
			? t('epub.reader.hoursMinutes', { hours, minutes })
			: t('epub.reader.hoursOnly', { hours });
	}

	function getRemainingReadingStickerProps(): { valueText: string; labelText: string; titleText: string } | null {
		const chapterMs = remainingReadingTime.chapterMs;
		const bookMs = remainingReadingTime.bookMs;
		const targetMs = typeof chapterMs === 'number' && chapterMs > 0
			? chapterMs
			: typeof bookMs === 'number' && bookMs > 0
				? bookMs
				: undefined;
		if (!targetMs) {
			return null;
		}
		const labelText = typeof chapterMs === 'number' && chapterMs > 0
			? t('epub.reader.remainingChapter')
			: t('epub.reader.remainingBook');
		return {
			valueText: formatRemainingReadingStickerValue(targetMs),
			labelText,
			titleText: t('epub.reader.remainingTimeTitle', {
				label: labelText,
				value: formatRemainingReadingStickerValue(targetMs),
			}),
		};
	}

	function getReadingReferenceDeltaText(): string {
		if (sessionReadingStartPercent === null) {
			return '0%';
		}
		const delta = Math.round(readingProgress - sessionReadingStartPercent);
		return delta > 0 ? `+${delta}%` : `${delta}%`;
	}

	function getReadingReferenceDeltaPercent(): number {
		if (sessionReadingStartPercent === null) {
			return 0;
		}
		return readingProgress - sessionReadingStartPercent;
	}

	function getReadingReferenceStartText(): string {
		if (!readingReferencePoint) {
			return '';
		}
		return t('epub.reader.resumePointLabel', {
			percent: Math.max(0, Math.round(readingReferencePoint.percent)),
		});
	}

	function getReadingReferenceTitleText(): string {
		if (!readingReferencePoint) {
			return t('epub.reader.sessionDeltaLabel');
		}
		const currentDelta = getReadingReferenceDeltaText();
		const resumePercent = Math.max(0, Math.round(readingReferencePoint.percent));
		const title = String(
			readingReferencePoint.title || getReadingPositionLabel(resumePercent)
		).trim();
		return t('epub.reader.sessionDeltaTitle', {
			delta: currentDelta,
			percent: resumePercent,
			title,
		});
	}

	function showMenuAtAnchor(menu: Menu, event: MouseEvent | KeyboardEvent) {
		if (event instanceof MouseEvent) {
			menu.showAtMouseEvent(event);
			return;
		}
		menu.showAtPosition({
			x: Math.max(24, Math.round(window.innerWidth / 2)),
			y: Math.max(24, Math.round(window.innerHeight / 2)),
		});
	}

	function clearScrolledNavMetrics() {
		rootEl?.style.removeProperty(SCROLLED_NAV_FRAME_INSET_VAR);
		rootEl?.style.removeProperty(SCROLLED_NAV_SCROLLBAR_VAR);
	}

	function getVisibleReaderFrameGeometry(): {
		frameElement: HTMLElement;
		frameWindow: Window;
		frameDocument: Document;
	} | null {
		for (const frame of readerService.getVisibleFrames()) {
			const frameElement = frame.window?.frameElement;
			if (!(frameElement instanceof HTMLElement)) {
				continue;
			}
			return {
				frameElement,
				frameWindow: frame.window,
				frameDocument: frame.document,
			};
		}
		return null;
	}

	function syncScrolledNavMetrics() {
		if (!rootEl || !viewportEl || !showBottomNav() || !useVerticalNav()) {
			clearScrolledNavMetrics();
			return;
		}

		const frameGeometry = getVisibleReaderFrameGeometry();
		if (!frameGeometry) {
			clearScrolledNavMetrics();
			return;
		}

		const viewportRect = viewportEl.getBoundingClientRect();
		const frameRect = frameGeometry.frameElement.getBoundingClientRect();
		const documentElement = frameGeometry.frameDocument.documentElement;
		const body = frameGeometry.frameDocument.body;
		const contentWidth = Math.max(documentElement?.clientWidth || 0, body?.clientWidth || 0);
		const scrollbarWidth = Math.max(0, frameGeometry.frameWindow.innerWidth - contentWidth);
		const frameInsetEnd = Math.max(0, viewportRect.right - frameRect.right);

		rootEl.style.setProperty(SCROLLED_NAV_FRAME_INSET_VAR, `${frameInsetEnd}px`);
		rootEl.style.setProperty(SCROLLED_NAV_SCROLLBAR_VAR, `${scrollbarWidth}px`);
	}

	function scheduleScrolledNavLayoutSync() {
		if (scrolledNavSyncFrame) {
			return;
		}
		scrolledNavSyncFrame = window.requestAnimationFrame(() => {
			scrolledNavSyncFrame = 0;
			syncScrolledNavMetrics();
		});
	}

	function setupScrolledNavMetricsObserver() {
		if (scrolledNavResizeObserver) {
			scrolledNavResizeObserver.disconnect();
		}
		scrolledNavResizeObserver = new ResizeObserver(() => {
			scheduleScrolledNavLayoutSync();
		});
		if (rootEl) {
			scrolledNavResizeObserver.observe(rootEl);
		}
		if (viewportEl) {
			scrolledNavResizeObserver.observe(viewportEl);
		}
	}

	async function handlePrevPage() {
		await readerService.prevPage();
	}

	async function handleNextPage() {
		await readerService.nextPage();
	}

	async function handleJumpToPage(pageNumber: number) {
		await readerService.goToPage(pageNumber);
	}

	function hasNextChapter(): boolean {
		return Boolean(book && currentChapterIndex >= 0 && currentChapterIndex < book.metadata.chapterCount - 1);
	}

	function syncNextChapterActionVisibility() {
		showNextChapterAction = Boolean(hasNextChapter() && readerService.isAtCurrentChapterEnd?.());
	}

	async function handleNextChapter() {
		if (!hasNextChapter()) {
			return;
		}

		const moved = await readerService.nextChapter?.();
		if (!moved) {
			new Notice(t('epub.reader.nextChapterExists'));
			return;
		}

		showNextChapterAction = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			readerService.prevPage();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			readerService.nextPage();
		}
	}

	function buildNoteContent(
		text: string,
		cfiRange: string,
		color?: string,
		style?: EpubHighlightStyle
	): string {
		const chapterIndex = readerService.getCurrentChapterIndex();
		const chapterTitle = readerService.getCurrentChapterTitle();
		const timestamp = excerptSettings.addCreationTime ? formatTimestamp(new Date()) : undefined;
		const targetNotePath = (getLastActiveMarkdownLeaf?.()?.view as MarkdownView | undefined)?.file?.path;
		return linkService.buildQuoteBlock(
			filePath,
			cfiRange,
			text,
			chapterIndex,
			color,
			chapterTitle,
			timestamp,
			targetNotePath,
			book?.sourceId,
			undefined,
			style
		);
	}

	function buildReadingPointSourceLink(text: string, cfiRange: string): string {
		const chapterIndex = readerService.getCurrentChapterIndex();
		const chapterTitle = readerService.getCurrentChapterTitle();
		return linkService.buildEpubLink(
			filePath,
			cfiRange,
			text,
			chapterIndex,
			chapterTitle,
			undefined,
			book?.sourceId
		);
	}

	function buildChapterReadingPointSourceLink(
		text: string,
		cfiRange: string,
		chapterIndex?: number
	): string {
		return linkService.buildEpubLink(
			filePath,
			cfiRange,
			text,
			chapterIndex,
			text,
			undefined,
			book?.sourceId
		);
	}

	function formatTimestamp(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	}

	function insertToEditor(content: string): string | null {
		const leaf = getLastActiveMarkdownLeaf?.();
		if (!leaf) {
			new Notice(t('epub.reader.markdownEditorMissing'));
			return null;
		}
		const view = leaf.view;
		if (!(view instanceof MarkdownView) || !view.editor) {
			new Notice(t('epub.reader.markdownEditorMissing'));
			return null;
		}
		const editor = view.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(content + '\n', cursor);
		const lines = content.split('\n').length;
		editor.setCursor({ line: cursor.line + lines, ch: 0 });
		return view.file?.path || null;
	}

	function insertToEditorAndTrack(content: string, delayMs = 900) {
		const sourcePath = insertToEditor(content);
		rememberHighlightSourcePath(sourcePath);
		if (sourcePath) {
			queueHighlightReload(delayMs);
		}
	}

	async function copyTextToClipboard(content: string) {
		try {
			await navigator.clipboard.writeText(content);
			new Notice(t('epub.reader.copiedToClipboard'));
		} catch (_e) {
			new Notice(t('epub.reader.copyFailed'));
		}
	}

	async function copyImageToClipboard(blob: Blob) {
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob })
			]);
			new Notice(t('epub.reader.imageCopied'));
		} catch (_e) {
			new Notice(t('epub.reader.imageCopyFailed'));
		}
	}

	function outputNote(text: string, cfiRange: string, color?: string, style?: EpubHighlightStyle) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		if (canvasMode && canvasService.isActive() && hasCanvasExcerptCapability()) {
			addToCanvas(text, cfiRange, color, style);
			return;
		}

		const content = buildNoteContent(text, cfiRange, color, style);
		if (autoInsert) {
			insertToEditorAndTrack(content);
		} else {
			copyTextToClipboard(content);
		}
	}

	async function addToCanvas(
		text: string,
		cfiRange: string,
		color?: string,
		style?: EpubHighlightStyle
	) {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_CANVAS_EXCERPTS, t('epub.reader.canvasExcerptFeatureNotice'))) {
			return;
		}
		const chapterIndex = readerService.getCurrentChapterIndex();
		const chapterTitle = readerService.getCurrentChapterTitle();

		canvasService.updateAnchorFromCanvasSelection(app);

		const timestamp = excerptSettings.addCreationTime ? formatTimestamp(new Date()) : undefined;
		const node = await canvasService.addExcerptNode(
			text,
			cfiRange,
			filePath,
			chapterIndex,
			chapterTitle,
			color,
			timestamp,
			book?.sourceId,
			style
		);
		if (node) {
			rememberHighlightSourcePath(canvasService.getCanvasPath());
			queueHighlightReload(120);
			new Notice(t('epub.reader.addedToCanvas'));
		}
	}

	async function initCanvasBinding() {
		if (!book || !hasCanvasExcerptCapability()) {
			canvasService.setCanvasPath(null);
			canvasService.setAnchor(null);
			canvasMode = false;
			onCanvasStateChange?.(false, null);
			return;
		}
		const savedPath = await storageService.getCanvasBinding(book.id);
		if (savedPath) {
			const exists = await app.vault.adapter.exists(savedPath);
			if (exists) {
				canvasService.setCanvasPath(savedPath);
				canvasMode = true;
				onCanvasStateChange?.(true, savedPath);
			}
		}
	}

	async function bindCanvas(canvasPath: string) {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_CANVAS_EXCERPTS, t('epub.reader.canvasExcerptFeatureNotice'))) {
			return;
		}
		if (!book) return;
		canvasService.setCanvasPath(canvasPath);
		await storageService.setCanvasBinding(book.id, canvasPath);
		canvasMode = true;
		onCanvasStateChange?.(true, canvasPath);
		void reloadHighlights();
	}

	async function unbindCanvas() {
		if (!book) return;
		canvasService.setCanvasPath(null);
		canvasService.setAnchor(null);
		await storageService.removeCanvasBinding(book.id);
		canvasMode = false;
		onCanvasStateChange?.(false, null);
		void reloadHighlights();
	}

	function handleInsertToNote(
		text: string,
		cfiRange: string,
		color?: string,
		style?: EpubHighlightStyle
	) {
		outputNote(text, cfiRange, color, style);
	}

	async function handleExtractToCard(
		text: string,
		cfiRange: string,
		color?: string,
		style?: EpubHighlightStyle
	) {
		await extractContentToCard(
			buildNoteContent(text, cfiRange, color, style),
			t('epub.reader.createCardSuccess'),
			'Failed to extract selection to card',
			t('epub.reader.createCardFailed')
		);
	}

	function showSelectedTextAIMenu(event: MouseEvent, text: string, cfiRange: string) {
		if (!isWeaveMainPluginEnabled(app)) {
			new Notice(t('epub.reader.weaveRequired'));
			return;
		}

		const host = resolveEpubHost(app);
		if (!host?.openSelectedTextAISplitMenu || !host.openSelectedTextAIPanelFromEpub) {
			new Notice(t('epub.reader.weaveRequired'));
			return;
		}

		host.openSelectedTextAISplitMenu({
			event,
			selectedText: text,
			onSelectAction: (actionId: string) => {
				void host.openSelectedTextAIPanelFromEpub?.({
					filePath,
					selectedText: text,
					actionId,
					sourceLink: buildReadingPointSourceLink(text, cfiRange),
				});
			},
		});
	}

	async function handleCreateReadingPoint(text: string, cfiRange: string) {
		try {
			const plugin = getIncrementalReadingHost();
			if (!plugin?.openIRReadingPointFromExternalSelection) {
				new Notice(t('epub.reader.irUnavailable'));
				return;
			}

			await plugin.openIRReadingPointFromExternalSelection({
				filePath,
				selectedText: text,
				sourceLink: buildReadingPointSourceLink(text, cfiRange),
				successNotice: t('epub.reader.irReadingPointCreated')
			});
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to create reading point from selection:', error);
			new Notice(t('epub.reader.createReadingPointFailed'));
		}
	}

	async function handleCreateChapterReadingPoint(item: TocItem, event?: MouseEvent) {
		try {
			const plugin = getIncrementalReadingHost();
			if (!plugin?.scheduleEpubChapterForIncrementalReading) {
				new Notice(t('epub.reader.irUnavailable'));
				return;
			}

			const topicProvider = plugin.getAvailableEpubIncrementalReadingTopics;
			if (!topicProvider) {
				await plugin.scheduleEpubChapterForIncrementalReading({
					filePath,
					title: item.label,
					tocHref: item.href,
					tocLevel: item.level
				});
				return;
			}

			const topics = (await topicProvider())
				.filter((topic) => String(topic.id || '').trim() && String(topic.name || '').trim());
			if (topics.length === 0) {
				new Notice(t('epub.reader.noIncrementalTopics'));
				return;
			}

			const menu = new Menu();
			for (const topic of topics) {
				menu.addItem((menuItem) => {
					menuItem.setTitle(topic.name);
					menuItem.onClick(() => {
						void plugin.scheduleEpubChapterForIncrementalReading?.({
							filePath,
							title: item.label,
							tocHref: item.href,
							tocLevel: item.level,
							deckId: topic.id,
						});
					});
				});
			}
			if (event instanceof MouseEvent) {
				menu.showAtMouseEvent(event);
			} else {
				menu.showAtPosition({
					x: Math.max(24, Math.round(window.innerWidth / 2)),
					y: Math.max(24, Math.round(window.innerHeight / 2)),
				});
			}
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to add chapter to incremental reading:', error);
			new Notice(t('epub.reader.addToIncrementalReadingFailed'));
		}
	}

	async function exportCurrentChapterToMarkdown() {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_CHAPTER_EXPORT, t('epub.reader.chapterExportFeatureNotice'))) {
			return;
		}
		try {
			const plugin = getMarkdownExportHost();
			if (!plugin?.exportEpubChapterToMarkdown) {
				new Notice(t('epub.reader.exportMarkdownUnavailable'));
				return;
			}

			const chapterHref = readerService.getCurrentChapterHref?.() || '';
			const titleHint = readerService.getCurrentChapterTitle() || book?.metadata.title || t('epub.reader.epubChapterDefaultTitle');
			if (!chapterHref) {
				new Notice(t('epub.reader.chapterLocateFailed'));
				return;
			}

			const draft = await readerService.getChapterReadingPointDraft?.(chapterHref, titleHint);
			if (!draft?.text?.trim()) {
				new Notice(t('epub.reader.chapterExtractFailed'));
				return;
			}

			await plugin.exportEpubChapterToMarkdown({
				filePath,
				title: draft.title || titleHint,
				body: draft.text,
				markdown: draft.markdown,
				assets: draft.assets,
				sourceLink: buildChapterReadingPointSourceLink(
					draft.title || titleHint,
					draft.cfi,
					draft.chapterIndex
				),
				bookTitle: book?.metadata.title,
				author: book?.metadata.author,
			});
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to export current chapter to markdown:', error);
			new Notice(t('epub.reader.exportMarkdownFailed'));
		}
	}

	function getHighlightStyleLabel(highlight: ReaderHighlight): string | null {
		if (highlight.presentation === 'conceal') {
			return t('epub.reader.concealed');
		}

		switch (highlight.style) {
			case 'underline':
				return t('epub.reader.underline');
			case 'strikethrough':
				return t('epub.reader.strikethrough');
			case 'wavy':
				return t('epub.reader.wavy');
			default:
				return null;
		}
	}

	function isHighlightSelectedForBookNotesExport(highlight: ReaderHighlight): boolean {
		if (highlight.presentation !== 'highlight') {
			return false;
		}
		if (highlight.style === 'underline') {
			return excerptSettings.bookNotesExportIncludeUnderline;
		}
		if (highlight.style === 'strikethrough') {
			return excerptSettings.bookNotesExportIncludeStrikethrough;
		}
		if (highlight.style === 'wavy') {
			return excerptSettings.bookNotesExportIncludeWavy;
		}
		return excerptSettings.bookNotesExportIncludeHighlight;
	}

	function ensureBookNotesExportSelection(): boolean {
		return Boolean(
			excerptSettings.bookNotesExportIncludeHighlight ||
			excerptSettings.bookNotesExportIncludeUnderline ||
			excerptSettings.bookNotesExportIncludeStrikethrough ||
			excerptSettings.bookNotesExportIncludeWavy
		);
	}

	async function updateBookNotesExportSetting(
		patch: Partial<Pick<
			EpubExcerptSettings,
			| 'bookNotesExportIncludeHighlight'
			| 'bookNotesExportIncludeUnderline'
			| 'bookNotesExportIncludeStrikethrough'
			| 'bookNotesExportIncludeWavy'
		>>
	) {
		await applyAndPersistExcerptSettings(patch);
	}

	function closeExportNotesPopover() {
		exportNotesPopoverOpen = false;
		exportNotesSubmitting = false;
	}

	function openExportNotesPopover(event?: MouseEvent) {
		event?.preventDefault();
		exportNotesSubmitting = false;
		exportNotesPopoverOpen = true;
	}

	function handleExportNotesPointerDownOutside(event: MouseEvent) {
		if (!exportNotesPopoverOpen || !exportNotesPopoverEl) {
			return;
		}
		if (exportNotesPopoverEl.contains(event.target as Node)) {
			return;
		}
		closeExportNotesPopover();
	}

	function renderHighlightQuote(text: string): string {
		const normalized = String(text || '')
			.replace(/\r\n?/g, '\n')
			.trim();
		if (!normalized) {
			return `> ${t('epub.reader.emptyExcerpt')}`;
		}
		return normalized
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');
	}

	function getHighlightChapterIndex(highlight: ReaderHighlight): number | undefined {
		return typeof highlight.chapterIndex === 'number' && Number.isFinite(highlight.chapterIndex)
			? highlight.chapterIndex
			: undefined;
	}

	function getHighlightTextForExport(highlight: ReaderHighlight): string {
		const normalizedText = String(highlight.text || '').trim();
		return normalizedText || t('epub.reader.emptyExcerpt');
	}

	function buildBookHighlightsMarkdownTemplate1(highlights: ReaderHighlight[]): string {
		const sortedHighlights = [...highlights].sort((left, right) => {
			const chapterDiff = (left.chapterIndex || 0) - (right.chapterIndex || 0);
			if (chapterDiff !== 0) {
				return chapterDiff;
			}
			return (left.createdTime || 0) - (right.createdTime || 0);
		});

		const sections: string[] = [t('epub.reader.notesTitle'), ''];
		let currentChapterLabel = '';
		let chapterExcerptIndex = 0;

		for (const highlight of sortedHighlights) {
			const highlightChapterIndex = getHighlightChapterIndex(highlight);
			const highlightText = getHighlightTextForExport(highlight);
			const chapterNumber = typeof highlightChapterIndex === 'number' ? highlightChapterIndex + 1 : 0;
			const chapterLabel = chapterNumber > 0
				? t('epub.reader.chapterLabel', { number: chapterNumber })
				: t('epub.reader.unlocatedChapter');
			if (chapterLabel !== currentChapterLabel) {
				currentChapterLabel = chapterLabel;
				chapterExcerptIndex = 0;
				sections.push(`## ${chapterLabel}`, '');
			}

			chapterExcerptIndex += 1;
			const sourceLink = linkService.buildEpubLink(
				filePath,
				highlight.cfiRange,
				highlightText,
				highlightChapterIndex,
				undefined,
				undefined,
				book?.sourceId
			);
			const metaLines = [
				highlight.color ? t('epub.reader.exportMeta.color', { value: highlight.color }) : '',
				getHighlightStyleLabel(highlight) ? t('epub.reader.exportMeta.style', { value: getHighlightStyleLabel(highlight) || '' }) : '',
				typeof highlight.createdTime === 'number' && highlight.createdTime > 0
					? t('epub.reader.exportMeta.time', { value: formatTimestamp(new Date(highlight.createdTime)) })
					: '',
				sourceLink ? t('epub.reader.exportMeta.source', { value: sourceLink }) : '',
			].filter(Boolean);

			sections.push(t('epub.reader.excerptHeading', { number: chapterExcerptIndex }), '');
			sections.push(renderHighlightQuote(highlightText), '');
			if (metaLines.length > 0) {
				sections.push(...metaLines, '');
			}
		}

		return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	function buildBookHighlightsMarkdownTemplate2(highlights: ReaderHighlight[]): string {
		const sortedHighlights = [...highlights].sort((left, right) => {
			const chapterDiff = (left.chapterIndex || 0) - (right.chapterIndex || 0);
			if (chapterDiff !== 0) {
				return chapterDiff;
			}
			return (left.createdTime || 0) - (right.createdTime || 0);
		});

		const sections: string[] = [t('epub.reader.notesTitle'), ''];
		let currentChapterLabel = '';

		for (const highlight of sortedHighlights) {
			const highlightChapterIndex = getHighlightChapterIndex(highlight);
			const highlightText = getHighlightTextForExport(highlight);
			const chapterNumber = typeof highlightChapterIndex === 'number' ? highlightChapterIndex + 1 : 0;
			const chapterLabel = chapterNumber > 0
				? t('epub.reader.chapterLabel', { number: chapterNumber })
				: t('epub.reader.unlocatedChapter');
			if (chapterLabel !== currentChapterLabel) {
				currentChapterLabel = chapterLabel;
				sections.push(`## ${chapterLabel}`, '');
			}

			const styleLabel = getHighlightStyleLabel(highlight) || t('epub.reader.highlight');
			const sourceLink = linkService.buildQuoteBlock(
				filePath,
				highlight.cfiRange,
				highlightText,
				highlightChapterIndex,
				highlight.color,
				highlight.chapterTitle,
				typeof highlight.createdTime === 'number' && highlight.createdTime > 0
					? formatTimestamp(new Date(highlight.createdTime))
					: undefined,
				undefined,
				book?.sourceId,
				highlight.excerptId,
				highlight.style,
			);

			sections.push(`### ${styleLabel}`, '');
			sections.push(sourceLink.trim(), '');
		}

		return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	function buildBookHighlightsMarkdown(highlights: ReaderHighlight[]): string {
		return excerptSettings.bookNotesExportTemplate === 'template2'
			? buildBookHighlightsMarkdownTemplate2(highlights)
			: buildBookHighlightsMarkdownTemplate1(highlights);
	}

	async function exportBookHighlightsToMarkdown(event?: MouseEvent) {
		try {
			const plugin = getMarkdownExportHost();
			if (!plugin?.exportEpubBookNotesToMarkdown) {
				new Notice(t('epub.reader.exportMarkdownUnavailable'));
				return;
			}

			if (!book) {
				new Notice(t('epub.reader.bookNotReady'));
				return;
			}

			if (event) {
				openExportNotesPopover(event);
				return;
			}

			if (!ensureBookNotesExportSelection()) {
				new Notice(t('epub.reader.selectAtLeastOneExportType'));
				return;
			}

			const highlights = (await annotationService.collectAllHighlights(book.id, filePath, backlinkService))
				.filter(isHighlightSelectedForBookNotesExport);
			if (highlights.length === 0) {
				new Notice(t('epub.reader.noExportableNotes'));
				return;
			}

			await plugin.exportEpubBookNotesToMarkdown({
				filePath,
				markdown: buildBookHighlightsMarkdown(highlights),
				bookTitle: book.metadata.title,
			});
			closeExportNotesPopover();
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to export book highlights to markdown:', error);
			new Notice(t('epub.reader.exportReadingNotesFailed'));
			exportNotesSubmitting = false;
		}
	}

	async function submitBookNotesExport() {
		if (exportNotesSubmitting) {
			return;
		}
		if (!hasExcerptNotesCapability()) {
			return;
		}
		exportNotesSubmitting = true;
		await exportBookHighlightsToMarkdown();
	}

	async function handleHighlightExtractToCard(info: HighlightClickInfo) {
		await extractContentToCard(
			buildNoteContent(info.text, info.cfiRange, info.color, info.style),
			t('epub.reader.createCardSuccess'),
			'Failed to extract highlight to card',
			t('epub.reader.highlightExtractFailed'),
			() => {
				highlightToolbarInfo = null;
			}
		);
	}

        function handleAutoInsertSelection(
		text: string,
		cfiRange: string,
		color?: string,
		style?: EpubHighlightStyle
	) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		outputNote(text, cfiRange, color, style);
	}

	async function handleConcealSelection(text: string, cfiRange: string) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		if (!book) {
			new Notice(t('epub.reader.bookNotReady'));
			return;
		}

		try {
			const canonicalCfi = typeof readerService.canonicalizeLocation === 'function'
				? await readerService.canonicalizeLocation(cfiRange, text)
				: cfiRange;
			await annotationService.createConcealedText(
				book.id,
				text,
				readerService.getCurrentChapterIndex(),
				canonicalCfi || cfiRange,
				'mask'
			);
			new Notice(t('epub.reader.hideTextSuccess'));
			void reloadHighlights();
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to conceal selection:', error);
			new Notice(t('epub.reader.hideTextFailed'));
		}
	}

	function requestIRNavigation(nav: ReaderNavigationIntent) {
		if (!nav.cfi && !nav.href) {
			return;
		}
		if (!readerReady) {
			pendingIRNav = nav;
			return;
		}
		void applyIRNav(nav);
	}

        async function navigateToCfi(cfi: string, text: string) {
		requestIRNavigation({
			cfi,
			text,
			flashStyle: 'highlight',
			showLocateOverlay: true,
		});
	}

	function getVisibleReaderFrames(): EpubVisibleFrameLike[] {
		return readerService.getVisibleFrames() as EpubVisibleFrameLike[];
	}

	async function handleScreenshotCapture(blob: Blob, rect: ScreenshotRect) {
		const currentCfi = readerService.getCurrentCFI();
		const chapterIndex = readerService.getCurrentChapterIndex();
		const chapterTitle = readerService.getCurrentChapterTitle();
		const targetNotePath = (getLastActiveMarkdownLeaf?.()?.view as MarkdownView | undefined)?.file?.path;

		let canvasContent: string | null = null;

		if (autoInsert) {
			if (screenshotSaveAsImage) {
				const bookTitle = book?.metadata.title || 'epub';
				const imagePath = await screenshotService.saveAsJpeg(blob, bookTitle);
				const insertText = screenshotService.buildJpegInsert(
					imagePath,
					filePath,
					currentCfi,
					chapterIndex,
					chapterTitle,
					targetNotePath
				);
				insertToEditorAndTrack(insertText);
				canvasContent = insertText;
			} else {
				const extractedText = screenshotService.extractTextFromRect(viewportEl!, rect, getVisibleReaderFrames());
				const insertText = screenshotService.buildSnapshotEmbed(
					filePath,
					currentCfi,
					extractedText,
					chapterIndex,
					chapterTitle,
					targetNotePath
				);
				insertToEditorAndTrack(insertText);
				canvasContent = insertText;
			}
		} else {
			if (screenshotSaveAsImage) {
				const pngBlob = await convertToClipboardImage(blob);
				await copyImageToClipboard(pngBlob);
			} else {
				const extractedText = screenshotService.extractTextFromRect(viewportEl!, rect, getVisibleReaderFrames());
				const content = screenshotService.buildSnapshotEmbed(
					filePath,
					currentCfi,
					extractedText,
					chapterIndex,
					chapterTitle,
					targetNotePath
				);
				await copyTextToClipboard(content);
				canvasContent = content;
			}
		}

		if (canvasMode && canvasService.isActive() && canvasContent) {
			canvasService.updateAnchorFromCanvasSelection(app);
			const node = await canvasService.addRawTextNode(canvasContent);
			if (node) {
				new Notice(t('epub.reader.screenshotAddedToCanvas'));
			}
		}
	}

	async function convertToClipboardImage(blob: Blob): Promise<Blob> {
		const img = new Image();
		const url = URL.createObjectURL(blob);
		return new Promise((resolve) => {
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(img, 0, 0);
				URL.revokeObjectURL(url);
				canvas.toBlob((b) => resolve(b || blob), 'image/png');
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				resolve(blob);
			};
			img.src = url;
		});
	}

	async function markIRResumePoint(event?: MouseEvent) {
		try {
			const currentCfi = readerService.getCurrentCFI();
			if (!currentCfi) {
				new Notice(t('epub.reader.noAvailableReadingPosition'));
				return;
			}

			const chapterHref = readerService.getCurrentChapterHref?.() || '';
			const chapterTitle = readerService.getCurrentChapterTitle() || undefined;
			const plugin = getIncrementalReadingHost();
			if (!plugin?.markEpubResumePointFromReader) {
				new Notice(t('epub.reader.irUnavailable'));
				return;
			}

			const topicProvider = plugin.getAvailableEpubIncrementalReadingTopics;
			if (event instanceof MouseEvent && typeof topicProvider === 'function') {
				const topics = (await topicProvider())
					.filter((topic) => String(topic.id || '').trim() && String(topic.name || '').trim());
				if (topics.length > 0) {
					const menu = new Menu();
					for (const topic of topics) {
						menu.addItem((menuItem) => {
							menuItem.setTitle(topic.name);
							menuItem.onClick(() => {
								void plugin.markEpubResumePointFromReader?.({
									filePath,
									cfi: currentCfi,
									chapterHref,
									chapterTitle,
									deckId: topic.id,
								});
							});
						});
					}
					menu.showAtMouseEvent(event);
					return;
				}
			}

			await plugin.markEpubResumePointFromReader({
				filePath,
				cfi: currentCfi,
				chapterHref,
				chapterTitle,
			});
		} catch (e) {
			logger.error('[EpubReaderApp] markIRResumePoint failed:', e);
			new Notice(t('epub.reader.irResumeSaveFailed'));
		}
	}

	function handleEpubNavigateEvent(e: Event) {
		const detail = (e as CustomEvent).detail;
		if (!detail || detail.filePath !== filePath) return;

		const nav: ReaderNavigationIntent = {};
		if (detail.cfi) nav.cfi = detail.cfi;
		else if (detail.href) nav.href = detail.href;
		if (typeof detail.text === 'string' && detail.text.trim()) {
			nav.text = detail.text;
		}
		if (detail.flashStyle === 'pulse' || detail.flashStyle === 'highlight' || detail.flashStyle === 'none') {
			nav.flashStyle = detail.flashStyle;
		}
		if (typeof detail.showLocateOverlay === 'boolean') {
			nav.showLocateOverlay = detail.showLocateOverlay;
		}

		requestIRNavigation(nav);
	}

	async function applyIRNav(nav: ReaderNavigationIntent) {
		try {
			if (nav.flashStyle && nav.flashStyle !== 'none') {
				await readerService.navigateAndHighlight({
					cfi: nav.cfi,
					href: nav.href,
					text: nav.text,
					flashStyle: nav.flashStyle
				});
			} else {
				await readerService.navigateTo({
					cfi: nav.cfi,
					href: nav.href,
					text: nav.text,
				});
			}
			if (nav.showLocateOverlay) {
				window.setTimeout(() => {
					const rect = readerService.getNavigationTargetRect({ cfi: nav.cfi, href: nav.href, text: nav.text });
					if (rect) {
						sourceLocateOverlay.showAtRect(rect, { label: t('epub.reader.locateSourcePosition'), icon: 'map-pinned', durationMs: 2200 });
					}
				}, 80);
			}
		} catch (e) {
			logger.warn('[EpubReaderApp] IR navigation failed:', e);
		}
	}

	function setupHighlightClickHandler() {
		readerService.onHighlightClick((info: HighlightClickInfo) => {
			footnotePreviewInfo = null;
			if (info.interactionTarget === 'comment-marker') {
				referencePopoverInfo = null;
				referencePopoverStats = null;
				openCommentEditor(info);
				return;
			}
			if (info.interactionTarget === 'reference-badge') {
				return;
			}
			referencePopoverInfo = null;
			referencePopoverStats = null;
			closeCommentEditor();
			highlightToolbarInfo = info;
		});
	}

	function setupReferenceBadgeClickHandler() {
		referenceBadgeClickCleanup?.();
		referenceBadgeClickCleanup = null;

		const cleanupTasks: Array<() => void> = [];

		if (typeof readerService.onReferenceBadgeClick === 'function') {
			cleanupTasks.push(
				readerService.onReferenceBadgeClick((info: HighlightClickInfo) => {
					void handleReferenceBadgeClick(info);
				})
			);
		}

		// 保留旧的 DOM 自定义事件监听作为兼容兜底。
		if (readerService && typeof (readerService as any).foliateView !== 'undefined') {
			const foliateView = (readerService as any).foliateView;
			if (foliateView) {
				const handleReferenceBadgeClickEvent = (event: Event) => {
					const customEvent = event as CustomEvent;
					const cfiRange = customEvent.detail?.cfiRange;
					if (cfiRange) {
						const info = readerService.getHighlightClickInfo?.(cfiRange, 'reference-badge') || cfiRange;
						void handleReferenceBadgeClick(info);
					}
				};

				foliateView.addEventListener('reference-badge-click', handleReferenceBadgeClickEvent as EventListener);
				cleanupTasks.push(() => {
					foliateView.removeEventListener(
						'reference-badge-click',
						handleReferenceBadgeClickEvent as EventListener
					);
				});
			}
		}

		if (cleanupTasks.length > 0) {
			referenceBadgeClickCleanup = () => {
				for (const cleanup of cleanupTasks) {
					cleanup();
				}
			};
		}
	}

	function setupFootnotePreviewHandler() {
		readerService.onFootnotePreview((info: ReaderFootnotePreviewInfo | null) => {
			logger.debugWithTag(
				'FootnoteDiag',
				`[FootnoteDiag] EpubReaderApp received footnote preview event hasInfo=${String(Boolean(info))} href=${info?.href || ''} textLength=${String(info?.text.length || 0)}`
			);
			if (!hasFootnotePreviewCapability()) {
				footnotePreviewInfo = null;
				return;
			}
			if (highlightToolbarInfo || commentEditorInfo) {
				footnotePreviewInfo = null;
				return;
			}
			footnotePreviewInfo = info;
		});
	}

	function openCommentEditor(info: HighlightClickInfo) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		highlightToolbarInfo = null;
		footnotePreviewInfo = null;
		referencePopoverInfo = null;
		referencePopoverStats = null;
		commentEditorInfo = info;
		commentEditorDraft = info.commentText || '';
		commentEditorSaving = false;
	}

	function closeCommentEditor() {
		commentEditorInfo = null;
		commentEditorDraft = '';
		commentEditorSaving = false;
	}

	function closeReferencePopover() {
		referencePopoverInfo = null;
		referencePopoverStats = null;
	}

	function syncAsActiveEpubDocument() {
		const activeFilePath = filePath?.trim() ? filePath : null;
		const canUseReadingProgress = hasReadingProgressCapability();
		const canUseExcerptNotes = hasExcerptNotesCapability();
		if (!activeFilePath) {
			epubActiveDocumentStore.clearActiveDocument();
			epubActiveDocumentStore.setSharedState({
				filePath: null,
				canUseReadingProgress,
				canUseExcerptNotes,
				excerptSettings,
				highlightViewSnapshotService: canUseExcerptNotes ? highlightViewSnapshotService : null,
				onDeleteBookmark: null,
				onSettingsClick: showSettingsMenu,
			});
			return;
		}

		epubActiveDocumentStore.setActiveDocument(activeFilePath);
		epubActiveDocumentStore.setSharedState({
			filePath: activeFilePath,
			readerService,
			annotationService: canUseExcerptNotes ? annotationService : null,
			highlightViewSnapshotService: canUseExcerptNotes ? highlightViewSnapshotService : null,
			backlinkService: canUseExcerptNotes ? backlinkService : null,
			referenceStatsService: canUseExcerptNotes ? referenceStatsService : null,
			book,
			canUseReadingProgress,
			canUseExcerptNotes,
			excerptSettings,
			annotationRevision,
			bookmarkRevision,
			progress: canUseReadingProgress ? readingProgress : 0,
			chapterTitle: readerService.getCurrentChapterTitle(),
			chapterHref: readerService.getCurrentChapterHref?.() || '',
			paginationInfo,
			onDeleteBookmark: deleteBookmarkById,
			onNavigate: requestIRNavigation,
			onSettingsClick: showSettingsMenu,
			onSwitchBook,
			onCreateChapterReadingPoint: hasScheduleChapterForIncrementalReadingCapability()
				? handleCreateChapterReadingPoint
				: null
		});
	}

	async function resolveHighlightSource(info: HighlightClickInfo): Promise<BacklinkSourceMatch | null> {
		let sourceFile = String(info.sourceFile || '').trim();
		let sourceRef = info.sourceRef;
		let excerptId = info.excerptId;

		if (!sourceFile || !sourceRef || !excerptId) {
			const resolved = await backlinkService.findSourceForCfi(
				info.cfiRange,
				filePath,
				sourceFile || undefined,
				{
					text: info.text,
					createdTime: info.createdTime,
				}
			);
			if (resolved?.sourceFile) {
				sourceFile = resolved.sourceFile;
				if (!sourceRef && resolved.sourceRef) {
					sourceRef = resolved.sourceRef;
				}
				if (!excerptId && resolved.excerptId) {
					excerptId = resolved.excerptId;
				}
			}
		}

		if (!sourceFile) {
			sourceFile = await backlinkService.findSourceFileForCfi(info.cfiRange, filePath) || '';
		}

		if (!sourceFile) {
			return null;
		}

		return {
			sourceFile,
			sourceRef,
			excerptId,
		};
	}

	async function handleHighlightDelete(info: HighlightClickInfo) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		if (info.presentation === 'conceal') {
			readerService.removeHighlight(info.cfiRange);
			if (!book) {
				new Notice(t('epub.reader.bookNotReady'));
				return;
			}
			await annotationService.deleteConcealedTextByCfi(book.id, info.cfiRange);
			new Notice(t('epub.reader.hideTextRestored'));
			highlightToolbarInfo = null;
			void reloadHighlights();
			return;
		}
		const source = await resolveHighlightSource(info);
		if (!source?.sourceFile) {
			new Notice(t('epub.reader.highlightSourcePending'));
			void reloadHighlights();
			return;
		}

		const officialApi = resolveEpubWeaveOfficialAPI(app);
		const officialApiInfo = officialApi?.getInfo?.();
		const canUseOfficialExcerptApi = !!(
			officialApi?.removeExcerpt &&
			officialApiInfo?.capabilities?.excerpts?.remove
		);
		const supportsInteractiveUserChoice = !!officialApiInfo?.capabilities?.excerpts?.supportsInteractiveUserChoice;

		if (canUseOfficialExcerptApi) {
			const officialApiResult = await deleteHighlightThroughOfficialAPI(
				officialApi,
				info,
				source,
				supportsInteractiveUserChoice
			);
			if (officialApiResult !== 'fallback') {
				if (officialApiResult === 'success') {
					readerService.removeHighlight(info.cfiRange);
					new Notice(t('epub.reader.highlightDeleted'));
					highlightToolbarInfo = null;
				} else if (officialApiResult === 'failed') {
					new Notice(t('epub.reader.highlightDeleteFailed'));
				}
				void reloadHighlights({ invalidateCache: officialApiResult !== 'cancelled' });
				return;
			}
		}

		let cardDeletionMode: 'excerpt-only' | 'delete-card' | undefined;
		if (source.sourceFile.endsWith('.json') || source.sourceFile.endsWith('.wdeck')) {
			const analysis = await backlinkService.inspectCardDataHighlightDeletion(
				source.sourceFile,
				info.cfiRange,
				filePath,
				source.sourceRef,
				source.excerptId
			);

			if (analysis?.hasAdditionalContent) {
				const message = [
					t('epub.reader.highlightDeleteChoiceMessage'),
					analysis.additionalContentPreview
						? `${t('epub.reader.highlightDeleteChoicePreviewLabel')}\n${analysis.additionalContentPreview}`
						: '',
				].filter(Boolean).join('\n\n');
				const choice = await showObsidianChoice(app, message, {
					title: t('epub.reader.highlightDeleteChoiceTitle'),
					cancelText: t('epub.reader.highlightDeleteChoiceCancel'),
					choices: [
						{
							value: 'excerpt-only',
							text: t('epub.reader.highlightDeleteChoiceExcerptOnly'),
							description: t('epub.reader.highlightDeleteChoiceExcerptOnlyDescription'),
							className: 'mod-cta',
						},
						{
							value: 'delete-card',
							text: t('epub.reader.highlightDeleteChoiceDeleteCard'),
							description: t('epub.reader.highlightDeleteChoiceDeleteCardDescription'),
							className: 'mod-warning',
						},
					],
				});

				if (!choice) {
					void reloadHighlights({ invalidateCache: false });
					return;
				}
				cardDeletionMode = choice;
			} else if (analysis?.matched) {
				cardDeletionMode = analysis.recommendedMode;
			}
		}

		const deleted = await backlinkService.deleteHighlight(
			source.sourceFile,
			info.cfiRange,
			filePath,
			source.sourceRef,
			source.excerptId,
			cardDeletionMode
		);
		if (deleted) {
			readerService.removeHighlight(info.cfiRange);
			new Notice(t('epub.reader.highlightDeleted'));
			highlightToolbarInfo = null;
			void reloadHighlights();
		} else {
			new Notice(t('epub.reader.highlightDeleteFailed'));
			void reloadHighlights();
		}
	}

	async function deleteHighlightThroughOfficialAPI(
		api: EpubWeaveOfficialAPI,
		info: HighlightClickInfo,
		source: BacklinkSourceMatch & { excerptId?: string },
		supportsInteractiveUserChoice: boolean
	): Promise<'success' | 'failed' | 'cancelled' | 'fallback'> {
		const initialResult = await api.removeExcerpt?.({
			sourceType: 'epub',
			epubFilePath: filePath,
			cfiRange: info.cfiRange,
			cardId: extractCardIdFromSourceRef(source.sourceRef),
			sourceFile: source.sourceFile,
			sourceRef: source.sourceRef,
			excerptId: source.excerptId,
			mode: 'auto',
		});

		if (!initialResult) {
			return 'fallback';
		}

		if (initialResult.needsUserChoice && supportsInteractiveUserChoice) {
			const choice = await promptHighlightDeleteChoice(initialResult);
			if (!choice) {
				return 'cancelled';
			}
			const retryResult = await api.removeExcerpt?.({
				sourceType: 'epub',
				epubFilePath: filePath,
				cfiRange: info.cfiRange,
				cardId:
					extractCardIdFromSourceRef(source.sourceRef) ||
					initialResult.affectedCardIds?.[0],
				sourceFile: source.sourceFile,
				sourceRef: source.sourceRef,
				excerptId: source.excerptId,
				mode: choice,
			});
			return retryResult?.success ? 'success' : 'failed';
		}

		if (initialResult.needsUserChoice) {
			return 'fallback';
		}

		if (!initialResult.success || initialResult.action === 'noop') {
			return 'failed';
		}

		return 'success';
	}

	function extractCardIdFromSourceRef(sourceRef?: string): string | undefined {
		const normalized = String(sourceRef || '').trim();
		if (!normalized.startsWith('card:')) {
			return undefined;
		}
		const cardId = normalized.slice(5).trim();
		return cardId || undefined;
	}

	async function promptHighlightDeleteChoice(
		result: EpubWeaveRemoveExcerptResult
	): Promise<EpubWeaveExcerptRemovalMode | null> {
		const message = [
			t('epub.reader.highlightDeleteChoiceMessage'),
			result.additionalContentPreview
				? `${t('epub.reader.highlightDeleteChoicePreviewLabel')}\n${result.additionalContentPreview}`
				: '',
		].filter(Boolean).join('\n\n');

		const choice = await showObsidianChoice(app, message, {
			title: t('epub.reader.highlightDeleteChoiceTitle'),
			cancelText: t('epub.reader.highlightDeleteChoiceCancel'),
			choices: [
				{
					value: 'excerpt-only',
					text: t('epub.reader.highlightDeleteChoiceExcerptOnly'),
					description: t('epub.reader.highlightDeleteChoiceExcerptOnlyDescription'),
					className: 'mod-cta',
				},
				{
					value: 'delete-card',
					text: t('epub.reader.highlightDeleteChoiceDeleteCard'),
					description: t('epub.reader.highlightDeleteChoiceDeleteCardDescription'),
					className: 'mod-warning',
				},
			],
		});

		return choice ?? null;
	}

        function handleTemporarilyRevealConcealed(info: HighlightClickInfo) {
                if (info.presentation !== 'conceal') {
                        return;
                }

                readerService.temporarilyRevealConcealedText?.(info.cfiRange, 3000);
                highlightToolbarInfo = null;
                new Notice(t('epub.reader.transientRevealSuccess'));
        }

        async function handleHighlightChangeColor(info: HighlightClickInfo, newColor: string) {
                if (!hasExcerptNotesCapability()) {
			return;
		}
		if (newColor === info.color) return;
		const source = await resolveHighlightSource(info);
		if (!source?.sourceFile) {
			new Notice(t('epub.reader.highlightSourcePending'));
			void reloadHighlights();
			return;
		}
		const changed = await backlinkService.changeHighlightColor(
			source.sourceFile,
			info.cfiRange,
			filePath,
			newColor,
			source.sourceRef,
			source.excerptId
		);

		if (changed) {
			highlightToolbarInfo = null;
			void reloadHighlights();
		} else {
			new Notice(t('epub.reader.changeColorFailed'));
		}
	}

	async function handleHighlightChangeStyle(
		info: HighlightClickInfo,
		newStyle?: HighlightClickInfo['style']
	) {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS, t('epub.reader.styledExcerptFeatureNotice'))) {
			return;
		}
		if (newStyle === info.style) return;
		const source = await resolveHighlightSource(info);
		if (!source?.sourceFile) {
			new Notice(t('epub.reader.highlightSourcePending'));
			void reloadHighlights();
			return;
		}
		const changed = await backlinkService.changeHighlightStyle(
			source.sourceFile,
			info.cfiRange,
			filePath,
			newStyle,
			source.sourceRef,
			source.excerptId
		);

		if (changed) {
			highlightToolbarInfo = null;
			void reloadHighlights();
		} else {
			new Notice(t('epub.reader.changeStyleFailed'));
		}
	}

	async function handleReferenceBadgeClick(infoOrCfi: HighlightClickInfo | string) {
		if (!hasSourceLocationCapability()) {
			if (isPremiumFeaturePreviewEnabled()) {
				openPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_SOURCE_LOCATION);
			}
			return;
		}
		try {
			if (!book || !filePath) {
				logger.warn('[EpubReaderApp] Reference badge click ignored because reader context is incomplete', {
					hasBook: Boolean(book),
					filePath,
					cfiRange: typeof infoOrCfi === 'string' ? infoOrCfi : infoOrCfi.cfiRange,
				});
				new Notice(t('epub.reader.readingContextUnavailable'));
				return;
			}

			const info = typeof infoOrCfi === 'string'
				? readerService.getHighlightClickInfo?.(infoOrCfi, 'reference-badge') || null
				: infoOrCfi;
			const cfiRange = typeof infoOrCfi === 'string' ? infoOrCfi : infoOrCfi.cfiRange;

			const stats = await referenceStatsService.getStatsForCfi(
				filePath,
				cfiRange,
				getBoundCanvasPath()
			);

			if (!stats) {
				logger.warn('[EpubReaderApp] No reference stats found for clicked badge', {
					filePath,
					cfiRange,
				});
				new Notice(t('epub.reader.referenceStatsMissing'));
				return;
			}
			if (!info) {
				logger.warn('[EpubReaderApp] Reference stats found but anchor info is missing', {
					filePath,
					cfiRange,
				});
				new Notice(t('epub.reader.referenceRectUnavailable'));
				return;
			}
			closeCommentEditor();
			highlightToolbarInfo = null;
			footnotePreviewInfo = null;
			referencePopoverInfo = info;
			referencePopoverStats = stats;
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to open reference detail popover:', error);
			new Notice(t('epub.reader.referencePopoverOpenFailed'));
		}
	}

	async function handleHighlightBacklink(info: HighlightClickInfo) {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_SOURCE_LOCATION, t('epub.reader.sourceLocationFeatureNotice'))) {
			return;
		}
		const source = await resolveHighlightSource(info);
		if (!source?.sourceFile) {
			new Notice(t('epub.reader.relatedNoteMissing'));
			return;
		}

		const sourceFile = source.sourceFile;
		const sourceRef = source.sourceRef;

		if (sourceRef?.startsWith('card:')) {
			await openCardBacklink(sourceRef.slice(5));
			highlightToolbarInfo = null;
			return;
		}

		const encodedCfi = EpubLinkService.encodeCfiForWikilink(info.cfiRange);

		// Handle canvas files
		if (sourceFile.endsWith('.canvas')) {
			await sourceNavigationService.openCanvasAndLocate(
				sourceFile,
				[encodedCfi, info.cfiRange, sourceFile],
				sourceRef,
				{ label: t('epub.reader.locateSourcePosition'), icon: 'map-pinned', focus: true, openInNewTab: true, delayMs: 500 }
			);
			highlightToolbarInfo = null;
			return;
		}

		if (sourceFile.endsWith('.json')) {
			const openedLeaf = await openFileWithExistingLeaf(app, sourceFile, {
				openInNewTab: true,
				focus: true,
			});
			if (!openedLeaf) {
				new Notice(t('epub.reader.relatedNoteMissing'));
			} else {
				new Notice(t('epub.reader.openedSourceFileSearchHighlight'));
			}
			highlightToolbarInfo = null;
			return;
		}

		// Handle markdown files
		await navigateToMarkdownCallout(sourceFile, encodedCfi, info.cfiRange, info.text, info.createdTime);
		highlightToolbarInfo = null;
	}

	function handleHighlightEditComment(info: HighlightClickInfo) {
		openCommentEditor(info);
	}

	async function saveHighlightComment() {
		if (!hasExcerptNotesCapability()) {
			return;
		}
		const info = commentEditorInfo;
		if (!info) {
			return;
		}
		const source = await resolveHighlightSource(info);
		if (!source?.sourceFile) {
			new Notice(t('epub.reader.highlightSourcePending'));
			void reloadHighlights();
			return;
		}
		commentEditorSaving = true;
		const updated = await backlinkService.updateHighlightComment(
			source.sourceFile,
			info.cfiRange,
			filePath,
			commentEditorDraft,
			source.sourceRef,
			source.excerptId,
			true
		);
		commentEditorSaving = false;
		if (!updated) {
			new Notice(t('epub.reader.commentSaveFailed'));
			return;
		}
		new Notice(t('epub.reader.commentSaved'));
		closeCommentEditor();
		void reloadHighlights();
	}

	async function navigateToReferenceSource(source: ReferenceSourceInfo) {
		if (!ensureEpubPremiumFeature(app, PREMIUM_FEATURES.EPUB_SOURCE_LOCATION, t('epub.reader.sourceLocationFeatureNotice'))) {
			return;
		}
		if (source.sourceRef?.startsWith('card:')) {
			await openCardBacklink(source.sourceRef.slice(5));
			return;
		}

		if (source.type === 'canvas') {
			await sourceNavigationService.openCanvasAndLocate(
				source.file,
				source.locateCandidates,
				source.nodeId,
				{ label: t('epub.reader.locateSourcePosition'), icon: 'map-pinned', focus: true, openInNewTab: true, delayMs: 320 }
			);
			return;
		}

		if (source.file.endsWith('.json')) {
			const openedLeaf = await openFileWithExistingLeaf(app, source.file, {
				openInNewTab: true,
				focus: true,
			});
			if (!openedLeaf) {
				new Notice(t('epub.reader.relatedNoteMissing'));
				return;
			}
			new Notice(t('epub.reader.openedSourceFileSearchHighlight'));
			return;
		}

		const openedLeaf = await sourceNavigationService.openMarkdownLinkAndLocate(
			source.file,
			filePath,
			source.locateCandidates,
			{
				label: t('epub.reader.locateSourcePosition'),
				icon: 'map-pinned',
				openInNewTab: true,
				focus: true,
				delayMs: 220
			}
		);
		if (!openedLeaf) {
			new Notice(t('epub.reader.relatedNoteMissing'));
		}
	}

	async function navigateToMarkdownCallout(sourceFile: string, encodedCfi: string, rawCfi: string, excerptText?: string, createdTime?: number) {
		const locateCandidates = buildEpubMarkdownLocateCandidates({
			epubFilePath: filePath,
			encodedCfi,
			rawCfi,
			excerptText,
			createdTime,
		});
		const openedLeaf = await sourceNavigationService.openMarkdownLinkAndLocate(
			sourceFile,
			filePath,
			locateCandidates,
			{
				label: t('epub.reader.locateSourcePosition'),
				icon: 'map-pinned',
				openInNewTab: true,
				focus: true,
				delayMs: 220
			}
		);
		if (!openedLeaf) {
			new Notice(t('epub.reader.relatedNoteMissing'));
		}
	}

	async function openCardBacklink(cardUuid: string) {
		try {
			const host = getEpubActionHost();
			if (!host?.openCardBacklinkFromEpub) {
				new Notice(t('epub.reader.cardLocateUnavailable'));
				return;
			}

			await host.openCardBacklinkFromEpub(cardUuid);
			new Notice(t('epub.reader.cardLocated'));
		} catch (error) {
			logger.error('[EpubReaderApp] Failed to open card backlink:', error);
			new Notice(t('epub.reader.cardLocateFailed'));
		}
	}

	async function handleHighlightCopyText(info: HighlightClickInfo) {
		const plainText = info.text.replace(/^>\s?/gm, '').trim();
		await copyTextToClipboard(plainText);
		highlightToolbarInfo = null;
	}

	async function reloadHighlights(options?: { invalidateCache?: boolean }) {
		if (!book || componentDisposed) return;
		if (!hasExcerptNotesCapability()) {
			trackedHighlightSourceFiles = new Set<string>();
			pendingLoadedHighlights = [];
			highlightToolbarInfo = null;
			closeCommentEditor();
			if (readerReady) {
				await readerService.applyHighlights([]);
			}
			annotationRevision += 1;
			epubActiveDocumentStore.setSharedState({ annotationRevision });
			return;
		}
		const invalidateCache = options?.invalidateCache ?? true;
		const reloadToken = ++highlightReloadToken;
		try {
			if (invalidateCache) {
				annotationService.invalidateCollectedHighlightsCache(book.id, filePath);
				highlightViewSnapshotService.invalidate(book.id, filePath);
				referenceStatsService.clearCache(filePath);
			}
			const allHighlights = await annotationService.collectAllHighlights(book.id, filePath, backlinkService);
			if (componentDisposed || reloadToken !== highlightReloadToken) {
				return;
			}
			
			// 计算引用统计
			const referenceStats = await referenceStatsService.computeReferenceStats(
				filePath,
				getBoundCanvasPath()
			);
			
			// 将统计数据附加到高亮上
			const highlightsWithStats = allHighlights.map(highlight => {
				const normalizedCfi = EpubLinkService.normalizeCfi(highlight.cfiRange);
				const stats = referenceStats.get(normalizedCfi);
				
				return {
					...highlight,
					referenceCount: stats?.referenceCount || 1,
					referenceHeat: stats?.referenceHeat || 0,
				};
			});
			
			trackedHighlightSourceFiles = collectTrackedHighlightSourceFiles(highlightsWithStats);
			pendingLoadedHighlights = highlightsWithStats;
			if (readerReady) {
				await readerService.applyHighlights(highlightsWithStats);
			}
			annotationRevision += 1;
			epubActiveDocumentStore.setSharedState({ annotationRevision });
		} catch (_e) {
			logger.warn('[EpubReaderApp] Failed to reload highlights:', _e);
		}
	}

	async function migrateLegacyStoredLocations(options?: {
		requireReaderReady?: boolean;
		targetBook?: EpubBook | null;
	}) {
		const targetBook = options?.targetBook ?? book;
		const requireReaderReady = options?.requireReaderReady ?? true;
		if (!targetBook || (requireReaderReady && !readerReady)) {
			return;
		}
		if (migratedLocationBookIds.has(targetBook.id) || migratingLocationBookId === targetBook.id) {
			return;
		}

		migratingLocationBookId = targetBook.id;
		try {
			const summary = await locationMigrationService.migrateBookData(targetBook.id, filePath);
			migratedLocationBookIds.add(targetBook.id);
			migratingLocationBookId = null;

			if (
				summary.progressMigrated
				|| summary.resumePointsMigrated > 0
			) {
				if (readerReady) {
					annotationRevision += 1;
					epubActiveDocumentStore.setSharedState({ annotationRevision });
				}
			}
		} catch (error) {
			logger.warn('[EpubReaderApp] Failed to migrate legacy EPUB locations:', error);
		} finally {
			if (migratingLocationBookId === targetBook.id) {
				migratingLocationBookId = null;
			}
		}
	}

	function trackHighlightSourceChanges() {
		if (vaultEventRefs.length > 0) return;

		const shouldReloadForPath = (path: string): boolean => {
			const normalizedPath = normalizeTrackedVaultPath(path);
			if (!normalizedPath) return false;
			if (trackedHighlightSourceFiles.has(normalizedPath)) return true;
			const canvasPath = normalizeTrackedVaultPath(canvasService.getCanvasPath());
			if (canvasPath && normalizedPath === canvasPath) return true;
			return false;
		};

		const requestReload = (path: string, delayMs = 180) => {
			const normalizedPath = normalizeTrackedVaultPath(path);
			if (!normalizedPath || !book || componentDisposed) return;
			if (shouldReloadForPath(normalizedPath)) {
				queueHighlightReload(delayMs);
				return;
			}
			void (async () => {
				try {
					const mayAffectHighlights = await backlinkService.mayFileAffectHighlights(
						normalizedPath,
						filePath,
						canvasService.getCanvasPath()
					);
					if (!mayAffectHighlights || componentDisposed) {
						return;
					}
					rememberHighlightSourcePath(normalizedPath);
					queueHighlightReload(delayMs);
				} catch (error) {
					logger.debug('[EpubReaderApp] Failed to inspect changed highlight source file:', {
						path: normalizedPath,
						error,
					});
				}
			})();
		};

		vaultEventRefs = [
			app.vault.on('create', (file: TAbstractFile) => {
				requestReload(file.path, 160);
			}),
			app.vault.on('modify', (file: TAbstractFile) => {
				requestReload(file.path, 180);
			}),
			app.vault.on('delete', (file: TAbstractFile) => {
				requestReload(file.path, 120);
			}),
			app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				if (shouldReloadForPath(oldPath) || shouldReloadForPath(file.path)) {
					queueHighlightReload(120);
					return;
				}
				requestReload(file.path, 160);
			}),
		];
	}

	onMount(() => {
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		const cleanupExternalHighlightSyncReload = attachExternalHighlightSyncReload({
			canReload: () => !componentDisposed && !!book && hasExcerptNotesCapability(),
			onReload: (delayMs) => {
				queueHighlightReload(delayMs);
			},
		});
		const unsubscribePremiumPreview = PremiumFeatureGuard.getInstance().premiumFeaturesPreviewEnabled.subscribe((value) => {
			premiumFeaturePreviewEnabled = value;
			if (!value) {
				closePremiumFeaturePreview();
			}
		});
		componentDisposed = false;
		setupScrolledNavMetricsObserver();
		window.addEventListener('resize', scheduleScrolledNavLayoutSync);
		void (async () => {
			try {
				const [savedExcerptSettings, savedReaderSettings] = await Promise.all([
					storageService.loadExcerptSettings(),
					storageService.loadReaderSettings()
				]);
				excerptSettings = savedExcerptSettings;
				epubActiveDocumentStore.setSharedState({ excerptSettings: savedExcerptSettings });
				const normalizedSettings = normalizeReaderSettings(savedReaderSettings);
				settings = normalizedSettings;
				readerService.setFootnoteClickAction?.(normalizedSettings.footnoteClickAction);
				onReaderSettingsLoaded?.(normalizedSettings);
				if (
					normalizedSettings.widthMode !== savedReaderSettings.widthMode
					|| normalizedSettings.layoutMode !== savedReaderSettings.layoutMode
					|| normalizedSettings.flowMode !== savedReaderSettings.flowMode
					|| normalizedSettings.footnoteClickAction !== savedReaderSettings.footnoteClickAction
					|| normalizedSettings.showTopSticker !== savedReaderSettings.showTopSticker
					|| normalizedSettings.paragraphModeEnabled !== savedReaderSettings.paragraphModeEnabled
				) {
					await storageService.saveReaderSettings(normalizedSettings);
				}
			} catch (error) {
				logger.warn('[EpubReaderApp] Failed to load reader settings:', error);
			}
			if (!filePath) {
				book = null;
				loading = false;
				errorMsg = '';
				readerReady = false;
				onReadingReferencePointChange?.(null);
				onChapterTitleChange?.('');
				scheduleScrolledNavLayoutSync();
				return;
			}
			await loadBook();
		})();

		// Check global pending IR navigation (set by sidebar before this component mounts)
		const pending =
			(window as any)[EPUB_PENDING_NAVIGATION_KEY] ??
			(LEGACY_EPUB_PENDING_NAVIGATION_KEY
				? (window as any)[LEGACY_EPUB_PENDING_NAVIGATION_KEY]
				: null);
		if (pending && pending.filePath === filePath) {
			const nav: ReaderNavigationIntent = {};
			if (pending.cfi) nav.cfi = pending.cfi;
			else if (pending.href) nav.href = pending.href;
			if (typeof pending.text === 'string' && pending.text.trim()) {
				nav.text = pending.text;
			}
			if (pending.flashStyle === 'pulse' || pending.flashStyle === 'highlight' || pending.flashStyle === 'none') {
				nav.flashStyle = pending.flashStyle;
			}
			if (typeof pending.showLocateOverlay === 'boolean') {
				nav.showLocateOverlay = pending.showLocateOverlay;
			}

			requestIRNavigation(nav);
		}

		setupHighlightClickHandler();
		setupReferenceBadgeClickHandler();
		setupFootnotePreviewHandler();
		trackHighlightSourceChanges();
		syncAsActiveEpubDocument();

		if (rootEl) {
			rootEl.addEventListener('keydown', handleKeydown);
			rootEl.addEventListener('pointerdown', syncAsActiveEpubDocument);
			rootEl.addEventListener('focusin', syncAsActiveEpubDocument);
			rootEl.setAttribute('tabindex', '0');
		}

		window.addEventListener(EXCERPT_SETTINGS_CHANGED_EVENT, handleGlobalExcerptSettingsChanged);
		window.addEventListener(EPUB_NAVIGATE_EVENT, handleEpubNavigateEvent);
		if (LEGACY_EPUB_NAVIGATE_EVENT) {
			window.addEventListener(LEGACY_EPUB_NAVIGATE_EVENT, handleEpubNavigateEvent);
		}

		onActionsReady?.({
			setAutoInsert: (enabled: boolean) => { autoInsert = enabled; },
			setScreenshotMode: (active: boolean) => { screenshotMode = active; },
			setLayoutMode: handleLayoutModeChange,
			setFlowMode: handleFlowModeChange,
			toggleParagraphMode,
			openTypographyPanel,
			getReaderSettings: () => settings,
			updateReaderSettings,
			setScreenshotSaveMode: (saveAsImage: boolean) => { screenshotSaveAsImage = saveAsImage; },
			navigateToCfi,
			toggleTutorial,
			addBookmark,
			canUseReadingProgress: hasReadingProgressCapability,
			canUseParagraphMode: hasParagraphModeCapability,
			canUseExcerptNotes: hasExcerptNotesCapability,
			canUseStyledExcerpts: hasStyledExcerptCapability,
			canUseCanvasExcerpts: hasCanvasExcerptCapability,
			canUseFootnotePreview: hasFootnotePreviewCapability,
			isPremiumFeaturePreviewEnabled,
			showPremiumFeaturePreview: openPremiumFeaturePreview,
			saveReadingReferencePoint: hasReadingProgressCapability() ? saveReadingReferencePoint : undefined,
			saveLastOpenBookmark: hasReadingProgressCapability() ? saveLastOpenBookmark : undefined,
			bindCanvasPath: (canvasPath: string) => { bindCanvas(canvasPath); },
			unbindCanvas: () => { unbindCanvas(); },
			getCanvasService: () => canvasService,
			canMarkIRResumePoint: () => hasMarkIRResumePointCapability(),
			markIRResumePoint,
			exportCurrentChapterToMarkdown: hasChapterExportCapability() ? exportCurrentChapterToMarkdown : undefined,
			exportBookHighlightsToMarkdown: hasExcerptNotesCapability() ? exportBookHighlightsToMarkdown : undefined,
			getExcerptSettings: () => excerptSettings,
			updateExcerptSettings: applyAndPersistExcerptSettings
		});
		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			cleanupExternalHighlightSyncReload();
			setParagraphModeImmersiveClass(false);
			unsubscribePremiumPreview();
			componentDisposed = true;
			clearParagraphModeSelection();
			window.removeEventListener('resize', scheduleScrolledNavLayoutSync);
			if (scrolledNavSyncFrame) {
				cancelAnimationFrame(scrolledNavSyncFrame);
				scrolledNavSyncFrame = 0;
			}
			if (scrolledNavResizeObserver) {
				scrolledNavResizeObserver.disconnect();
				scrolledNavResizeObserver = null;
			}
			clearScrolledNavMetrics();
			activeBookLoadToken += 1;
			if (deferredHighlightReloadTimer) {
				clearTimeout(deferredHighlightReloadTimer);
				deferredHighlightReloadTimer = null;
			}
			if (rootEl) {
				rootEl.removeEventListener('keydown', handleKeydown);
				rootEl.removeEventListener('pointerdown', syncAsActiveEpubDocument);
				rootEl.removeEventListener('focusin', syncAsActiveEpubDocument);
			}
			for (const ref of vaultEventRefs) {
				app.vault.offref(ref);
			}
			vaultEventRefs = [];
			referenceBadgeClickCleanup?.();
			referenceBadgeClickCleanup = null;
			window.removeEventListener(EXCERPT_SETTINGS_CHANGED_EVENT, handleGlobalExcerptSettingsChanged);
			window.removeEventListener(EPUB_NAVIGATE_EVENT, handleEpubNavigateEvent);
			if (LEGACY_EPUB_NAVIGATE_EVENT) {
				window.removeEventListener(LEGACY_EPUB_NAVIGATE_EVENT, handleEpubNavigateEvent);
			}
			sourceLocateOverlay.clear();
			void persistCurrentReadingProgress(book);
			readerService.destroy();
			epubActiveDocumentStore.clearActiveDocument(filePath);
		};
	});

	onMount(() => {
		const unsubscribeTheme = UnifiedThemeManager.getInstance().addListener((result) => {
			hostTheme = result.isDark ? 'dark' : 'light';
		});
		window.addEventListener('mousedown', handleExportNotesPointerDownOutside);
		window.addEventListener('mousedown', handleTypographyPointerDownOutside);
		return () => {
			unsubscribeTheme();
			window.removeEventListener('mousedown', handleExportNotesPointerDownOutside);
			window.removeEventListener('mousedown', handleTypographyPointerDownOutside);
		};
	});

	$effect(() => {
		const _flowMode = settings.flowMode;
		const _showScrolledSideNav = settings.showScrolledSideNav;
		const _widthMode = settings.widthMode;
		const _layoutMode = settings.layoutMode;
		const _viewport = viewportEl;
		const _topStickerRail = topStickerRailEl;
		const _showTopSticker = settings.showTopSticker;
		const _topStickerLayout = settings.topStickerLayout;
		const _readingReferencePoint = readingReferencePoint?.cfi;
		const _remainingBookMs = remainingReadingTime.bookMs;
		const _remainingChapterMs = remainingReadingTime.chapterMs;
		void _flowMode;
		void _showScrolledSideNav;
		void _widthMode;
		void _layoutMode;
		void _viewport;
		void _topStickerRail;
		void _showTopSticker;
		void _topStickerLayout;
		void _readingReferencePoint;
		void _remainingBookMs;
		void _remainingChapterMs;
		untrack(() => {
			setupScrolledNavMetricsObserver();
			scheduleScrolledNavLayoutSync();
		});
	});

	$effect(() => {
		const paragraphModeEnabled = settings.paragraphModeEnabled;
		const ready = readerReady;
		const chapterIndex = currentChapterIndex;
		const currentPage = paginationInfo.currentPage;
		const version = readerVersion;
		const revision = annotationRevision;
		void chapterIndex;
		void currentPage;
		void version;
		void revision;
		if (!paragraphModeEnabled || !ready) {
			untrack(() => {
				paragraphModeLocation = null;
				paragraphModeAnchorParagraphId = '';
				paragraphModeSelection = null;
			});
			return;
		}

		const preferredAnchorParagraphId = untrack(() => paragraphModeAnchorParagraphId || undefined);
		untrack(() => {
			void refreshParagraphModeLocation(undefined, preferredAnchorParagraphId);
		});
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="epub-reader-root"
	data-theme={settings.theme}
	data-host-theme={hostTheme}
	data-flow={settings.flowMode}
	data-layout={settings.layoutMode}
	data-width={settings.widthMode}
	data-paragraph-mode={settings.paragraphModeEnabled ? 'active' : 'inactive'}
	data-top-sticker-layout={getTopStickerLayoutState()}
	data-scrolled-side-nav={isDesktopScrolledSideNavVisible() ? 'visible' : 'hidden'}
	style={getReaderRootStyle()}
	bind:this={rootEl}
>
	{#if loading}
		<div class="epub-loading">
			<div class="epub-loading-spinner"></div>
			<span>{t('epub.reader.loading')}</span>
		</div>
	{:else if errorMsg}
		<div class="epub-error">
			<span>{errorMsg}</span>
		</div>
	{:else if !filePath}
		<BookshelfView
			{app}
			{onSwitchBook}
			onClose={() => {}}
			onBack={() => {
				void onBackFromBookshelf?.();
			}}
			onSettingsClick={showSettingsMenu}
		/>
	{:else}
		<div
			class="epub-reader-viewport"
			bind:this={viewportEl}
		>
			<div class="epub-content-wrapper">
				<EpubReaderView
					{app}
					{filePath}
					{book}
					{readerService}
					{storageService}
					{annotationService}
					{backlinkService}
					{settings}
					{excerptSettings}
					canUseReadingProgress={hasReadingProgressCapability()}
					canUseExcerptNotes={hasExcerptNotesCapability()}
					getReadingPositionAutoSaveConfig={getContinuousReadingPositionAutoSaveConfig}
					isParagraphModeActive={() => settings.paragraphModeEnabled}
					onAutoReadingPositionSaved={syncReadingReferencePointFromAutoSave}
					hasPendingNavigation={Boolean(pendingIRNav)}
					onProgressChange={(p) => {
						readingProgress = p;
						epubActiveDocumentStore.setSharedState({
							progress: hasReadingProgressCapability() ? p : 0,
							chapterTitle: readerService.getCurrentChapterTitle(),
							chapterHref: readerService.getCurrentChapterHref?.() || '',
						});
						scheduleScrolledNavLayoutSync();
						void refreshRemainingReadingTimeEstimate();
					}}
					onPaginationChange={(info) => {
						paginationInfo = info;
						currentChapterIndex = readerService.getCurrentChapterIndex();
						epubActiveDocumentStore.setSharedState({
							paginationInfo: info,
							chapterTitle: readerService.getCurrentChapterTitle(),
							chapterHref: readerService.getCurrentChapterHref?.() || '',
						});
						syncNextChapterActionVisibility();
						scheduleScrolledNavLayoutSync();
					}}
					onChapterChange={(title) => {
						currentChapterIndex = readerService.getCurrentChapterIndex();
						epubActiveDocumentStore.setSharedState({
							chapterTitle: String(title || '').trim(),
							chapterHref: readerService.getCurrentChapterHref?.() || '',
						});
						syncNextChapterActionVisibility();
						onChapterTitleChange?.(String(title || '').trim());
					}}
					onReaderReady={() => {
						readerVersion++;
						readerReady = true;
						if (pendingLoadedHighlights) {
							void readerService.applyHighlights(pendingLoadedHighlights);
						} else if (book) {
							void reloadHighlights();
						}
						if (pendingIRNav) {
							const nav = pendingIRNav;
							pendingIRNav = null;
							applyIRNav(nav);
						}
						void migrateLegacyStoredLocations();
						syncNextChapterActionVisibility();
						scheduleScrolledNavLayoutSync();
						void refreshRemainingReadingTimeEstimate();
					}}
					onRenderError={(message) => {
						logger.error('[EpubReaderApp] Reader view render error:', message);
						setError(message);
					}}
				/>
			</div>

		{#if !settings.paragraphModeEnabled && showBottomNav() && useVerticalNav()}
				<BottomNav
					onPrev={handlePrevPage}
					onNext={handleNextPage}
					onJumpToPage={handleJumpToPage}
					currentPage={paginationInfo.currentPage}
					totalPages={paginationInfo.totalPages}
					vertical={true}
					statusText={getBottomNavStatusText()}
					statusDetail={getBottomNavStatusDetail()}
					stickerWiggleEnabled={settings.topStickerWiggleEnabled}
				/>
			{/if}

			{#if !settings.paragraphModeEnabled && useVerticalNav() && showNextChapterAction}
				<div class="epub-scrolled-chapter-action-slot">
					<button
						type="button"
						class="epub-scrolled-chapter-action"
						onclick={() => void handleNextChapter()}
					>
						{t('epub.reader.nextChapter')}
					</button>
				</div>
			{/if}

			{#if !settings.paragraphModeEnabled && shouldRenderTopStickerRail()}
				<div class="epub-top-sticker-rail" data-layout={getEffectiveTopStickerLayout()} bind:this={topStickerRailEl}>
					{#if getRemainingReadingStickerProps()}
						<EpubRemainingReadingSticker
							valueText={getRemainingReadingStickerProps()?.valueText || ''}
							labelText={getRemainingReadingStickerProps()?.labelText || ''}
							titleText={getRemainingReadingStickerProps()?.titleText || ''}
							wiggleEnabled={settings.topStickerWiggleEnabled}
						/>
					{/if}

					{#if hasReadingProgressCapability() && readingReferencePoint}
						<EpubReadingReferenceSticker
							referencePoint={readingReferencePoint}
							deltaPercent={getReadingReferenceDeltaPercent()}
							deltaText={getReadingReferenceDeltaText()}
							startText={getReadingReferenceStartText()}
							titleText={getReadingReferenceTitleText()}
							wiggleEnabled={settings.topStickerWiggleEnabled}
							onOpenMenu={openReadingReferencePointMenu}
						/>
					{/if}
				</div>
			{/if}

			<ParagraphReadingOverlay
				active={settings.paragraphModeEnabled}
				paragraph={paragraphModeLocation?.paragraphs?.[paragraphModeLocation.currentIndex] || null}
				fontScale={settings.paragraphModeFontScale}
				surfaceStyle={settings.paragraphModeSurfaceStyle}
				transitionStyle={settings.paragraphModeTransitionStyle}
				immersive={paragraphModeImmersive}
				currentIndex={paragraphModeLocation?.currentIndex || 0}
				totalCount={paragraphModeLocation?.paragraphs?.length || 0}
				onFontScaleChange={(fontScale) => void updateReaderSettings({ paragraphModeFontScale: fontScale })}
				onSurfaceStyleChange={(surfaceStyle) => void updateReaderSettings({ paragraphModeSurfaceStyle: surfaceStyle })}
				onTransitionStyleChange={setParagraphModeTransitionStyle}
				onPrev={() => navigateParagraphRelative(-1)}
				onNext={() => navigateParagraphRelative(1)}
				onFootnoteActivate={handleParagraphFootnoteActivate}
				onHighlightActivate={handleParagraphHighlightActivate}
				onFootnoteDismiss={dismissParagraphFootnotePreview}
				onToggleImmersive={toggleParagraphModeImmersive}
				onClose={() => void closeParagraphMode()}
				onSelectionChange={handleParagraphOverlaySelectionChange}
			/>

			<EpubHighlightToolbar
				readerService={readerService}
				info={hasExcerptNotesCapability() ? highlightToolbarInfo : null}
				canUseStyledExcerpts={hasStyledExcerptCapability()}
				canUseSourceLocation={hasSourceLocationCapability()}
				showPremiumFeaturePreviewEnabled={isPremiumFeaturePreviewEnabled()}
				onRequestPremiumFeaturePreview={openPremiumFeaturePreview}
				onDelete={handleHighlightDelete}
				onTemporarilyReveal={handleTemporarilyRevealConcealed}
				onChangeColor={handleHighlightChangeColor}
				onChangeStyle={handleHighlightChangeStyle}
				onBacklink={handleHighlightBacklink}
				onExtractToCard={handleHighlightExtractToCard}
				onCopyText={handleHighlightCopyText}
				onEditComment={handleHighlightEditComment}
				onDismiss={() => highlightToolbarInfo = null}
			/>

			<EpubCommentEditorPopover
				open={hasExcerptNotesCapability() && commentEditorInfo !== null}
				info={hasExcerptNotesCapability() ? commentEditorInfo : null}
				{readerService}
				boundsEl={viewportEl}
				draftText={commentEditorDraft}
				saving={commentEditorSaving}
				onDraftTextChange={(value) => commentEditorDraft = value}
				onSave={saveHighlightComment}
				onClose={closeCommentEditor}
			/>

			<EpubFootnotePreviewPopover
				info={footnotePreviewInfo}
				boundsEl={viewportEl}
			/>

			<ReferenceDetailModal
				open={referencePopoverInfo !== null && referencePopoverStats !== null}
				info={referencePopoverInfo}
				stats={referencePopoverStats}
				{readerService}
				boundsEl={viewportEl}
				onNavigate={async (source: ReferenceSourceInfo) => {
					await navigateToReferenceSource(source);
					closeReferencePopover();
				}}
				onClose={closeReferencePopover}
			/>

			<SelectionToolbar
				{app}
				{readerService}
				{book}
				{readerVersion}
				boundsEl={viewportEl}
				externalSelection={settings.paragraphModeEnabled ? paragraphModeSelection : null}
				{autoInsert}
				{canvasMode}
				canUseExcerptNotes={hasExcerptNotesCapability()}
				canUseStyledExcerpts={hasStyledExcerptCapability()}
				showPremiumFeaturePreviewEnabled={isPremiumFeaturePreviewEnabled()}
				onRequestPremiumFeaturePreview={openPremiumFeaturePreview}
				onInsertToNote={hasExcerptNotesCapability() ? handleInsertToNote : undefined}
				onExtractToCard={handleExtractToCard}
				onCreateReadingPoint={hasCreateReadingPointCapability() ? handleCreateReadingPoint : undefined}
				onAutoInsert={hasExcerptNotesCapability() ? handleAutoInsertSelection : undefined}
				onOpenAIMenu={showSelectedTextAIMenu}
			/>

			<EpubPremiumFeaturePopover
				open={premiumFeaturePreviewFeatureId !== null}
				featureId={premiumFeaturePreviewFeatureId}
				onClose={closePremiumFeaturePreview}
				onOpenSettings={() => resolveEpubHost(app)?.openEpubPremiumSettings?.()}
			/>

			<EpubTutorial
				visible={tutorialVisible}
				onClose={() => tutorialVisible = false}
			/>

			<ScreenshotOverlay
				active={screenshotMode}
				sourceEl={viewportEl}
				{screenshotService}
				getVisibleFrames={getVisibleReaderFrames}
				onCapture={handleScreenshotCapture}
				onCancel={() => screenshotMode = false}
			/>

			{#if typographyPopoverOpen}
				<div class="epub-settings-float epub-glass-panel">
					<div class="epub-settings-row epub-settings-row--stack">
						<div class="epub-settings-row__heading">
							<span class="label">{t('epub.reader.typography.lineHeight')}</span>
							<span class="epub-settings-value">{settings.lineHeight.toFixed(2)}</span>
						</div>
						<input
							class="epub-settings-range"
							type="range"
							min="1.2"
							max="2.4"
							step="0.01"
							value={settings.lineHeight}
							aria-label={t('epub.reader.typography.lineHeightAria')}
							oninput={(event) => previewReaderLineHeight((event.currentTarget as HTMLInputElement).value)}
							onchange={persistCurrentReaderSettings}
						/>
					</div>
					<div class="epub-settings-row epub-settings-row--stack">
						<div class="epub-settings-row__heading">
							<span class="label">{t('epub.reader.typography.letterSpacing')}</span>
							<span class="epub-settings-value">{formatLetterSpacingValue(settings.letterSpacing)}</span>
						</div>
						<input
							class="epub-settings-range"
							type="range"
							min="-0.02"
							max="0.24"
							step="0.01"
							value={settings.letterSpacing}
							aria-label={t('epub.reader.typography.letterSpacingAria')}
							oninput={(event) => previewReaderLetterSpacing((event.currentTarget as HTMLInputElement).value)}
							onchange={persistCurrentReaderSettings}
						/>
					</div>
					<div class="epub-settings-row epub-settings-row--stack">
						<div class="epub-settings-row__heading">
							<span class="label">{t('epub.reader.typography.pageMargin')}</span>
							<span class="epub-settings-value">{Math.round(settings.pageMargin)}</span>
						</div>
						<input
							class="epub-settings-range"
							type="range"
							min="8"
							max="96"
							step="1"
							value={settings.pageMargin}
							aria-label={t('epub.reader.typography.pageMarginAria')}
							oninput={(event) => previewReaderPageMargin((event.currentTarget as HTMLInputElement).value)}
							onchange={persistCurrentReaderSettings}
						/>
					</div>
					<div class="epub-settings-row">
						<span class="label">{t('epub.reader.typography.widthMode')}</span>
						<div class="epub-settings-mode-group">
							<button
								type="button"
							class="epub-settings-mode-btn"
							class:active={settings.widthMode === 'standard'}
							disabled={settings.layoutMode === 'double'}
							onclick={() => setReaderWidthMode('standard')}
						>{t('epub.reader.typography.widthStandard')}</button>
						<button
							type="button"
							class="epub-settings-mode-btn"
							class:active={settings.widthMode === 'full'}
							disabled={settings.layoutMode === 'double'}
							onclick={() => setReaderWidthMode('full')}
						>{t('epub.reader.typography.widthWide')}</button>
						<button
							type="button"
							class="epub-settings-mode-btn"
							class:active={settings.widthMode === 'fit'}
							onclick={() => setReaderWidthMode('fit')}
						>{t('epub.reader.typography.widthFull')}</button>
						<button
							type="button"
							class="epub-settings-mode-btn"
							class:active={settings.widthMode === 'edge'}
							disabled={settings.layoutMode === 'double'}
							onclick={() => setReaderWidthMode('edge')}
						>{t('epub.reader.typography.widthEdge')}</button>
						</div>
					</div>
					<div class="epub-settings-row">
						<span class="label">{t('epub.reader.typography.scrolledSideNav')}</span>
						<label class="epub-export-notes-popover__toggle-switch">
							<input
								type="checkbox"
								checked={settings.showScrolledSideNav}
								onchange={(event) => handleScrolledSideNavToggle((event.currentTarget as HTMLInputElement).checked)}
							/>
							<span class="epub-export-notes-popover__toggle-slider"></span>
						</label>
					</div>
					<div class="epub-settings-row">
						<span class="label">{t('epub.reader.typography.footnoteAction')}</span>
						<div class="epub-settings-mode-group">
							{#if hasFootnotePreviewCapability()}
								<button
									type="button"
									class="epub-settings-mode-btn"
									class:active={settings.footnoteClickAction === 'preview'}
									onclick={() => setFootnoteClickAction('preview')}
								>{t('epub.reader.typography.footnotePreview')}</button>
							{/if}
							<button
								type="button"
								class="epub-settings-mode-btn"
								class:active={settings.footnoteClickAction === 'navigate'}
								onclick={() => setFootnoteClickAction('navigate')}
							>{t('epub.reader.typography.footnoteNavigate')}</button>
						</div>
					</div>
					<div class="epub-settings-actions">
						<button type="button" class="epub-settings-reset" onclick={resetReaderTypographySettings}>{t('epub.reader.typography.reset')}</button>
					</div>
				</div>
			{/if}

			{#if exportNotesPopoverOpen}
				<div
					class="epub-settings-float epub-export-notes-popover epub-glass-panel"
					bind:this={exportNotesPopoverEl}
				>
					<div class="epub-export-notes-popover__header">
						<div class="epub-export-notes-popover__title">{t('epub.reader.exportNotesPopover.title')}</div>
					</div>
					<div class="epub-export-notes-popover__section">
						<div class="epub-export-notes-popover__label">{t('epub.reader.exportNotesPopover.typeLabel')}</div>
						<div class="epub-export-notes-popover__toggle-list">
							<label class="epub-export-notes-popover__toggle-row">
								<span>{t('epub.reader.highlight')}</span>
								<span class="epub-export-notes-popover__toggle-switch">
									<input
										type="checkbox"
										checked={excerptSettings.bookNotesExportIncludeHighlight}
										onchange={(event) => void updateBookNotesExportSetting({
											bookNotesExportIncludeHighlight: (event.currentTarget as HTMLInputElement).checked,
										})}
									/>
									<span class="epub-export-notes-popover__toggle-slider"></span>
								</span>
							</label>
							<label class="epub-export-notes-popover__toggle-row">
								<span>{t('epub.reader.underline')}</span>
								<span class="epub-export-notes-popover__toggle-switch">
									<input
										type="checkbox"
										checked={excerptSettings.bookNotesExportIncludeUnderline}
										onchange={(event) => void updateBookNotesExportSetting({
											bookNotesExportIncludeUnderline: (event.currentTarget as HTMLInputElement).checked,
										})}
									/>
									<span class="epub-export-notes-popover__toggle-slider"></span>
								</span>
							</label>
							<label class="epub-export-notes-popover__toggle-row">
								<span>{t('epub.reader.strikethrough')}</span>
								<span class="epub-export-notes-popover__toggle-switch">
									<input
										type="checkbox"
										checked={excerptSettings.bookNotesExportIncludeStrikethrough}
										onchange={(event) => void updateBookNotesExportSetting({
											bookNotesExportIncludeStrikethrough: (event.currentTarget as HTMLInputElement).checked,
										})}
									/>
									<span class="epub-export-notes-popover__toggle-slider"></span>
								</span>
							</label>
							<label class="epub-export-notes-popover__toggle-row">
								<span>{t('epub.reader.wavy')}</span>
								<span class="epub-export-notes-popover__toggle-switch">
									<input
										type="checkbox"
										checked={excerptSettings.bookNotesExportIncludeWavy}
										onchange={(event) => void updateBookNotesExportSetting({
											bookNotesExportIncludeWavy: (event.currentTarget as HTMLInputElement).checked,
										})}
									/>
									<span class="epub-export-notes-popover__toggle-slider"></span>
								</span>
							</label>
						</div>
					</div>
					<div class="epub-export-notes-popover__actions">
						<button type="button" class="epub-export-notes-popover__action" onclick={closeExportNotesPopover}>{t('epub.reader.exportNotesPopover.cancel')}</button>
						<button type="button" class="epub-export-notes-popover__action epub-export-notes-popover__action--primary" disabled={exportNotesSubmitting} onclick={submitBookNotesExport}>{t('epub.reader.exportNotesPopover.export')}</button>
					</div>
				</div>
			{/if}

		</div>

		{#if !settings.paragraphModeEnabled && showBottomNav() && !useVerticalNav()}
			<div class="epub-bottom-nav-slot">
				<BottomNav
					onPrev={handlePrevPage}
					onNext={handleNextPage}
					onJumpToPage={handleJumpToPage}
					currentPage={paginationInfo.currentPage}
					totalPages={paginationInfo.totalPages}
					vertical={false}
					statusText={getBottomNavStatusText()}
					statusDetail={getBottomNavStatusDetail()}
					stickerWiggleEnabled={settings.topStickerWiggleEnabled}
				/>
			</div>
		{/if}
	{/if}
</div>
