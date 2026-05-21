import type { App } from "obsidian";
import type {
	EpubBookFootnotesDraft,
	EpubChapterReadingPointDraft,
	EpubReaderEngine,
	HighlightSourceLocator,
	HighlightClickInfo,
	NavigateAndHighlightOptions,
	ReaderAppearanceOptions,
	ReaderFootnotePreviewInfo,
	ReaderFrame,
	ReaderHighlight,
	ReaderHighlightInput,
	ReaderNavigationRectOptions,
	ReaderNavigateOptions,
	ReaderParagraph,
	ReaderParagraphLocation,
	ReaderParagraphSelectionResolution,
	ReaderRemainingTimeEstimate,
	ReaderRenderOptions,
	ReaderSelectionChange,
	ReaderViewportGeometry,
} from "./reader-engine-types";
import type {
	EpubBook,
	EpubFootnoteClickAction,
	EpubFlowMode,
	EpubHighlightStyle,
	EpubLayoutMode,
	EpubStrikethroughDisplayMode,
	EpubWidthMode,
	PaginationInfo,
	ReadingPosition,
	ReadingStats,
	TocItem,
} from "./types";
import {
	buildRemainingReadingEstimate,
	createPaceAnchor,
	estimateConsumedBookWords,
	normalizeReadingPaceStats,
	PACE_HEARTBEAT_MS,
	PACE_IDLE_CUTOFF_MS,
	PACE_MAX_INTERVAL_MS,
	PACE_MIN_INTERVAL_WORDS,
	recordReadingInterval,
	shouldRecordPaceInterval,
	type PaceAnchorSnapshot,
	type SectionReadingSlice,
} from "./reading-pace";
import type { View as FoliateViewElement } from "foliate-js/view.js";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { UnifiedThemeManager } from "../../utils/theme-detection";
import { installFoliateCustomElementGuard } from "../../utils/foliate-custom-element-guard";
import { FoliateVaultPublicationParser } from "./FoliateVaultPublicationParser";
import {
	installDesktopFoliateIframeSandboxPatch,
	installMobileBlobIframePatch,
} from "./foliate-runtime-patches";
import { FootnotePreviewController, FootnotePreviewResolver } from "./footnote-preview";
import { FoliateSessionGuard } from "./FoliateSessionGuard";
import { setSvgInteractionAttributes } from "./svg-interaction";

function logFootnoteDiag(message: string): void {
	logger.debugWithTag("FootnoteDiag", message);
}

type FoliateAnnotation = ReaderHighlight & {
	value: string;
	focusColor?: string;
};

type RenderedFoliateAnnotation = {
	annotation: FoliateAnnotation;
	renderSignature: string;
};

type VisibleFrameWithIndex = {
	index: number;
	href: string;
	document: Document;
	frameElement: HTMLElement | null;
	frame: ReaderFrame;
};

type FoliateRenderer = HTMLElement & {
	setStyles?: (styles: string | [string, string]) => void;
	render?: () => void;
	getContents?: () => Array<{ index?: number; doc?: Document | null }>;
};

type BridgedHostSelectionPayload = {
	text: string;
	sourceSelection: Selection;
	sourceRange: Range;
	primaryRect: HighlightClickInfo["rect"];
	rects: HighlightClickInfo["rect"][];
};

type ReaderParagraphTextSegment = {
	path: number[];
	relativePath: number[];
	text: string;
};

type ReaderParagraphCharPointer = {
	segmentIndex: number;
	nodeOffset: number;
};

type ReaderParagraphRecord = ReaderParagraph & {
	elementPath: number[];
	segments: ReaderParagraphTextSegment[];
	charMap: ReaderParagraphCharPointer[];
	htmlRevision?: number;
};

type ParagraphExtractionSource = {
	doc: Document;
	chapterIndex: number;
	chapterHref: string;
};

type ParagraphExtractionCandidateSource = "visible" | "processed" | "raw" | "embedded";

const PARAGRAPH_EXTRACTION_SOURCE_PRIORITY: Record<ParagraphExtractionCandidateSource, number> = {
	raw: 3,
	processed: 2,
	embedded: 1,
	visible: 0,
};

const PARAGRAPH_TAG_NAMES = new Set([
	"P",
	"LI",
	"BLOCKQUOTE",
	"PRE",
	"FIGCAPTION",
	"DD",
	"DT",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
]);

const PARAGRAPH_CHILD_BLOCK_SELECTOR = [
	"p",
	"li",
	"blockquote",
	"pre",
	"figcaption",
	"dd",
	"dt",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"table",
	"ul",
	"ol",
	"section",
	"article",
].join(", ");

const PARAGRAPH_EXPLICIT_SELECTOR = [
	"p",
	"li",
	"blockquote",
	"pre",
	"figcaption",
	"dd",
	"dt",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
].join(", ");

const LEAF_PARAGRAPH_CONTAINER_SELECTOR = ["div", "section", "article"].join(", ");
const BLOCK_PARAGRAPH_FALLBACK_SELECTOR = [
	"p",
	"li",
	"blockquote",
	"pre",
	"figcaption",
	"dd",
	"dt",
	"div",
	"section",
	"article",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
].join(", ");

const PARAGRAPH_READING_EXCLUDED_SELECTOR =
	"nav, header, footer, aside, [hidden], [aria-hidden='true']";
const PARAGRAPH_CONTAINER_MAX_LENGTH = 3200;
const PARAGRAPH_EXPLICIT_MAX_LENGTH = 12000;
const PARAGRAPH_EXPLICIT_SPLIT_CHUNK = 1800;
const PARAGRAPH_MIN_MEANINGFUL_LENGTH = 12;
const PARAGRAPH_BODY_COVERAGE_THRESHOLD = 0.3;
const PARAGRAPH_BOILERPLATE_PATTERNS = [
	/未经授权禁止转载/u,
	/禁止转载/u,
	/获取更多电子书/u,
	/\bt\.me\//iu,
	/\bEPUB_\d{10,}\b/u,
];

export class FoliateReaderService implements EpubReaderEngine {
	readonly engineType = "foliate" as const;

	private static readonly HIGHLIGHT_TINT_MAP: Record<"light" | "dark", Record<string, string>> = {
		light: {
			yellow: "rgb(250, 204, 21)",
			green: "rgb(22, 163, 74)",
			blue: "rgb(37, 99, 235)",
			red: "rgb(220, 38, 38)",
			purple: "rgb(147, 51, 234)",
		},
		dark: {
			yellow: "rgb(255, 222, 89)",
			green: "rgb(74, 222, 128)",
			blue: "rgb(96, 165, 250)",
			red: "rgb(248, 113, 113)",
			purple: "rgb(196, 181, 253)",
		},
	};
	private static readonly HIGHLIGHT_OPACITY_MAP: Record<"light" | "dark", string> = {
		light: "0.72",
		dark: "0.68",
	};
	private static readonly HIGHLIGHT_BLEND_MODE_MAP: Record<"light" | "dark", string> = {
		light: "normal",
		dark: "normal",
	};
	private static readonly FOOTNOTE_PREVIEW_RESOLVE_TIMEOUT_MS = 2200;
	private static readonly FOOTNOTE_PREVIEW_CANDIDATE_TIMEOUT_MS = 480;
	private static readonly NAVIGATION_TIMEOUT_MS = 5000;

	private readonly app: App;
	private readonly parser: FoliateVaultPublicationParser;
	private readonly footnotePreviewResolver: FootnotePreviewResolver;
	private readonly footnotePreviewController: FootnotePreviewController;

	private currentBook: EpubBook | null = null;
	private currentPosition: ReadingPosition = {
		chapterIndex: 0,
		cfi: "",
		percent: 0,
	};
	private currentPaginationInfo: PaginationInfo = { currentPage: 0, totalPages: 0 };
	private renderContainer: HTMLElement | null = null;
	private foliateView: FoliateViewElement | null = null;
	private layoutChangeInFlight = false;
	private currentLineHeight = 1.72;
	private currentLetterSpacing = 0;
	private currentPageMargin = 48;
	private currentWidthMode: EpubWidthMode = "standard";
	private currentStrikethroughPresentation: EpubStrikethroughDisplayMode = "conceal";
	private currentLayoutMode: EpubLayoutMode = "paginated";
	private currentFlowMode: EpubFlowMode = "paginated";
	private currentFootnoteClickAction: EpubFootnoteClickAction = "preview";
	private currentChapterTitle = "";
	private currentChapterHref = "";
	private paragraphFootnotePreviewSession = 0;
	private relocatedCallbacks = new Set<(position: ReadingPosition) => void>();
	private footnotePreviewCallbacks = new Set<(info: ReaderFootnotePreviewInfo | null) => void>();
	private selectionChangeCallbacks = new Set<(event: ReaderSelectionChange) => void>();
	private highlightClickCallbacks = new Set<(info: HighlightClickInfo) => void>();
	private referenceBadgeClickCallbacks = new Set<(info: HighlightClickInfo) => void>();
	private highlightDataMap = new Map<string, ReaderHighlight>();
	private temporaryHighlightDataMap = new Map<string, ReaderHighlight>();
	private savedHighlights: ReaderHighlight[] = [];
	private renderedAnnotations = new Map<string, RenderedFoliateAnnotation>();
	private temporaryHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private temporarilyRevealedConcealmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private documentFootnoteCleanups = new Map<Document, () => void>();
	private documentSelectionCleanups = new Map<Document, () => void>();
	private documentWheelCleanups = new Map<Document, () => void>();
	private documentStyleElements = new WeakMap<Document, HTMLStyleElement>();
	private loadedDocumentSectionIndexes = new WeakMap<Document, number>();
	private lastSelectionByDocument = new WeakMap<Document, string>();
	private overlayerModulePromise: Promise<typeof import("foliate-js/overlayer.js")> | null = null;
	private renderContainerWheelCleanup: (() => void) | null = null;
	private themeChangeCleanup: (() => void) | null = null;
	private pendingThemeRefreshFrame: number | null = null;
	private pendingLayoutRecoveryFrame: number | null = null;
	private themeRefreshToken = 0;
	private layoutRecoveryToken = 0;
	private readonly sessionGuard = new FoliateSessionGuard<FoliateViewElement>();
	private wheelTurnInFlight = false;
	private wheelDeltaAccumulator = 0;
	private lastWheelEventAt = 0;
	private navigationTask: Promise<void> = Promise.resolve();
	private paragraphCache = new Map<number, ReaderParagraphRecord[]>();
	private paragraphRecordById = new Map<string, ReaderParagraphRecord>();
	private paragraphPresentationRevision = 0;
	private paragraphRangeCache = new WeakMap<Document, Map<string, Range | null>>();
	private readingPaceAnchor: PaceAnchorSnapshot | null = null;
	private pendingActiveReadMs = 0;
	private lastReaderActivityAt = 0;
	private currentSectionProgression = 0;
	private paceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private paceVisibilityCleanup: (() => void) | null = null;
	private static readonly PACE_HEARTBEAT_MS = PACE_HEARTBEAT_MS;
	private static readonly PACE_IDLE_CUTOFF_MS = PACE_IDLE_CUTOFF_MS;

	constructor(app: App) {
		this.app = app;
		this.parser = new FoliateVaultPublicationParser(app);
		this.footnotePreviewResolver = new FootnotePreviewResolver({
			parser: this.parser,
			getCurrentChapterHref: () => this.currentChapterHref,
			getSectionHrefForDocument: (doc: Document) => {
				const currentSectionIndex = this.loadedDocumentSectionIndexes.get(doc);
				return typeof currentSectionIndex === "number"
					? this.parser.getSectionHrefByIndex(currentSectionIndex)
					: this.currentChapterHref;
			},
			getVisibleFrames: () => this.getVisibleFramesWithIndex(),
			createViewportRectFromElement: (doc: Document, element: Element) =>
				this.createViewportRectFromElement(doc, element),
			candidateTimeoutMs: FoliateReaderService.FOOTNOTE_PREVIEW_CANDIDATE_TIMEOUT_MS,
		});
		this.footnotePreviewController = new FootnotePreviewController({
			buildPendingPreviewInfo: (doc: Document, anchor: HTMLAnchorElement) =>
				this.buildPendingFootnotePreviewInfo(doc, anchor),
			buildStatusPreviewInfo: (doc: Document, anchor: HTMLAnchorElement, text: string) =>
				this.buildStatusFootnotePreviewInfo(doc, anchor, text),
			resolvePreviewInfo: (doc: Document, anchor: HTMLAnchorElement) =>
				this.buildFootnotePreviewInfo(doc, anchor),
			notifyPreview: (info: ReaderFootnotePreviewInfo | null) => this.notifyFootnotePreview(info),
			resolveTimeoutMs: FoliateReaderService.FOOTNOTE_PREVIEW_RESOLVE_TIMEOUT_MS,
		});
	}

	private async ensureFoliateViewRegistered(): Promise<void> {
		installFoliateCustomElementGuard();
		installDesktopFoliateIframeSandboxPatch();
		installMobileBlobIframePatch((error) => {
			logger.warn("[FoliateReaderService] Failed to resolve mobile blob iframe source:", error);
		});
		if (customElements.get("foliate-view")) {
			return;
		}
		const viewModule = await import("foliate-js/view.js");
		const viewConstructor = (viewModule as { View?: CustomElementConstructor }).View;
		if (viewConstructor && !customElements.get("foliate-view")) {
			customElements.define("foliate-view", viewConstructor);
		}
	}

	async loadEpub(filePath: string, existingBookId?: string): Promise<EpubBook> {
		await this.destroyViewOnly();
		this.resetHighlightState();
		this.resetParagraphState();
		this.resetReaderState();

		try {
			const loaded = await this.parser.load(filePath);
			const initialCfi =
				(await this.parser.canonicalizeLocation(this.parser.getSectionHrefByIndex(0))) || "";
			this.currentBook = {
				id: existingBookId || this.buildFallbackBookId(filePath),
				filePath,
				metadata: {
					title: loaded.metadata.title,
					author: loaded.metadata.author,
					publisher: loaded.metadata.publisher,
					language: loaded.metadata.language,
					identifier: loaded.metadata.identifier,
					isbn: loaded.metadata.isbn,
					translator: loaded.metadata.translator,
					description: loaded.metadata.description,
					publishDate: loaded.metadata.publishDate,
					subjects: loaded.metadata.subjects,
					series: loaded.metadata.series,
					rights: loaded.metadata.rights,
					price: loaded.metadata.price,
					coverImage: loaded.coverImage,
					wordCount: loaded.metadata.wordCount,
					chapterCount: loaded.metadata.chapterCount,
				},
				currentPosition: {
					chapterIndex: 0,
					cfi: initialCfi,
					percent: 0,
				},
				readingStats: {
					totalReadTime: 0,
					lastReadTime: Date.now(),
					createdTime: Date.now(),
				},
			};
			this.currentPosition = { ...this.currentBook.currentPosition };
			this.currentPaginationInfo = {
				currentPage: initialCfi ? (await this.parser.resolvePageNumber(initialCfi)) || 1 : 0,
				totalPages: loaded.totalPositions,
			};
			this.currentChapterTitle = this.parser.getSectionTitleByIndex(0);
			this.currentChapterHref = this.parser.getSectionHrefByIndex(0);
			return this.currentBook;
		} catch (error) {
			this.resetReaderState();
			throw error;
		}
	}

	private buildFallbackBookId(filePath: string): string {
		return `epub-${this.hashString(String(filePath || "").trim() || "book")}`;
	}

	private hashString(input: string): string {
		let hash = 2166136261;
		for (let index = 0; index < input.length; index += 1) {
			hash ^= input.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0).toString(36);
	}

	async renderTo(container: HTMLElement, options?: ReaderRenderOptions): Promise<void> {
		if (!this.currentBook) {
			throw this.createNotReadyError("renderTo");
		}

		await this.destroyViewOnly();
		await this.ensureFoliateViewRegistered();
		const viewSessionToken = this.sessionGuard.startViewSession();

		this.renderContainer = container;
		this.layoutChangeInFlight = true;
		this.applyRenderOptions(options);
		container.replaceChildren();
		container.dataset.foliate = "true";

		const view = document.createElement("foliate-view") as FoliateViewElement;
		view.classList.add("weave-epub-reader-host");
		view.addEventListener("relocate", this.handleRelocateEvent as EventListener);
		view.addEventListener("load", this.handleLoadEvent as EventListener);
		view.addEventListener("link", this.handleLinkEvent as EventListener);
		view.addEventListener("draw-annotation", this.handleDrawAnnotationEvent as EventListener);
		view.addEventListener("show-annotation", this.handleShowAnnotationEvent as EventListener);
		this.foliateView = view;
		container.appendChild(view);
		this.attachRenderContainerWheelListener(container, view as unknown as HTMLElement);

		try {
			await view.open(this.parser.getBook());
			if (!this.sessionGuard.isActiveViewSession(viewSessionToken, this.foliateView, view)) {
				return;
			}
			this.attachThemeChangeListener();
			this.applyRendererLayout();
			this.applyRendererAppearance();
			this.renderedAnnotations.clear();
			const positionOperationToken = this.sessionGuard.startPositionOperation();
			const initialTarget = this.currentPosition.cfi || this.currentBook.currentPosition.cfi;
			if (initialTarget) {
				const safeInitialTarget = this.isSectionBaseCfiTarget(initialTarget)
					? this.getSectionHrefFallbackTarget(initialTarget)
					: initialTarget;
				await this.navigateViewWithFallback(
					safeInitialTarget,
					this.getSectionHrefFallbackTarget(initialTarget),
					positionOperationToken,
					viewSessionToken
				);
			} else {
				await view.goToTextStart();
				await this.stabilizeViewAfterNavigation(
					undefined,
					positionOperationToken,
					viewSessionToken
				);
			}
			await this.syncCurrentPositionFromTarget(
				initialTarget || this.parser.getSectionHrefByIndex(0),
				undefined,
				positionOperationToken
			);
			await this.refreshHighlights();
			this.attachReadingPaceListeners();
		} catch (error) {
			if (this.sessionGuard.isActiveViewSession(viewSessionToken, this.foliateView, view)) {
				await this.destroyViewOnly();
			}
			throw error;
		} finally {
			if (this.sessionGuard.isActiveViewSession(viewSessionToken, this.foliateView, view)) {
				this.layoutChangeInFlight = false;
			}
		}
	}

	setFootnoteClickAction(action: EpubFootnoteClickAction): void {
		this.currentFootnoteClickAction = action === "navigate" ? "navigate" : "preview";
	}

	async setRestoredPosition(position: ReadingPosition): Promise<void> {
		if (!this.currentBook || !position?.cfi) {
			return;
		}

		const canonical = await this.parser.canonicalizeLocation(position.cfi);
		if (!canonical) {
			return;
		}

		const currentPage = (await this.parser.resolvePageNumber(canonical)) || 0;
		const totalPages = this.parser.getTotalPositions();
		const percent =
			totalPages > 1 && currentPage > 0
				? this.clamp(((currentPage - 1) / (totalPages - 1)) * 100, 0, 100)
				: Number.isFinite(position.percent)
				? this.clamp(position.percent, 0, 100)
				: 0;

		this.currentPosition = {
			chapterIndex:
				typeof position.chapterIndex === "number" && Number.isFinite(position.chapterIndex)
					? position.chapterIndex
					: this.currentPosition.chapterIndex,
			cfi: canonical,
			percent,
		};
		this.currentBook.currentPosition = { ...this.currentPosition };
		this.currentPaginationInfo = {
			currentPage,
			totalPages,
		};
	}

	async goToLocation(cfi: string): Promise<void> {
		await this.enqueueNavigation(async (positionOperationToken) => {
			const canonical = await this.parser.canonicalizeLocation(cfi);
			if (!canonical) {
				return;
			}
			this.clearSelections();
			if (
				await this.tryApplyLightweightLocationUpdate(canonical, positionOperationToken)
			) {
				return;
			}
			await this.navigateViewWithFallback(
				canonical,
				this.getSectionHrefFallbackTarget(canonical, cfi),
				positionOperationToken
			);
			await this.syncCurrentPositionFromTarget(canonical, undefined, positionOperationToken);
		}, "goToLocation");
	}

	canonicalizeLocation(cfi: string, textHint?: string): Promise<string | null> {
		return this.parser.canonicalizeLocation(cfi, textHint);
	}

	getReadingProgress(): number {
		return this.currentPosition.percent;
	}

	async getPaginationInfo(): Promise<PaginationInfo> {
		return this.currentPaginationInfo;
	}

	getReadingStats(): ReadingStats | null {
		if (!this.currentBook) {
			return null;
		}
		return normalizeReadingPaceStats(this.currentBook.readingStats);
	}

	flushReadingPace(): void {
		if (!this.currentBook) {
			return;
		}
		const totalPositions = this.parser.getTotalPositions();
		const currentPage = this.normalizeCurrentPage(totalPositions);
		const consumedBookWords = this.getConsumedBookWordsForPace(currentPage);
		const now = Date.now();

		if (this.readingPaceAnchor) {
			const activeMs = Math.min(
				PACE_MAX_INTERVAL_MS,
				now - this.readingPaceAnchor.at + this.pendingActiveReadMs
			);
			this.pendingActiveReadMs = 0;
			if (activeMs > 0 && this.isDocumentVisibleForPace()) {
				const normalized = normalizeReadingPaceStats(this.currentBook.readingStats);
				this.currentBook.readingStats = {
					...normalized,
					totalReadTime: normalized.totalReadTime + activeMs,
					lastReadTime: now,
				};
			}
		}

		this.readingPaceAnchor = createPaceAnchor(consumedBookWords, currentPage, now);
	}

	async getRemainingReadingTimeEstimate(): Promise<ReaderRemainingTimeEstimate> {
		if (!this.currentBook) {
			return {};
		}
		const totalWordCount = this.parser.getTotalWordCount();
		const totalPositions = this.parser.getTotalPositions();
		const currentPage = this.normalizeCurrentPage(totalPositions);

		return buildRemainingReadingEstimate({
			totalWordCount,
			sections: this.collectSectionSlices(),
			currentChapterIndex: this.currentPosition.chapterIndex,
			currentPage,
			totalPositions,
			percentFallback: this.currentPosition.percent,
			sectionProgression: this.currentSectionProgression,
			stats: this.currentBook.readingStats,
			language: this.currentBook.metadata.language,
		});
	}

	isLayoutChanging(): boolean {
		return this.layoutChangeInFlight;
	}

	resize(_width: number, _height: number): void {
		this.applyRendererLayout();
		(this.foliateView?.renderer as FoliateRenderer | undefined)?.render?.();
		this.schedulePaginatedLayoutRecovery();
	}

	async applyReaderAppearance(
		appearance: ReaderAppearanceOptions,
		_redisplay?: boolean
	): Promise<void> {
		if (typeof appearance.lineHeight === "number" && appearance.lineHeight > 0) {
			this.currentLineHeight = appearance.lineHeight;
		}
		if (typeof appearance.letterSpacing === "number" && Number.isFinite(appearance.letterSpacing)) {
			this.currentLetterSpacing = appearance.letterSpacing;
		}
		if (typeof appearance.pageMargin === "number" && Number.isFinite(appearance.pageMargin)) {
			this.currentPageMargin = appearance.pageMargin;
		}
		if (appearance.widthMode) {
			this.currentWidthMode = appearance.widthMode;
		}
		if (appearance.strikethroughPresentation) {
			this.currentStrikethroughPresentation = appearance.strikethroughPresentation;
		}
		this.applyRendererLayout();
		this.applyRendererAppearance();
		await this.refreshHighlights();
	}

	onRelocated(callback: (position: ReadingPosition) => void): () => void {
		this.relocatedCallbacks.add(callback);
		return () => {
			this.relocatedCallbacks.delete(callback);
		};
	}

	async setLayoutMode(
		mode: EpubLayoutMode,
		flowMode: EpubFlowMode,
		appearance?: ReaderAppearanceOptions
	): Promise<void> {
		this.currentLayoutMode = mode;
		this.currentFlowMode = flowMode;
		if (typeof appearance?.lineHeight === "number" && appearance.lineHeight > 0) {
			this.currentLineHeight = appearance.lineHeight;
		}
		if (
			typeof appearance?.letterSpacing === "number" &&
			Number.isFinite(appearance.letterSpacing)
		) {
			this.currentLetterSpacing = appearance.letterSpacing;
		}
		if (typeof appearance?.pageMargin === "number" && Number.isFinite(appearance.pageMargin)) {
			this.currentPageMargin = appearance.pageMargin;
		}
		if (appearance?.widthMode) {
			this.currentWidthMode = appearance.widthMode;
		} else if (mode === "double") {
			this.currentWidthMode = "full";
		}
		if (appearance?.strikethroughPresentation) {
			this.currentStrikethroughPresentation = appearance.strikethroughPresentation;
		}
		if (!this.foliateView) {
			return;
		}
		const currentCfi = this.getCurrentCFI();
		this.layoutChangeInFlight = true;
		try {
			this.applyRendererLayout();
			this.applyRendererAppearance();
			this.renderedAnnotations.clear();
			if (currentCfi) {
				const positionOperationToken = this.sessionGuard.startPositionOperation();
				const safeCurrentTarget = this.isSectionBaseCfiTarget(currentCfi)
					? this.getSectionHrefFallbackTarget(currentCfi, this.currentChapterHref)
					: currentCfi;
				await this.navigateViewWithFallback(
					safeCurrentTarget,
					this.getSectionHrefFallbackTarget(currentCfi, this.currentChapterHref),
					positionOperationToken
				);
				await this.syncCurrentPositionFromTarget(currentCfi, undefined, positionOperationToken);
			}
			await this.refreshHighlights();
		} finally {
			this.layoutChangeInFlight = false;
		}
	}

	searchText(
		query: string
	): Promise<Array<{ cfi: string; excerpt: string; chapterTitle: string }>> {
		return this.parser.search(query);
	}

	getTableOfContents(): Promise<TocItem[]> {
		return Promise.resolve(this.parser.getTocItems());
	}

	async navigateTo(options: ReaderNavigateOptions): Promise<void> {
		await this.enqueueNavigation(
			(positionOperationToken) => this.resolveNavigationRequest(options, positionOperationToken),
			"navigateTo"
		);
	}

	async navigateAndHighlight(options: NavigateAndHighlightOptions): Promise<void> {
		await this.enqueueNavigation(async (positionOperationToken) => {
			const { canonical } = await this.resolveNavigationRequest(options, positionOperationToken);
			if (canonical && options.flashStyle !== "none") {
				this.addTemporaryHighlight(
					{
						cfiRange: canonical,
						color: options.flashColor || "yellow",
						text: options.text,
						sourceFile: options.sourceFile,
						sourceRef: options.sourceRef,
						createdTime: options.createdTime,
					},
					2200
				);
			}
		}, "navigateAndHighlight");
	}

	getNavigationTargetRect(options: ReaderNavigationRectOptions): DOMRect | null {
		const preciseRect = this.findPreciseNavigationTargetRect(options);
		if (preciseRect) {
			return preciseRect;
		}
		if (options.allowFallback === false) {
			return null;
		}
		return this.getRenderContainerRect();
	}

	getCurrentPosition(): ReadingPosition {
		return { ...this.currentPosition };
	}

	private findPreciseNavigationTargetRect(options: ReaderNavigationRectOptions): DOMRect | null {
		for (const target of this.buildNavigationRectTargets(options)) {
			for (const frame of this.getVisibleFramesWithIndex()) {
				const range = this.parser.resolveRangeInLoadedSection(
					target,
					frame.document,
					frame.index,
					options.text
				);
				if (!range) {
					continue;
				}
				const rect = this.createViewportRect(frame, range);
				if (rect) {
					return new DOMRect(rect.left, rect.top, rect.width, rect.height);
				}
			}
		}

		return null;
	}

	private buildNavigationRectTargets(options: ReaderNavigationRectOptions): string[] {
		const targets = new Set<string>();
		const primaryTarget = String(options.cfi || options.href || "").trim();
		if (primaryTarget) {
			targets.add(primaryTarget);
		}

		const currentCfi = String(this.currentPosition.cfi || "").trim();
		if (currentCfi) {
			targets.add(currentCfi);
		}

		const currentHref = String(this.currentChapterHref || "").trim();
		if (currentHref) {
			targets.add(currentHref);
		}

		return Array.from(targets);
	}

	private getRenderContainerRect(): DOMRect | null {
		const rect = this.renderContainer?.getBoundingClientRect() || null;
		if (!rect || (!rect.width && !rect.height)) {
			return null;
		}
		return new DOMRect(rect.left, rect.top, rect.width, rect.height);
	}

	getCurrentChapterTitle(): string {
		return this.currentChapterTitle;
	}

	getCurrentChapterIndex(): number {
		return this.currentPosition.chapterIndex;
	}

	getCurrentChapterHref(): string {
		return this.currentChapterHref;
	}

	async getParagraphsForChapter(chapterIndex: number): Promise<ReaderParagraph[]> {
		return Promise.all(
			(await this.getParagraphRecordsForChapter(chapterIndex)).map((paragraph) =>
				this.toReaderParagraph(paragraph, { includeHtml: true })
			)
		);
	}

	async getCurrentParagraphLocation(options?: {
		preferredParagraphId?: string;
		preferredIndex?: number;
	}): Promise<ReaderParagraphLocation | null> {
		const chapterIndex = this.getCurrentChapterIndex();
		if (chapterIndex < 0) {
			return null;
		}
		const paragraphs = await this.getMergedParagraphRecordsForReadingContext(chapterIndex);
		if (paragraphs.length === 0) {
			return null;
		}
		const currentIndex = await this.resolveCurrentParagraphIndex(chapterIndex, paragraphs);
		const preferredParagraphId = String(options?.preferredParagraphId || "").trim();
		const preferredIndex = Number.isInteger(options?.preferredIndex)
			? Math.max(0, Math.min(Number(options?.preferredIndex), paragraphs.length - 1))
			: null;
		const preferredParagraphMatchIndex = preferredParagraphId
			? paragraphs.findIndex((paragraph) => paragraph.id === preferredParagraphId)
			: -1;
		const activeIndex =
			preferredParagraphMatchIndex >= 0
				? preferredParagraphMatchIndex
				: preferredIndex ?? currentIndex;
		const paragraphSnapshots = await Promise.all(
			paragraphs.map((paragraph, index) =>
				this.toReaderParagraph(paragraph, { includeHtml: index === activeIndex })
			)
		);
		return {
			paragraphs: paragraphSnapshots,
			currentIndex: activeIndex,
		};
	}

	async resolveParagraphSelection(
		paragraphId: string,
		startOffset: number,
		endOffset: number
	): Promise<ReaderParagraphSelectionResolution | null> {
		const paragraph = this.paragraphRecordById.get(paragraphId);
		if (!paragraph) {
			return null;
		}
		const totalLength = paragraph.text.length;
		const normalizedStart = this.clamp(Math.floor(startOffset), 0, totalLength);
		const normalizedEnd = this.clamp(Math.ceil(endOffset), 0, totalLength);
		if (normalizedEnd <= normalizedStart) {
			return null;
		}

		const resolvedRange = await this.createParagraphSelectionRange(
			paragraph,
			normalizedStart,
			normalizedEnd
		);
		if (!resolvedRange) {
			return null;
		}

		const { range, chapterIndex } = resolvedRange;
		let cfiRange: string | null = null;
		const visibleFrame = this.getVisibleFramesWithIndex().find(
			(item) => item.index === chapterIndex
		);
		if (visibleFrame) {
			const liveRange = this.resolveParagraphRangeInDocument(
				paragraph,
				visibleFrame.document,
				normalizedStart,
				normalizedEnd
			);
			cfiRange = liveRange ? visibleFrame.frame.cfiFromRange(liveRange) : null;
		}
		if (!cfiRange) {
			try {
				cfiRange = this.parser.createCfiFromRange(chapterIndex, range);
			} catch (error) {
				logger.warn("[FoliateReaderService] Failed to resolve paragraph selection CFI:", {
					paragraphId,
					chapterIndex,
					error,
				});
			}
		}
		if (!cfiRange) {
			return null;
		}

		return {
			cfiRange,
			text: paragraph.text.slice(normalizedStart, normalizedEnd).trim(),
		};
	}

	async openParagraphFootnotePreview(
		paragraphId: string,
		href: string,
		label?: string,
		options?: {
			pinned?: boolean;
			rect?: ReaderFootnotePreviewInfo["rect"];
		}
	): Promise<void> {
		const paragraph = this.paragraphRecordById.get(paragraphId);
		if (!paragraph) {
			this.dismissParagraphFootnotePreview({ unpin: true });
			return;
		}
		const doc = await this.parser.getRawDocumentByIndex(paragraph.chapterIndex);
		if (!doc) {
			this.dismissParagraphFootnotePreview({ unpin: true });
			return;
		}
		const paragraphElement = this.resolveElementPath(
			doc.body || doc.documentElement,
			paragraph.elementPath
		);
		if (!(paragraphElement instanceof HTMLElement)) {
			this.dismissParagraphFootnotePreview({ unpin: true });
			return;
		}
		const targetHref = String(href || "").trim();
		const targetLabel = String(label || "")
			.replace(/\s+/g, " ")
			.trim();
		const matchingAnchor = Array.from(paragraphElement.querySelectorAll("a")).find((anchor) => {
			if (!(anchor instanceof HTMLAnchorElement) || !this.isFootnoteReference(anchor)) {
				return false;
			}
			const anchorHref = String(anchor.getAttribute("href") || "").trim();
			const anchorLabel = String(anchor.textContent || "")
				.replace(/\s+/g, " ")
				.trim();
			return anchorHref === targetHref || (targetLabel.length > 0 && anchorLabel === targetLabel);
		}) as HTMLAnchorElement | undefined;
		if (!matchingAnchor) {
			this.dismissParagraphFootnotePreview({ unpin: true });
			return;
		}
		const rectOverride = options?.rect;
		const pinned = options?.pinned === true;
		if (!rectOverride || pinned) {
			this.emitFootnotePreviewForAnchor(doc, matchingAnchor, {
				pinned,
				suppressRelocateMs: 0,
				rectOverride,
			});
			return;
		}

		const session = ++this.paragraphFootnotePreviewSession;
		this.footnotePreviewPinned = false;
		const pendingInfo = this.buildPendingFootnotePreviewInfo(doc, matchingAnchor, rectOverride);
		if (
			pendingInfo &&
			session === this.paragraphFootnotePreviewSession &&
			!this.footnotePreviewPinned
		) {
			this.notifyFootnotePreview(pendingInfo);
		}
		try {
			const previewInfo = await this.buildFootnotePreviewInfo(doc, matchingAnchor, rectOverride);
			if (session !== this.paragraphFootnotePreviewSession || this.footnotePreviewPinned) {
				return;
			}
			this.notifyFootnotePreview(
				previewInfo ||
					this.buildStatusFootnotePreviewInfo(
						doc,
						matchingAnchor,
						"脚注内容暂时无法显示",
						rectOverride
					)
			);
		} catch (error) {
			if (session !== this.paragraphFootnotePreviewSession || this.footnotePreviewPinned) {
				return;
			}
			logger.warn("[FoliateReaderService] Failed to resolve paragraph footnote preview:", error);
			this.notifyFootnotePreview(
				this.buildStatusFootnotePreviewInfo(
					doc,
					matchingAnchor,
					"脚注内容暂时无法显示",
					rectOverride
				)
			);
		}
	}

	getChapterReadingPointDraft(
		href: string,
		titleHint?: string
	): Promise<EpubChapterReadingPointDraft | null> {
		return this.parser.getSectionReadingPointDraft(href, titleHint);
	}

	getBookFootnotesDraft(): Promise<EpubBookFootnotesDraft | null> {
		return this.parser.getBookFootnotesDraft();
	}

	getSectionHrefForCfi(cfi: string): string | null {
		return this.parser.getSectionHrefForCfi(cfi);
	}

	getSectionHrefByChapterIndex(chapterIndex: number): string | null {
		if (!Number.isFinite(chapterIndex) || chapterIndex < 0) {
			return null;
		}
		return this.parser.getSectionHrefByIndex(Math.floor(chapterIndex)) || null;
	}

	getCurrentCFI(): string {
		return this.currentPosition.cfi;
	}

	async nextChapter(): Promise<boolean> {
		return this.enqueueNavigation(async (positionOperationToken) => {
			const chapterCount = this.parser.getMetadata().chapterCount;
			const currentChapterIndex = this.currentPosition.chapterIndex ?? 0;
			if (chapterCount <= 1 || currentChapterIndex < 0 || currentChapterIndex >= chapterCount - 1) {
				return false;
			}

			const nextHref = this.parser.getSectionHrefByIndex(currentChapterIndex + 1);
			if (!nextHref) {
				return false;
			}

			this.clearSelections();
			await this.navigateViewWithFallback(nextHref, nextHref, positionOperationToken);
			await this.syncCurrentPositionFromTarget(nextHref, undefined, positionOperationToken);
			return true;
		}, "nextChapter");
	}

	isAtCurrentChapterEnd(): boolean {
		if (this.currentFlowMode !== "scrolled") {
			return false;
		}

		const sectionIndex = this.currentPosition.chapterIndex ?? 0;
		const section = this.parser.getSectionReadingMetrics(sectionIndex);
		if (!section) {
			return false;
		}

		const totalPositions = this.parser.getTotalPositions();
		const currentPage = this.normalizeCurrentPage(totalPositions);
		const chapterEndPage = section.positionStart + Math.max(section.positionCount, 1);
		return currentPage >= chapterEndPage;
	}

	async prevPage(): Promise<void> {
		await this.enqueueNavigation(async () => {
			this.clearSelections();
			if (!this.foliateView) {
				return;
			}
			if (typeof this.foliateView.goLeft === "function") {
				await this.foliateView.goLeft();
				return;
			}
			await this.foliateView.prev();
		}, "prevPage");
	}

	async nextPage(): Promise<void> {
		await this.enqueueNavigation(async () => {
			this.clearSelections();
			if (!this.foliateView) {
				return;
			}
			if (typeof this.foliateView.goRight === "function") {
				await this.foliateView.goRight();
				return;
			}
			await this.foliateView.next();
		}, "nextPage");
	}

	async goToPage(pageNumber: number): Promise<void> {
		await this.enqueueNavigation(async (positionOperationToken) => {
			this.clearSelections();
			const canonical = await this.parser.resolveCfiForPage(pageNumber);
			if (!canonical) {
				return;
			}
			await this.navigateViewWithFallback(
				canonical,
				this.getSectionHrefFallbackTarget(canonical),
				positionOperationToken
			);
			await this.syncCurrentPositionFromTarget(canonical, undefined, positionOperationToken);
		}, "goToPage");
	}

	getPageNumberFromCfi(cfi: string): Promise<number | undefined> {
		return this.parser.resolvePageNumber(cfi);
	}

	getVisibleFrames(): ReaderFrame[] {
		return this.getVisibleFramesWithIndex().map((item) => item.frame);
	}

	onFootnotePreview(callback: (info: ReaderFootnotePreviewInfo | null) => void): () => void {
		this.footnotePreviewCallbacks.add(callback);
		return () => {
			this.footnotePreviewCallbacks.delete(callback);
		};
	}

	onSelectionChange(callback: (event: ReaderSelectionChange) => void): () => void {
		this.selectionChangeCallbacks.add(callback);
		return () => {
			this.selectionChangeCallbacks.delete(callback);
		};
	}

	onHighlightClick(callback: (info: HighlightClickInfo) => void): () => void {
		this.highlightClickCallbacks.add(callback);
		return () => {
			this.highlightClickCallbacks.delete(callback);
		};
	}

	onReferenceBadgeClick(callback: (info: HighlightClickInfo) => void): () => void {
		this.referenceBadgeClickCallbacks.add(callback);
		return () => {
			this.referenceBadgeClickCallbacks.delete(callback);
		};
	}

	getHighlightClickInfo(
		cfiRange: string,
		interactionTarget: HighlightClickInfo["interactionTarget"] = "highlight",
		geometryOverride?: {
			rect: HighlightClickInfo["rect"];
			rects?: HighlightClickInfo["rects"];
			anchorPoint?: HighlightClickInfo["anchorPoint"];
		}
	): HighlightClickInfo | null {
		const highlight = this.getCurrentHighlightByCfi(cfiRange);
		if (!highlight) {
			return null;
		}
		const geometry = geometryOverride || this.getCurrentHighlightViewportGeometry(cfiRange);
		if (!geometry?.rect) {
			return null;
		}
		return this.buildHighlightClickInfo(highlight, geometry, interactionTarget);
	}

	getSelectionViewportGeometry(cfiRange: string): ReaderViewportGeometry | null {
		const geometry = this.getCurrentHighlightViewportGeometry(cfiRange);
		if (!geometry?.rect) {
			return null;
		}
		return {
			rect: geometry.rect,
			rects: geometry.rects,
			anchorPoint: this.createAnchorPointFromRect(geometry.rect),
		};
	}

	async refreshHighlights(): Promise<void> {
		this.invalidateParagraphPresentation();
		await this.syncAnnotationsWithView();
	}

	async applyHighlights(highlights: ReaderHighlight[]): Promise<void> {
		const deduped = new Map<string, ReaderHighlight>();
		this.highlightDataMap.clear();
		for (const highlight of highlights) {
			const canonical =
				(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) ||
				highlight.cfiRange;
			const normalizedHighlight = this.normalizeHighlightSources({
				...highlight,
				cfiRange: canonical,
			});
			const key = this.normalizeLocationKey(normalizedHighlight.cfiRange);
			const existing = deduped.get(key);
			deduped.set(
				key,
				existing ? this.mergeHighlights(existing, normalizedHighlight) : normalizedHighlight
			);
		}
		this.savedHighlights = Array.from(deduped.values());
		for (const highlight of this.savedHighlights) {
			this.highlightDataMap.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		await this.refreshHighlights();
	}

	addHighlight(highlight: ReaderHighlight): void {
		void this.addResolvedHighlight(highlight);
	}

	addTemporaryHighlight(highlight: ReaderHighlightInput, durationMs = 2000): void {
		void this.addResolvedHighlight({ ...highlight, temporary: true }, durationMs);
	}

	temporarilyRevealConcealedText(cfiRange: string, durationMs = 3000): void {
		const key = this.normalizeLocationKey(cfiRange);
		const highlight = this.highlightDataMap.get(key);
		if (!highlight || highlight.presentation !== "conceal") {
			return;
		}
		const existingTimer = this.temporarilyRevealedConcealmentTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		this.temporarilyRevealedConcealmentTimers.set(
			key,
			setTimeout(() => {
				this.temporarilyRevealedConcealmentTimers.delete(key);
				void this.refreshHighlights();
			}, Math.max(200, durationMs))
		);
		void this.refreshHighlights();
	}

	removeHighlight(cfiRange: string): void {
		const key = this.normalizeLocationKey(cfiRange);
		this.highlightDataMap.delete(key);
		this.temporaryHighlightDataMap.delete(key);
		this.savedHighlights = this.savedHighlights.filter(
			(item) => this.normalizeLocationKey(item.cfiRange) !== key
		);
		const timer = this.temporaryHighlightTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.temporaryHighlightTimers.delete(key);
		}
		const revealedTimer = this.temporarilyRevealedConcealmentTimers.get(key);
		if (revealedTimer) {
			clearTimeout(revealedTimer);
			this.temporarilyRevealedConcealmentTimers.delete(key);
		}
		this.invalidateParagraphPresentation();
		void this.syncAnnotationsWithView();
	}

	destroy(): void {
		void this.destroyAll();
	}

	private handleRelocateEvent = (event: Event): void => {
		if (event.currentTarget && event.currentTarget !== this.foliateView) {
			return;
		}
		const detail = (event as CustomEvent<{ cfi?: string; index?: number }>).detail;
		if (!detail) {
			return;
		}

		const shouldPreserveFootnotePreview = this.footnotePreviewController.shouldPreserveOnRelocate();
		if (!shouldPreserveFootnotePreview) {
			this.dismissFootnotePreview({ unpin: true });
		}

		const target =
			detail.cfi ||
			(typeof detail.index === "number" ? this.parser.getSectionHrefByIndex(detail.index) : "") ||
			this.currentPosition.cfi;
		if (!target) {
			return;
		}

		this.schedulePaginatedLayoutRecovery();
		const positionOperationToken = this.sessionGuard.startPositionOperation();
		void this.syncCurrentPositionFromTarget(target, undefined, positionOperationToken);
	};

	private handleLoadEvent = (event: Event): void => {
		if (event.currentTarget && event.currentTarget !== this.foliateView) {
			return;
		}
		const detail = (event as CustomEvent<{ doc?: Document; index?: number }>).detail;
		const doc = detail?.doc;
		if (!doc) {
			return;
		}

		const index =
			typeof detail.index === "number" ? detail.index : this.currentPosition.chapterIndex || 0;
		this.loadedDocumentSectionIndexes.set(doc, index);
		this.maybeInvalidateParagraphCacheForSection(index, doc);
		this.normalizeDocument(doc);
		this.attachSelectionListeners(doc);
		this.attachWheelListeners(doc);
		this.renderedAnnotations.clear();
		this.schedulePaginatedLayoutRecovery();
		void this.syncAnnotationsWithView();
	};

	private handleLinkEvent = (event: Event): void => {
		if (event.currentTarget && event.currentTarget !== this.foliateView) {
			return;
		}
		const detail = (event as CustomEvent<{ a?: HTMLAnchorElement; href?: string }>).detail;
		const anchor = detail?.a;
		if (!anchor) {
			return;
		}
		if (!this.isFootnoteReference(anchor)) {
			return;
		}
		if (this.currentFootnoteClickAction === "navigate") {
			this.dismissFootnotePreview({ unpin: true });
			return;
		}
		event.preventDefault();
		const href = anchor.getAttribute("href") || detail?.href || "";
		const text = String(anchor.textContent || "").trim();
		logFootnoteDiag(`Click reference intercepted href=${href} text=${text}`);
		this.emitFootnotePreviewForAnchor(anchor.ownerDocument, anchor, {
			pinned: true,
			suppressRelocateMs: 1800,
		});
	};

	private handleDrawAnnotationEvent = (event: Event): void => {
		if (event.currentTarget && event.currentTarget !== this.foliateView) {
			return;
		}
		const detail = (
			event as CustomEvent<{
				draw?: (
					draw: (rects: unknown[], options?: unknown) => SVGElement,
					options?: unknown
				) => void;
				annotation?: FoliateAnnotation;
			}>
		).detail;
		if (!detail?.annotation || typeof detail.draw !== "function") {
			return;
		}
		void this.drawAnnotation(detail.annotation, detail.draw);
	};

	private handleShowAnnotationEvent = (event: Event): void => {
		if (event.currentTarget && event.currentTarget !== this.foliateView) {
			return;
		}
		const detail = (
			event as CustomEvent<{
				value?: string;
				index?: number;
				range?: Range;
			}>
		).detail;
		const value = detail?.value;
		if (!value) {
			return;
		}

		const key = this.normalizeLocationKey(value);
		const highlight = this.highlightDataMap.get(key) || this.temporaryHighlightDataMap.get(key);
		if (!highlight) {
			return;
		}

		const frame =
			this.getVisibleFramesWithIndex().find((item) => item.index === detail.index) ||
			this.getVisibleFramesWithIndex()[0];
		if (this.hasActiveReaderSelection(frame?.document)) {
			return;
		}
		const containerRect = this.renderContainer?.getBoundingClientRect();
		const rect =
			frame && detail.range
				? this.createViewportRect(frame, detail.range) || {
						top: 0,
						left: 0,
						bottom: containerRect?.height || 0,
						right: containerRect?.width || 0,
						width: containerRect?.width || 0,
						height: containerRect?.height || 0,
				  }
				: {
						top: 0,
						left: 0,
						bottom: containerRect?.height || 0,
						right: containerRect?.width || 0,
						width: containerRect?.width || 0,
						height: containerRect?.height || 0,
				  };

		const info = this.buildHighlightClickInfo(
			highlight,
			{
				rect,
				rects:
					frame && detail.range
						? this.createViewportRectList(frame, detail.range) || undefined
						: undefined,
			},
			"highlight"
		);
		this.notifyHighlightClick(info);
	};

	private async resolveNavigationRequest(
		options: ReaderNavigateOptions,
		positionOperationToken?: number
	): Promise<{ canonical: string | null }> {
		const rawCfi = String(options.cfi || "").trim();
		const rawHref = String(options.href || "").trim();
		const rawTarget = rawCfi || rawHref;
		if (!rawTarget) {
			return { canonical: null };
		}

		const resolved = await this.parser.resolveNavigationTarget(rawTarget, options.text);
		const canonical = resolved?.cfi || null;
		if (!resolved && !rawHref) {
			return { canonical: null };
		}

		const viewTarget = rawHref && !rawCfi ? rawHref : canonical || rawTarget;
		const fallbackTarget =
			rawHref ||
			resolved?.href ||
			this.getSectionHrefFallbackTarget(canonical || rawCfi || rawTarget);
		this.clearSelections();
		await this.navigateViewWithFallback(viewTarget, fallbackTarget, positionOperationToken);
		await this.syncCurrentPositionFromTarget(
			canonical || rawTarget,
			options.text,
			positionOperationToken
		);
		return { canonical };
	}

	private enqueueNavigation<T>(
		operation: (positionOperationToken: number) => Promise<T>,
		label: string
	): Promise<T> {
		const positionOperationToken = this.sessionGuard.startPositionOperation();
		const run = () => operation(positionOperationToken);
		const underlyingTask = this.navigationTask.catch(() => undefined).then(run, run);
		this.navigationTask = underlyingTask.then(
			() => undefined,
			() => undefined
		);
		return this.withNavigationTimeout(underlyingTask, label);
	}

	private withNavigationTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const timer = window.setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				this.sessionGuard.startPositionOperation();
				reject(new Error(`FoliateReaderService navigation timed out: ${label}`));
			}, FoliateReaderService.NAVIGATION_TIMEOUT_MS);

			operation.then(
				(value) => {
					if (settled) {
						return;
					}
					settled = true;
					window.clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					if (settled) {
						return;
					}
					settled = true;
					window.clearTimeout(timer);
					reject(error);
				}
			);
		});
	}

	private async stabilizeViewAfterNavigation(
		target?: string,
		positionOperationToken?: number,
		viewSessionToken?: number,
		options?: { retarget?: boolean }
	): Promise<void> {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		if (!renderer) {
			return;
		}

		if (typeof renderer.render === "function") {
			renderer.render();
		}
		await this.waitForAnimationFrame();
		if (
			!this.sessionGuard.canApplyPositionOperation(
				this.foliateView,
				positionOperationToken,
				viewSessionToken
			)
		) {
			return;
		}

		const normalizedTarget = String(target || "").trim();
		const shouldRetarget =
			options?.retarget ??
			(Boolean(normalizedTarget) &&
				this.currentFlowMode === "paginated" &&
				(!this.isCfiLikeTarget(normalizedTarget) ||
					this.isSectionBaseCfiTarget(normalizedTarget)));
		if (shouldRetarget && normalizedTarget && this.foliateView) {
			await this.foliateView.goTo(normalizedTarget);
			await this.waitForAnimationFrame();
			if (
				!this.sessionGuard.canApplyPositionOperation(
					this.foliateView,
					positionOperationToken,
					viewSessionToken
				)
			) {
				return;
			}
		}

		if (typeof renderer.render === "function") {
			renderer.render();
		}
		this.schedulePaginatedLayoutRecovery();
	}

	private async waitForAnimationFrame(): Promise<void> {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	private clearSelections(): void {
		const docs = new Set<Document>([document]);
		for (const frame of this.getVisibleFramesWithIndex()) {
			docs.add(frame.document);
		}
		for (const doc of docs) {
			try {
				doc.getSelection?.()?.removeAllRanges();
			} catch {}
			try {
				doc.defaultView?.getSelection?.()?.removeAllRanges();
			} catch {}
		}
	}

	private getElementFromEventTarget(target: EventTarget | null): Element | null {
		const node = target as Node | null;
		if (!node || typeof node.nodeType !== "number") {
			return null;
		}
		if (node.nodeType === Node.ELEMENT_NODE) {
			return node as Element;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			return (node as ChildNode).parentElement;
		}
		return null;
	}

	private bridgeHostSelectionMouseUp(doc: Document, event: MouseEvent): void {
		const payload = this.createBridgedHostSelectionPayload(doc);
		const dispatchHostMouseUp = () => {
			document.dispatchEvent(
				new MouseEvent("mouseup", {
					bubbles: event.bubbles,
					cancelable: event.cancelable,
					composed: true,
					button: event.button,
					buttons: event.buttons,
					clientX: event.clientX,
					clientY: event.clientY,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
				})
			);
		};
		if (!payload) {
			dispatchHostMouseUp();
			return;
		}
		const bridgedSelection = this.createBridgedHostSelection(payload);
		const windowSelectionDescriptor = Object.getOwnPropertyDescriptor(window, "getSelection");
		const documentSelectionDescriptor = Object.getOwnPropertyDescriptor(document, "getSelection");
		Object.defineProperty(window, "getSelection", {
			configurable: true,
			value: () => bridgedSelection,
		});
		Object.defineProperty(document, "getSelection", {
			configurable: true,
			value: () => bridgedSelection,
		});
		try {
			dispatchHostMouseUp();
		} finally {
			if (windowSelectionDescriptor) {
				Object.defineProperty(window, "getSelection", windowSelectionDescriptor);
			} else {
				Reflect.deleteProperty(window as unknown as Record<string, unknown>, "getSelection");
			}
			if (documentSelectionDescriptor) {
				Object.defineProperty(document, "getSelection", documentSelectionDescriptor);
			} else {
				Reflect.deleteProperty(document as unknown as Record<string, unknown>, "getSelection");
			}
		}
	}

	private createBridgedHostSelectionPayload(doc: Document): BridgedHostSelectionPayload | null {
		const sourceSelection = doc.defaultView?.getSelection?.();
		if (!sourceSelection || sourceSelection.isCollapsed || sourceSelection.rangeCount === 0) {
			return null;
		}
		const text = sourceSelection.toString().trim();
		if (!text) {
			return null;
		}
		const sourceRange = sourceSelection.getRangeAt(0);
		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		const primaryRect = frame
			? this.createViewportRect(frame, sourceRange)
			: this.createViewportRectFromRange(doc, sourceRange);
		if (!primaryRect) {
			return null;
		}
		const rects = frame
			? this.createViewportRectList(frame, sourceRange) || [primaryRect]
			: [primaryRect];
		return {
			text,
			sourceSelection,
			sourceRange,
			primaryRect,
			rects,
		};
	}

	private createBridgedHostSelection(payload: BridgedHostSelectionPayload): Selection {
		const bridgedRange = {
			...payload.sourceRange,
			getBoundingClientRect: () =>
				new DOMRect(
					payload.primaryRect.left,
					payload.primaryRect.top,
					payload.primaryRect.width,
					payload.primaryRect.height
				),
			getClientRects: () => {
				const rects = (payload.rects.length ? payload.rects : [payload.primaryRect]).map(
					(rect) => new DOMRect(rect.left, rect.top, rect.width, rect.height)
				);
				return {
					length: rects.length,
					item: (index: number) => rects[index] || null,
					[Symbol.iterator]: function* iterator() {
						yield* rects;
					},
				} as unknown as DOMRectList;
			},
		} as Range;
		return {
			...payload.sourceSelection,
			rangeCount: 1,
			isCollapsed: false,
			toString: () => payload.text,
			getRangeAt: () => bridgedRange,
		} as Selection;
	}

	private createViewportRect(
		frame: { frameElement?: HTMLElement | null },
		range: Range
	): HighlightClickInfo["rect"] | null {
		const rawRect = this.extractRangeBoundingRect(range);
		if (!rawRect) {
			return null;
		}
		return this.mapRawRectToViewport(frame.frameElement, rawRect);
	}

	private createViewportRectList(
		frame: { frameElement?: HTMLElement | null },
		range: Range
	): HighlightClickInfo["rect"][] | null {
		const rects = this.extractRangeClientRects(range)
			.map((rect) => this.mapRawRectToViewport(frame.frameElement, rect))
			.filter((rect): rect is HighlightClickInfo["rect"] => Boolean(rect));
		return rects.length ? rects : null;
	}

	private createViewportRectFromRange(
		doc: Document,
		range: Range
	): ReaderFootnotePreviewInfo["rect"] | null {
		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		if (frame) {
			return this.createViewportRect(frame, range);
		}
		const rawRect = this.extractRangeBoundingRect(range);
		return rawRect ? this.createViewportRectFromRawRect(rawRect) : null;
	}

	private createViewportRectFromElement(
		doc: Document,
		element: Element
	): ReaderFootnotePreviewInfo["rect"] | null {
		try {
			const range = doc.createRange();
			range.selectNodeContents(element);
			const rect = this.createViewportRectFromRange(doc, range);
			if (rect) {
				return rect;
			}
		} catch {}

		const fallbackRect = this.createElementViewportRect(element);
		if (!fallbackRect) {
			return null;
		}
		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		if (!frame?.frameElement) {
			return fallbackRect;
		}
		return this.mapRawRectToViewport(frame.frameElement, {
			left: fallbackRect.left,
			top: fallbackRect.top,
			width: fallbackRect.width,
			height: fallbackRect.height,
		});
	}

	private extractRangeBoundingRect(range: Range): {
		left: number;
		top: number;
		width: number;
		height: number;
	} | null {
		const rect = range.getBoundingClientRect?.();
		if (rect && (rect.width > 0 || rect.height > 0)) {
			return {
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height,
			};
		}
		return this.extractRangeClientRects(range)[0] || null;
	}

	private extractRangeClientRects(range: Range): Array<{
		left: number;
		top: number;
		width: number;
		height: number;
	}> {
		const rects = Array.from(range.getClientRects?.() || [])
			.map((rect) => ({
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height,
			}))
			.filter((rect) => rect.width > 0 || rect.height > 0);
		if (rects.length > 0) {
			return rects;
		}
		const fallbackRect = range.getBoundingClientRect?.();
		if (fallbackRect && (fallbackRect.width > 0 || fallbackRect.height > 0)) {
			return [
				{
					left: fallbackRect.left,
					top: fallbackRect.top,
					width: fallbackRect.width,
					height: fallbackRect.height,
				},
			];
		}
		return [];
	}

	private mapRawRectToViewport(
		frameElement: HTMLElement | null | undefined,
		rawRect: {
			left: number;
			top: number;
			width: number;
			height: number;
		}
	): HighlightClickInfo["rect"] | null {
		if (!frameElement) {
			return this.createViewportRectFromRawRect(rawRect);
		}
		const iframeRect = frameElement.getBoundingClientRect();
		return this.createViewportRectFromRawRect({
			left: rawRect.left + iframeRect.left,
			top: rawRect.top + iframeRect.top,
			width: rawRect.width,
			height: rawRect.height,
		});
	}

	private isFootnoteReference(anchor: HTMLAnchorElement): boolean {
		return this.footnotePreviewResolver.isFootnoteReference(anchor);
	}

	private findFootnoteReference(target: EventTarget | null): HTMLAnchorElement | null {
		const originElement = this.getElementFromEventTarget(target);
		const anchor =
			originElement instanceof HTMLAnchorElement
				? originElement
				: (originElement?.closest?.("a[href]") as HTMLAnchorElement | null);
		if (!anchor) {
			return null;
		}
		return this.isFootnoteReference(anchor) ? anchor : null;
	}

	private findFootnoteReferenceFromEvent(event: Event): HTMLAnchorElement | null {
		const composedPath = typeof event.composedPath === "function" ? event.composedPath() : [];
		for (const target of composedPath) {
			const anchor = this.findFootnoteReference(target as EventTarget | null);
			if (anchor) {
				return anchor;
			}
		}
		return this.findFootnoteReference(event.target);
	}

	private buildPendingFootnotePreviewInfo(
		doc: Document,
		anchor: HTMLAnchorElement,
		rectOverride?: ReaderFootnotePreviewInfo["rect"]
	): ReaderFootnotePreviewInfo | null {
		return this.footnotePreviewResolver.buildPendingPreviewInfo(doc, anchor, rectOverride);
	}

	private buildStatusFootnotePreviewInfo(
		doc: Document,
		anchor: HTMLAnchorElement,
		text: string,
		rectOverride?: ReaderFootnotePreviewInfo["rect"]
	): ReaderFootnotePreviewInfo | null {
		return this.footnotePreviewResolver.buildStatusPreviewInfo(doc, anchor, text, rectOverride);
	}

	private buildFootnotePreviewInfo(
		doc: Document,
		anchor: HTMLAnchorElement,
		rectOverride?: ReaderFootnotePreviewInfo["rect"]
	): Promise<ReaderFootnotePreviewInfo | null> {
		return this.footnotePreviewResolver.buildPreviewInfo(doc, anchor, rectOverride);
	}

	private notifyFootnotePreview(info: ReaderFootnotePreviewInfo | null): void {
		for (const callback of this.footnotePreviewCallbacks) {
			try {
				callback(info);
			} catch (error) {
				logger.warn("[FoliateReaderService] Footnote preview listener failed:", error);
			}
		}
	}

	private emitFootnotePreviewForAnchor(
		doc: Document,
		anchor: HTMLAnchorElement,
		options?: {
			pinned?: boolean;
			suppressRelocateMs?: number;
			rectOverride?: ReaderFootnotePreviewInfo["rect"];
		}
	): void {
		this.footnotePreviewController.emitForAnchor(doc, anchor, options);
	}

	private dismissFootnotePreview(options?: { unpin?: boolean }): void {
		this.footnotePreviewController.dismiss(options);
	}

	dismissParagraphFootnotePreview(options?: { unpin?: boolean }): void {
		this.paragraphFootnotePreviewSession += 1;
		this.dismissFootnotePreview(options);
	}

	private normalizeDocument(doc: Document): void {
		const mountPoint = doc.head || doc.documentElement;
		if (!mountPoint) {
			return;
		}
		let styleElement = this.documentStyleElements.get(doc);
		if (!styleElement || !styleElement.isConnected) {
			styleElement = doc.createElement("style");
			styleElement.setAttribute("data-weave-foliate-reader-style", "true");
			mountPoint.appendChild(styleElement);
			this.documentStyleElements.set(doc, styleElement);
		}
		styleElement.textContent = this.buildReaderStyles();
		const colorScheme = this.getCurrentColorScheme();
		const background = this.getObsidianCSSVar("--background-primary", "rgb(255, 255, 255)");
		const textColor = this.getObsidianCSSVar("--text-normal", "rgb(28, 29, 31)");
		doc.documentElement.style.colorScheme = colorScheme;
		doc.documentElement.style.backgroundColor = background;
		doc.documentElement.style.color = textColor;
		if (doc.body) {
			doc.body.style.colorScheme = colorScheme;
			doc.body.style.backgroundColor = background;
			doc.body.style.color = textColor;
		}
		this.attachFootnotePreviewListeners(doc);
	}

	private async navigateViewWithFallback(
		primaryTarget?: string,
		fallbackTarget?: string,
		positionOperationToken?: number,
		viewSessionToken?: number
	): Promise<void> {
		const normalizedPrimaryTarget = String(primaryTarget || "").trim();
		const normalizedFallbackTarget = String(fallbackTarget || "").trim();
		if (
			!this.foliateView ||
			!this.sessionGuard.canApplyPositionOperation(
				this.foliateView,
				positionOperationToken,
				viewSessionToken
			) ||
			(!normalizedPrimaryTarget && !normalizedFallbackTarget)
		) {
			return;
		}

		const preferredSafeTarget = this.getPreferredSafeNavigationTarget(
			normalizedPrimaryTarget,
			normalizedFallbackTarget
		);
		if (preferredSafeTarget) {
			await this.goToAndStabilize(preferredSafeTarget, positionOperationToken, viewSessionToken);
			return;
		}

		if (normalizedPrimaryTarget) {
			try {
				await this.goToAndStabilize(
					normalizedPrimaryTarget,
					positionOperationToken,
					viewSessionToken
				);
				return;
			} catch (error) {
				if (
					!normalizedFallbackTarget ||
					normalizedFallbackTarget === normalizedPrimaryTarget ||
					!this.shouldFallbackFromNavigationError(normalizedPrimaryTarget, error)
				) {
					throw error;
				}
				logger.warn(
					"[FoliateReaderService] EPUB navigation target failed, falling back to section href:",
					{
						primaryTarget: normalizedPrimaryTarget,
						fallbackTarget: normalizedFallbackTarget,
						error,
					}
				);
			}
		}

		await this.goToAndStabilize(
			normalizedFallbackTarget,
			positionOperationToken,
			viewSessionToken
		);
	}

	private async goToAndStabilize(
		target: string,
		positionOperationToken?: number,
		viewSessionToken?: number
	): Promise<void> {
		if (
			!this.foliateView ||
			!this.sessionGuard.canApplyPositionOperation(
				this.foliateView,
				positionOperationToken,
				viewSessionToken
			)
		) {
			return;
		}
		const view = this.foliateView;
		await view.goTo(target);
		if (
			!this.sessionGuard.canApplyPositionOperation(
				this.foliateView,
				positionOperationToken,
				viewSessionToken,
				view
			)
		) {
			return;
		}
		const normalizedTarget = String(target || "").trim();
		await this.stabilizeViewAfterNavigation(
			normalizedTarget,
			positionOperationToken,
			viewSessionToken,
			{
				retarget:
					this.layoutChangeInFlight ||
					!normalizedTarget ||
					!this.isCfiLikeTarget(normalizedTarget) ||
					this.isSectionBaseCfiTarget(normalizedTarget),
			}
		);
	}

	private async tryApplyLightweightLocationUpdate(
		canonical: string,
		positionOperationToken?: number
	): Promise<boolean> {
		if (
			!this.foliateView ||
			!this.sessionGuard.canApplyPositionOperation(this.foliateView, positionOperationToken)
		) {
			return false;
		}

		const chapterIndex = this.parser.getSectionIndexForCfi(canonical);
		if (chapterIndex === null || chapterIndex !== this.getCurrentChapterIndex()) {
			return false;
		}

		const visibleFrame = this.getVisibleFramesWithIndex().find(
			(item) => item.index === chapterIndex
		);
		if (!visibleFrame) {
			return false;
		}

		const range = this.parser.resolveRangeInLoadedSection(
			canonical,
			visibleFrame.document,
			chapterIndex
		);
		if (!range) {
			return false;
		}

		if (this.currentFlowMode === "paginated") {
			const targetPage = await this.parser.resolvePageNumber(canonical);
			const currentPage = this.normalizeCurrentPage(this.parser.getTotalPositions());
			if (targetPage && currentPage && targetPage !== currentPage) {
				return false;
			}
		}

		await this.syncCurrentPositionFromTarget(canonical, undefined, positionOperationToken);
		return this.sessionGuard.canApplyPositionOperation(
			this.foliateView,
			positionOperationToken
		);
	}

	private getSectionHrefFallbackTarget(...candidates: Array<string | null | undefined>): string {
		for (const candidate of candidates) {
			const normalized = String(candidate || "").trim();
			if (!normalized) {
				continue;
			}
			if (!this.isCfiLikeTarget(normalized)) {
				return normalized;
			}
			const href = this.parser.getSectionHrefForCfi(normalized);
			if (href) {
				return href;
			}
		}
		return (
			this.currentChapterHref ||
			this.parser.getSectionHrefByIndex(this.currentPosition.chapterIndex || 0)
		);
	}

	private shouldFallbackFromNavigationError(target: string, error: unknown): boolean {
		if (!this.isCfiLikeTarget(target)) {
			return false;
		}
		const normalizedMessage = String(
			(error as { message?: string } | null)?.message || ""
		).toLowerCase();
		return (
			normalizedMessage.includes("invalid epub cfi target") ||
			normalizedMessage.includes("childnodes") ||
			normalizedMessage.includes("reading 'length'") ||
			normalizedMessage.includes('reading "length"') ||
			normalizedMessage.includes("epubcfi") ||
			normalizedMessage.includes(" cfi")
		);
	}

	private getPreferredSafeNavigationTarget(
		primaryTarget: string,
		fallbackTarget: string
	): string | null {
		if (!primaryTarget || !this.isSectionBaseCfiTarget(primaryTarget)) {
			return null;
		}
		const preferredTarget = this.getSectionHrefFallbackTarget(primaryTarget, fallbackTarget);
		if (
			!preferredTarget ||
			preferredTarget === primaryTarget ||
			this.isCfiLikeTarget(preferredTarget)
		) {
			return null;
		}
		return preferredTarget;
	}

	private isCfiLikeTarget(target: string): boolean {
		const normalized = String(target || "").trim();
		return normalized.startsWith("epubcfi(") || /^\/\d+/.test(normalized);
	}

	private isSectionBaseCfiTarget(target: string): boolean {
		const normalized = String(target || "").trim();
		if (!this.isCfiLikeTarget(normalized)) {
			return false;
		}
		const wrapped = normalized.startsWith("epubcfi(") ? normalized : `epubcfi(${normalized})`;
		return wrapped.startsWith("epubcfi(/6/") && !wrapped.includes("!");
	}

	private async syncCurrentPositionFromTarget(
		target: string,
		textHint?: string,
		positionOperationToken?: number
	): Promise<void> {
		const resolved = await this.parser.resolveNavigationTarget(target, textHint);
		if (
			!resolved ||
			!this.sessionGuard.canApplyPositionOperation(this.foliateView, positionOperationToken)
		) {
			return;
		}

		const totalPages = this.parser.getTotalPositions();
		const currentPage = resolved.cfi
			? (await this.parser.resolvePageNumber(resolved.cfi)) || (totalPages > 0 ? 1 : 0)
			: totalPages > 0
			? 1
			: 0;

		let percent = 0;
		if (totalPages > 1 && currentPage > 0) {
			percent = this.clamp(((currentPage - 1) / (totalPages - 1)) * 100, 0, 100);
		} else if (resolved.doc && resolved.range) {
			const sectionProgress = this.computeSectionProgression(resolved.doc, resolved.range);
			const chapterCount = Math.max(this.parser.getMetadata().chapterCount, 1);
			percent = this.clamp(((resolved.index + sectionProgress) / chapterCount) * 100, 0, 100);
		}

		this.currentChapterTitle = this.parser.getSectionTitleByIndex(resolved.index);
		this.currentChapterHref = resolved.href;
		this.currentPosition = {
			chapterIndex: resolved.index,
			cfi: resolved.cfi || this.currentPosition.cfi,
			percent,
		};
		this.currentPaginationInfo = {
			currentPage,
			totalPages,
		};
		if (this.currentBook) {
			this.currentBook.currentPosition = { ...this.currentPosition };
		}

		const sectionProgression =
			resolved.doc && resolved.range
				? this.computeSectionProgression(resolved.doc, resolved.range)
				: 0;
		this.recordReadingPaceOnRelocate(currentPage, resolved.index, sectionProgression);

		for (const callback of this.relocatedCallbacks) {
			try {
				callback(this.currentPosition);
			} catch (error) {
				logger.warn("[FoliateReaderService] Relocate listener failed:", error);
			}
		}
	}

	private computeSectionProgression(doc: Document, range: Range): number {
		const root = doc.body || doc.documentElement;
		const text = root?.textContent?.replace(/\s+/g, " ").trim() || "";
		if (!text) {
			return 0;
		}
		const probe = doc.createRange();
		probe.selectNodeContents(root);
		probe.setEnd(range.startContainer, range.startOffset);
		return this.clamp(probe.toString().length / Math.max(text.length, 1), 0, 1);
	}

	private getFoliateVisibleContents(): Array<{ index?: number; doc?: Document | null }> {
		const rendererContents = (
			this.foliateView?.renderer as FoliateRenderer | undefined
		)?.getContents?.();
		if (Array.isArray(rendererContents)) {
			return rendererContents;
		}

		// Backward-compat fallback for older foliate runtimes that exposed getContents() on the view.
		const legacyView = this.foliateView as
			| (FoliateViewElement & {
					getContents?: () => Array<{ index?: number; doc?: Document | null }>;
			  })
			| null;
		const legacyContents = legacyView?.getContents?.();
		return Array.isArray(legacyContents) ? legacyContents : [];
	}

	private getVisibleFramesWithIndex(): VisibleFrameWithIndex[] {
		const contents = this.getFoliateVisibleContents();
		const visibleFrames: VisibleFrameWithIndex[] = [];

		for (const item of contents) {
			const doc = item.doc;
			if (!doc?.defaultView) {
				continue;
			}

			const index =
				typeof item.index === "number"
					? item.index
					: this.loadedDocumentSectionIndexes.get(doc) ?? this.currentPosition.chapterIndex;
			const frame = this.createReaderFrame(doc, index);
			visibleFrames.push({
				index,
				href: this.parser.getSectionHrefByIndex(index),
				document: doc,
				frameElement: (doc.defaultView.frameElement as HTMLElement | null) || null,
				frame,
			});
		}

		return visibleFrames;
	}

	private createReaderFrame(doc: Document, index: number): ReaderFrame {
		return {
			document: doc,
			window: doc.defaultView as Window,
			cfiFromRange: (range: Range) => {
				try {
					return this.parser.createCfiFromRange(index, range);
				} catch (error) {
					logger.warn("[FoliateReaderService] Failed to build CFI from range:", {
						index,
						error,
					});
					return null;
				}
			},
		};
	}

	private async toReaderParagraph(
		paragraph: ReaderParagraphRecord,
		options?: { includeHtml?: boolean }
	): Promise<ReaderParagraph> {
		return {
			id: paragraph.id,
			chapterIndex: paragraph.chapterIndex,
			chapterTitle: paragraph.chapterTitle,
			chapterHref: paragraph.chapterHref,
			text: paragraph.text,
			html: options?.includeHtml ? await this.ensureParagraphHtml(paragraph) : undefined,
			htmlRevision: options?.includeHtml ? paragraph.htmlRevision : undefined,
			cfiRange: paragraph.cfiRange,
		};
	}

	private async getParagraphRecordsForChapter(
		chapterIndex: number
	): Promise<ReaderParagraphRecord[]> {
		if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
			return [];
		}
		const cached = this.paragraphCache.get(chapterIndex);
		if (cached) {
			return cached;
		}

		const source = await this.resolveParagraphExtractionSource(chapterIndex);
		const title = this.parser.getSectionTitleByIndex(source?.chapterIndex ?? chapterIndex);
		const paragraphs = source
			? this.extractParagraphRecordsFromDocument(
					source.doc,
					source.chapterIndex,
					source.chapterHref,
					title
				)
			: [];
		for (const paragraph of paragraphs) {
			this.paragraphRecordById.set(paragraph.id, paragraph);
		}
		if (
			this.getNonBoilerplateParagraphRecordsTextLength(paragraphs) > 0 ||
			paragraphs.length === 0
		) {
			this.paragraphCache.set(chapterIndex, paragraphs);
		}
		return paragraphs;
	}

	private async getMergedParagraphRecordsForReadingContext(
		anchorChapterIndex: number
	): Promise<ReaderParagraphRecord[]> {
		const visibleIndexes = [
			...new Set(
				this.getVisibleFramesWithIndex()
					.map((frame) => frame.index)
					.filter((index) => Number.isInteger(index) && index >= 0)
			),
		].sort((left, right) => left - right);

		if (visibleIndexes.length <= 1) {
			return this.getParagraphRecordsForChapter(anchorChapterIndex);
		}

		const merged: ReaderParagraphRecord[] = [];
		for (const index of visibleIndexes) {
			merged.push(...(await this.getParagraphRecordsForChapter(index)));
		}
		if (this.getNonBoilerplateParagraphRecordsTextLength(merged) > 0) {
			return merged;
		}
		return this.getParagraphRecordsForChapter(anchorChapterIndex);
	}

	private async resolveParagraphExtractionSource(
		chapterIndex: number
	): Promise<ParagraphExtractionSource | null> {
		const defaultHref = this.parser.getSectionHrefByIndex(chapterIndex);
		const candidates: Array<{
			doc: Document;
			chapterIndex: number;
			chapterHref: string;
			nonBoilerplateLength: number;
			readableLength: number;
			explicitParagraphCount: number;
			sourcePriority: number;
		}> = [];

		const pushCandidate = (
			doc: Document | null | undefined,
			sourceChapterIndex: number,
			sourceHref: string,
			sourceKind: ParagraphExtractionCandidateSource
		) => {
			if (!doc?.body) {
				return;
			}
			const root = doc.body;
			candidates.push({
				doc,
				chapterIndex: sourceChapterIndex,
				chapterHref: sourceHref,
				readableLength: this.getParagraphReadableBodyTextLength(root),
				nonBoilerplateLength: this.getNonBoilerplateReadableBodyTextLength(root),
				explicitParagraphCount: this.countMeaningfulExplicitParagraphElements(root),
				sourcePriority: PARAGRAPH_EXTRACTION_SOURCE_PRIORITY[sourceKind],
			});
		};

		const visibleFrame = this.getVisibleFramesWithIndex().find(
			(frame) => frame.index === chapterIndex
		);
		pushCandidate(visibleFrame?.document, chapterIndex, defaultHref, "visible");

		const processed = await this.parser.getProcessedDocumentByIndex(chapterIndex);
		pushCandidate(processed, chapterIndex, defaultHref, "processed");

		const raw = await this.parser.getRawDocumentByIndex(chapterIndex);
		pushCandidate(raw, chapterIndex, defaultHref, "raw");

		if (raw) {
			for (const embedded of await this.loadEmbeddedParagraphSources(raw, chapterIndex, defaultHref)) {
				pushCandidate(embedded.doc, embedded.chapterIndex, embedded.chapterHref, "embedded");
			}
		}

		if (candidates.length === 0) {
			return null;
		}

		candidates.sort((left, right) => {
			const lengthBaseline = Math.max(
				left.nonBoilerplateLength,
				right.nonBoilerplateLength,
				1
			);
			const lengthGap = Math.abs(right.nonBoilerplateLength - left.nonBoilerplateLength);
			if (lengthGap / lengthBaseline > 0.08) {
				return right.nonBoilerplateLength - left.nonBoilerplateLength;
			}
			if (right.explicitParagraphCount !== left.explicitParagraphCount) {
				return right.explicitParagraphCount - left.explicitParagraphCount;
			}
			if (right.sourcePriority !== left.sourcePriority) {
				return right.sourcePriority - left.sourcePriority;
			}
			return right.readableLength - left.readableLength;
		});

		const best = candidates[0];
		return {
			doc: best.doc,
			chapterIndex: best.chapterIndex,
			chapterHref: best.chapterHref,
		};
	}

	private async loadEmbeddedParagraphSources(
		doc: Document,
		fallbackChapterIndex: number,
		chapterHref: string
	): Promise<ParagraphExtractionSource[]> {
		const sources: ParagraphExtractionSource[] = [];
		const seenHrefs = new Set<string>();
		const elements = Array.from(
			doc.querySelectorAll("iframe[src], object[data], embed[src]")
		);
		for (const element of elements) {
			const rawHref = String(
				element.getAttribute("src") || element.getAttribute("data") || ""
			).trim();
			if (!rawHref || /^(?:https?:|data:|blob:|javascript:)/i.test(rawHref)) {
				continue;
			}
			const resolvedHref = this.parser.resolveHrefAgainst(chapterHref, rawHref);
			const normalizedHref = resolvedHref.split("#")[0]?.split("?")[0] || "";
			if (!normalizedHref || seenHrefs.has(normalizedHref)) {
				continue;
			}
			seenHrefs.add(normalizedHref);
			const embeddedIndex = this.parser.getSectionIndexForHref(normalizedHref);
			const embeddedChapterIndex =
				embeddedIndex >= 0 ? embeddedIndex : fallbackChapterIndex;
			const loaders = [
				this.parser.getProcessedDocumentByHref(normalizedHref),
				this.parser.getRawDocumentByHref(normalizedHref),
			];
			for (const loader of loaders) {
				const embeddedDoc = await loader;
				if (embeddedDoc?.body) {
					sources.push({
						doc: embeddedDoc,
						chapterIndex: embeddedChapterIndex,
						chapterHref: normalizedHref,
					});
					break;
				}
			}
		}
		return sources;
	}

	private getNonBoilerplateReadableBodyTextLength(root: Element): number {
		let boilerplateLength = 0;
		for (const element of Array.from(
			root.querySelectorAll<HTMLElement>("div, section, article, p, span, footer, aside")
		)) {
			const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
			if (text.length < 16 || !this.isParagraphBoilerplate(text)) {
				continue;
			}
			if (element.querySelector("div, section, article, p")) {
				continue;
			}
			boilerplateLength += text.length;
		}
		return Math.max(0, this.getParagraphReadableBodyTextLength(root) - boilerplateLength);
	}

	private maybeInvalidateParagraphCacheForSection(chapterIndex: number, liveDoc: Document): void {
		const cached = this.paragraphCache.get(chapterIndex);
		if (!cached?.length) {
			return;
		}
		const root = liveDoc.body || liveDoc.documentElement;
		if (root && this.isUnderSegmentedParagraphExtraction(cached, root)) {
			this.dropParagraphCacheForChapter(chapterIndex);
			return;
		}
		const cachedLength = this.getNonBoilerplateParagraphRecordsTextLength(cached);
		const liveLength = root ? this.getNonBoilerplateReadableBodyTextLength(root) : 0;
		const liveExplicitCount = root ? this.countMeaningfulExplicitParagraphElements(root) : 0;
		const cachedNonBoilerplateCount = cached.filter(
			(record) => !this.isParagraphBoilerplate(record.text)
		).length;
		if (
			liveExplicitCount >= 2 &&
			cachedNonBoilerplateCount < Math.min(liveExplicitCount, Math.max(2, Math.ceil(liveExplicitCount * 0.55)))
		) {
			this.dropParagraphCacheForChapter(chapterIndex);
			return;
		}
		if (liveLength > cachedLength + 80) {
			this.dropParagraphCacheForChapter(chapterIndex);
		}
	}

	private dropParagraphCacheForChapter(chapterIndex: number): void {
		const cached = this.paragraphCache.get(chapterIndex);
		if (cached) {
			for (const record of cached) {
				this.paragraphRecordById.delete(record.id);
			}
		}
		this.paragraphCache.delete(chapterIndex);
	}

	private extractParagraphRecordsFromDocument(
		doc: Document,
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string
	): ReaderParagraphRecord[] {
		const root = doc.body || doc.documentElement;
		if (!root) {
			return [];
		}

		const primary = this.buildParagraphRecordsForElements(
			doc,
			root,
			this.collectParagraphCandidateElements(root),
			chapterIndex,
			chapterHref,
			chapterTitle
		);
		return this.finalizeParagraphExtractionRecords(
			doc,
			root,
			primary,
			chapterIndex,
			chapterHref,
			chapterTitle
		);
	}

	private buildParagraphRecordsForElements(
		doc: Document,
		root: Element,
		elements: HTMLElement[],
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string
	): ReaderParagraphRecord[] {
		const paragraphs: ReaderParagraphRecord[] = [];
		for (const element of elements) {
			if (this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			const record = this.buildParagraphRecordFromElement(
				doc,
				element,
				chapterIndex,
				chapterHref,
				chapterTitle,
				paragraphs.length
			);
			if (record) {
				paragraphs.push(record);
			}
		}
		return paragraphs;
	}

	private finalizeParagraphExtractionRecords(
		doc: Document,
		root: Element,
		primary: ReaderParagraphRecord[],
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string
	): ReaderParagraphRecord[] {
		let resolved = this.filterParagraphBoilerplateRecords(primary, root);
		if (!this.shouldExpandParagraphExtraction(resolved, root)) {
			return this.applyGranularParagraphFallbackIfNeeded(
				doc,
				root,
				resolved,
				chapterIndex,
				chapterHref,
				chapterTitle
			);
		}

		const expanded: ReaderParagraphRecord[] = [];
		for (const range of this.collectBrDelimitedParagraphRanges(root)) {
			const record = this.buildParagraphRecordFromRange(
				doc,
				range,
				chapterIndex,
				chapterHref,
				chapterTitle,
				expanded.length
			);
			if (record) {
				expanded.push(record);
			}
		}
		for (const element of this.collectNestedBlockParagraphElements(root)) {
			const record = this.buildParagraphRecordFromElement(
				doc,
				element,
				chapterIndex,
				chapterHref,
				chapterTitle,
				expanded.length
			);
			if (record) {
				expanded.push(record);
			}
		}
		for (const range of this.collectOversizedExplicitParagraphRanges(root)) {
			const record = this.buildParagraphRecordFromRange(
				doc,
				range,
				chapterIndex,
				chapterHref,
				chapterTitle,
				expanded.length
			);
			if (record) {
				expanded.push(record);
			}
		}
		for (const range of this.collectOversizedContainerParagraphRanges(root)) {
			const record = this.buildParagraphRecordFromRange(
				doc,
				range,
				chapterIndex,
				chapterHref,
				chapterTitle,
				expanded.length
			);
			if (record) {
				expanded.push(record);
			}
		}

		const expandedFiltered = this.filterParagraphBoilerplateRecords(expanded, root);
		if (this.isStrongerParagraphExtraction(expandedFiltered, resolved, root)) {
			resolved = expandedFiltered;
		}

		const mainContentRecords: ReaderParagraphRecord[] = [];
		for (const range of this.collectMainContentParagraphRanges(root)) {
			const record = this.buildParagraphRecordFromRange(
				doc,
				range,
				chapterIndex,
				chapterHref,
				chapterTitle,
				mainContentRecords.length
			);
			if (record) {
				mainContentRecords.push(record);
			}
		}
		const mainContentFiltered = this.filterParagraphBoilerplateRecords(mainContentRecords, root);
		if (this.isStrongerParagraphExtraction(mainContentFiltered, resolved, root)) {
			resolved = mainContentFiltered;
		}

		if (this.getNonBoilerplateParagraphRecordsTextLength(resolved) > 0) {
			return this.applyGranularParagraphFallbackIfNeeded(
				doc,
				root,
				resolved,
				chapterIndex,
				chapterHref,
				chapterTitle
			);
		}

		const fallbackCandidates = this.collectFallbackParagraphElements(root);
		const fallback = this.buildParagraphRecordsForElements(
			doc,
			root,
			fallbackCandidates,
			chapterIndex,
			chapterHref,
			chapterTitle
		);
		const fallbackFiltered = this.filterParagraphBoilerplateRecords(fallback, root);
		if (fallbackFiltered.length > 0) {
			return fallbackFiltered;
		}

		const rootText = root.textContent?.replace(/\s+/g, " ").trim() || "";
		if (rootText.length > 0 && rootText.length <= 900) {
			const fallbackRecord = this.buildParagraphRecordFromElement(
				doc,
				root,
				chapterIndex,
				chapterHref,
				chapterTitle,
				0
			);
			return fallbackRecord ? [fallbackRecord] : [];
		}

		const blockFallback = this.buildParagraphRecordsForElements(
			doc,
			root,
			this.collectBlockFallbackElements(root),
			chapterIndex,
			chapterHref,
			chapterTitle
		);
		return this.filterParagraphBoilerplateRecords(blockFallback, root);
	}

	private normalizeParagraphTagName(tagName: string): string {
		return String(tagName || "").toUpperCase();
	}

	private collectParagraphCandidateElements(root: Element): HTMLElement[] {
		const elements = [
			...Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_EXPLICIT_SELECTOR)),
			...Array.from(root.querySelectorAll<HTMLElement>(LEAF_PARAGRAPH_CONTAINER_SELECTOR)),
		];
		const unique = new Set<HTMLElement>();
		const results: HTMLElement[] = [];
		for (const element of elements) {
			if (!unique.has(element) && this.isParagraphCandidateElement(element)) {
				unique.add(element);
				results.push(element);
			}
		}
		return results;
	}

	private isParagraphCandidateElement(element: HTMLElement): boolean {
		if (this.isParagraphReadingExcludedElement(element)) {
			return false;
		}
		const tagName = this.normalizeParagraphTagName(element.tagName);
		if (PARAGRAPH_TAG_NAMES.has(tagName)) {
			const explicitLength = this.getElementNormalizedTextLength(element);
			return explicitLength >= 2 && explicitLength <= PARAGRAPH_EXPLICIT_MAX_LENGTH;
		}
		if (tagName !== "DIV" && tagName !== "SECTION" && tagName !== "ARTICLE") {
			return false;
		}
		if (element.querySelector(PARAGRAPH_CHILD_BLOCK_SELECTOR)) {
			return false;
		}
		const textLength = this.getElementNormalizedTextLength(element);
		if (textLength < 24 || textLength > PARAGRAPH_CONTAINER_MAX_LENGTH) {
			return false;
		}
		const sentenceCount = this.estimateSentenceCount(element.textContent || "");
		if (sentenceCount > 28) {
			return false;
		}
		return this.hasOnlyInlineDescendants(element);
	}

	private collectFallbackParagraphElements(root: Element): HTMLElement[] {
		const blocks = Array.from(
			root.querySelectorAll<HTMLElement>(LEAF_PARAGRAPH_CONTAINER_SELECTOR)
		);
		return blocks.filter((element) => this.isFallbackParagraphElement(element));
	}

	private isFallbackParagraphElement(element: HTMLElement): boolean {
		if (this.isParagraphCandidateElement(element)) {
			return true;
		}
		if (element.querySelector(PARAGRAPH_EXPLICIT_SELECTOR)) {
			return false;
		}
		if (!this.hasOnlyInlineDescendants(element)) {
			return false;
		}
		const textLength = this.getElementNormalizedTextLength(element);
		if (textLength < 18 || textLength > 1800) {
			return false;
		}
		return this.estimateSentenceCount(element.textContent || "") <= 20;
	}

	private collectBlockFallbackElements(root: Element): HTMLElement[] {
		const elements = Array.from(
			root.querySelectorAll<HTMLElement>(BLOCK_PARAGRAPH_FALLBACK_SELECTOR)
		);
		const unique = new Set<HTMLElement>();
		const results: HTMLElement[] = [];
		for (const element of elements) {
			if (unique.has(element)) {
				continue;
			}
			if (element.querySelector(PARAGRAPH_EXPLICIT_SELECTOR)) {
				continue;
			}
			const textLength = this.getElementNormalizedTextLength(element);
			if (textLength < 16 || textLength > 2000) {
				continue;
			}
			if (!this.hasOnlyInlineDescendants(element)) {
				continue;
			}
			unique.add(element);
			results.push(element);
		}
		return results;
	}

	private getElementNormalizedTextLength(element: Element): number {
		return (element.textContent?.replace(/\s+/g, " ").trim() || "").length;
	}

	private estimateSentenceCount(text: string): number {
		return (text.match(/[.!?。！？；;]+/g) || []).length + 1;
	}

	private hasOnlyInlineDescendants(element: HTMLElement): boolean {
		for (const descendant of Array.from(element.children)) {
			if (!(descendant instanceof HTMLElement)) {
				continue;
			}
			const descendantTagName = this.normalizeParagraphTagName(descendant.tagName);
			if (descendantTagName === "BR") {
				continue;
			}
			if (PARAGRAPH_TAG_NAMES.has(descendantTagName)) {
				return false;
			}
			if (
				["DIV", "SECTION", "ARTICLE", "UL", "OL", "TABLE", "ASIDE", "MAIN"].includes(
					descendantTagName
				)
			) {
				return false;
			}
		}
		return true;
	}

	private buildParagraphRecordFromElement(
		doc: Document,
		element: Element,
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string,
		ordinal: number
	): ReaderParagraphRecord | null {
		const segments = this.collectParagraphTextSegments(doc, element);
		if (segments.length === 0) {
			return null;
		}
		const normalized = this.normalizeParagraphSegments(segments);
		if (!normalized.text.trim() || normalized.charMap.length === 0) {
			return null;
		}

		const range = this.createParagraphRangeFromCharMap(doc, segments, normalized.charMap);
		if (!range) {
			return null;
		}

		return this.buildParagraphRecordFromResolvedRange(
			doc,
			element,
			range,
			segments,
			normalized.charMap,
			normalized.text,
			chapterIndex,
			chapterHref,
			chapterTitle,
			ordinal
		);
	}

	private buildParagraphRecordFromRange(
		doc: Document,
		range: Range,
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string,
		ordinal: number
	): ReaderParagraphRecord | null {
		const presentationElement = this.resolveParagraphPresentationElement(range);
		const segments = this.collectParagraphTextSegmentsInRange(doc, range);
		if (segments.length === 0) {
			return null;
		}
		const normalized = this.normalizeParagraphSegments(segments);
		if (!normalized.text.trim() || normalized.charMap.length === 0) {
			return null;
		}
		const resolvedRange = this.createParagraphRangeFromCharMap(doc, segments, normalized.charMap);
		if (!resolvedRange) {
			return null;
		}
		return this.buildParagraphRecordFromResolvedRange(
			doc,
			presentationElement,
			resolvedRange,
			segments,
			normalized.charMap,
			normalized.text,
			chapterIndex,
			chapterHref,
			chapterTitle,
			ordinal
		);
	}

	private buildParagraphRecordFromResolvedRange(
		doc: Document,
		presentationElement: Element,
		range: Range,
		segments: ReaderParagraphTextSegment[],
		charMap: ReaderParagraphCharPointer[],
		text: string,
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string,
		ordinal: number
	): ReaderParagraphRecord | null {
		let cfiRange = "";
		try {
			cfiRange = this.parser.createCfiFromRange(chapterIndex, range);
		} catch (error) {
			logger.warn("[FoliateReaderService] Failed to build paragraph CFI:", {
				chapterIndex,
				error,
			});
			return null;
		}
		return {
			id: `${chapterIndex}:${ordinal}:${cfiRange}`,
			chapterIndex,
			chapterTitle,
			chapterHref,
			text,
			cfiRange,
			elementPath: this.getNodePath(doc.body || doc.documentElement, presentationElement),
			segments,
			charMap,
		};
	}

	private resolveParagraphPresentationElement(range: Range): Element {
		let current: Node | null = range.commonAncestorContainer;
		if (current.nodeType === Node.TEXT_NODE) {
			current = current.parentElement;
		}
		while (current instanceof Element) {
			const currentTagName = this.normalizeParagraphTagName(current.tagName);
			if (
				PARAGRAPH_TAG_NAMES.has(currentTagName) ||
				["DIV", "SECTION", "ARTICLE", "MAIN"].includes(currentTagName)
			) {
				return current;
			}
			current = current.parentElement;
		}
		return range.commonAncestorContainer instanceof Element
			? range.commonAncestorContainer
			: range.startContainer.parentElement || range.startContainer;
	}

	private collectParagraphTextSegmentsInRange(
		doc: Document,
		range: Range
	): ReaderParagraphTextSegment[] {
		const root = doc.body || doc.documentElement;
		if (!root) {
			return [];
		}
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text) || !node.textContent) {
					return NodeFilter.FILTER_REJECT;
				}
				if (!node.parentElement) {
					return NodeFilter.FILTER_REJECT;
				}
				if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
				if (!range.intersectsNode(node)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const segments: ReaderParagraphTextSegment[] = [];
		let current = walker.nextNode();
		while (current) {
			if (current instanceof Text && current.textContent) {
				segments.push({
					path: this.getNodePath(root, current),
					relativePath: this.getNodePath(range.commonAncestorContainer, current),
					text: current.textContent,
				});
			}
			current = walker.nextNode();
		}
		return segments;
	}

	private isParagraphReadingExcludedElement(element: Element): boolean {
		return Boolean(element.closest(PARAGRAPH_READING_EXCLUDED_SELECTOR));
	}

	private isParagraphBoilerplate(text: string): boolean {
		const normalized = text.replace(/\s+/g, " ").trim();
		if (normalized.length < 16) {
			return false;
		}
		let signalCount = 0;
		for (const pattern of PARAGRAPH_BOILERPLATE_PATTERNS) {
			if (pattern.test(normalized)) {
				signalCount += 1;
			}
		}
		if (signalCount >= 2) {
			return true;
		}
		return signalCount >= 1 && normalized.length <= 280;
	}

	private getParagraphReadableBodyTextLength(root: Element): number {
		const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text) || !node.textContent?.trim()) {
					return NodeFilter.FILTER_REJECT;
				}
				const parent = node.parentElement;
				if (!parent || this.isParagraphReadingExcludedElement(parent)) {
					return NodeFilter.FILTER_REJECT;
				}
				if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		let length = 0;
		let current = walker?.nextNode();
		while (current) {
			if (current instanceof Text) {
				length += current.textContent?.replace(/\s+/g, " ").trim().length || 0;
			}
			current = walker?.nextNode() || null;
		}
		return length;
	}

	private getParagraphRecordsTextLength(records: ReaderParagraphRecord[]): number {
		return records.reduce((total, record) => total + record.text.length, 0);
	}

	private getNonBoilerplateParagraphRecordsTextLength(records: ReaderParagraphRecord[]): number {
		return records
			.filter((record) => !this.isParagraphBoilerplate(record.text))
			.reduce((total, record) => total + record.text.length, 0);
	}

	private countMeaningfulExplicitParagraphElements(root: Element): number {
		let count = 0;
		for (const element of Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_EXPLICIT_SELECTOR))) {
			if (this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			const text = this.normalizeParagraphTextFragment(element.textContent || "", true);
			if (text.length >= PARAGRAPH_MIN_MEANINGFUL_LENGTH) {
				count += 1;
			}
		}
		return count;
	}

	private isUnderSegmentedParagraphExtraction(
		records: ReaderParagraphRecord[],
		root: Element
	): boolean {
		const filtered = records.filter((record) => !this.isParagraphBoilerplate(record.text));
		if (filtered.length === 0) {
			return true;
		}
		const bodyLength = this.getParagraphReadableBodyTextLength(root);
		if (bodyLength < 200) {
			return false;
		}
		if (
			filtered.some((record) => record.text.length > PARAGRAPH_CONTAINER_MAX_LENGTH)
		) {
			return true;
		}
		const explicitCount = this.countMeaningfulExplicitParagraphElements(root);
		const expectedMinimum = Math.min(
			explicitCount,
			Math.max(2, Math.ceil(explicitCount * 0.55))
		);
		if (explicitCount >= 2 && filtered.length < expectedMinimum) {
			return true;
		}
		if (filtered.length === 1 && explicitCount >= 2) {
			return filtered[0].text.length / bodyLength >= 0.55;
		}
		return false;
	}

	private collectGranularExplicitParagraphElements(root: Element): HTMLElement[] {
		const elements = Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_EXPLICIT_SELECTOR));
		const unique = new Set<HTMLElement>();
		const results: HTMLElement[] = [];
		for (const element of elements) {
			if (unique.has(element) || this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			const text = this.normalizeParagraphTextFragment(element.textContent || "", true);
			if (text.length < PARAGRAPH_MIN_MEANINGFUL_LENGTH) {
				continue;
			}
			unique.add(element);
			results.push(element);
		}
		return results;
	}

	private applyGranularParagraphFallbackIfNeeded(
		doc: Document,
		root: Element,
		resolved: ReaderParagraphRecord[],
		chapterIndex: number,
		chapterHref: string,
		chapterTitle: string
	): ReaderParagraphRecord[] {
		if (!this.isUnderSegmentedParagraphExtraction(resolved, root)) {
			return resolved;
		}
		const granular = this.buildParagraphRecordsForElements(
			doc,
			root,
			this.collectGranularExplicitParagraphElements(root),
			chapterIndex,
			chapterHref,
			chapterTitle
		);
		const granularFiltered = this.filterParagraphBoilerplateRecords(granular, root);
		if (
			granularFiltered.length > 0 &&
			(this.isStrongerParagraphExtraction(granularFiltered, resolved, root) ||
				granularFiltered.length > resolved.length)
		) {
			return granularFiltered;
		}
		return resolved;
	}

	private shouldExpandParagraphExtraction(
		records: ReaderParagraphRecord[],
		root: Element
	): boolean {
		if (records.length === 0) {
			return true;
		}
		const bodyLength = this.getParagraphReadableBodyTextLength(root);
		if (bodyLength <= 0) {
			return false;
		}
		const nonBoilerplateLength = this.getNonBoilerplateParagraphRecordsTextLength(records);
		if (nonBoilerplateLength <= 0) {
			return true;
		}
		if (records.every((record) => this.isParagraphBoilerplate(record.text))) {
			return true;
		}
		if (this.isUnderSegmentedParagraphExtraction(records, root)) {
			return true;
		}
		return nonBoilerplateLength / bodyLength < PARAGRAPH_BODY_COVERAGE_THRESHOLD;
	}

	private isStrongerParagraphExtraction(
		candidate: ReaderParagraphRecord[],
		current: ReaderParagraphRecord[],
		root: Element
	): boolean {
		const candidateLength = this.getNonBoilerplateParagraphRecordsTextLength(candidate);
		const currentLength = this.getNonBoilerplateParagraphRecordsTextLength(current);
		if (candidateLength > currentLength) {
			return true;
		}
		if (candidateLength < currentLength) {
			return false;
		}
		const bodyLength = this.getParagraphReadableBodyTextLength(root);
		if (bodyLength <= 0) {
			return candidate.length > current.length;
		}
		return (
			candidate.length > current.length &&
			candidateLength / bodyLength >= PARAGRAPH_BODY_COVERAGE_THRESHOLD
		);
	}

	private filterParagraphBoilerplateRecords(
		records: ReaderParagraphRecord[],
		root: Element
	): ReaderParagraphRecord[] {
		if (records.length === 0) {
			return records;
		}
		const filtered = records.filter((record) => !this.isParagraphBoilerplate(record.text));
		if (filtered.length === 0) {
			return [];
		}
		const bodyLength = this.getParagraphReadableBodyTextLength(root);
		if (bodyLength <= 0) {
			return filtered;
		}
		if (this.getParagraphRecordsTextLength(filtered) / bodyLength >= PARAGRAPH_BODY_COVERAGE_THRESHOLD) {
			return filtered;
		}
		return filtered;
	}

	private collectMainContentParagraphRanges(root: Element): Range[] {
		const doc = root.ownerDocument;
		if (!doc) {
			return [];
		}
		let best: HTMLElement | null = null;
		let bestScore = 0;
		for (const element of Array.from(
			root.querySelectorAll<HTMLElement>("div, section, article, main, p")
		)) {
			if (this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			const text = this.normalizeParagraphTextFragment(element.textContent || "", true);
			if (text.length < 80 || this.isParagraphBoilerplate(text)) {
				continue;
			}
			if (
				element.querySelector(PARAGRAPH_CHILD_BLOCK_SELECTOR) &&
				this.normalizeParagraphTagName(element.tagName) !== "P"
			) {
				continue;
			}
			if (text.length > bestScore) {
				bestScore = text.length;
				best = element;
			}
		}
		if (!best) {
			return [];
		}
		if (best.querySelector("br")) {
			return this.splitElementIntoBrDelimitedRanges(best);
		}
		if (this.getElementNormalizedTextLength(best) > PARAGRAPH_CONTAINER_MAX_LENGTH) {
			return this.splitElementTextIntoChunkRanges(best);
		}
		const range = doc.createRange();
		range.selectNodeContents(best);
		return [range];
	}

	private collectBrDelimitedParagraphRanges(root: Element): Range[] {
		const doc = root.ownerDocument;
		if (!doc) {
			return [];
		}
		const ranges: Range[] = [];
		const seen = new Set<string>();
		const containers = root.querySelectorAll("div, section, article, p, blockquote, li");
		for (const container of Array.from(containers)) {
			if (!(container instanceof HTMLElement)) {
				continue;
			}
			if (this.isParagraphReadingExcludedElement(container)) {
				continue;
			}
			if (container.querySelector("br") === null) {
				continue;
			}
			const textLength = this.getElementNormalizedTextLength(container);
			if (textLength < 40) {
				continue;
			}
			for (const range of this.splitElementIntoBrDelimitedRanges(container)) {
				const signature = this.normalizeParagraphTextFragment(range.toString(), true);
				if (signature.length < PARAGRAPH_MIN_MEANINGFUL_LENGTH || seen.has(signature)) {
					continue;
				}
				seen.add(signature);
				ranges.push(range);
			}
		}
		return ranges;
	}

	private splitElementIntoBrDelimitedRanges(container: HTMLElement): Range[] {
		const doc = container.ownerDocument;
		if (!doc) {
			return [];
		}
		const ranges: Range[] = [];
		let startAnchor: { node: Node; offset: number } | null = null;

		const pushRange = (endNode: Node, endOffset: number) => {
			if (!startAnchor) {
				return;
			}
			const range = doc.createRange();
			range.setStart(startAnchor.node, startAnchor.offset);
			range.setEnd(endNode, endOffset);
			const text = this.normalizeParagraphTextFragment(range.toString(), true);
			if (text.length >= PARAGRAPH_MIN_MEANINGFUL_LENGTH) {
				ranges.push(range);
			}
			startAnchor = null;
		};

		const visit = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.textContent || "";
				const firstOffset = text.search(/\S/u);
				if (firstOffset < 0) {
					return;
				}
				if (!startAnchor) {
					startAnchor = { node, offset: firstOffset };
				}
				return;
			}
			if (node instanceof HTMLBRElement) {
				pushRange(node, 0);
				return;
			}
			if (node.nodeType === Node.ELEMENT_NODE) {
				for (const child of Array.from(node.childNodes)) {
					visit(child);
				}
			}
		};

		for (const child of Array.from(container.childNodes)) {
			visit(child);
		}
		const endBoundary = this.findLastTextEndInElement(container);
		if (startAnchor && endBoundary) {
			pushRange(endBoundary.node, endBoundary.offset);
		}
		return ranges;
	}

	private findLastTextEndInElement(element: Element): { node: Text; offset: number } | null {
		const doc = element.ownerDocument;
		if (!doc) {
			return null;
		}
		const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text) || !node.textContent?.trim()) {
					return NodeFilter.FILTER_REJECT;
				}
				const parent = node.parentElement;
				if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		let last: Text | null = null;
		let current = walker.nextNode();
		while (current) {
			if (current instanceof Text) {
				last = current;
			}
			current = walker.nextNode();
		}
		return last ? { node: last, offset: last.textContent?.length || 0 } : null;
	}

	private collectNestedBlockParagraphElements(root: Element): HTMLElement[] {
		const results: HTMLElement[] = [];
		const seen = new Set<HTMLElement>();
		const containers = root.querySelectorAll("div, section, article");
		for (const container of Array.from(containers)) {
			if (!(container instanceof HTMLElement)) {
				continue;
			}
			if (this.isParagraphReadingExcludedElement(container)) {
				continue;
			}
			const blockChildren = Array.from(container.children).filter(
				(child): child is HTMLElement =>
					child instanceof HTMLElement &&
					["DIV", "SECTION", "ARTICLE", "P"].includes(
						this.normalizeParagraphTagName(child.tagName)
					)
			);
			if (blockChildren.length < 2) {
				continue;
			}
			for (const child of blockChildren) {
				if (seen.has(child) || this.isParagraphReadingExcludedElement(child)) {
					continue;
				}
				const textLength = this.getElementNormalizedTextLength(child);
				if (textLength < 18 || textLength > PARAGRAPH_EXPLICIT_MAX_LENGTH) {
					continue;
				}
				if (
					child.querySelector(PARAGRAPH_CHILD_BLOCK_SELECTOR) &&
					this.normalizeParagraphTagName(child.tagName) !== "P"
				) {
					continue;
				}
				seen.add(child);
				results.push(child);
			}
		}
		return results;
	}

	private collectOversizedContainerParagraphRanges(root: Element): Range[] {
		const ranges: Range[] = [];
		for (const element of Array.from(
			root.querySelectorAll<HTMLElement>(LEAF_PARAGRAPH_CONTAINER_SELECTOR)
		)) {
			if (this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			if (element.querySelector(PARAGRAPH_EXPLICIT_SELECTOR)) {
				continue;
			}
			if (element.querySelector("br")) {
				continue;
			}
			const textLength = this.getElementNormalizedTextLength(element);
			if (textLength <= PARAGRAPH_CONTAINER_MAX_LENGTH) {
				continue;
			}
			ranges.push(...this.splitElementTextIntoChunkRanges(element));
		}
		return ranges;
	}

	private collectOversizedExplicitParagraphRanges(root: Element): Range[] {
		const ranges: Range[] = [];
		for (const element of Array.from(root.querySelectorAll<HTMLElement>(PARAGRAPH_EXPLICIT_SELECTOR))) {
			if (this.isParagraphReadingExcludedElement(element)) {
				continue;
			}
			const textLength = this.getElementNormalizedTextLength(element);
			if (textLength <= PARAGRAPH_CONTAINER_MAX_LENGTH) {
				continue;
			}
			ranges.push(...this.splitElementTextIntoChunkRanges(element));
		}
		return ranges;
	}

	private splitElementTextIntoChunkRanges(element: HTMLElement): Range[] {
		const doc = element.ownerDocument;
		if (!doc) {
			return [];
		}
		const segments = this.collectParagraphTextSegments(doc, element);
		const normalized = this.normalizeParagraphSegments(segments);
		if (normalized.charMap.length <= PARAGRAPH_EXPLICIT_SPLIT_CHUNK) {
			return [];
		}

		const ranges: Range[] = [];
		let chunkStart = 0;
		while (chunkStart < normalized.charMap.length) {
			let chunkEnd = Math.min(chunkStart + PARAGRAPH_EXPLICIT_SPLIT_CHUNK, normalized.charMap.length);
			if (chunkEnd < normalized.charMap.length) {
				const preferredBreak = normalized.text.lastIndexOf("。", chunkEnd - 1);
				const fallbackBreak = normalized.text.lastIndexOf("，", chunkEnd - 1);
				const breakOffset = Math.max(preferredBreak, fallbackBreak);
				if (breakOffset > chunkStart + 80) {
					chunkEnd = breakOffset + 1;
				}
			}
			const range = this.createRangeFromSegmentPointers(doc, segments, normalized.charMap[chunkStart], {
				segmentIndex: normalized.charMap[chunkEnd - 1].segmentIndex,
				nodeOffset: normalized.charMap[chunkEnd - 1].nodeOffset + 1,
			});
			if (range) {
				ranges.push(range);
			}
			chunkStart = chunkEnd;
		}
		return ranges;
	}

	private async ensureParagraphHtml(paragraph: ReaderParagraphRecord): Promise<string | undefined> {
		if (
			typeof paragraph.html === "string" &&
			paragraph.htmlRevision === this.paragraphPresentationRevision
		) {
			return paragraph.html;
		}
		const doc = await this.parser.getRawDocumentByIndex(paragraph.chapterIndex);
		if (!doc) {
			return paragraph.html;
		}
		const root = doc.body || doc.documentElement;
		const element = this.resolveElementPath(root, paragraph.elementPath);
		if (!element) {
			return paragraph.html;
		}
		const range = this.resolveParagraphRangeInDocument(paragraph, doc);
		if (!range) {
			return paragraph.html;
		}
		const html = this.buildParagraphHtml(
			doc,
			element,
			range,
			paragraph.segments,
			paragraph.charMap,
			paragraph.chapterIndex
		);
		paragraph.html = html;
		paragraph.htmlRevision = this.paragraphPresentationRevision;
		return html;
	}

	private collectParagraphTextSegments(
		doc: Document,
		element: Element
	): ReaderParagraphTextSegment[] {
		const root = doc.body || doc.documentElement;
		if (!root) {
			return [];
		}
		const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text) || !node.textContent) {
					return NodeFilter.FILTER_REJECT;
				}
				if (!node.parentElement) {
					return NodeFilter.FILTER_REJECT;
				}
				if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const segments: ReaderParagraphTextSegment[] = [];
		let current = walker.nextNode();
		while (current) {
			if (current instanceof Text && current.textContent) {
				segments.push({
					path: this.getNodePath(root, current),
					relativePath: this.getNodePath(element, current),
					text: current.textContent,
				});
			}
			current = walker.nextNode();
		}
		return segments;
	}

	private normalizeParagraphSegments(segments: ReaderParagraphTextSegment[]): {
		text: string;
		charMap: ReaderParagraphCharPointer[];
	} {
		let text = "";
		const charMap: ReaderParagraphCharPointer[] = [];
		let lastWasWhitespace = true;

		for (const [segmentIndex, segment] of segments.entries()) {
			for (let offset = 0; offset < segment.text.length; offset += 1) {
				const char = segment.text[offset];
				if (/\s/u.test(char)) {
					if (!lastWasWhitespace) {
						text += " ";
						charMap.push({ segmentIndex, nodeOffset: offset });
						lastWasWhitespace = true;
					}
					continue;
				}
				text += char;
				charMap.push({ segmentIndex, nodeOffset: offset });
				lastWasWhitespace = false;
			}
		}

		while (text.endsWith(" ")) {
			text = text.slice(0, -1);
			charMap.pop();
		}

		return { text, charMap };
	}

	private createParagraphRangeFromCharMap(
		doc: Document,
		segments: ReaderParagraphTextSegment[],
		charMap: ReaderParagraphCharPointer[]
	): Range | null {
		if (charMap.length === 0) {
			return null;
		}
		const startPointer = charMap[0];
		const endPointer = charMap[charMap.length - 1];
		return this.createRangeFromSegmentPointers(doc, segments, startPointer, {
			segmentIndex: endPointer.segmentIndex,
			nodeOffset: endPointer.nodeOffset + 1,
		});
	}

	private createRangeFromSegmentPointers(
		doc: Document,
		segments: ReaderParagraphTextSegment[],
		startPointer: ReaderParagraphCharPointer,
		endPointer: ReaderParagraphCharPointer
	): Range | null {
		const root = doc.body || doc.documentElement;
		if (!root) {
			return null;
		}
		const startNode = this.resolveTextNodePath(root, segments[startPointer.segmentIndex]?.path);
		const endNode = this.resolveTextNodePath(root, segments[endPointer.segmentIndex]?.path);
		if (!startNode || !endNode) {
			return null;
		}

		const range = doc.createRange();
		range.setStart(
			startNode,
			this.clamp(startPointer.nodeOffset, 0, startNode.textContent?.length || 0)
		);
		range.setEnd(endNode, this.clamp(endPointer.nodeOffset, 0, endNode.textContent?.length || 0));
		return range;
	}

	private createRangeFromRelativeSegmentPointers(
		doc: Document,
		root: Node,
		segments: ReaderParagraphTextSegment[],
		startPointer: ReaderParagraphCharPointer,
		endPointer: ReaderParagraphCharPointer
	): Range | null {
		const startNode = this.resolveTextNodePath(
			root,
			segments[startPointer.segmentIndex]?.relativePath
		);
		const endNode = this.resolveTextNodePath(root, segments[endPointer.segmentIndex]?.relativePath);
		if (!startNode || !endNode) {
			return null;
		}
		const range = doc.createRange();
		range.setStart(
			startNode,
			this.clamp(startPointer.nodeOffset, 0, startNode.textContent?.length || 0)
		);
		range.setEnd(endNode, this.clamp(endPointer.nodeOffset, 0, endNode.textContent?.length || 0));
		return range;
	}

	private getNodePath(root: Node, target: Node): number[] {
		const path: number[] = [];
		let current: Node | null = target;
		while (current && current !== root) {
			const parent: Node | null = current.parentNode;
			if (!parent) {
				return [];
			}
			path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
			current = parent;
		}
		return path;
	}

	private resolveTextNodePath(root: Node, path: number[] | undefined): Text | null {
		if (!path?.length) {
			return root instanceof Text ? root : null;
		}
		let current: Node | null = root;
		for (const index of path) {
			current = current?.childNodes?.[index] || null;
			if (!current) {
				return null;
			}
		}
		return current instanceof Text ? current : null;
	}

	private resolveElementPath(root: Node | null, path: number[] | undefined): Element | null {
		if (!root || !path?.length) {
			return root instanceof Element ? root : null;
		}
		let current: Node | null = root;
		for (const index of path) {
			current = current?.childNodes?.[index] || null;
			if (!current) {
				return null;
			}
		}
		return current instanceof Element ? current : null;
	}

	private resolveParagraphRangeInDocument(
		paragraph: ReaderParagraphRecord,
		doc: Document,
		startOffset = 0,
		endOffset = paragraph.text.length
	): Range | null {
		if (paragraph.charMap.length === 0) {
			return null;
		}
		const normalizedStart = this.clamp(Math.floor(startOffset), 0, paragraph.text.length);
		const normalizedEnd = this.clamp(Math.ceil(endOffset), 0, paragraph.text.length);
		if (normalizedEnd <= normalizedStart) {
			return null;
		}
		if (normalizedStart === 0 && normalizedEnd === paragraph.text.length) {
			const cachedRange = this.getCachedParagraphRangeInDocument(paragraph, doc);
			if (cachedRange) {
				return cachedRange;
			}
		}
		const startPointer = paragraph.charMap[normalizedStart];
		const endPointer = paragraph.charMap[normalizedEnd - 1];
		if (!startPointer || !endPointer) {
			return null;
		}
		const range = this.createRangeFromSegmentPointers(doc, paragraph.segments, startPointer, {
			segmentIndex: endPointer.segmentIndex,
			nodeOffset: endPointer.nodeOffset + 1,
		});
		if (normalizedStart === 0 && normalizedEnd === paragraph.text.length) {
			this.storeCachedParagraphRangeInDocument(paragraph, doc, range);
		}
		return range;
	}

	private getCachedParagraphRangeInDocument(
		paragraph: ReaderParagraphRecord,
		doc: Document
	): Range | null {
		const byParagraphId = this.paragraphRangeCache.get(doc);
		if (!byParagraphId || !byParagraphId.has(paragraph.id)) {
			return null;
		}
		const cached = byParagraphId.get(paragraph.id) || null;
		return cached ? cached.cloneRange() : null;
	}

	private storeCachedParagraphRangeInDocument(
		paragraph: ReaderParagraphRecord,
		doc: Document,
		range: Range | null
	): void {
		let byParagraphId = this.paragraphRangeCache.get(doc);
		if (!byParagraphId) {
			byParagraphId = new Map<string, Range | null>();
			this.paragraphRangeCache.set(doc, byParagraphId);
		}
		byParagraphId.set(paragraph.id, range ? range.cloneRange() : null);
	}

	private buildParagraphHtml(
		doc: Document,
		element: Element,
		paragraphRange: Range,
		segments: ReaderParagraphTextSegment[],
		charMap: ReaderParagraphCharPointer[],
		chapterIndex: number
	): string | undefined {
		const clone = element.cloneNode(true) as Element;
		this.decorateParagraphFootnoteAnchors(element, clone);
		const highlights = this.collectParagraphHighlightDecorations(
			doc,
			this.normalizeParagraphTextFragment(paragraphRange.toString(), true),
			paragraphRange,
			segments,
			charMap,
			chapterIndex
		);
		for (const decoration of highlights.sort(
			(left, right) => right.startOffset - left.startOffset
		)) {
			const cloneRange =
				this.createRangeFromRelativeOffsets(
					clone.ownerDocument,
					clone,
					segments,
					charMap,
					decoration.startOffset,
					decoration.endOffset
				) ||
				this.createRangeFromNormalizedTextOffsets(
					clone.ownerDocument,
					clone,
					decoration.startOffset,
					decoration.endOffset
				);
			if (!cloneRange) {
				continue;
			}
			const marker = clone.ownerDocument.createElement("span");
			marker.className = "weave-paragraph-annotation";
			marker.setAttribute("data-cfi-range", decoration.cfiRange);
			marker.setAttribute("data-color", decoration.color || "yellow");
			marker.setAttribute("data-style", decoration.style || "highlight");
			if (decoration.hasCommentDivider) {
				marker.setAttribute("data-has-comment", "true");
			}
			const fragment = cloneRange.extractContents();
			marker.appendChild(fragment);
			cloneRange.insertNode(marker);
		}
		return clone.innerHTML || undefined;
	}

	private decorateParagraphFootnoteAnchors(sourceElement: Element, clonedElement: Element): void {
		const sourceAnchors = Array.from(sourceElement.querySelectorAll("a"));
		const clonedAnchors = Array.from(clonedElement.querySelectorAll("a"));
		for (let index = 0; index < sourceAnchors.length; index += 1) {
			const sourceAnchor = sourceAnchors[index];
			const clonedAnchor = clonedAnchors[index];
			if (
				!(sourceAnchor instanceof HTMLAnchorElement) ||
				!(clonedAnchor instanceof HTMLAnchorElement)
			) {
				continue;
			}
			if (!this.isFootnoteReference(sourceAnchor)) {
				continue;
			}
			clonedAnchor.classList.add("weave-paragraph-footnote");
			clonedAnchor.setAttribute(
				"data-footnote-href",
				String(sourceAnchor.getAttribute("href") || "").trim()
			);
			clonedAnchor.setAttribute(
				"data-footnote-label",
				String(sourceAnchor.textContent || "")
					.replace(/\s+/g, " ")
					.trim()
			);
		}
	}

	private collectParagraphHighlightDecorations(
		doc: Document,
		paragraphText: string,
		paragraphRange: Range,
		segments: ReaderParagraphTextSegment[],
		charMap: ReaderParagraphCharPointer[],
		chapterIndex: number
	): Array<{
		startOffset: number;
		endOffset: number;
		cfiRange: string;
		color: string;
		style?: EpubHighlightStyle;
		hasCommentDivider?: boolean;
	}> {
		const decorations: Array<{
			startOffset: number;
			endOffset: number;
			cfiRange: string;
			color: string;
			style?: EpubHighlightStyle;
			hasCommentDivider?: boolean;
		}> = [];
		for (const highlight of this.getAllParagraphModeHighlights()) {
			const fallbackDecoration = this.buildParagraphTextMatchDecoration(paragraphText, highlight);
			const resolvedChapterIndex =
				typeof highlight.chapterIndex === "number" && Number.isFinite(highlight.chapterIndex)
					? highlight.chapterIndex
					: this.parser.getSectionIndexForCfi(highlight.cfiRange);
			if (typeof resolvedChapterIndex === "number" && resolvedChapterIndex !== chapterIndex) {
				if (fallbackDecoration) {
					decorations.push(fallbackDecoration);
				}
				continue;
			}
			const highlightRange = this.parser.resolveRangeInLoadedSection(
				highlight.cfiRange,
				doc,
				chapterIndex,
				highlight.text
			);
			if (!highlightRange || !this.rangesIntersect(paragraphRange, highlightRange)) {
				if (fallbackDecoration) {
					decorations.push(fallbackDecoration);
				}
				continue;
			}
			const intersection = this.createIntersectionRange(doc, paragraphRange, highlightRange);
			if (!intersection) {
				continue;
			}
			const startOffset = this.getNormalizedParagraphOffsetForBoundary(
				doc,
				paragraphRange,
				intersection.startContainer,
				intersection.startOffset
			);
			const endOffset = this.getNormalizedParagraphOffsetForBoundary(
				doc,
				paragraphRange,
				intersection.endContainer,
				intersection.endOffset
			);
			if (endOffset <= startOffset) {
				continue;
			}
			decorations.push({
				startOffset,
				endOffset,
				cfiRange: highlight.cfiRange,
				color: highlight.color || "yellow",
				style: highlight.style,
				hasCommentDivider: highlight.hasCommentDivider,
			});
		}
		return this.dedupeParagraphDecorations(decorations);
	}

	private buildParagraphTextMatchDecoration(
		paragraphText: string,
		highlight: ReaderHighlight
	): {
		startOffset: number;
		endOffset: number;
		cfiRange: string;
		color: string;
		style?: EpubHighlightStyle;
		hasCommentDivider?: boolean;
	} | null {
		const normalizedParagraph = this.normalizeParagraphTextFragment(paragraphText, true);
		const normalizedHighlightText = this.normalizeParagraphTextFragment(highlight.text || "", true);
		if (!normalizedParagraph || !normalizedHighlightText) {
			return null;
		}
		const startOffset = normalizedParagraph.indexOf(normalizedHighlightText);
		if (startOffset < 0) {
			return null;
		}
		const endOffset = startOffset + normalizedHighlightText.length;
		if (endOffset <= startOffset) {
			return null;
		}
		return {
			startOffset,
			endOffset,
			cfiRange: highlight.cfiRange,
			color: highlight.color || "yellow",
			style: highlight.style,
			hasCommentDivider: highlight.hasCommentDivider,
		};
	}

	private getAllParagraphModeHighlights(): ReaderHighlight[] {
		const merged = new Map<string, ReaderHighlight>();
		for (const highlight of this.savedHighlights) {
			merged.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		for (const highlight of this.highlightDataMap.values()) {
			merged.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		for (const highlight of this.temporaryHighlightDataMap.values()) {
			merged.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		return Array.from(merged.values());
	}

	private dedupeParagraphDecorations(
		decorations: Array<{
			startOffset: number;
			endOffset: number;
			cfiRange: string;
			color: string;
			style?: EpubHighlightStyle;
			hasCommentDivider?: boolean;
		}>
	): Array<{
		startOffset: number;
		endOffset: number;
		cfiRange: string;
		color: string;
		style?: EpubHighlightStyle;
		hasCommentDivider?: boolean;
	}> {
		const deduped = new Map<string, typeof decorations[number]>();
		for (const decoration of decorations) {
			const key = [
				decoration.startOffset,
				decoration.endOffset,
				decoration.color,
				decoration.style || "highlight",
				decoration.hasCommentDivider ? "comment" : "plain",
			].join(":");
			deduped.set(key, decoration);
		}
		return Array.from(deduped.values());
	}

	private rangesIntersect(left: Range, right: Range): boolean {
		return (
			left.compareBoundaryPoints(Range.END_TO_START, right) > 0 &&
			left.compareBoundaryPoints(Range.START_TO_END, right) < 0
		);
	}

	private createIntersectionRange(doc: Document, base: Range, target: Range): Range | null {
		if (!this.rangesIntersect(base, target)) {
			return null;
		}
		const range = doc.createRange();
		if (base.compareBoundaryPoints(Range.START_TO_START, target) >= 0) {
			range.setStart(base.startContainer, base.startOffset);
		} else {
			range.setStart(target.startContainer, target.startOffset);
		}
		if (base.compareBoundaryPoints(Range.END_TO_END, target) <= 0) {
			range.setEnd(base.endContainer, base.endOffset);
		} else {
			range.setEnd(target.endContainer, target.endOffset);
		}
		return range;
	}

	private getNormalizedParagraphOffsetForBoundary(
		doc: Document,
		paragraphRange: Range,
		container: Node,
		offset: number
	): number {
		const probe = paragraphRange.cloneRange();
		probe.setEnd(container, offset);
		return this.normalizeParagraphTextFragment(probe.toString(), false).length;
	}

	private normalizeParagraphTextFragment(text: string, trimTrailing: boolean): string {
		let normalized = "";
		let lastWasWhitespace = true;
		for (const char of String(text || "")) {
			if (/\s/u.test(char)) {
				if (!lastWasWhitespace) {
					normalized += " ";
					lastWasWhitespace = true;
				}
				continue;
			}
			normalized += char;
			lastWasWhitespace = false;
		}
		return trimTrailing ? normalized.trimEnd() : normalized;
	}

	private createRangeFromRelativeOffsets(
		doc: Document,
		root: Node,
		segments: ReaderParagraphTextSegment[],
		charMap: ReaderParagraphCharPointer[],
		startOffset: number,
		endOffset: number
	): Range | null {
		if (charMap.length === 0) {
			return null;
		}
		const normalizedStart = this.clamp(Math.floor(startOffset), 0, charMap.length);
		const normalizedEnd = this.clamp(Math.ceil(endOffset), 0, charMap.length);
		if (normalizedEnd <= normalizedStart) {
			return null;
		}
		const startPointer = charMap[normalizedStart];
		const endPointer = charMap[normalizedEnd - 1];
		if (!startPointer || !endPointer) {
			return null;
		}
		return this.createRangeFromRelativeSegmentPointers(doc, root, segments, startPointer, {
			segmentIndex: endPointer.segmentIndex,
			nodeOffset: endPointer.nodeOffset + 1,
		});
	}

	private createRangeFromNormalizedTextOffsets(
		doc: Document,
		root: Node,
		startOffset: number,
		endOffset: number
	): Range | null {
		const normalized = this.collectNormalizedTextPointersForRoot(doc, root);
		if (normalized.charMap.length === 0) {
			return null;
		}
		const normalizedStart = this.clamp(Math.floor(startOffset), 0, normalized.charMap.length);
		const normalizedEnd = this.clamp(Math.ceil(endOffset), 0, normalized.charMap.length);
		if (normalizedEnd <= normalizedStart) {
			return null;
		}
		const startPointer = normalized.charMap[normalizedStart];
		const endPointer = normalized.charMap[normalizedEnd - 1];
		if (!startPointer || !endPointer) {
			return null;
		}
		const range = doc.createRange();
		range.setStart(
			startPointer.node,
			this.clamp(startPointer.nodeOffset, 0, startPointer.node.textContent?.length || 0)
		);
		range.setEnd(
			endPointer.node,
			this.clamp(endPointer.nodeOffset + 1, 0, endPointer.node.textContent?.length || 0)
		);
		return range;
	}

	private collectNormalizedTextPointersForRoot(
		doc: Document,
		root: Node
	): {
		text: string;
		charMap: Array<{ node: Text; nodeOffset: number }>;
	} {
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (!(node instanceof Text) || !node.textContent) {
					return NodeFilter.FILTER_REJECT;
				}
				if (!node.parentElement) {
					return NodeFilter.FILTER_REJECT;
				}
				if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		let text = "";
		const charMap: Array<{ node: Text; nodeOffset: number }> = [];
		let lastWasWhitespace = true;
		let current = walker.nextNode();
		while (current) {
			if (current instanceof Text && current.textContent) {
				for (let offset = 0; offset < current.textContent.length; offset += 1) {
					const char = current.textContent[offset];
					if (/\s/u.test(char)) {
						if (!lastWasWhitespace) {
							text += " ";
							charMap.push({ node: current, nodeOffset: offset });
							lastWasWhitespace = true;
						}
						continue;
					}
					text += char;
					charMap.push({ node: current, nodeOffset: offset });
					lastWasWhitespace = false;
				}
			}
			current = walker.nextNode();
		}
		while (text.endsWith(" ")) {
			text = text.slice(0, -1);
			charMap.pop();
		}
		return { text, charMap };
	}

	private async createParagraphSelectionRange(
		paragraph: ReaderParagraphRecord,
		startOffset: number,
		endOffset: number
	): Promise<{ range: Range; chapterIndex: number } | null> {
		const visibleFrame = this.getVisibleFramesWithIndex().find(
			(item) => item.index === paragraph.chapterIndex
		);
		if (visibleFrame) {
			const liveRange = this.resolveParagraphRangeInDocument(
				paragraph,
				visibleFrame.document,
				startOffset,
				endOffset
			);
			if (liveRange) {
				return { range: liveRange, chapterIndex: paragraph.chapterIndex };
			}
		}

		const rawDoc = await this.parser.getRawDocumentByIndex(paragraph.chapterIndex);
		if (!rawDoc) {
			return null;
		}
		const rawRange = this.resolveParagraphRangeInDocument(
			paragraph,
			rawDoc,
			startOffset,
			endOffset
		);
		return rawRange ? { range: rawRange, chapterIndex: paragraph.chapterIndex } : null;
	}

	private async resolveCurrentParagraphIndex(
		chapterIndex: number,
		paragraphs: ReaderParagraphRecord[]
	): Promise<number> {
		const currentCfi = String(this.currentPosition.cfi || "").trim();
		if (!currentCfi) {
			return 0;
		}
		const visibleFrame = this.getVisibleFramesWithIndex().find(
			(item) => item.index === chapterIndex
		);
		if (!visibleFrame) {
			const exactIndex = paragraphs.findIndex(
				(paragraph) =>
					this.normalizeLocationKey(paragraph.cfiRange) === this.normalizeLocationKey(currentCfi)
			);
			return exactIndex >= 0 ? exactIndex : 0;
		}

		const currentRange = this.parser.resolveRangeInLoadedSection(
			currentCfi,
			visibleFrame.document,
			chapterIndex
		);
		if (!currentRange) {
			return 0;
		}

		for (const [index, paragraph] of paragraphs.entries()) {
			const paragraphRange = this.resolveParagraphRangeInDocument(paragraph, visibleFrame.document);
			if (!paragraphRange) {
				continue;
			}
			if (
				paragraphRange.comparePoint(currentRange.startContainer, currentRange.startOffset) <= 0 &&
				paragraphRange.comparePoint(currentRange.endContainer, currentRange.endOffset) >= 0
			) {
				return index;
			}
		}

		let closestIndex = 0;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (const [index, paragraph] of paragraphs.entries()) {
			const paragraphRange = this.resolveParagraphRangeInDocument(paragraph, visibleFrame.document);
			if (!paragraphRange) {
				continue;
			}
			const distance = Math.abs(
				paragraphRange.comparePoint(currentRange.startContainer, currentRange.startOffset)
			);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		}
		return closestIndex;
	}

	private attachSelectionListeners(doc: Document): void {
		if (this.documentSelectionCleanups.has(doc)) {
			return;
		}

		let pendingFrame = 0;
		const scheduleEmit = () => {
			if (pendingFrame) {
				cancelAnimationFrame(pendingFrame);
			}
			pendingFrame = requestAnimationFrame(() => {
				pendingFrame = 0;
				this.emitSelectionChangeIfNeeded(doc);
			});
		};

		const onSelectionChange = () => scheduleEmit();
		const onMouseUp = (event: MouseEvent) => {
			scheduleEmit();
			this.bridgeHostSelectionMouseUp(doc, event);
		};
		const onTouchEnd = () => scheduleEmit();
		const onKeyUp = () => scheduleEmit();

		doc.addEventListener("selectionchange", onSelectionChange);
		doc.addEventListener("mouseup", onMouseUp);
		doc.addEventListener("touchend", onTouchEnd);
		doc.addEventListener("keyup", onKeyUp);

		const cleanup = () => {
			if (pendingFrame) {
				cancelAnimationFrame(pendingFrame);
			}
			doc.removeEventListener("selectionchange", onSelectionChange);
			doc.removeEventListener("mouseup", onMouseUp);
			doc.removeEventListener("touchend", onTouchEnd);
			doc.removeEventListener("keyup", onKeyUp);
		};
		this.documentSelectionCleanups.set(doc, cleanup);
	}

	private attachWheelListeners(doc: Document): void {
		if (this.documentWheelCleanups.has(doc)) {
			return;
		}

		const eventOptions: AddEventListenerOptions = { passive: false, capture: true };
		const onWheel = (event: WheelEvent) => {
			this.handleWheelPageTurn(event, doc);
		};

		doc.addEventListener("wheel", onWheel, eventOptions);
		doc.defaultView?.addEventListener("wheel", onWheel, eventOptions);

		const cleanup = () => {
			doc.removeEventListener("wheel", onWheel, true);
			doc.defaultView?.removeEventListener("wheel", onWheel, true);
		};
		this.documentWheelCleanups.set(doc, cleanup);
	}

	private attachRenderContainerWheelListener(container: HTMLElement, hostView?: HTMLElement): void {
		if (this.renderContainerWheelCleanup) {
			this.renderContainerWheelCleanup();
			this.renderContainerWheelCleanup = null;
		}

		const eventOptions: AddEventListenerOptions = { passive: false, capture: true };
		const onWheel = (event: WheelEvent) => {
			this.handleWheelPageTurn(event);
		};

		container.addEventListener("wheel", onWheel, eventOptions);
		hostView?.addEventListener("wheel", onWheel, eventOptions);
		this.renderContainerWheelCleanup = () => {
			container.removeEventListener("wheel", onWheel, true);
			hostView?.removeEventListener("wheel", onWheel, true);
		};
	}

	private handleWheelPageTurn(event: WheelEvent, sourceDoc?: Document): void {
		if (this.currentFlowMode !== "paginated" || this.layoutChangeInFlight || !this.foliateView) {
			this.resetWheelPageTurnState();
			return;
		}
		if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
			return;
		}
		if (this.isWheelEventOnInteractiveElement(event.target)) {
			return;
		}

		const deltaX = this.normalizeWheelDelta(event.deltaX, event.deltaMode, sourceDoc);
		const deltaY = this.normalizeWheelDelta(event.deltaY, event.deltaMode, sourceDoc);
		if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 4) {
			return;
		}
		if (Math.abs(deltaX) > Math.abs(deltaY)) {
			return;
		}
		if (this.hasActiveReaderSelection(sourceDoc)) {
			return;
		}

		const isDiscreteWheelInput =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE ||
			event.deltaMode === WheelEvent.DOM_DELTA_PAGE;
		const hasDiscreteTurnIntent = isDiscreteWheelInput && Math.abs(event.deltaY) >= 1;

		event.preventDefault();
		event.stopPropagation();

		if (hasDiscreteTurnIntent) {
			const direction: "next" | "prev" = deltaY > 0 ? "next" : "prev";
			this.resetWheelPageTurnState();
			void this.performWheelPageTurn(direction);
			return;
		}

		const now = Date.now();
		if (now - this.lastWheelEventAt > 360) {
			this.wheelDeltaAccumulator = 0;
		}
		this.lastWheelEventAt = now;
		this.wheelDeltaAccumulator += deltaY;

		if (Math.abs(this.wheelDeltaAccumulator) < 64) {
			return;
		}

		const direction: "next" | "prev" = this.wheelDeltaAccumulator > 0 ? "next" : "prev";
		this.resetWheelPageTurnState();
		void this.performWheelPageTurn(direction);
	}

	private normalizeWheelDelta(delta: number, deltaMode: number, sourceDoc?: Document): number {
		if (!Number.isFinite(delta)) {
			return 0;
		}
		if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
			return delta * 16;
		}
		if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			const viewportHeight =
				sourceDoc?.defaultView?.innerHeight || this.renderContainer?.clientHeight || 800;
			return delta * viewportHeight;
		}
		return delta;
	}

	private async performWheelPageTurn(direction: "next" | "prev"): Promise<void> {
		if (this.wheelTurnInFlight) {
			return;
		}
		this.wheelTurnInFlight = true;
		try {
			if (direction === "next") {
				await this.nextPage();
				return;
			}
			await this.prevPage();
		} finally {
			window.setTimeout(() => {
				this.wheelTurnInFlight = false;
			}, 180);
		}
	}

	private resetWheelPageTurnState(): void {
		this.wheelDeltaAccumulator = 0;
		this.lastWheelEventAt = 0;
	}

	private isWheelEventOnInteractiveElement(target: EventTarget | null): boolean {
		const originElement = this.getElementFromEventTarget(target);
		if (!originElement || typeof originElement.closest !== "function") {
			return false;
		}
		const interactive = originElement.closest(
			'a, button, input, textarea, select, summary, label, [contenteditable="true"], [role="button"], [role="link"]'
		);
		return Boolean(interactive);
	}

	private attachFootnotePreviewListeners(doc: Document): void {
		if (this.documentFootnoteCleanups.has(doc)) {
			return;
		}

		let hoverTimer: ReturnType<typeof setTimeout> | null = null;
		let hideTimer: ReturnType<typeof setTimeout> | null = null;
		let activeAnchor: HTMLAnchorElement | null = null;

		const clearHoverTimer = () => {
			if (hoverTimer) {
				clearTimeout(hoverTimer);
				hoverTimer = null;
			}
		};

		const clearHideTimer = () => {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
		};

		const schedulePreviewForAnchor = (anchor: HTMLAnchorElement) => {
			if (this.footnotePreviewPinned) {
				return;
			}
			if (activeAnchor === anchor) {
				clearHideTimer();
				return;
			}
			activeAnchor = anchor;
			clearHoverTimer();
			clearHideTimer();
			hoverTimer = setTimeout(() => {
				hoverTimer = null;
				this.emitFootnotePreviewForAnchor(doc, anchor);
			}, 180);
		};

		const scheduleHidePreview = () => {
			if (this.footnotePreviewPinned) {
				return;
			}
			clearHoverTimer();
			clearHideTimer();
			hideTimer = setTimeout(() => {
				activeAnchor = null;
				this.dismissFootnotePreview();
			}, 120);
		};

		const onMouseOver = (event: MouseEvent) => {
			const anchor = this.findFootnoteReferenceFromEvent(event);
			if (!anchor) {
				return;
			}
			const href = anchor.getAttribute("href") || "";
			const text = String(anchor.textContent || "").trim();
			logFootnoteDiag(`Hover reference detected href=${href} text=${text}`);
			schedulePreviewForAnchor(anchor);
		};

		const onMouseOut = (event: MouseEvent) => {
			const anchor = this.findFootnoteReferenceFromEvent(event);
			if (!anchor) {
				return;
			}
			const relatedAnchor = this.findFootnoteReference(event.relatedTarget);
			if (relatedAnchor === anchor) {
				return;
			}
			scheduleHidePreview();
		};

		const onClick = (event: MouseEvent) => {
			const anchor = this.findFootnoteReferenceFromEvent(event);
			if (!anchor) {
				if (this.footnotePreviewPinned) {
					activeAnchor = null;
					clearHoverTimer();
					clearHideTimer();
					this.dismissFootnotePreview({ unpin: true });
				}
				return;
			}
			activeAnchor = anchor;
			clearHoverTimer();
			clearHideTimer();
			if (this.currentFootnoteClickAction === "navigate") {
				this.dismissFootnotePreview({ unpin: true });
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			(
				event as MouseEvent & { stopImmediatePropagation?: () => void }
			).stopImmediatePropagation?.();
			const href = anchor.getAttribute("href") || "";
			const text = String(anchor.textContent || "").trim();
			logFootnoteDiag(`Click reference intercepted href=${href} text=${text}`);
			this.emitFootnotePreviewForAnchor(doc, anchor, {
				pinned: true,
				suppressRelocateMs: 1800,
			});
		};

		const onFocusIn = (event: FocusEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			schedulePreviewForAnchor(anchor);
		};

		const onFocusOut = (event: FocusEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			scheduleHidePreview();
		};

		doc.addEventListener("mouseover", onMouseOver, true);
		doc.addEventListener("mouseout", onMouseOut, true);
		doc.addEventListener("click", onClick, true);
		doc.addEventListener("focusin", onFocusIn);
		doc.addEventListener("focusout", onFocusOut);

		const cleanup = () => {
			clearHoverTimer();
			clearHideTimer();
			doc.removeEventListener("mouseover", onMouseOver, true);
			doc.removeEventListener("mouseout", onMouseOut, true);
			doc.removeEventListener("click", onClick, true);
			doc.removeEventListener("focusin", onFocusIn);
			doc.removeEventListener("focusout", onFocusOut);
		};
		this.documentFootnoteCleanups.set(doc, cleanup);
	}

	private get footnotePreviewPinned(): boolean {
		return this.footnotePreviewController.isPinned();
	}

	private set footnotePreviewPinned(value: boolean) {
		this.footnotePreviewController.setPinnedState(value);
	}

	private hasNonCollapsedTextSelection(doc: Document | null | undefined): boolean {
		if (!doc?.defaultView) {
			return false;
		}
		const selection = doc.defaultView.getSelection?.();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			return false;
		}
		return Boolean(selection.toString().trim());
	}

	private hasActiveReaderSelection(preferredDoc?: Document | null): boolean {
		if (this.hasNonCollapsedTextSelection(preferredDoc)) {
			return true;
		}
		for (const frame of this.getVisibleFramesWithIndex()) {
			if (frame.document === preferredDoc) {
				continue;
			}
			if (this.hasNonCollapsedTextSelection(frame.document)) {
				return true;
			}
		}
		return this.hasNonCollapsedTextSelection(document);
	}

	private emitSelectionChangeIfNeeded(doc: Document): void {
		const selection = doc.defaultView?.getSelection?.();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			this.lastSelectionByDocument.delete(doc);
			return;
		}

		const range = selection.getRangeAt(0);
		const text = selection.toString().trim();
		if (!text) {
			this.lastSelectionByDocument.delete(doc);
			return;
		}

		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		if (!frame) {
			return;
		}
		const cfiRange = frame.frame.cfiFromRange(range.cloneRange());
		if (!cfiRange) {
			return;
		}

		const lastCfi = this.lastSelectionByDocument.get(doc);
		if (lastCfi === cfiRange) {
			return;
		}
		this.lastSelectionByDocument.set(doc, cfiRange);
		this.notifySelectionChange(cfiRange, frame.frame);
	}

	private applyRenderOptions(options?: ReaderRenderOptions): void {
		this.currentFlowMode = options?.flow === "scrolled" ? "scrolled" : "paginated";
		this.currentLayoutMode = options?.spread === "always" ? "double" : "paginated";
		this.currentWidthMode = options?.widthMode || this.currentWidthMode;
		if (typeof options?.lineHeight === "number" && options.lineHeight > 0) {
			this.currentLineHeight = options.lineHeight;
		}
		if (typeof options?.letterSpacing === "number" && Number.isFinite(options.letterSpacing)) {
			this.currentLetterSpacing = options.letterSpacing;
		}
		if (typeof options?.pageMargin === "number" && Number.isFinite(options.pageMargin)) {
			this.currentPageMargin = options.pageMargin;
		}
		if (options?.strikethroughPresentation) {
			this.currentStrikethroughPresentation = options.strikethroughPresentation;
		}
	}

	private computePaginatorLayoutMetrics(): {
		hostWidth: number;
		inlineSize: string;
		paginatorMargin: number;
		gap: string;
	} {
		const renderContainerWidth = Math.max(
			0,
			Math.round(this.renderContainer?.getBoundingClientRect().width || 0)
		);
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		const hostWidth = Math.max(
			renderContainerWidth,
			0,
			this.foliateView?.clientWidth || this.foliateView?.offsetWidth || renderer?.clientWidth || 0
		);
		const isEdgeWidth = this.currentWidthMode === "edge";
		const isFitWidth = this.currentWidthMode === "fit";
		const isDoublePaginated =
			this.currentLayoutMode === "double" && this.currentFlowMode === "paginated";
		const isDoubleFitWidth = isFitWidth && isDoublePaginated;
		const paginatorMargin = isEdgeWidth
			? 0
			: isDoubleFitWidth
			? Math.min(32, Math.max(16, Math.round(this.currentPageMargin * 0.5)))
			: Math.max(0, Math.round(this.currentPageMargin));
		const fitInlineSize = Math.max(hostWidth - paginatorMargin * 2, 0);
		const doubleFitInlineSize = Math.max(Math.floor(fitInlineSize / 2), 0);
		const inlineSize = isEdgeWidth
			? `${Math.max(hostWidth, 0)}px`
			: isFitWidth
			? `${isDoublePaginated ? doubleFitInlineSize : fitInlineSize}px`
			: this.currentWidthMode === "full"
			? "920px"
			: "720px";
		const gap =
			this.currentFlowMode === "scrolled"
				? "4%"
				: isDoubleFitWidth
				? "6%"
				: this.currentLayoutMode === "double"
				? "10%"
				: "7%";

		return {
			hostWidth,
			inlineSize,
			paginatorMargin,
			gap,
		};
	}

	private applyRendererLayout(): void {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		if (!renderer) {
			return;
		}
		const { inlineSize, paginatorMargin, gap } = this.computePaginatorLayoutMetrics();

		const tagName = renderer.tagName.toLowerCase();
		if (tagName === "foliate-paginator") {
			renderer.setAttribute("flow", this.currentFlowMode === "scrolled" ? "scrolled" : "paginated");
			renderer.setAttribute("max-column-count", this.currentLayoutMode === "double" ? "2" : "1");
			renderer.setAttribute("max-inline-size", inlineSize);
			renderer.setAttribute("max-block-size", "1440px");
			renderer.setAttribute("margin", `${paginatorMargin}px`);
			renderer.setAttribute("gap", gap);
			renderer.setAttribute("animated", "");
			renderer.render?.();
			return;
		}

		if (tagName === "foliate-fxl") {
			renderer.setAttribute(
				"zoom",
				this.currentWidthMode === "full" || this.currentWidthMode === "edge"
					? "fit-width"
					: "fit-page"
			);
		}
	}

	private applyRendererAppearance(): void {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		const styles = this.buildReaderStyles();
		renderer?.setStyles?.(styles);
		this.applyHostThemeSurface();
		for (const frame of this.getVisibleFramesWithIndex()) {
			this.normalizeDocument(frame.document);
		}
		this.schedulePaginatedLayoutRecovery();
	}

	private applyHostThemeSurface(): void {
		const background = this.getObsidianCSSVar("--background-primary", "rgb(255, 255, 255)");
		const textColor = this.getObsidianCSSVar("--text-normal", "rgb(28, 29, 31)");
		const colorScheme = this.getCurrentColorScheme();
		const renderer = this.foliateView?.renderer as HTMLElement | undefined;
		const targets = [this.renderContainer, this.foliateView as HTMLElement | null, renderer].filter(
			Boolean
		) as HTMLElement[];

		for (const target of targets) {
			if (!(target instanceof HTMLElement) || !target.style) {
				continue;
			}
			target.style.backgroundColor = background;
			target.style.color = textColor;
			target.style.colorScheme = colorScheme;
		}

		for (const iframe of Array.from(this.renderContainer?.querySelectorAll("iframe") || [])) {
			iframe.style.backgroundColor = background;
			iframe.style.colorScheme = colorScheme;
		}
	}

	private schedulePaginatedLayoutRecovery(): void {
		if (!this.renderContainer || !this.foliateView || this.currentFlowMode !== "paginated") {
			return;
		}
		const renderer = this.foliateView.renderer as FoliateRenderer | undefined;
		if (!renderer || renderer.tagName.toLowerCase() !== "foliate-paginator") {
			return;
		}
		const recoveryToken = ++this.layoutRecoveryToken;
		if (this.pendingLayoutRecoveryFrame !== null) {
			cancelAnimationFrame(this.pendingLayoutRecoveryFrame);
		}
		this.pendingLayoutRecoveryFrame = requestAnimationFrame(() => {
			this.pendingLayoutRecoveryFrame = null;
			void this.recoverPaginatedLayoutIfNeeded(recoveryToken);
		});
	}

	private async recoverPaginatedLayoutIfNeeded(recoveryToken: number): Promise<void> {
		if (recoveryToken !== this.layoutRecoveryToken) {
			return;
		}
		await this.waitForAnimationFrame();
		if (recoveryToken !== this.layoutRecoveryToken || !this.shouldRecoverPaginatedLayout()) {
			return;
		}

		this.applyRendererLayout();

		await this.waitForAnimationFrame();
		if (recoveryToken !== this.layoutRecoveryToken || !this.shouldRecoverPaginatedLayout()) {
			return;
		}

		this.applyRendererLayout();
	}

	private shouldRecoverPaginatedLayout(): boolean {
		if (!this.renderContainer || !this.foliateView || this.currentFlowMode !== "paginated") {
			return false;
		}
		const renderer = this.foliateView.renderer as FoliateRenderer | undefined;
		if (!renderer || renderer.tagName.toLowerCase() !== "foliate-paginator") {
			return false;
		}

		const { hostWidth } = this.computePaginatorLayoutMetrics();
		if (hostWidth < 480) {
			return false;
		}

		const visibleFrames = this.getVisibleFramesWithIndex();
		if (!visibleFrames.length) {
			return false;
		}

		const narrowestViewportWidth = visibleFrames.reduce((smallest, frame) => {
			const docWidth = Math.max(
				frame.document.documentElement?.clientWidth || 0,
				frame.document.body?.clientWidth || 0
			);
			if (docWidth <= 0) {
				return smallest;
			}
			return Math.min(smallest, docWidth);
		}, Number.POSITIVE_INFINITY);

		if (!Number.isFinite(narrowestViewportWidth)) {
			return false;
		}

		return narrowestViewportWidth <= Math.max(180, hostWidth * 0.33);
	}

	private buildReaderStyles(): string {
		const background = this.getObsidianCSSVar("--background-primary", "rgb(255, 255, 255)");
		const textColor = this.getObsidianCSSVar("--text-normal", "rgb(28, 29, 31)");
		const linkColor = this.getObsidianCSSVar("--link-color", "rgb(80, 110, 214)");
		const selectionBackground = this.getObsidianCSSVar(
			"--text-selection",
			"rgba(120, 140, 255, 0.32)"
		);
		const selectionTextColor = this.getObsidianCSSVar("--text-on-accent", textColor);
		const fontFamily = this.getObsidianFontStack();
		const monospaceFontFamily = this.getObsidianMonospaceFontStack();
		const fontSize = this.getObsidianTextFontSize();
		const colorScheme = this.getCurrentColorScheme();
		const concealment = this.getConcealmentPalette();
		const highlightOpacity = FoliateReaderService.HIGHLIGHT_OPACITY_MAP[colorScheme];
		const highlightBlendMode = FoliateReaderService.HIGHLIGHT_BLEND_MODE_MAP[colorScheme];
		const letterSpacing = `${this.currentLetterSpacing.toFixed(3)}em`;
		const horizontalPageMargin = `${
			this.currentWidthMode === "edge" ? 0 : Math.max(0, Math.round(this.currentPageMargin))
		}px`;

		return `:root {
	color-scheme: ${colorScheme};
	--overlayer-highlight-opacity: ${highlightOpacity};
	--overlayer-highlight-blend-mode: ${highlightBlendMode};
	--weave-reader-font-family: ${fontFamily};
	--weave-reader-monospace-font-family: ${monospaceFontFamily};
	--weave-reader-font-size: ${fontSize};
	--weave-reader-letter-spacing: ${letterSpacing};
	--weave-reader-page-margin-inline: ${horizontalPageMargin};
}
html {
	background: ${background} !important;
	color: ${textColor} !important;
	font-family: var(--weave-reader-font-family) !important;
	font-size: var(--weave-reader-font-size) !important;
	line-height: ${this.currentLineHeight} !important;
	letter-spacing: var(--weave-reader-letter-spacing) !important;
	-webkit-text-size-adjust: 100%;
}
	body {
		background: ${background} !important;
		color: ${textColor} !important;
		font-family: var(--weave-reader-font-family) !important;
	font-size: inherit !important;
	line-height: inherit !important;
	letter-spacing: inherit !important;
	margin: 0 var(--weave-reader-page-margin-inline) !important;
	text-rendering: optimizeLegibility;
	font-kerning: normal;
}
body :is(article, section, main, aside, header, footer, nav, p, div, span, li, dd, dt, blockquote, figcaption, td, th, caption, label, legend) {
	font-family: inherit !important;
	font-size: inherit !important;
	letter-spacing: inherit !important;
}
body :is(p, div, li, dd, dt, blockquote, figcaption) {
	line-height: inherit !important;
}
body :is(h1, h2, h3, h4, h5, h6) {
	font-family: inherit !important;
	line-height: inherit !important;
}
body :is(p, div, span, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, td, th, caption, label, legend) {
	color: inherit;
}
body :is(a, a:link, a:visited) {
	color: ${linkColor} !important;
	font-family: inherit !important;
	font-size: inherit !important;
}
body :is(pre, code, kbd, samp) {
	font-family: var(--weave-reader-monospace-font-family) !important;
	white-space: pre-wrap !important;
	word-break: break-word;
}
body :is(img, svg, video, canvas) {
	max-width: 100% !important;
	height: auto !important;
}
body ::selection {
	background: ${selectionBackground} !important;
	color: ${selectionTextColor} !important;
}
body .weave-foliate-concealment {
	fill: ${concealment.base};
	stroke: ${concealment.border};
	stroke-width: 1;
}`;
	}

	private async syncAnnotationsWithView(): Promise<void> {
		const view = this.foliateView;
		if (!view) {
			this.renderedAnnotations.clear();
			return;
		}

		const visibleFrames = this.getVisibleFramesWithIndex();
		const visibleIndexes = new Set(visibleFrames.map((item) => item.index));
		const desiredVisible = new Map<string, RenderedFoliateAnnotation>();

		const highlightKeys = new Set([
			...this.highlightDataMap.keys(),
			...this.temporaryHighlightDataMap.keys(),
		]);

		for (const key of highlightKeys) {
			const persistentHighlight = this.highlightDataMap.get(key);
			const temporaryHighlight = this.temporaryHighlightDataMap.get(key);
			const visibleHighlight = temporaryHighlight || persistentHighlight;
			if (!visibleHighlight) {
				continue;
			}
			const sectionIndex = this.parser.getSectionIndexForCfi(visibleHighlight.cfiRange);
			if (sectionIndex === null || !visibleIndexes.has(sectionIndex)) {
				continue;
			}
			desiredVisible.set(
				key,
				this.createRenderedAnnotation(persistentHighlight, temporaryHighlight)
			);
		}

		for (const [key, rendered] of Array.from(this.renderedAnnotations.entries())) {
			const desired = desiredVisible.get(key);
			if (
				!desired ||
				rendered.renderSignature !== desired.renderSignature ||
				!this.isSameAnnotation(rendered.annotation, desired.annotation)
			) {
				try {
					await view.deleteAnnotation(rendered.annotation);
				} catch (error) {
					logger.debugWithTag("FoliateReaderService", "Failed to delete foliate annotation", {
						key,
						error,
					});
				}
				this.renderedAnnotations.delete(key);
			}
		}

		for (const [key, rendered] of desiredVisible.entries()) {
			if (this.renderedAnnotations.has(key)) {
				continue;
			}
			try {
				await view.addAnnotation(rendered.annotation);
				this.renderedAnnotations.set(key, rendered);
			} catch (error) {
				logger.warn("[FoliateReaderService] Failed to add foliate annotation:", {
					key,
					error,
				});
			}
		}
	}

	private createAnnotation(highlight: ReaderHighlight, focusColor?: string): FoliateAnnotation {
		const annotation: FoliateAnnotation = {
			...highlight,
			value: highlight.cfiRange,
		};
		if (focusColor) {
			annotation.focusColor = focusColor;
		}
		return annotation;
	}

	private buildHighlightClickInfo(
		highlight: ReaderHighlight,
		geometry: {
			rect: HighlightClickInfo["rect"];
			rects?: HighlightClickInfo["rects"];
			anchorPoint?: HighlightClickInfo["anchorPoint"];
		},
		interactionTarget: HighlightClickInfo["interactionTarget"] = "highlight"
	): HighlightClickInfo {
		return {
			cfiRange: highlight.cfiRange,
			color: highlight.color,
			style: highlight.style,
			text: highlight.text || "",
			commentText: highlight.commentText,
			hasCommentDivider: highlight.hasCommentDivider,
			sourceFile: highlight.sourceFile || "",
			sourceRef: highlight.sourceRef,
			excerptId: highlight.excerptId,
			sourceLocators: highlight.sourceLocators,
			createdTime: highlight.createdTime,
			temporary: highlight.temporary,
			presentation: highlight.presentation,
			interactionTarget,
			rect: geometry.rect,
			rects: geometry.rects,
			anchorPoint: geometry.anchorPoint,
		};
	}

	private getCurrentHighlightByCfi(cfiRange: string): ReaderHighlight | null {
		const key = this.normalizeLocationKey(cfiRange);
		return this.highlightDataMap.get(key) || this.temporaryHighlightDataMap.get(key) || null;
	}

	private createElementViewportRect(element: Element): HighlightClickInfo["rect"] | null {
		const rect = element.getBoundingClientRect?.();
		if (!rect || (!rect.width && !rect.height)) {
			return null;
		}
		return {
			top: rect.top,
			left: rect.left,
			bottom: rect.bottom,
			right: rect.right,
			width: rect.width,
			height: rect.height,
		};
	}

	private createAnchorPointFromRect(
		rect: HighlightClickInfo["rect"] | null | undefined
	): HighlightClickInfo["anchorPoint"] | undefined {
		if (!rect) {
			return undefined;
		}
		return {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		};
	}

	private createViewportRectFromRawRect(rect: {
		left: number;
		top: number;
		width: number;
		height: number;
	}): HighlightClickInfo["rect"] | null {
		if (
			!Number.isFinite(rect.left) ||
			!Number.isFinite(rect.top) ||
			rect.width <= 0 ||
			rect.height <= 0
		) {
			return null;
		}
		return {
			top: rect.top,
			left: rect.left,
			bottom: rect.top + rect.height,
			right: rect.left + rect.width,
			width: rect.width,
			height: rect.height,
		};
	}

	private createViewportRectListFromRawRectList(
		rects: Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>
	): HighlightClickInfo["rect"][] {
		return rects
			.map((rect) => this.createViewportRectFromRawRect(rect))
			.filter((rect): rect is HighlightClickInfo["rect"] => Boolean(rect));
	}

	private createViewportRectFromRawRectList(
		rects: Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>
	): HighlightClickInfo["rect"] | null {
		const validRects = this.createViewportRectListFromRawRectList(rects);
		if (!validRects.length) {
			return null;
		}
		const left = Math.min(...validRects.map((rect) => rect.left));
		const top = Math.min(...validRects.map((rect) => rect.top));
		const right = Math.max(...validRects.map((rect) => rect.right));
		const bottom = Math.max(...validRects.map((rect) => rect.bottom));
		return {
			top,
			left,
			bottom,
			right,
			width: right - left,
			height: bottom - top,
		};
	}

	private notifyCommentMarkerClick(
		cfiRange: string,
		markerElement: Element,
		anchorRect?: HighlightClickInfo["rect"] | null
	): void {
		const highlight = this.getCurrentHighlightByCfi(cfiRange);
		if (!highlight) {
			return;
		}
		const rangeGeometry = this.getCurrentHighlightViewportGeometry(cfiRange);
		const markerRect = this.createElementViewportRect(markerElement);
		const rect = markerRect || anchorRect || rangeGeometry?.rect;
		if (!rect) {
			return;
		}
		this.notifyHighlightClick(
			this.buildHighlightClickInfo(
				highlight,
				{
					rect,
					rects: markerRect ? [markerRect] : rangeGeometry?.rects,
					anchorPoint: this.createAnchorPointFromRect(markerRect || anchorRect || rect),
				},
				"comment-marker"
			)
		);
	}

	private getCurrentHighlightViewportGeometry(
		cfiRange: string
	): { rect: HighlightClickInfo["rect"]; rects?: HighlightClickInfo["rect"][] } | null {
		const frames = this.getVisibleFramesWithIndex();
		for (const frame of frames) {
			const range = this.parser.resolveRangeInLoadedSection(cfiRange, frame.document, frame.index);
			if (!range) {
				continue;
			}
			const rect = this.createViewportRect(frame, range);
			if (rect) {
				const rects = this.createViewportRectList(frame, range);
				return {
					rect,
					rects: rects?.length ? rects : undefined,
				};
			}
		}
		return null;
	}

	private createRenderedAnnotation(
		persistentHighlight?: ReaderHighlight,
		temporaryHighlight?: ReaderHighlight
	): RenderedFoliateAnnotation {
		const annotation = this.composeVisibleAnnotationHighlight(
			persistentHighlight,
			temporaryHighlight
		);
		return {
			annotation,
			renderSignature: this.getAnnotationRenderSignature(annotation),
		};
	}

	private shouldRenderAnnotationAsConceal(
		annotation: Pick<FoliateAnnotation, "cfiRange" | "presentation" | "style">
	): boolean {
		if (annotation.presentation === "conceal") {
			return true;
		}
		return (
			annotation.style === "strikethrough" && this.currentStrikethroughPresentation === "conceal"
		);
	}

	private composeVisibleAnnotationHighlight(
		persistentHighlight?: ReaderHighlight,
		temporaryHighlight?: ReaderHighlight
	): FoliateAnnotation {
		if (persistentHighlight && temporaryHighlight) {
			return this.createAnnotation(persistentHighlight, temporaryHighlight.color);
		}

		const highlight = temporaryHighlight || persistentHighlight;
		if (!highlight) {
			throw new Error("Cannot compose annotation without a highlight");
		}

		return this.createAnnotation(highlight);
	}

	private async drawAnnotation(
		annotation: FoliateAnnotation,
		draw: (draw: (rects: unknown[], options?: unknown) => SVGElement, options?: unknown) => void
	): Promise<void> {
		if (this.shouldRenderAnnotationAsConceal(annotation)) {
			const key = this.normalizeLocationKey(annotation.cfiRange);
			if (!this.temporarilyRevealedConcealmentTimers.has(key)) {
				draw((rects) => this.createConcealmentOverlay(rects));
				return;
			}
		}

		const overlayer = await this.getOverlayerModule();
		draw((rects) => this.createCompositeAnnotationOverlay(annotation, rects, overlayer));
	}

	private getOverlayerModule(): Promise<typeof import("foliate-js/overlayer.js")> {
		if (!this.overlayerModulePromise) {
			this.overlayerModulePromise = import("foliate-js/overlayer.js");
		}
		return this.overlayerModulePromise;
	}

	private createCompositeAnnotationOverlay(
		annotation: FoliateAnnotation,
		rects: unknown[],
		overlayer?: {
			Overlayer: {
				highlight: (rects: unknown[], options?: unknown) => SVGElement;
			};
		}
	): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");

		if (annotation.style) {
			group.appendChild(
				this.createStyledAnnotationOverlay(rects, annotation.style, annotation.color)
			);
		} else if (overlayer) {
			group.appendChild(
				overlayer.Overlayer.highlight(rects, {
					color: this.resolveHighlightTint(annotation.color),
					padding: 1,
				})
			);
		}

		if (annotation.hasCommentDivider) {
			group.appendChild(this.createCommentMarkerOverlay(annotation, rects));
		}

		if (annotation.focusColor) {
			group.appendChild(this.createTemporaryFocusOverlay(rects, annotation.focusColor));
		}

		// 添加引用次数角标
		if (annotation.referenceCount && annotation.referenceCount > 1) {
			group.appendChild(this.createReferenceBadgeOverlay(annotation, rects));
		}

		return group;
	}

	private createConcealmentOverlay = (rects: unknown[]): SVGElement => {
		const palette = this.getConcealmentPalette();
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");

		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			const background = document.createElementNS(svgNS, "rect");
			background.setAttribute("x", String(rect.left));
			background.setAttribute("y", String(rect.top));
			background.setAttribute("width", String(rect.width));
			background.setAttribute("height", String(rect.height));
			background.setAttribute("rx", "4");
			background.setAttribute("fill", palette.base);
			background.setAttribute("stroke", palette.border);
			group.appendChild(background);

			const stripeWidth = 9;
			for (let x = rect.left; x < rect.left + rect.width; x += stripeWidth * 2) {
				const stripe = document.createElementNS(svgNS, "rect");
				stripe.setAttribute("x", String(x));
				stripe.setAttribute("y", String(rect.top));
				stripe.setAttribute("width", String(Math.min(stripeWidth, rect.left + rect.width - x)));
				stripe.setAttribute("height", String(rect.height));
				stripe.setAttribute("fill", palette.stripe);
				stripe.setAttribute("opacity", "0.92");
				group.appendChild(stripe);
			}
		}

		return group;
	};

	private createCommentMarkerOverlay(annotation: FoliateAnnotation, rects: unknown[]): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		group.setAttribute("data-weave-comment-marker", "group");
		const rectList = rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>;
		const anchorRect = this.createViewportRectFromRawRectList(rectList);
		const targetRect = [...rectList].reverse().find((rect) => rect.width > 0 && rect.height > 0);
		if (!targetRect) {
			return group;
		}

		const accentColor = annotation.color
			? this.resolveHighlightTint(annotation.color)
			: this.getObsidianCSSVar("--interactive-accent", "#7c3aed");
		const fillColor = this.getObsidianCSSVar("--background-primary", "#ffffff");
		const accentTextColor = this.getObsidianCSSVar("--text-on-accent", "#ffffff");
		const inset = Math.max(1.15, Math.min(2.1, targetRect.height * 0.1));
		const availableWidth = Math.max(12, targetRect.width - inset * 2);
		const availableHeight = Math.max(9.5, targetRect.height - inset * 2);
		const bubbleHeight = Math.min(
			Math.max(10.2, Math.min(12.8, targetRect.height * 0.62)),
			availableHeight
		);
		const tailSize = Math.min(
			Math.max(1.9, Math.min(2.8, bubbleHeight * 0.24)),
			Math.max(1.5, bubbleHeight * 0.26)
		);
		const bubbleBodyHeight = Math.max(7.5, bubbleHeight - tailSize);
		const badgeWidth = Math.min(
			Math.max(14.8, Math.min(20.5, bubbleBodyHeight * 1.78)),
			availableWidth
		);
		const cornerRadius = Math.max(4.2, Math.min(6.6, bubbleBodyHeight * 0.5));
		const badgeX = Math.max(
			targetRect.left + inset,
			targetRect.left + targetRect.width - badgeWidth - inset
		);
		const badgeY = targetRect.top + inset;
		const bubbleBackdrop = document.createElementNS(svgNS, "rect");
		bubbleBackdrop.setAttribute("data-weave-comment-marker", "backdrop");
		bubbleBackdrop.setAttribute("x", String(badgeX));
		bubbleBackdrop.setAttribute("y", String(badgeY));
		bubbleBackdrop.setAttribute("width", String(badgeWidth));
		bubbleBackdrop.setAttribute("height", String(bubbleBodyHeight));
		bubbleBackdrop.setAttribute("rx", String(cornerRadius));
		bubbleBackdrop.setAttribute("ry", String(cornerRadius));
		bubbleBackdrop.setAttribute("fill", accentColor);
		bubbleBackdrop.setAttribute("fill-opacity", "0.16");
		setSvgInteractionAttributes(bubbleBackdrop, { pointerEvents: "none" });
		const bubbleBody = document.createElementNS(svgNS, "rect");
		bubbleBody.setAttribute("data-weave-comment-marker", "bubble");
		bubbleBody.setAttribute("x", String(badgeX));
		bubbleBody.setAttribute("y", String(badgeY));
		bubbleBody.setAttribute("width", String(badgeWidth));
		bubbleBody.setAttribute("height", String(bubbleBodyHeight));
		bubbleBody.setAttribute("rx", String(cornerRadius));
		bubbleBody.setAttribute("ry", String(cornerRadius));
		bubbleBody.setAttribute("fill", accentColor);
		bubbleBody.setAttribute("fill-opacity", "0.12");
		bubbleBody.setAttribute("stroke", accentColor);
		bubbleBody.setAttribute("stroke-width", "1.75");
		bubbleBody.setAttribute("opacity", "1");
		setSvgInteractionAttributes(bubbleBody, { pointerEvents: "none" });

		const bubbleInner = document.createElementNS(svgNS, "rect");
		bubbleInner.setAttribute("data-weave-comment-marker", "inner");
		bubbleInner.setAttribute("x", String(badgeX + 1.15));
		bubbleInner.setAttribute("y", String(badgeY + 1.1));
		bubbleInner.setAttribute("width", String(Math.max(7, badgeWidth - 2.3)));
		bubbleInner.setAttribute("height", String(Math.max(4.8, bubbleBodyHeight - 2.25)));
		bubbleInner.setAttribute("rx", String(Math.max(3.2, cornerRadius - 1.2)));
		bubbleInner.setAttribute("ry", String(Math.max(3.2, cornerRadius - 1.2)));
		bubbleInner.setAttribute("fill", fillColor);
		bubbleInner.setAttribute("fill-opacity", "0.2");
		setSvgInteractionAttributes(bubbleInner, { pointerEvents: "none" });

		const bubbleTail = document.createElementNS(svgNS, "path");
		bubbleTail.setAttribute("data-weave-comment-marker", "tail");
		bubbleTail.setAttribute(
			"d",
			[
				`M ${badgeX + badgeWidth * 0.56} ${badgeY + bubbleBodyHeight - 0.18}`,
				`L ${badgeX + badgeWidth * 0.78} ${badgeY + bubbleHeight - 0.12}`,
				`L ${badgeX + badgeWidth * 0.44} ${badgeY + bubbleBodyHeight + 0.28}`,
				"Z",
			].join(" ")
		);
		bubbleTail.setAttribute("fill", accentColor);
		bubbleTail.setAttribute("fill-opacity", "0.12");
		bubbleTail.setAttribute("stroke", accentColor);
		bubbleTail.setAttribute("stroke-width", "1.55");
		bubbleTail.setAttribute("stroke-linejoin", "round");
		setSvgInteractionAttributes(bubbleTail, { pointerEvents: "none" });

		const dotRadius = Math.max(1.08, Math.min(1.55, bubbleBodyHeight * 0.15));
		const dotCenterY = badgeY + bubbleBodyHeight * 0.56;
		const dots: SVGCircleElement[] = [];
		for (const ratio of [0.3, 0.5, 0.7]) {
			const dot = document.createElementNS(svgNS, "circle");
			dot.setAttribute("data-weave-comment-marker", "dot");
			dot.setAttribute("cx", String(badgeX + badgeWidth * ratio));
			dot.setAttribute("cy", String(dotCenterY));
			dot.setAttribute("r", String(dotRadius));
			dot.setAttribute("fill", accentColor);
			setSvgInteractionAttributes(dot, { pointerEvents: "none" });
			dots.push(dot);
		}

		const stickerSize = Math.max(2.4, Math.min(3.4, bubbleBodyHeight * 0.26));
		const sticker = document.createElementNS(svgNS, "circle");
		sticker.setAttribute("data-weave-comment-marker", "sticker");
		sticker.setAttribute("cx", String(badgeX + badgeWidth - stickerSize - 1.15));
		sticker.setAttribute("cy", String(badgeY + stickerSize + 0.85));
		sticker.setAttribute("r", String(stickerSize));
		sticker.setAttribute("fill", accentColor);
		sticker.setAttribute("stroke", fillColor);
		sticker.setAttribute("stroke-width", "0.95");
		setSvgInteractionAttributes(sticker, { pointerEvents: "none" });

		const stickerHighlight = document.createElementNS(svgNS, "circle");
		stickerHighlight.setAttribute("data-weave-comment-marker", "sticker-highlight");
		stickerHighlight.setAttribute("cx", String(badgeX + badgeWidth - stickerSize - 1.9));
		stickerHighlight.setAttribute("cy", String(badgeY + stickerSize + 0.1));
		stickerHighlight.setAttribute("r", String(Math.max(0.7, stickerSize * 0.34)));
		stickerHighlight.setAttribute("fill", accentTextColor);
		stickerHighlight.setAttribute("fill-opacity", "0.78");
		setSvgInteractionAttributes(stickerHighlight, { pointerEvents: "none" });

		const hitAreaX = Math.max(targetRect.left, badgeX - 1.5);
		const hitAreaY = Math.max(targetRect.top, badgeY - 1.5);
		const hitAreaRight = Math.min(targetRect.left + targetRect.width, badgeX + badgeWidth + 1.5);
		const hitAreaBottom = Math.min(targetRect.top + targetRect.height, badgeY + bubbleHeight + 2);
		const hitArea = document.createElementNS(svgNS, "rect");
		hitArea.setAttribute("data-weave-comment-marker", "hit-area");
		hitArea.setAttribute("x", String(hitAreaX));
		hitArea.setAttribute("y", String(hitAreaY));
		hitArea.setAttribute("width", String(Math.max(6, hitAreaRight - hitAreaX)));
		hitArea.setAttribute("height", String(Math.max(6, hitAreaBottom - hitAreaY)));
		hitArea.setAttribute("rx", String(cornerRadius + 1.5));
		hitArea.setAttribute("ry", String(cornerRadius + 1.5));
		hitArea.setAttribute("fill", "#000000");
		hitArea.setAttribute("fill-opacity", "0.001");
		hitArea.setAttribute("role", "button");
		hitArea.setAttribute("aria-label", i18n.t("epub.reader.commentMarkerAria"));
		setSvgInteractionAttributes(hitArea, { cursor: "pointer", pointerEvents: "auto" });

		const handleMarkerClick = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			this.notifyCommentMarkerClick(annotation.cfiRange, bubbleBody, anchorRect);
		};
		hitArea.addEventListener("click", handleMarkerClick);
		group.appendChild(hitArea);
		group.appendChild(bubbleBackdrop);
		group.appendChild(bubbleBody);
		group.appendChild(bubbleInner);
		group.appendChild(bubbleTail);
		for (const dot of dots) {
			group.appendChild(dot);
		}
		group.appendChild(sticker);
		group.appendChild(stickerHighlight);
		return group;
	}

	private createReferenceBadgeOverlay(annotation: FoliateAnnotation, rects: unknown[]): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		group.setAttribute("data-weave-reference-badge", "group");

		const rectList = rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>;

		// 找到最后一个有效的矩形（高亮的末尾）
		const targetRect = [...rectList].reverse().find((rect) => rect.width > 0 && rect.height > 0);

		if (!targetRect) {
			return group;
		}

		const count = annotation.referenceCount || 0;
		const heat = annotation.referenceHeat || 0;
		const badgeColor = this.getReferenceBadgeColor(heat);
		const fillColor = this.getObsidianCSSVar("--background-primary", "#ffffff");
		const inset = Math.max(0.85, Math.min(1.8, targetRect.height * 0.1));
		const availableWidth = Math.max(9.5, targetRect.width - inset * 2);
		const availableHeight = Math.max(8.2, targetRect.height - inset * 2);
		const badgeHeight = Math.min(
			Math.max(8.8, Math.min(12.6, targetRect.height * 0.58)),
			availableHeight
		);
		const badgeWidth = Math.min(
			Math.max(badgeHeight + 2, Math.min(18.5, count >= 10 ? 16.5 : count >= 5 ? 14.8 : 13.2)),
			availableWidth
		);
		const badgeX = Math.max(
			targetRect.left + inset,
			targetRect.left + targetRect.width - badgeWidth - inset
		);
		const badgeY = targetRect.top + inset;
		const cornerRadius = Math.max(3.6, Math.min(6.2, badgeHeight * 0.52));

		const background = document.createElementNS(svgNS, "rect");
		background.setAttribute("data-weave-reference-badge", "background");
		background.setAttribute("x", String(badgeX));
		background.setAttribute("y", String(badgeY));
		background.setAttribute("width", String(badgeWidth));
		background.setAttribute("height", String(badgeHeight));
		background.setAttribute("rx", String(cornerRadius));
		background.setAttribute("ry", String(cornerRadius));
		background.setAttribute("fill", badgeColor);
		background.setAttribute("stroke", fillColor);
		background.setAttribute("stroke-width", "0.8");
		setSvgInteractionAttributes(background, { pointerEvents: "none" });

		const inner = document.createElementNS(svgNS, "rect");
		inner.setAttribute("data-weave-reference-badge", "inner");
		inner.setAttribute("x", String(badgeX + 0.9));
		inner.setAttribute("y", String(badgeY + 0.8));
		inner.setAttribute("width", String(Math.max(5.5, badgeWidth - 1.8)));
		inner.setAttribute("height", String(Math.max(4.8, badgeHeight - 1.6)));
		inner.setAttribute("rx", String(Math.max(2.8, cornerRadius - 0.9)));
		inner.setAttribute("ry", String(Math.max(2.8, cornerRadius - 0.9)));
		inner.setAttribute("fill", "#ffffff");
		inner.setAttribute("fill-opacity", "0.14");
		setSvgInteractionAttributes(inner, { pointerEvents: "none" });

		const text = document.createElementNS(svgNS, "text");
		text.setAttribute("data-weave-reference-badge", "text");
		text.setAttribute("x", String(badgeX + badgeWidth / 2));
		text.setAttribute("y", String(badgeY + badgeHeight * 0.56));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "middle");
		text.setAttribute("fill", "#ffffff");
		text.setAttribute("font-size", String(Math.max(7.2, Math.min(9.6, badgeHeight * 0.56))));
		text.setAttribute("font-weight", "700");
		text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
		text.textContent = String(count);
		setSvgInteractionAttributes(text, { pointerEvents: "none" });

		const hitArea = document.createElementNS(svgNS, "rect");
		hitArea.setAttribute("data-weave-reference-badge", "hit-area");
		hitArea.setAttribute("x", String(Math.max(targetRect.left, badgeX - 1.25)));
		hitArea.setAttribute("y", String(Math.max(targetRect.top, badgeY - 1.25)));
		hitArea.setAttribute(
			"width",
			String(Math.max(6, Math.min(targetRect.width, badgeWidth + 2.5)))
		);
		hitArea.setAttribute(
			"height",
			String(Math.max(6, Math.min(targetRect.height, badgeHeight + 2.5)))
		);
		hitArea.setAttribute("rx", String(cornerRadius + 1.1));
		hitArea.setAttribute("ry", String(cornerRadius + 1.1));
		hitArea.setAttribute("fill", "#000000");
		hitArea.setAttribute("fill-opacity", "0.001");
		hitArea.setAttribute("role", "button");
		hitArea.setAttribute("aria-label", i18n.t("epub.reader.referenceBadgeAria", { count }));
		setSvgInteractionAttributes(hitArea, { cursor: "pointer", pointerEvents: "auto" });
		const badgeRect = this.createViewportRectFromRawRect({
			left: Math.max(targetRect.left, badgeX - 1.25),
			top: Math.max(targetRect.top, badgeY - 1.25),
			width: Math.max(6, Math.min(targetRect.width, badgeWidth + 2.5)),
			height: Math.max(6, Math.min(targetRect.height, badgeHeight + 2.5)),
		});
		const badgeAnchorPoint = this.createAnchorPointFromRect(badgeRect);
		const highlightRects = this.createViewportRectListFromRawRectList(rectList);

		const handleBadgeClick = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			this.notifyReferenceBadgeClick(annotation.cfiRange, {
				rect: badgeRect,
				rects: highlightRects,
				anchorPoint: badgeAnchorPoint,
			});
		};
		hitArea.addEventListener("click", handleBadgeClick);

		group.appendChild(hitArea);
		group.appendChild(background);
		group.appendChild(inner);
		group.appendChild(text);
		return group;
	}

	private getReferenceBadgeColor(heat: number): string {
		if (heat >= 80) return "#ef4444"; // red
		if (heat >= 50) return "#f97316"; // orange
		if (heat >= 20) return "#eab308"; // yellow
		return "#667eea"; // purple
	}

	private notifyReferenceBadgeClick(
		cfiRange: string,
		geometry?: {
			rect: HighlightClickInfo["rect"] | null;
			rects?: HighlightClickInfo["rects"];
			anchorPoint?: HighlightClickInfo["anchorPoint"];
		}
	): void {
		const highlight = this.getCurrentHighlightByCfi(cfiRange);
		let info: HighlightClickInfo | null = null;

		if (highlight && geometry?.rect) {
			info = this.buildHighlightClickInfo(
				highlight,
				{
					rect: geometry.rect,
					rects: geometry.rects,
					anchorPoint: geometry.anchorPoint,
				},
				"reference-badge"
			);
		} else {
			info = this.getHighlightClickInfo(cfiRange, "reference-badge");
		}

		if (info) {
			for (const listener of this.referenceBadgeClickCallbacks) {
				try {
					listener(info);
				} catch (error) {
					logger.warn("[FoliateReaderService] Reference badge click listener failed:", {
						cfiRange,
						error,
					});
				}
			}
		}

		// 兼容旧链路：如果外部仍依赖高亮点击或 DOM 事件，这里继续发出。
		if (info) {
			this.notifyHighlightClick(info);
		}

		if (this.foliateView) {
			this.foliateView.dispatchEvent(
				new CustomEvent("reference-badge-click", {
					detail: { cfiRange },
					bubbles: true,
				})
			);
		}
	}

	private createStyledAnnotationOverlay = (
		rects: unknown[],
		style: EpubHighlightStyle,
		color?: string
	): SVGElement => {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		const strokeColor = this.resolveHighlightTint(color);

		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			if (rect.width <= 0 || rect.height <= 0) {
				continue;
			}
			if (style === "underline") {
				group.appendChild(
					this.createStraightLineOverlay(rect, strokeColor, rect.top + rect.height - 1.5)
				);
				continue;
			}
			if (style === "strikethrough") {
				group.appendChild(
					this.createStraightLineOverlay(rect, strokeColor, rect.top + rect.height * 0.58)
				);
				continue;
			}
			group.appendChild(this.createWavyLineOverlay(rect, strokeColor));
		}
		return group;
	};

	private createStraightLineOverlay(
		rect: { left: number; top: number; width: number; height: number },
		strokeColor: string,
		y: number
	): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const line = document.createElementNS(svgNS, "line");
		line.setAttribute("x1", String(rect.left));
		line.setAttribute("y1", String(y));
		line.setAttribute("x2", String(rect.left + rect.width));
		line.setAttribute("y2", String(y));
		line.setAttribute("stroke", strokeColor);
		line.setAttribute("stroke-width", String(Math.max(1.5, Math.min(2.6, rect.height * 0.11))));
		line.setAttribute("stroke-linecap", "round");
		line.setAttribute("stroke-opacity", "0.96");
		return line;
	}

	private createWavyLineOverlay(
		rect: { left: number; top: number; width: number; height: number },
		strokeColor: string
	): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const path = document.createElementNS(svgNS, "path");
		const baseY = rect.top + rect.height - 2;
		const amplitude = Math.max(1.2, Math.min(2.8, rect.height * 0.12));
		const wavelength = Math.max(6, Math.min(12, rect.height * 0.8));
		let currentX = rect.left;
		let d = `M ${rect.left} ${baseY}`;
		while (currentX < rect.left + rect.width) {
			const nextX = Math.min(currentX + wavelength, rect.left + rect.width);
			const midX = currentX + (nextX - currentX) / 2;
			d += ` Q ${currentX + wavelength * 0.25} ${baseY - amplitude}, ${midX} ${baseY}`;
			d += ` Q ${currentX + wavelength * 0.75} ${baseY + amplitude}, ${nextX} ${baseY}`;
			currentX = nextX;
		}
		path.setAttribute("d", d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", strokeColor);
		path.setAttribute("stroke-width", String(Math.max(1.4, Math.min(2.2, rect.height * 0.1))));
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		path.setAttribute("stroke-opacity", "0.96");
		return path;
	}

	private createTemporaryFocusOverlay = (rects: unknown[], color: string): SVGElement => {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		const strokeColor = this.resolveHighlightTint(color);

		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			const outline = document.createElementNS(svgNS, "rect");
			outline.setAttribute("x", String(rect.left - 1.5));
			outline.setAttribute("y", String(rect.top - 1.5));
			outline.setAttribute("width", String(rect.width + 3));
			outline.setAttribute("height", String(rect.height + 3));
			outline.setAttribute("rx", "5");
			outline.setAttribute("fill", "none");
			outline.setAttribute("stroke", strokeColor);
			outline.setAttribute("stroke-width", "2");
			outline.setAttribute("stroke-opacity", "0.95");
			group.appendChild(outline);
		}

		return group;
	};

	private async addResolvedHighlight(
		highlight: ReaderHighlight,
		durationMs?: number
	): Promise<void> {
		const canonical =
			(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) ||
			highlight.cfiRange;
		const normalizedHighlight = this.normalizeHighlightSources({
			...highlight,
			cfiRange: canonical,
		});
		const key = this.normalizeLocationKey(normalizedHighlight.cfiRange);

		const existingTimer = this.temporaryHighlightTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.temporaryHighlightTimers.delete(key);
		}

		if (normalizedHighlight.temporary) {
			const existingTemporaryHighlight = this.temporaryHighlightDataMap.get(key);
			this.temporaryHighlightDataMap.set(
				key,
				existingTemporaryHighlight
					? this.mergeHighlights(existingTemporaryHighlight, normalizedHighlight)
					: normalizedHighlight
			);
			await this.refreshHighlights();

			if (typeof durationMs === "number" && durationMs > 0) {
				const timer = setTimeout(() => {
					this.temporaryHighlightTimers.delete(key);
					this.removeTemporaryHighlight(normalizedHighlight.cfiRange);
				}, durationMs);
				this.temporaryHighlightTimers.set(key, timer);
			}
			return;
		}

		const deduped = new Map<string, ReaderHighlight>();
		for (const item of this.savedHighlights) {
			deduped.set(this.normalizeLocationKey(item.cfiRange), item);
		}
		const existingHighlight = deduped.get(key);
		const mergedHighlight = existingHighlight
			? this.mergeHighlights(existingHighlight, normalizedHighlight)
			: normalizedHighlight;
		deduped.set(key, mergedHighlight);
		this.highlightDataMap.set(key, mergedHighlight);
		this.savedHighlights = Array.from(deduped.values());
		await this.refreshHighlights();
	}

	private removeTemporaryHighlight(cfiRange: string): void {
		const key = this.normalizeLocationKey(cfiRange);
		const existingTimer = this.temporaryHighlightTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.temporaryHighlightTimers.delete(key);
		}
		this.temporaryHighlightDataMap.delete(key);
		this.invalidateParagraphPresentation();
		void this.syncAnnotationsWithView();
	}

	private dedupeHighlights(highlights: ReaderHighlight[]): ReaderHighlight[] {
		const deduped = new Map<string, ReaderHighlight>();
		for (const highlight of highlights) {
			const normalized = this.normalizeHighlightSources(highlight);
			const key = this.normalizeLocationKey(normalized.cfiRange);
			const existing = deduped.get(key);
			deduped.set(key, existing ? this.mergeHighlights(existing, normalized) : normalized);
		}
		return Array.from(deduped.values());
	}

	private collectHighlightSourceLocators(highlight: {
		sourceFile?: string;
		sourceRef?: string;
		excerptId?: string;
		sourceLocators?: HighlightSourceLocator[];
	}): HighlightSourceLocator[] {
		const locators: HighlightSourceLocator[] = [];
		const primarySourceFile = String(highlight.sourceFile || "").trim();
		if (primarySourceFile) {
			locators.push({
				sourceFile: primarySourceFile,
				sourceRef: highlight.sourceRef,
				...(highlight.excerptId ? { excerptId: highlight.excerptId } : {}),
			});
		}
		for (const locator of highlight.sourceLocators || []) {
			const sourceFile = String(locator?.sourceFile || "").trim();
			if (!sourceFile) continue;
			locators.push({
				sourceFile,
				sourceRef: locator.sourceRef,
				...(locator.excerptId ? { excerptId: locator.excerptId } : {}),
			});
		}
		return this.mergeHighlightSourceLocators([], locators);
	}

	private mergeHighlightSourceLocators(
		existing: HighlightSourceLocator[],
		incoming: HighlightSourceLocator[]
	): HighlightSourceLocator[] {
		const merged = new Map<string, HighlightSourceLocator>();
		for (const locator of [...existing, ...incoming]) {
			const sourceFile = String(locator?.sourceFile || "").trim();
			if (!sourceFile) continue;
			const normalizedRef = String(locator?.sourceRef || "").trim();
			const normalizedExcerptId = String(locator?.excerptId || "").trim();
			const key = `${sourceFile}::${normalizedRef}::${normalizedExcerptId}`;
			if (!merged.has(key)) {
				merged.set(key, {
					sourceFile,
					sourceRef: normalizedRef || undefined,
					...(normalizedExcerptId ? { excerptId: normalizedExcerptId } : {}),
				});
			}
		}
		return Array.from(merged.values());
	}

	private selectPrimarySourceLocator(
		locators: HighlightSourceLocator[]
	): HighlightSourceLocator | null {
		if (locators.length === 0) {
			return null;
		}

		const cardLocator = locators.find(
			(locator) => typeof locator.sourceRef === "string" && locator.sourceRef.startsWith("card:")
		);
		if (cardLocator) {
			return cardLocator;
		}

		const referencedLocator = locators.find(
			(locator) => typeof locator.sourceRef === "string" && locator.sourceRef.trim().length > 0
		);
		if (referencedLocator) {
			return referencedLocator;
		}

		const markdownLocator = locators.find((locator) => locator.sourceFile.endsWith(".md"));
		if (markdownLocator) {
			return markdownLocator;
		}

		const canvasLocator = locators.find((locator) => locator.sourceFile.endsWith(".canvas"));
		if (canvasLocator) {
			return canvasLocator;
		}

		const wdeckLocator = locators.find((locator) => locator.sourceFile.endsWith(".wdeck"));
		if (wdeckLocator) {
			return wdeckLocator;
		}

		const jsonLocator = locators.find((locator) => locator.sourceFile.endsWith(".json"));
		if (jsonLocator) {
			return jsonLocator;
		}

		return locators[0] || null;
	}

	private normalizeHighlightSources(highlight: ReaderHighlight): ReaderHighlight {
		const sourceLocators = this.collectHighlightSourceLocators(highlight);
		const primaryLocator = this.selectPrimarySourceLocator(sourceLocators);
		return {
			...highlight,
			sourceFile: primaryLocator?.sourceFile || highlight.sourceFile,
			sourceRef: primaryLocator?.sourceRef || highlight.sourceRef,
			excerptId: primaryLocator?.excerptId || highlight.excerptId,
			sourceLocators,
		};
	}

	private mergeHighlights(existing: ReaderHighlight, incoming: ReaderHighlight): ReaderHighlight {
		const sourceLocators = this.mergeHighlightSourceLocators(
			this.collectHighlightSourceLocators(existing),
			this.collectHighlightSourceLocators(incoming)
		);
		const primaryLocator = this.selectPrimarySourceLocator(sourceLocators);
		return {
			...existing,
			...incoming,
			sourceFile: primaryLocator?.sourceFile || incoming.sourceFile || existing.sourceFile,
			sourceRef: primaryLocator?.sourceRef || incoming.sourceRef || existing.sourceRef,
			excerptId: primaryLocator?.excerptId || incoming.excerptId || existing.excerptId,
			sourceLocators,
		};
	}

	private normalizeLocationKey(value: string): string {
		return this.normalizeLocationString(value).toLowerCase();
	}

	private normalizeLocationString(value: string): string {
		let normalized = String(value || "")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]")
			.replace(/%7C/gi, "|")
			.trim();
		if (normalized.includes("%")) {
			try {
				normalized = decodeURIComponent(normalized);
			} catch (_error) {
				// Keep the original string when decoding fails.
			}
		}
		return normalized;
	}

	private attachThemeChangeListener(): void {
		if (this.themeChangeCleanup) {
			this.themeChangeCleanup();
			this.themeChangeCleanup = null;
		}

		let skipInitialNotification = true;
		this.themeChangeCleanup = UnifiedThemeManager.getInstance().addListener(() => {
			if (skipInitialNotification) {
				skipInitialNotification = false;
				return;
			}
			this.scheduleThemeRefresh();
		});
	}

	private scheduleThemeRefresh(): void {
		if (!this.renderContainer || !this.foliateView) {
			return;
		}

		const refreshToken = ++this.themeRefreshToken;
		if (this.pendingThemeRefreshFrame !== null) {
			cancelAnimationFrame(this.pendingThemeRefreshFrame);
		}

		this.pendingThemeRefreshFrame = requestAnimationFrame(() => {
			if (refreshToken !== this.themeRefreshToken) {
				this.pendingThemeRefreshFrame = null;
				return;
			}
			this.pendingThemeRefreshFrame = requestAnimationFrame(() => {
				this.pendingThemeRefreshFrame = null;
				void this.refreshThemeAfterHostChange(refreshToken);
			});
		});
	}

	private async refreshThemeAfterHostChange(refreshToken: number): Promise<void> {
		if (refreshToken !== this.themeRefreshToken || !this.renderContainer || !this.foliateView) {
			return;
		}

		try {
			this.applyHostThemeSurface();
			await this.applyReaderAppearance({});
			if (refreshToken !== this.themeRefreshToken || !this.foliateView) {
				return;
			}
			const renderer = this.foliateView.renderer as FoliateRenderer | undefined;
			this.applyRendererLayout();
			renderer?.render?.();
			await this.waitForAnimationFrame();
			if (refreshToken !== this.themeRefreshToken) {
				return;
			}
			this.applyHostThemeSurface();
			this.applyRendererLayout();
			renderer?.render?.();
			await this.waitForAnimationFrame();
			if (refreshToken !== this.themeRefreshToken) {
				return;
			}
			this.schedulePaginatedLayoutRecovery();
		} catch (error) {
			logger.warn(
				"[FoliateReaderService] Failed to refresh reader appearance after theme change:",
				error
			);
		}
	}

	private async destroyViewOnly(): Promise<void> {
		this.flushReadingPace();
		this.resetReadingPaceTracking();
		this.sessionGuard.invalidateViewSession();
		this.dismissFootnotePreview({ unpin: true });
		for (const cleanup of this.documentFootnoteCleanups.values()) {
			cleanup();
		}
		this.documentFootnoteCleanups.clear();
		for (const cleanup of this.documentSelectionCleanups.values()) {
			cleanup();
		}
		this.documentSelectionCleanups.clear();
		for (const cleanup of this.documentWheelCleanups.values()) {
			cleanup();
		}
		this.documentWheelCleanups.clear();
		if (this.themeChangeCleanup) {
			this.themeChangeCleanup();
			this.themeChangeCleanup = null;
		}
		this.themeRefreshToken += 1;
		if (this.pendingThemeRefreshFrame !== null) {
			cancelAnimationFrame(this.pendingThemeRefreshFrame);
			this.pendingThemeRefreshFrame = null;
		}
		this.layoutRecoveryToken += 1;
		if (this.pendingLayoutRecoveryFrame !== null) {
			cancelAnimationFrame(this.pendingLayoutRecoveryFrame);
			this.pendingLayoutRecoveryFrame = null;
		}
		if (this.renderContainerWheelCleanup) {
			this.renderContainerWheelCleanup();
			this.renderContainerWheelCleanup = null;
		}
		this.layoutChangeInFlight = false;
		this.resetWheelPageTurnState();
		this.wheelTurnInFlight = false;

		const currentContainer = this.renderContainer;
		const currentView = this.foliateView;
		this.foliateView = null;
		this.renderContainer = null;
		this.renderedAnnotations.clear();
		this.loadedDocumentSectionIndexes = new WeakMap<Document, number>();
		this.lastSelectionByDocument = new WeakMap<Document, string>();

		if (currentContainer) {
			currentContainer.removeAttribute("data-foliate");
		}
		if (!currentView) {
			return;
		}

		currentView.removeEventListener("relocate", this.handleRelocateEvent as EventListener);
		currentView.removeEventListener("load", this.handleLoadEvent as EventListener);
		currentView.removeEventListener("link", this.handleLinkEvent as EventListener);
		currentView.removeEventListener(
			"draw-annotation",
			this.handleDrawAnnotationEvent as EventListener
		);
		currentView.removeEventListener(
			"show-annotation",
			this.handleShowAnnotationEvent as EventListener
		);
		try {
			currentView.close();
		} catch (error) {
			logger.warn("[FoliateReaderService] Failed to close foliate view cleanly:", error);
		}
		currentView.remove();
	}

	private async destroyAll(): Promise<void> {
		await this.destroyViewOnly();
		this.resetHighlightState();
		this.resetParagraphState();
		this.parser.dispose();
		this.resetReaderState();
		this.relocatedCallbacks.clear();
		this.footnotePreviewCallbacks.clear();
		this.selectionChangeCallbacks.clear();
		this.highlightClickCallbacks.clear();
		this.referenceBadgeClickCallbacks.clear();
	}

	private resetTemporaryHighlightTimers(): void {
		for (const timer of this.temporaryHighlightTimers.values()) {
			clearTimeout(timer);
		}
		this.temporaryHighlightTimers.clear();
	}

	private resetHighlightState(): void {
		this.resetTemporaryHighlightTimers();
		for (const timer of this.temporarilyRevealedConcealmentTimers.values()) {
			clearTimeout(timer);
		}
		this.temporarilyRevealedConcealmentTimers.clear();
		this.highlightDataMap.clear();
		this.temporaryHighlightDataMap.clear();
		this.savedHighlights = [];
		this.renderedAnnotations.clear();
	}

	private resetParagraphState(): void {
		this.paragraphCache.clear();
		this.paragraphRecordById.clear();
		this.paragraphRangeCache = new WeakMap<Document, Map<string, Range | null>>();
		this.paragraphPresentationRevision = 0;
	}

	private invalidateParagraphPresentation(): void {
		this.paragraphPresentationRevision += 1;
	}

	private resetReaderState(): void {
		this.resetReadingPaceTracking();
		this.currentBook = null;
		this.currentPosition = { chapterIndex: 0, cfi: "", percent: 0 };
		this.currentPaginationInfo = { currentPage: 0, totalPages: 0 };
		this.currentChapterTitle = "";
		this.currentChapterHref = "";
	}

	private collectSectionSlices(): SectionReadingSlice[] {
		const chapterCount = Math.max(this.parser.getMetadata().chapterCount, 0);
		const slices: SectionReadingSlice[] = [];
		for (let index = 0; index < chapterCount; index += 1) {
			const section = this.parser.getSectionReadingMetrics(index);
			if (!section) {
				continue;
			}
			slices.push({
				index: section.index,
				wordCount: section.wordCount,
				positionStart: section.positionStart,
				positionCount: section.positionCount,
			});
		}
		return slices;
	}

	private getConsumedBookWordsForPace(currentPage: number): number {
		return estimateConsumedBookWords(
			this.collectSectionSlices(),
			currentPage,
			this.parser.getTotalWordCount(),
			this.currentPosition.percent
		);
	}

	private markReaderActivity(): void {
		this.lastReaderActivityAt = Date.now();
	}

	private isDocumentVisibleForPace(): boolean {
		return typeof document === "undefined" || document.visibilityState === "visible";
	}

	private resetReadingPaceTracking(): void {
		this.readingPaceAnchor = null;
		this.pendingActiveReadMs = 0;
		this.lastReaderActivityAt = 0;
		this.currentSectionProgression = 0;
		this.stopPaceHeartbeat();
		if (this.paceVisibilityCleanup) {
			this.paceVisibilityCleanup();
			this.paceVisibilityCleanup = null;
		}
	}

	private stopPaceHeartbeat(): void {
		if (this.paceHeartbeatTimer !== null) {
			clearInterval(this.paceHeartbeatTimer);
			this.paceHeartbeatTimer = null;
		}
	}

	private attachReadingPaceListeners(): void {
		this.resetReadingPaceTracking();
		this.markReaderActivity();
		if (typeof document === "undefined") {
			return;
		}
		const onVisibility = () => {
			if (!this.isDocumentVisibleForPace()) {
				this.flushReadingPace();
			} else {
				this.markReaderActivity();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);
		this.paceVisibilityCleanup = () => {
			document.removeEventListener("visibilitychange", onVisibility);
		};
		this.paceHeartbeatTimer = setInterval(() => {
			this.tickReadingPaceHeartbeat();
		}, FoliateReaderService.PACE_HEARTBEAT_MS);
	}

	private tickReadingPaceHeartbeat(): void {
		if (!this.currentBook || !this.foliateView) {
			return;
		}
		if (!this.isDocumentVisibleForPace()) {
			return;
		}
		const now = Date.now();
		if (now - this.lastReaderActivityAt > FoliateReaderService.PACE_IDLE_CUTOFF_MS) {
			return;
		}
		this.pendingActiveReadMs = Math.min(
			PACE_MAX_INTERVAL_MS,
			this.pendingActiveReadMs + FoliateReaderService.PACE_HEARTBEAT_MS
		);
	}

	private recordReadingPaceOnRelocate(
		currentPage: number,
		_chapterIndex: number,
		sectionProgression: number
	): void {
		if (!this.currentBook) {
			return;
		}
		this.markReaderActivity();
		this.currentSectionProgression = sectionProgression;

		const consumedBookWords = this.getConsumedBookWordsForPace(currentPage);
		const now = Date.now();

		if (!this.readingPaceAnchor) {
			this.readingPaceAnchor = createPaceAnchor(consumedBookWords, currentPage, now);
			return;
		}

		const wordsRead = Math.max(0, consumedBookWords - this.readingPaceAnchor.consumedBookWords);
		const pageAdvanced = currentPage > this.readingPaceAnchor.currentPage;
		const activeMs = Math.min(
			PACE_MAX_INTERVAL_MS,
			now - this.readingPaceAnchor.at + this.pendingActiveReadMs
		);
		this.pendingActiveReadMs = 0;

		if (!this.isDocumentVisibleForPace()) {
			this.readingPaceAnchor = createPaceAnchor(consumedBookWords, currentPage, now);
			return;
		}

		if (pageAdvanced || wordsRead >= PACE_MIN_INTERVAL_WORDS) {
			if (shouldRecordPaceInterval(wordsRead, activeMs, true)) {
				this.currentBook.readingStats = recordReadingInterval({
					stats: this.currentBook.readingStats,
					wordsRead,
					activeMs,
					now,
				});
			} else if (activeMs > 0) {
				const normalized = normalizeReadingPaceStats(this.currentBook.readingStats);
				this.currentBook.readingStats = {
					...normalized,
					totalReadTime: normalized.totalReadTime + activeMs,
					lastReadTime: now,
				};
			}
		}

		this.readingPaceAnchor = createPaceAnchor(consumedBookWords, currentPage, now);
	}

	private createNotReadyError(methodName: string): Error {
		return new Error(`FoliateReaderService not initialized yet: cannot call ${methodName}`);
	}

	private notifySelectionChange(cfiRange: string, frame: ReaderFrame): void {
		const event: ReaderSelectionChange = { cfiRange, frame };
		for (const listener of this.selectionChangeCallbacks) {
			try {
				listener(event);
			} catch (error) {
				logger.warn("[FoliateReaderService] Selection listener failed:", { cfiRange, error });
			}
		}
	}

	private notifyHighlightClick(info: HighlightClickInfo): void {
		this.dismissParagraphFootnotePreview({ unpin: true });
		for (const listener of this.highlightClickCallbacks) {
			try {
				listener(info);
			} catch (error) {
				logger.warn("[FoliateReaderService] Highlight click listener failed:", {
					cfiRange: info.cfiRange,
					error,
				});
			}
		}
	}

	private resolveHighlightTint(color?: string): string {
		const palette = FoliateReaderService.HIGHLIGHT_TINT_MAP[this.getCurrentColorScheme()];
		if (!color) {
			return palette.yellow;
		}
		return palette[color] || color;
	}

	private isSameAnnotation(a: FoliateAnnotation, b: FoliateAnnotation): boolean {
		return (
			a.value === b.value &&
			a.color === b.color &&
			a.style === b.style &&
			a.hasCommentDivider === b.hasCommentDivider &&
			a.focusColor === b.focusColor &&
			a.text === b.text &&
			a.sourceFile === b.sourceFile &&
			a.sourceRef === b.sourceRef &&
			a.excerptId === b.excerptId &&
			a.createdTime === b.createdTime &&
			a.referenceCount === b.referenceCount &&
			a.referenceHeat === b.referenceHeat &&
			a.temporary === b.temporary &&
			a.presentation === b.presentation
		);
	}

	private getAnnotationRenderSignature(annotation: FoliateAnnotation): string {
		const key = this.normalizeLocationKey(annotation.cfiRange);
		const isTemporarilyRevealed =
			this.shouldRenderAnnotationAsConceal(annotation) &&
			this.temporarilyRevealedConcealmentTimers.has(key);

		return [
			`presentation:${annotation.presentation || "highlight"}`,
			`color:${annotation.color || "yellow"}`,
			`style:${annotation.style || "highlight"}`,
			`comment:${annotation.hasCommentDivider ? "visible" : "hidden"}`,
			`references:${annotation.referenceCount || 0}`,
			`heat:${annotation.referenceHeat || 0}`,
			`focus:${annotation.focusColor || ""}`,
			`strikethrough:${this.currentStrikethroughPresentation}`,
			`scheme:${this.getCurrentColorScheme()}`,
			`concealment:${isTemporarilyRevealed ? "revealed" : "concealed"}`,
		].join("|");
	}

	private normalizeCurrentPage(totalPositions: number): number {
		const currentPage = Math.round(this.currentPaginationInfo.currentPage || 0);
		if (currentPage > 0) {
			return Math.min(currentPage, Math.max(totalPositions, 1));
		}
		if (totalPositions <= 0) {
			return 0;
		}
		return Math.min(
			totalPositions,
			Math.max(1, Math.round((this.currentPosition.percent / 100) * totalPositions))
		);
	}

	private getConcealmentPalette(): {
		base: string;
		stripe: string;
		border: string;
	} {
		if (this.getCurrentColorScheme() === "dark") {
			return {
				base: "rgba(86, 92, 104, 0.96)",
				stripe: "rgba(112, 119, 132, 0.98)",
				border: "rgba(255, 255, 255, 0.12)",
			};
		}

		return {
			base: "rgba(247, 243, 239, 0.96)",
			stripe: "rgba(232, 225, 216, 0.98)",
			border: "rgba(89, 79, 69, 0.12)",
		};
	}

	private getObsidianStyleSource(): HTMLElement {
		return this.renderContainer || document.body || document.documentElement;
	}

	private getObsidianCSSVar(varName: string, fallback: string): string {
		try {
			const styleSource = this.getObsidianStyleSource();
			const primary = getComputedStyle(styleSource).getPropertyValue(varName).trim();
			if (primary) {
				return primary;
			}
			const bodyValue = getComputedStyle(document.body).getPropertyValue(varName).trim();
			if (bodyValue) {
				return bodyValue;
			}
			const rootValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
			return rootValue || fallback;
		} catch {
			return fallback;
		}
	}

	private getObsidianFontStack(): string {
		const fontText = this.getObsidianCSSVar("--font-text", "").trim();
		const fontInterface = this.getObsidianCSSVar("--font-interface", "").trim();
		const baseFont = fontText || fontInterface;
		if (!baseFont) {
			return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
		}
		return `${baseFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
	}

	private getObsidianMonospaceFontStack(): string {
		const monoFont = this.getObsidianCSSVar("--font-monospace", "").trim();
		if (!monoFont) {
			return 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace';
		}
		return `${monoFont}, ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
	}

	private getObsidianTextFontSize(): string {
		const directTextSize = this.getObsidianCSSVar("--font-text-size", "").trim();
		if (this.isConcreteCssSizeValue(directTextSize)) {
			return directTextSize;
		}

		const directEditorSize = this.getObsidianCSSVar("--editor-font-size", "").trim();
		if (this.isConcreteCssSizeValue(directEditorSize)) {
			return directEditorSize;
		}

		const resolvedSize = this.resolveHostFontSizeExpression(
			"var(--font-text-size, var(--editor-font-size, 16px))"
		);
		if (resolvedSize) {
			return resolvedSize;
		}

		const rawSize = this.getObsidianCSSVar(
			"--font-text-size",
			this.getObsidianCSSVar("--editor-font-size", "16px")
		).trim();
		return rawSize || "16px";
	}

	private isConcreteCssSizeValue(value: string): boolean {
		if (!value) {
			return false;
		}
		return !value.includes("var(");
	}

	private resolveHostFontSizeExpression(valueExpression: string): string | null {
		try {
			const styleSource = this.getObsidianStyleSource();
			const probe = document.createElement("span");
			probe.setCssProps({
				position: "absolute",
				visibility: "hidden",
				"pointer-events": "none",
				inset: "0",
			});
			probe.style.fontSize = valueExpression;
			styleSource.appendChild(probe);
			const resolvedSize = getComputedStyle(probe).fontSize.trim();
			probe.remove();
			return resolvedSize || null;
		} catch {
			return null;
		}
	}

	private getCurrentColorScheme(): "light" | "dark" {
		if (
			document.body.classList.contains("theme-dark") ||
			document.documentElement.classList.contains("theme-dark")
		) {
			return "dark";
		}
		if (
			document.body.classList.contains("theme-light") ||
			document.documentElement.classList.contains("theme-light")
		) {
			return "light";
		}
		return UnifiedThemeManager.getInstance().getCurrentTheme().isDark ? "dark" : "light";
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(Math.max(value, min), max);
	}
}
