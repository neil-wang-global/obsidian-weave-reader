import {
	ItemView,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import type {
	EpubExcerptSettings,
	EpubFlowMode,
	EpubLayoutMode,
	EpubReaderSettings,
	EpubReadingReferencePoint,
} from "../services/epub";
import { canOpenEpubFile } from "../services/epub";
import { stripSupportedBookExtension } from "../services/epub/book-format";
import { EPUB_RUNTIME } from "../services/epub";
import type { EpubCanvasService } from "../services/epub/EpubCanvasService";
import { reportEpubError } from "../services/epub/epub-error";
import type { CanvasLayoutDirection } from "../services/epub/canvas-types";
import { resolveRecentEpubPath } from "../utils/epub-leaf-utils";
import { i18n, syncI18nWithObsidianLanguage } from "../utils/i18n";
import { logger } from "../utils/logger";
import { getViewSurfaceTokens } from "../utils/view-location-utils";
import type { ViewSurfaceTokens } from "../utils/view-location-utils";
import { getWeaveMainPlugin } from "../utils/weave-reader-access";
import type { EpubViewHost } from "./epub-view-host";
import { VIEW_TYPE_EPUB_SIDEBAR } from "./EpubSidebarView";
import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../services/premium/PremiumFeatureGuard";

export const VIEW_TYPE_EPUB = EPUB_RUNTIME.viewTypes.reader;

export class EpubView extends ItemView {
	private component: any = null;
	private plugin: EpubViewHost;
	private filePath = "";
	private bookTitle = "";
	private chapterTitle = "";
	private isOpen = false;
	private pendingCfi = "";
	private pendingText = "";
	private autoInsertEnabled = false;
	private screenshotModeActive = false;
	private screenshotSaveAsImage = true;
	private layoutMode: EpubLayoutMode = "paginated";
	private flowMode: EpubFlowMode = "paginated";
	private paragraphModeEnabled = false;
	private lastActiveMarkdownLeaf: WorkspaceLeaf | null = null;
	private leafChangeHandler: any = null;
	private layoutChangeHandler: any = null;
	private premiumUiUnsubscribers: Array<() => void> = [];
	private linkedCanvasPath: string | null = null;
	private mounting = false;
	private pendingRemount = false;
	private readerHostEl: HTMLDivElement | null = null;
	private inlineToolbarEl: HTMLDivElement | null = null;
	private inlineToolbarActionsEl: HTMLDivElement | null = null;
	private inlineToolbarToggleBtn: HTMLButtonElement | null = null;
	private inlineToolbarExpanded = false;
	private sidebarBtn: HTMLElement | null = null;
	private inlineSidebarBtn: HTMLButtonElement | null = null;
	private autoInsertBtn: HTMLElement | null = null;
	private inlineAutoInsertBtn: HTMLButtonElement | null = null;
	private screenshotBtn: HTMLElement | null = null;
	private inlineScreenshotBtn: HTMLButtonElement | null = null;
	private saveAsImageBtn: HTMLElement | null = null;
	private inlineSaveAsImageBtn: HTMLButtonElement | null = null;
	private flowBtn: HTMLElement | null = null;
	private inlineFlowBtn: HTMLButtonElement | null = null;
	private layoutBtn: HTMLElement | null = null;
	private inlineLayoutBtn: HTMLButtonElement | null = null;
	private paragraphModeBtn: HTMLElement | null = null;
	private inlineParagraphModeBtn: HTMLButtonElement | null = null;
	private canvasBtn: HTMLElement | null = null;
	private inlineCanvasBtn: HTMLButtonElement | null = null;
	private canvasDirBtn: HTMLElement | null = null;
	private inlineCanvasDirBtn: HTMLButtonElement | null = null;
	private canvasModeActive = false;
	private canvasDirection: CanvasLayoutDirection = "down";
	private readingReferenceBtn: HTMLElement | null = null;
	private inlineReadingReferenceBtn: HTMLButtonElement | null = null;
	private hasReadingReferencePoint = false;
	private resumePointBtn: HTMLElement | null = null;
	private inlineResumePointBtn: HTMLButtonElement | null = null;
	private tutorialBtn: HTMLElement | null = null;
	private inlineTutorialBtn: HTMLButtonElement | null = null;
	private bookmarkBtn: HTMLElement | null = null;
	private readingPositionAutoSaveBtn: HTMLElement | null = null;
	private inlineReadingPositionAutoSaveBtn: HTMLButtonElement | null = null;
	private readingPositionAutoSaveEnabled = false;
	private actionHandlers: {
		setAutoInsert?: (enabled: boolean) => void;
		setScreenshotMode?: (active: boolean) => void;
		setLayoutMode?: (mode: EpubLayoutMode) => void;
		setFlowMode?: (mode: EpubFlowMode) => void;
		toggleParagraphMode?: () => void;
		openTypographyPanel?: () => void;
		getReaderSettings?: () => EpubReaderSettings;
		updateReaderSettings?: (patch: Partial<EpubReaderSettings>) => Promise<void>;
		setScreenshotSaveMode?: (saveAsImage: boolean) => void;
		navigateToCfi?: (cfi: string, text: string) => void;
		toggleTutorial?: () => void;
		addBookmark?: () => Promise<void>;
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
		getReadingPositionAutoSaveEnabled?: () => boolean;
		setReadingPositionAutoSaveEnabled?: (enabled: boolean) => Promise<boolean>;
		bindCanvasPath?: (canvasPath: string) => void;
		unbindCanvas?: () => void;
		getCanvasService?: () => EpubCanvasService;
		canMarkIRResumePoint?: () => boolean;
		markIRResumePoint?: (event?: MouseEvent) => Promise<void>;
		exportCurrentChapterToMarkdown?: () => Promise<void>;
		exportBookHighlightsToMarkdown?: (event?: MouseEvent) => Promise<void>;
		getExcerptSettings?: () => EpubExcerptSettings;
		updateExcerptSettings?: (patch: Partial<EpubExcerptSettings>) => Promise<void>;
	} = {};

	constructor(leaf: WorkspaceLeaf, plugin: EpubViewHost) {
		super(leaf);
		this.plugin = plugin;
	}

	private t(key: string, params?: Record<string, string | number>): string {
		return i18n.t(key, params);
	}

	private getCanvasDirectionLabel(direction: CanvasLayoutDirection): string {
		return this.t(`views.epubView.direction.${direction}`);
	}

	private hasWeaveIncrementalReadingHost(): boolean {
		return Boolean(this.actionHandlers.canMarkIRResumePoint?.());
	}

	private canUseReadingProgress(): boolean {
		return Boolean(this.actionHandlers.canUseReadingProgress?.());
	}

	private canUseParagraphMode(): boolean {
		return Boolean(this.actionHandlers.canUseParagraphMode?.());
	}

	private canUseExcerptNotes(): boolean {
		return Boolean(this.actionHandlers.canUseExcerptNotes?.());
	}

	private canUseStyledExcerpts(): boolean {
		return Boolean(this.actionHandlers.canUseStyledExcerpts?.());
	}

	private canUseCanvasExcerpts(): boolean {
		return Boolean(this.actionHandlers.canUseCanvasExcerpts?.());
	}

	private canUseFootnotePreview(): boolean {
		return Boolean(this.actionHandlers.canUseFootnotePreview?.());
	}

	private isPremiumFeaturePreviewEnabled(): boolean {
		return Boolean(this.actionHandlers.isPremiumFeaturePreviewEnabled?.());
	}

	private getFeatureActionLabel(baseTitle: string, featureId: string): string {
		return PremiumFeatureGuard.getInstance().getFeatureEntryTitle(baseTitle, featureId, {
			page: "epub-reader",
		});
	}

	private showPremiumFeaturePreview(featureId: string): void {
		this.actionHandlers.showPremiumFeaturePreview?.(featureId);
	}

	private subscribePremiumUiState(): void {
		this.premiumUiUnsubscribers.forEach((unsubscribe) => unsubscribe());
		this.premiumUiUnsubscribers = [
			PremiumFeatureGuard.getInstance().isPremiumActive.subscribe(() => {
				this.refreshAllActionButtons();
			}),
			PremiumFeatureGuard.getInstance().premiumFeaturesPreviewEnabled.subscribe(() => {
				this.refreshAllActionButtons();
			}),
		];
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

	getDisplayText(): string {
		return this.getResolvedHeaderTitle();
	}

	getIcon(): string {
		return "book-open";
	}

	onPaneMenu(menu: Menu, source: string): void {
		syncI18nWithObsidianLanguage();
		super.onPaneMenu(menu, source);

		const excerptSettings = this.actionHandlers.getExcerptSettings?.();
		const readerSettings = this.actionHandlers.getReaderSettings?.();

		if (excerptSettings && this.actionHandlers.updateExcerptSettings) {
			if (this.canUseExcerptNotes()) {
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.menu.excerptTimestamp"));
					_item.setIcon("clock");
					_item.setChecked(excerptSettings.addCreationTime);
					_item.onClick(() => {
						void this.actionHandlers.updateExcerptSettings?.({
							addCreationTime: !excerptSettings.addCreationTime,
						});
					});
				});
			} else if (this.isPremiumFeaturePreviewEnabled()) {
				menu.addItem((_item) => {
					_item.setTitle(
						this.getFeatureActionLabel(
							this.t("views.epubView.menu.excerptTimestamp"),
							PREMIUM_FEATURES.EPUB_EXCERPT_NOTES
						)
					);
					_item.setIcon("clock");
					_item.onClick(() => {
						this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					});
				});
			}
		}

		if (readerSettings && this.actionHandlers.updateReaderSettings) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.scrolledSideNav"));
				_item.setIcon("panel-right");
				_item.setChecked(readerSettings.showScrolledSideNav);
				_item.onClick(() => {
					void this.actionHandlers.updateReaderSettings?.({
						showScrolledSideNav: !readerSettings.showScrolledSideNav,
					});
				});
			});
		}

		if (this.filePath) {
			menu.addSeparator();

			if (this.actionHandlers.exportBookHighlightsToMarkdown) {
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.menu.exportBookHighlights"));
					_item.setIcon("notebook-pen");
					_item.onClick((evt) => {
						void this.actionHandlers.exportBookHighlightsToMarkdown?.(evt as MouseEvent);
					});
				});
			}

			if (this.actionHandlers.exportCurrentChapterToMarkdown) {
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.menu.exportCurrentChapter"));
					_item.setIcon("file-text");
					_item.onClick(() => {
						void this.actionHandlers.exportCurrentChapterToMarkdown?.();
					});
				});
			}

			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.typography"));
				_item.setIcon("sliders-horizontal");
				_item.onClick(() => {
					window.setTimeout(() => {
						this.actionHandlers.openTypographyPanel?.();
					}, 0);
				});
			});

			if (this.actionHandlers.toggleParagraphMode) {
				menu.addItem((_item) => {
					_item.setTitle(
						this.canUseParagraphMode()
							? this.t("views.epubView.menu.paragraphMode")
							: this.getFeatureActionLabel(
									this.t("views.epubView.menu.paragraphMode"),
									PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE
							  )
					);
					_item.setIcon("pilcrow");
					_item.setChecked(this.canUseParagraphMode() && this.paragraphModeEnabled);
					_item.onClick(() => {
						this.toggleParagraphMode();
					});
				});
			}

			if (readerSettings && this.actionHandlers.updateReaderSettings) {
				if (this.canUseFootnotePreview()) {
					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.footnoteClickAction"));
						_item.setIcon("mouse-pointer");
						const subMenu = (_item as any).setSubmenu();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.footnotePreview"));
							subItem.setChecked(readerSettings.footnoteClickAction === "preview");
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									footnoteClickAction: "preview",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.footnoteNavigate"));
							subItem.setChecked(readerSettings.footnoteClickAction === "navigate");
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									footnoteClickAction: "navigate",
								});
							});
						});
					});
				} else if (this.isPremiumFeaturePreviewEnabled()) {
					menu.addItem((_item) => {
						_item.setTitle(
							this.getFeatureActionLabel(
								this.t("views.epubView.menu.footnoteClickAction"),
								PREMIUM_FEATURES.EPUB_FOOTNOTE_PREVIEW
							)
						);
						_item.setIcon("mouse-pointer");
						_item.onClick(() => {
							this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_FOOTNOTE_PREVIEW);
						});
					});
				}

				if (readerSettings.paragraphModeEnabled) {
					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.paragraphModeSurfaceStyle"));
						_item.setIcon("panel-top-open");
						const subMenu = (_item as any).setSubmenu();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.paragraphModeSurfaceStyleSpotlight"));
							subItem.setChecked(readerSettings.paragraphModeSurfaceStyle === "spotlight");
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									paragraphModeSurfaceStyle: "spotlight",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.paragraphModeSurfaceStyleBlend"));
							subItem.setChecked(readerSettings.paragraphModeSurfaceStyle === "blend");
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									paragraphModeSurfaceStyle: "blend",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.paragraphModeSurfaceStyleDashed"));
							subItem.setChecked(readerSettings.paragraphModeSurfaceStyle === "dashed");
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									paragraphModeSurfaceStyle: "dashed",
								});
							});
						});
					});

					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.paragraphModeTransitionStyle"));
						_item.setIcon("refresh-cw");
						const subMenu = (_item as any).setSubmenu();
						const transitionOptions = [
							["steady", "views.epubView.menu.paragraphModeTransitionStyleSteady"],
							["fade", "views.epubView.menu.paragraphModeTransitionStyleFade"],
							["settle", "views.epubView.menu.paragraphModeTransitionStyleSettle"],
							["slide", "views.epubView.menu.paragraphModeTransitionStyleSlide"],
						] as const;

						for (const [value, key] of transitionOptions) {
							subMenu.addItem((subItem: any) => {
								subItem.setTitle(this.t(key));
								subItem.setChecked(readerSettings.paragraphModeTransitionStyle === value);
								subItem.onClick(() => {
									void this.actionHandlers.updateReaderSettings?.({
										paragraphModeTransitionStyle: value,
									});
								});
							});
						}
					});
				}

				if (this.canUseReadingProgress()) {
					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.topSticker"));
						_item.setIcon("bookmark");
						const subMenu = (_item as any).setSubmenu();
						const topStickerVisible = readerSettings.showTopSticker !== false;

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.hidden"));
							subItem.setChecked(!topStickerVisible);
							subItem.onClick(() => {
								if (!topStickerVisible) {
									return;
								}
								void this.actionHandlers.updateReaderSettings?.({
									showTopSticker: false,
								});
							});
						});

						subMenu.addSeparator();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.auto"));
							subItem.setChecked(topStickerVisible && readerSettings.topStickerLayout === "auto");
							subItem.onClick(() => {
								if (topStickerVisible && readerSettings.topStickerLayout === "auto") {
									return;
								}
								void this.actionHandlers.updateReaderSettings?.({
									showTopSticker: true,
									topStickerLayout: "auto",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.inline"));
							subItem.setChecked(topStickerVisible && readerSettings.topStickerLayout === "inline");
							subItem.onClick(() => {
								if (topStickerVisible && readerSettings.topStickerLayout === "inline") {
									return;
								}
								void this.actionHandlers.updateReaderSettings?.({
									showTopSticker: true,
									topStickerLayout: "inline",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.sidebar"));
							subItem.setChecked(
								topStickerVisible && readerSettings.topStickerLayout === "sidebar"
							);
							subItem.onClick(() => {
								if (topStickerVisible && readerSettings.topStickerLayout === "sidebar") {
									return;
								}
								void this.actionHandlers.updateReaderSettings?.({
									showTopSticker: true,
									topStickerLayout: "sidebar",
								});
							});
						});

						subMenu.addSeparator();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.topStickerWiggle"));
							subItem.setChecked(readerSettings.topStickerWiggleEnabled !== false);
							subItem.onClick(() => {
								void this.actionHandlers.updateReaderSettings?.({
									topStickerWiggleEnabled: readerSettings.topStickerWiggleEnabled === false,
								});
							});
						});
					});
				} else if (this.isPremiumFeaturePreviewEnabled()) {
					menu.addItem((_item) => {
						_item.setTitle(
							this.getFeatureActionLabel(
								this.t("views.epubView.menu.topSticker"),
								PREMIUM_FEATURES.EPUB_READING_PROGRESS
							)
						);
						_item.setIcon("bookmark");
						_item.onClick(() => {
							this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_READING_PROGRESS);
						});
					});
				}
			}

			if (excerptSettings && this.actionHandlers.updateExcerptSettings) {
				if (this.canUseStyledExcerpts()) {
					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.concealedText"));
						_item.setIcon("eye");
						const subMenu = (_item as any).setSubmenu();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.concealStrikethroughText"));
							subItem.setChecked(excerptSettings.strikethroughDisplayMode === "conceal");
							subItem.onClick(() => {
								void this.actionHandlers.updateExcerptSettings?.({
									strikethroughDisplayMode:
										excerptSettings.strikethroughDisplayMode === "conceal"
											? "strikethrough"
											: "conceal",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.showConcealedTextInSidebar"));
							subItem.setChecked(excerptSettings.showStrikethroughInSidebar);
							subItem.onClick(() => {
								void this.actionHandlers.updateExcerptSettings?.({
									showStrikethroughInSidebar: !excerptSettings.showStrikethroughInSidebar,
								});
							});
						});
					});
				} else if (this.isPremiumFeaturePreviewEnabled()) {
					menu.addItem((_item) => {
						_item.setTitle(
							this.getFeatureActionLabel(
								this.t("views.epubView.menu.concealedText"),
								PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS
							)
						);
						_item.setIcon("eye");
						_item.onClick(() => {
							this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS);
						});
					});
				}

				if (this.canUseExcerptNotes()) {
					menu.addItem((_item) => {
						_item.setTitle(this.t("views.epubView.menu.bookNotesTemplate"));
						_item.setIcon("file-text");
						const subMenu = (_item as any).setSubmenu();

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.template1"));
							subItem.setChecked(excerptSettings.bookNotesExportTemplate === "template1");
							subItem.onClick(() => {
								if (excerptSettings.bookNotesExportTemplate === "template1") {
									return;
								}
								void this.actionHandlers.updateExcerptSettings?.({
									bookNotesExportTemplate: "template1",
								});
							});
						});

						subMenu.addItem((subItem: any) => {
							subItem.setTitle(this.t("views.epubView.menu.template2"));
							subItem.setChecked(excerptSettings.bookNotesExportTemplate === "template2");
							subItem.onClick(() => {
								if (excerptSettings.bookNotesExportTemplate === "template2") {
									return;
								}
								void this.actionHandlers.updateExcerptSettings?.({
									bookNotesExportTemplate: "template2",
								});
							});
						});
					});
				} else if (this.isPremiumFeaturePreviewEnabled()) {
					menu.addItem((_item) => {
						_item.setTitle(
							this.getFeatureActionLabel(
								this.t("views.epubView.menu.bookNotesTemplate"),
								PREMIUM_FEATURES.EPUB_EXCERPT_NOTES
							)
						);
						_item.setIcon("file-text");
						_item.onClick(() => {
							this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
						});
					});
				}
			}
		}

		if (!Platform.isMobile) return;

		menu.addSeparator();
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.toggleSidebar"));
			_item.setIcon("list");
			_item.onClick(() => {
				void this.toggleGlobalSidebar();
			});
		});

		menu.addSeparator();
		this.addMobileToolsToMenu(menu);
	}

	allowNoFile(): boolean {
		return true;
	}

	getCurrentFilePath(): string {
		return normalizePath(this.filePath || "");
	}

	getState(): any {
		return { filePath: this.filePath, file: this.filePath };
	}

	async setState(state: any, result: any): Promise<void> {
		await super.setState(state, result);

		const incomingPath = state?.filePath || state?.file || "";

		if (state?.pendingCfi) {
			this.pendingCfi = state.pendingCfi;
			this.pendingText = state.pendingText || "";
		}

		if (incomingPath && incomingPath !== this.filePath) {
			this.filePath = incomingPath;
			this.bookTitle = "";
			this.chapterTitle = "";
			this.hasReadingReferencePoint = false;
			this.refreshAllActionButtons();
			this.refreshInlineToolbarVisibility();
			this.refreshViewTitle();
			if (this.isOpen) {
				await this.mountComponent();
			}
		} else if (incomingPath && !this.component && this.isOpen) {
			this.filePath = incomingPath;
			this.refreshInlineToolbarVisibility();
			this.refreshViewTitle();
			await this.mountComponent();
		} else if (this.pendingCfi && this.component) {
			this.actionHandlers.navigateToCfi?.(this.pendingCfi, this.pendingText);
			this.pendingCfi = "";
			this.pendingText = "";
		}
	}

	async onOpen(): Promise<void> {
		syncI18nWithObsidianLanguage();
		this.isOpen = true;
		this.contentEl.empty();
		this.contentEl.addClass("weave-epub-view-content");
		this.ensureViewShell();
		this.refreshViewTitle();

		if (!Platform.isMobile) {
			this.sidebarBtn = this.addAction("list", this.t("views.epubView.menu.toggleSidebar"), () => {
				void this.toggleGlobalSidebar();
			});
		}

		this.saveAsImageBtn = this.addAction(
			"image",
			this.t("views.epubView.label.saveAsImageOn"),
			() => {
				if (!this.canUseExcerptNotes()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					return;
				}
				this.screenshotSaveAsImage = !this.screenshotSaveAsImage;
				this.updateSaveAsImageBtn();
				this.actionHandlers.setScreenshotSaveMode?.(this.screenshotSaveAsImage);
			}
		);
		this.screenshotBtn = this.addAction(
			"camera",
			this.t("views.epubView.label.screenshotToolOff"),
			() => {
				if (!this.canUseExcerptNotes()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					return;
				}
				this.screenshotModeActive = !this.screenshotModeActive;
				this.updateScreenshotBtn();
				this.actionHandlers.setScreenshotMode?.(this.screenshotModeActive);
			}
		);
		this.autoInsertBtn = this.addAction("zap", this.t("views.epubView.label.autoModeOff"), () => {
			if (!this.canUseExcerptNotes()) {
				this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
				return;
			}
			this.autoInsertEnabled = !this.autoInsertEnabled;
			this.updateAutoInsertBtn();
			this.actionHandlers.setAutoInsert?.(this.autoInsertEnabled);
		});
		this.bookmarkBtn = this.addAction("bookmark", this.t("views.epubView.menu.addBookmark"), () => {
			void this.actionHandlers.addBookmark?.();
		});
		this.readingPositionAutoSaveBtn = this.addAction(
			"map-pinned",
			this.t("views.epubView.label.readingPositionAutoSaveOff"),
			() => {
				void this.toggleReadingPositionAutoSave();
			}
		);
		this.readingReferenceBtn = this.addAction(
			"flag",
			this.t("views.epubView.label.readingReferencePointUnset"),
			() => {
				if (!this.canUseReadingProgress()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_READING_PROGRESS);
					return;
				}
				void this.actionHandlers.saveReadingReferencePoint?.();
			}
		);

		if (!Platform.isMobile) {
			this.flowBtn = this.addAction(
				"arrow-up-down",
				this.t("views.epubView.label.readingModePaginated"),
				() => {
					this.toggleFlowMode();
				}
			);
			this.layoutBtn = this.addAction(
				"scroll-text",
				this.t("views.epubView.label.layoutSingle"),
				() => {
					this.cycleLayoutMode();
				}
			);
			this.paragraphModeBtn = this.addAction(
				"pilcrow",
				this.t("views.epubView.label.paragraphModeOff"),
				() => {
					this.toggleParagraphMode();
				}
			);
			this.canvasDirBtn = this.addAction(
				"arrow-down",
				this.t("views.epubView.label.canvasDirection", {
					direction: this.getCanvasDirectionLabel("down"),
				}),
				(evt) => {
					this.showDirectionMenu(evt);
				}
			);
			this.canvasDirBtn.setCssProps({ display: "none" });
			this.canvasBtn = this.addAction(
				"layout-dashboard",
				this.t("views.epubView.label.canvasOff"),
				(evt) => {
					this.showCanvasMenu(evt);
				}
			);
			this.resumePointBtn = this.addAction(
				"bookmark-plus",
				this.t("views.epubView.menu.markResumePoint"),
				(evt) => {
					void this.actionHandlers.markIRResumePoint?.(evt as MouseEvent);
				}
			);
			this.tutorialBtn = this.addAction(
				"circle-help",
				this.t("views.epubView.menu.tutorial"),
				() => {
					this.actionHandlers.toggleTutorial?.();
				}
			);
			this.positionFlowBtn();
		}
		this.subscribePremiumUiState();
		this.refreshAllActionButtons();

		if (!Platform.isMobile) {
			this.moveSidebarBtnToNav();
			this.refreshInlineToolbarVisibility();
		}
		this.setupLeafChangeTracking();
		this.setupLinkedTabTracking();

		if (this.filePath) {
			await this.mountComponent();
		}
	}

	private async toggleGlobalSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_EPUB_SIDEBAR);
		if (existing.length > 0) {
			for (const leaf of existing) {
				leaf.detach();
			}
			return;
		}

		const leftLeaf = workspace.getLeftLeaf(false);
		if (leftLeaf) {
			await leftLeaf.setViewState({
				type: VIEW_TYPE_EPUB_SIDEBAR,
				active: true,
			});
			void workspace.revealLeaf(leftLeaf);
		}
	}

	private moveSidebarBtnToNav(): void {
		if (!this.sidebarBtn) return;
		const navButtons = this.containerEl.querySelector(".view-header-nav-buttons");
		if (navButtons) {
			navButtons.appendChild(this.sidebarBtn);
		}
	}

	private ensureViewShell(): void {
		if (this.readerHostEl?.isConnected) {
			this.applySurfaceContext();
			return;
		}

		this.contentEl.empty();
		const shellEl = this.contentEl.createDiv({ cls: "weave-epub-view-shell" });
		this.readerHostEl = shellEl.createDiv({ cls: "weave-epub-reader-host" });
		this.applySurfaceContext();

		if (!Platform.isMobile) {
			this.buildInlineToolbar(shellEl);
		}
	}

	private applySurfaceContext(): void {
		let surfaceTokens: ViewSurfaceTokens = {
			context: "main",
			surfaceBackground: "var(--background-primary)",
			elevatedBackground: "var(--background-secondary)",
		};
		try {
			surfaceTokens = getViewSurfaceTokens(this.leaf);
		} catch (_error) {
			// In partial workspace states, fall back to the main-surface token set.
		}
		const targets = [this.contentEl, this.readerHostEl, this.readerHostEl?.parentElement].filter(
			Boolean
		) as HTMLElement[];

		for (const target of targets) {
			target.dataset.weaveSurfaceContext = surfaceTokens.context;
			target.style.setProperty("--weave-surface-background", surfaceTokens.surfaceBackground);
			target.style.setProperty("--weave-elevated-background", surfaceTokens.elevatedBackground);
		}
	}

	async closeSelectedTextAIPanel(): Promise<void> {
		if (!this.filePath) {
			return;
		}
		const weave = getWeaveMainPlugin(this.app);
		await weave?.closeSelectedTextAIPanelFromEpub?.(this.filePath);
	}

	private buildInlineToolbar(shellEl: HTMLDivElement): void {
		this.inlineToolbarEl = shellEl.createDiv({ cls: "epub-left-inline-toolbar" });
		this.inlineToolbarToggleBtn = this.createInlineToolbarButton(
			"chevrons-right",
			this.t("views.epubView.label.inlineToolbarExpand"),
			() => {
				this.inlineToolbarExpanded = !this.inlineToolbarExpanded;
				this.updateInlineToolbarExpandedState();
			}
		);
		this.inlineToolbarToggleBtn.addClass("epub-left-inline-toolbar-toggle");
		this.inlineToolbarEl.appendChild(this.inlineToolbarToggleBtn);

		this.inlineToolbarActionsEl = this.inlineToolbarEl.createDiv({
			cls: "epub-left-inline-toolbar-actions",
		});
		this.inlineSidebarBtn = this.appendInlineActionButton(
			"list",
			this.t("views.epubView.menu.toggleSidebar"),
			() => {
				void this.toggleGlobalSidebar();
			}
		);
		this.inlineSaveAsImageBtn = this.appendInlineActionButton(
			"image",
			this.t("views.epubView.label.saveAsImageOn"),
			() => {
				if (!this.canUseExcerptNotes()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					return;
				}
				this.screenshotSaveAsImage = !this.screenshotSaveAsImage;
				this.updateSaveAsImageBtn();
				this.actionHandlers.setScreenshotSaveMode?.(this.screenshotSaveAsImage);
			}
		);
		this.inlineScreenshotBtn = this.appendInlineActionButton(
			"camera",
			this.t("views.epubView.label.screenshotToolOff"),
			() => {
				if (!this.canUseExcerptNotes()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					return;
				}
				this.screenshotModeActive = !this.screenshotModeActive;
				this.updateScreenshotBtn();
				this.actionHandlers.setScreenshotMode?.(this.screenshotModeActive);
			}
		);
		this.inlineAutoInsertBtn = this.appendInlineActionButton(
			"zap",
			this.t("views.epubView.label.autoModeOff"),
			() => {
				if (!this.canUseExcerptNotes()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
					return;
				}
				this.autoInsertEnabled = !this.autoInsertEnabled;
				this.updateAutoInsertBtn();
				this.actionHandlers.setAutoInsert?.(this.autoInsertEnabled);
			}
		);
		this.inlineFlowBtn = this.appendInlineActionButton(
			"arrow-up-down",
			this.t("views.epubView.label.readingModePaginated"),
			() => {
				this.toggleFlowMode();
			}
		);
		this.inlineLayoutBtn = this.appendInlineActionButton(
			"scroll-text",
			this.t("views.epubView.label.layoutSingle"),
			() => {
				this.cycleLayoutMode();
			}
		);
		this.inlineParagraphModeBtn = this.appendInlineActionButton(
			"pilcrow",
			this.t("views.epubView.label.paragraphModeOff"),
			() => {
				this.toggleParagraphMode();
			}
		);
		this.inlineCanvasDirBtn = this.appendInlineActionButton(
			"arrow-down",
			this.t("views.epubView.label.canvasDirection", {
				direction: this.getCanvasDirectionLabel("down"),
			}),
			(evt) => {
				this.showDirectionMenu(evt);
			}
		);
		this.inlineCanvasBtn = this.appendInlineActionButton(
			"layout-dashboard",
			this.t("views.epubView.label.canvasOff"),
			(evt) => {
				this.showCanvasMenu(evt);
			}
		);
		this.inlineReadingReferenceBtn = this.appendInlineActionButton(
			"flag",
			this.t("views.epubView.label.readingReferencePointUnset"),
			() => {
				if (!this.canUseReadingProgress()) {
					this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_READING_PROGRESS);
					return;
				}
				void this.actionHandlers.saveReadingReferencePoint?.();
			}
		);
		this.inlineReadingPositionAutoSaveBtn = this.appendInlineActionButton(
			"map-pinned",
			this.t("views.epubView.label.readingPositionAutoSaveOff"),
			() => {
				void this.toggleReadingPositionAutoSave();
			}
		);
		this.inlineResumePointBtn = this.appendInlineActionButton(
			"bookmark-plus",
			this.t("views.epubView.menu.markResumePoint"),
			(evt) => {
				void this.actionHandlers.markIRResumePoint?.(evt);
			}
		);
		this.inlineTutorialBtn = this.appendInlineActionButton(
			"circle-help",
			this.t("views.epubView.menu.tutorial"),
			() => {
				this.actionHandlers.toggleTutorial?.();
			}
		);

		this.updateInlineToolbarExpandedState();
		this.refreshAllActionButtons();
		this.refreshInlineToolbarVisibility();
	}

	private appendInlineActionButton(
		icon: string,
		label: string,
		onClick: (evt: MouseEvent) => void
	): HTMLButtonElement {
		const button = this.createInlineToolbarButton(icon, label, onClick);
		this.inlineToolbarActionsEl?.appendChild(button);
		return button;
	}

	private createInlineToolbarButton(
		icon: string,
		label: string,
		onClick: (evt: MouseEvent) => void
	): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "epub-left-inline-toolbar-btn";
		setIcon(button, icon);
		button.setAttribute("aria-label", label);
		button.setAttribute("title", label);
		button.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			onClick(evt);
		});
		return button;
	}

	private updateInlineToolbarExpandedState(): void {
		this.inlineToolbarEl?.toggleClass("is-expanded", this.inlineToolbarExpanded);
		this.inlineToolbarActionsEl?.toggleClass("is-expanded", this.inlineToolbarExpanded);
		if (!this.inlineToolbarToggleBtn) {
			return;
		}
		const icon = this.inlineToolbarExpanded ? "chevrons-left" : "chevrons-right";
		const label = this.inlineToolbarExpanded
			? this.t("views.epubView.label.inlineToolbarCollapse")
			: this.t("views.epubView.label.inlineToolbarExpand");
		setIcon(this.inlineToolbarToggleBtn, icon);
		this.inlineToolbarToggleBtn.setAttribute("aria-label", label);
		this.inlineToolbarToggleBtn.setAttribute("title", label);
		this.inlineToolbarToggleBtn.toggleClass("is-active", this.inlineToolbarExpanded);
	}

	private refreshInlineToolbarVisibility(): void {
		if (!this.inlineToolbarEl) {
			return;
		}
		const shouldShow = !Platform.isMobile && Boolean(this.filePath);
		this.inlineToolbarEl.toggleClass("is-hidden", !shouldShow);
	}

	private refreshAllActionButtons(): void {
		this.updateSaveAsImageBtn();
		this.updateScreenshotBtn();
		this.updateAutoInsertBtn();
		this.updateReadingPositionAutoSaveBtn();
		this.updateReadingReferencePointBtn();
		this.updateResumePointBtn();
		this.updateFlowBtn();
		this.updateLayoutBtn();
		this.updateParagraphModeBtn();
		this.updateCanvasBtn();
		this.updateDirectionBtn();
	}

	private applyActionButtonState(
		button: HTMLElement | null,
		options: {
			icon?: string;
			label?: string;
			active?: boolean;
			visible?: boolean;
		}
	): void {
		if (!button) {
			return;
		}
		if (options.icon) {
			setIcon(button, options.icon);
		}
		if (options.label) {
			button.setAttribute("aria-label", options.label);
			button.setAttribute("title", options.label);
		}
		if (typeof options.active === "boolean") {
			button.toggleClass("is-active", options.active);
		}
		if (typeof options.visible === "boolean") {
			button.setCssProps({ display: options.visible ? "" : "none" });
		}
	}

	private positionFlowBtn(): void {
		if (!this.flowBtn || !this.layoutBtn) return;
		const parent = this.layoutBtn.parentElement;
		if (!parent || parent !== this.flowBtn.parentElement) return;

		const direction = window.getComputedStyle(parent).flexDirection;
		if (direction === "row-reverse") {
			if (this.layoutBtn.nextSibling !== this.flowBtn) {
				parent.insertBefore(this.flowBtn, this.layoutBtn.nextSibling);
			}
			return;
		}

		if (this.layoutBtn.previousSibling !== this.flowBtn) {
			parent.insertBefore(this.flowBtn, this.layoutBtn);
		}
	}

	private getResolvedBookTitle(): string {
		if (this.bookTitle.trim()) {
			return this.bookTitle.trim();
		}

		if (this.filePath) {
			const fileName = this.filePath.split(/[\\/]/).pop() || this.filePath;
			const titleFromFile = stripSupportedBookExtension(fileName).trim();
			if (titleFromFile) {
				return titleFromFile;
			}
		}

		return this.t("views.epubView.emptyState.bookshelfTitle");
	}

	private getResolvedHeaderTitle(): string {
		const bookTitle = this.getResolvedBookTitle();
		const chapterTitle = this.chapterTitle.trim();
		if (!chapterTitle || chapterTitle === bookTitle) {
			return bookTitle;
		}
		return `${bookTitle} - ${chapterTitle}`;
	}

	private refreshViewTitle(): void {
		const title = this.getResolvedHeaderTitle();

		try {
			if (this.leaf && typeof (this.leaf as any).updateHeader === "function") {
				(this.leaf as any).updateHeader();
			}

			this.app.workspace.trigger("layout-change");

			const titleEl = this.leaf?.view?.containerEl?.querySelector(".view-header-title");
			if (titleEl instanceof HTMLElement) {
				titleEl.textContent = title;
				titleEl.setAttribute("aria-label", title);
			}
		} catch (error) {
			logger.warn("[EpubView] Failed to refresh view title:", error);
		}
	}

	private async mountComponent(): Promise<void> {
		if (this.mounting) {
			this.pendingRemount = true;
			return;
		}

		const mountedFilePath = this.filePath;
		this.mounting = true;
		this.pendingRemount = false;
		try {
			this.ensureViewShell();
			if (this.filePath && !canOpenEpubFile(this.app, this.filePath)) {
				this.readerHostEl?.empty();
				const lockedEl = this.readerHostEl?.createDiv({
					cls: "epub-error-state",
					text: this.t("views.epubView.emptyState.premiumFormatLocked"),
				});
				if (lockedEl && this.plugin.openEpubPremiumSettings) {
					const buttonEl = lockedEl.createEl("button", {
						text: this.t("views.epubView.emptyState.openPremiumSettings"),
					});
					buttonEl.addClass("mod-cta");
					buttonEl.addEventListener("click", () => {
						this.plugin.openEpubPremiumSettings?.();
					});
				}
				return;
			}
			await this.closeSelectedTextAIPanel();
			if (this.component) {
				const { unmount } = await import("svelte");
				try {
					void unmount(this.component);
				} catch (_e) {
					/* ignore */
				}
				this.component = null;
			}
			this.readerHostEl?.empty();

			const { mount } = await import("svelte");
			const { default: EpubReaderApp } = await import("../components/epub/EpubReaderApp.svelte");
			if (!this.readerHostEl) {
				throw new Error("EPUB reader host is unavailable");
			}

			const { pendingCfi: initialPendingCfi, pendingText: initialPendingText } =
				this.consumePendingNavigation();

			this.component = mount(EpubReaderApp, {
				target: this.readerHostEl,
				props: this.buildReaderAppProps(initialPendingCfi, initialPendingText),
			});

			logger.debug("[EpubView] EPUB component mounted:", this.filePath);
		} catch (error) {
			const classified = reportEpubError(error, "open");
			this.readerHostEl?.empty();
			this.readerHostEl?.createDiv({
				cls: "epub-error-state",
				text: classified.userMessage,
			});
		} finally {
			this.mounting = false;
			if (this.pendingRemount || mountedFilePath !== this.filePath) {
				this.pendingRemount = false;
				void this.mountComponent();
			}
		}
	}

	private consumePendingNavigation(): {
		pendingCfi: string;
		pendingText: string;
	} {
		const pendingNavigation = {
			pendingCfi: this.pendingCfi,
			pendingText: this.pendingText,
		};
		this.pendingCfi = "";
		this.pendingText = "";
		return pendingNavigation;
	}

	private buildReaderAppProps(initialPendingCfi: string, initialPendingText: string) {
		return {
			app: this.app,
			filePath: this.filePath,
			onTitleChange: (title: string) => {
				this.bookTitle = title;
				this.refreshViewTitle();
			},
			onChapterTitleChange: (title: string) => {
				this.chapterTitle = String(title || "").trim();
				this.refreshViewTitle();
			},
			onReaderSettingsLoaded: (settings: {
				layoutMode: EpubLayoutMode;
				flowMode: EpubFlowMode;
				paragraphModeEnabled?: boolean;
			}) => {
				this.layoutMode = settings.layoutMode;
				this.flowMode = settings.flowMode;
				this.paragraphModeEnabled = Boolean(settings.paragraphModeEnabled);
				this.updateFlowBtn();
				this.updateLayoutBtn();
				this.updateParagraphModeBtn();
			},
			onReadingReferencePointChange: (point: EpubReadingReferencePoint | null) => {
				this.hasReadingReferencePoint = Boolean(point);
				this.updateReadingReferencePointBtn();
			},
			pendingCfi: initialPendingCfi,
			pendingText: initialPendingText,
			autoInsertEnabled: this.autoInsertEnabled,
			getLastActiveMarkdownLeaf: () => this.getValidMarkdownLeaf(),
			onBackFromBookshelf: async () => {
				await this.returnFromBookshelfToRecentBook();
			},
			onActionsReady: (actions: typeof this.actionHandlers) => {
				this.actionHandlers = actions;
				const readerSettings = actions.getReaderSettings?.();
				if (readerSettings) {
					this.layoutMode = readerSettings.layoutMode;
					this.flowMode = readerSettings.flowMode;
					this.paragraphModeEnabled = Boolean(readerSettings.paragraphModeEnabled);
				}
				this.refreshAllActionButtons();
			},
			onSwitchBook: async (newFilePath: string) => {
				await this.switchBookInCurrentLeaf(newFilePath);
			},
			onCanvasStateChange: (active: boolean, _canvasPath: string | null) => {
				this.canvasModeActive = active;
				this.updateCanvasBtn();
			},
		};
	}

	async onClose(): Promise<void> {
		this.premiumUiUnsubscribers.forEach((unsubscribe) => unsubscribe());
		this.premiumUiUnsubscribers = [];
		if (this.leafChangeHandler) {
			this.app.workspace.off("active-leaf-change", this.leafChangeHandler);
			this.leafChangeHandler = null;
		}
		if (this.layoutChangeHandler) {
			this.app.workspace.off("layout-change", this.layoutChangeHandler);
			this.layoutChangeHandler = null;
		}
		if (this.component) {
			const { unmount } = await import("svelte");
			try {
				void unmount(this.component);
			} catch (_e) {
				// ignore
			}
			this.component = null;
		}
		await this.closeSelectedTextAIPanel();
		this.readerHostEl = null;
		this.inlineToolbarEl = null;
		this.inlineToolbarActionsEl = null;
		this.inlineToolbarToggleBtn = null;
		this.inlineSidebarBtn = null;
		this.inlineSaveAsImageBtn = null;
		this.inlineScreenshotBtn = null;
		this.inlineAutoInsertBtn = null;
		this.inlineFlowBtn = null;
		this.inlineLayoutBtn = null;
		this.inlineCanvasDirBtn = null;
		this.inlineCanvasBtn = null;
		this.inlineReadingReferenceBtn = null;
		this.inlineReadingPositionAutoSaveBtn = null;
		this.inlineResumePointBtn = null;
		this.inlineTutorialBtn = null;
		this.readingReferenceBtn = null;
		this.readingPositionAutoSaveBtn = null;
		this.readingPositionAutoSaveEnabled = false;
		this.hasReadingReferencePoint = false;
	}

	private setupLinkedTabTracking(): void {
		this.layoutChangeHandler = () => {
			this.applySurfaceContext();
			this.checkLinkedCanvasTab();
		};
		this.app.workspace.on("layout-change", this.layoutChangeHandler);
	}

	private checkLinkedCanvasTab(): void {
		if (!this.canUseCanvasExcerpts()) {
			if (this.linkedCanvasPath || this.canvasModeActive) {
				this.linkedCanvasPath = null;
				this.canvasModeActive = false;
				this.actionHandlers.unbindCanvas?.();
				this.updateCanvasBtn();
			}
			return;
		}

		const myGroup = (this.leaf as any).group;

		if (!myGroup) {
			if (this.linkedCanvasPath) {
				this.linkedCanvasPath = null;
				this.canvasModeActive = false;
				this.actionHandlers.unbindCanvas?.();
				this.updateCanvasBtn();
			}
			return;
		}

		const canvasLeaves = this.app.workspace.getLeavesOfType("canvas");
		let foundCanvasPath: string | null = null;

		for (const leaf of canvasLeaves) {
			if ((leaf as any).group === myGroup) {
				const file = (leaf.view as any)?.file;
				if (file?.path) {
					foundCanvasPath = file.path;
					break;
				}
			}
		}

		if (foundCanvasPath && foundCanvasPath !== this.linkedCanvasPath) {
			this.linkedCanvasPath = foundCanvasPath;
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(foundCanvasPath);
			this.updateCanvasBtn();
			new Notice(
				this.t("views.epubView.notice.canvasLinked", {
					name: foundCanvasPath.split("/").pop() || foundCanvasPath,
				})
			);
		} else if (!foundCanvasPath && this.linkedCanvasPath) {
			this.linkedCanvasPath = null;
			this.canvasModeActive = false;
			this.actionHandlers.unbindCanvas?.();
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasUnlinked"));
		}
	}

	private setupLeafChangeTracking(): void {
		this.leafChangeHandler = (leaf: WorkspaceLeaf | null) => {
			if (leaf && leaf.view instanceof MarkdownView) {
				this.lastActiveMarkdownLeaf = leaf;
			}
		};
		this.app.workspace.on("active-leaf-change", this.leafChangeHandler);

		const currentLeaves = this.app.workspace.getLeavesOfType("markdown");
		if (currentLeaves.length > 0) {
			this.lastActiveMarkdownLeaf = currentLeaves[0];
		}
	}

	private getValidMarkdownLeaf(): WorkspaceLeaf | null {
		if (this.lastActiveMarkdownLeaf) {
			try {
				const view = this.lastActiveMarkdownLeaf.view;
				if (view instanceof MarkdownView && view.editor) {
					return this.lastActiveMarkdownLeaf;
				}
			} catch (_e) {
				// stale reference
			}
		}

		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			if (leaf.view instanceof MarkdownView && leaf.view.editor) {
				this.lastActiveMarkdownLeaf = leaf;
				return leaf;
			}
		}
		return null;
	}

	private async switchBookInCurrentLeaf(newFilePath: string): Promise<void> {
		if (!newFilePath) {
			return;
		}

		if (newFilePath === this.filePath && this.component) {
			void this.app.workspace.revealLeaf(this.leaf);
			return;
		}

		this.bookTitle = "";
		this.chapterTitle = "";
		this.pendingCfi = "";
		this.pendingText = "";
		await this.leaf.setViewState({
			type: VIEW_TYPE_EPUB,
			active: true,
			state: { filePath: newFilePath },
		});
		void this.app.workspace.revealLeaf(this.leaf);
	}

	private async returnFromBookshelfToRecentBook(): Promise<void> {
		const recentPath = await resolveRecentEpubPath(this.app);
		if (!recentPath) {
			new Notice(this.t("views.epubView.notice.noRecentBook"));
			return;
		}

		await this.switchBookInCurrentLeaf(recentPath);
	}

	public updateBookTitle(title: string): void {
		this.bookTitle = title;
		this.refreshViewTitle();
	}

	private toggleFlowMode(): void {
		this.flowMode = this.flowMode === "scrolled" ? "paginated" : "scrolled";
		if (this.flowMode === "scrolled") {
			this.layoutMode = "paginated";
		}
		this.updateFlowBtn();
		this.updateLayoutBtn();
		this.actionHandlers.setFlowMode?.(this.flowMode);
	}

	private cycleLayoutMode(): void {
		if (Platform.isMobile) {
			this.layoutMode = "paginated";
			this.actionHandlers.setLayoutMode?.("paginated");
			return;
		}
		if (this.flowMode === "scrolled") {
			this.flowMode = "paginated";
			this.updateFlowBtn();
		}
		const modes: EpubLayoutMode[] = ["paginated", "double"];
		const idx = modes.indexOf(this.layoutMode);
		this.layoutMode = modes[(idx + 1) % modes.length];
		this.updateLayoutBtn();
		this.actionHandlers.setLayoutMode?.(this.layoutMode);
	}

	private toggleParagraphMode(): void {
		if (!this.canUseParagraphMode()) {
			if (this.isPremiumFeaturePreviewEnabled()) {
				this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE);
			} else {
				this.actionHandlers.toggleParagraphMode?.();
			}
			return;
		}
		this.paragraphModeEnabled = !this.paragraphModeEnabled;
		this.updateParagraphModeBtn();
		this.actionHandlers.toggleParagraphMode?.();
	}

	private updateFlowBtn(): void {
		const icon = this.flowMode === "scrolled" ? "scroll-text" : "arrow-up-down";
		const label = this.t("views.epubView.label.readingMode", {
			mode:
				this.flowMode === "scrolled"
					? this.t("views.epubView.label.readingModeScrolled")
					: this.t("views.epubView.label.readingModePaginated"),
		});
		this.applyActionButtonState(this.flowBtn, {
			icon,
			label,
			active: this.flowMode === "scrolled",
		});
		this.applyActionButtonState(this.inlineFlowBtn, {
			icon,
			label,
			active: this.flowMode === "scrolled",
		});
	}

	private updateLayoutBtn(): void {
		const iconMap: Record<EpubLayoutMode, string> = {
			paginated: "file-text",
			double: "book-open",
		};
		const layoutLabels: Record<EpubLayoutMode, string> = {
			paginated: this.t("views.epubView.label.layoutSingle"),
			double: this.t("views.epubView.label.layoutDouble"),
		};
		const label = this.t("views.epubView.label.layout", { layout: layoutLabels[this.layoutMode] });
		const icon = iconMap[this.layoutMode];
		this.applyActionButtonState(this.layoutBtn, {
			icon,
			label,
			active: this.layoutMode === "double",
		});
		this.applyActionButtonState(this.inlineLayoutBtn, {
			icon,
			label,
			active: this.layoutMode === "double",
		});
	}

	private updateParagraphModeBtn(): void {
		const canUseParagraphMode = this.canUseParagraphMode();
		const visible = canUseParagraphMode || this.isPremiumFeaturePreviewEnabled();
		const baseLabel = this.paragraphModeEnabled
			? this.t("views.epubView.label.paragraphModeOn")
			: this.t("views.epubView.label.paragraphModeOff");
		const label = canUseParagraphMode
			? baseLabel
			: this.getFeatureActionLabel(baseLabel, PREMIUM_FEATURES.EPUB_PARAGRAPH_MODE);
		this.applyActionButtonState(this.paragraphModeBtn, {
			icon: "pilcrow",
			label,
			active: canUseParagraphMode ? this.paragraphModeEnabled : false,
			visible,
		});
		this.applyActionButtonState(this.inlineParagraphModeBtn, {
			icon: "pilcrow",
			label,
			active: canUseParagraphMode ? this.paragraphModeEnabled : false,
			visible,
		});
	}

	private updateSaveAsImageBtn(): void {
		const icon = this.screenshotSaveAsImage ? "image" : "code";
		const baseLabel = this.screenshotSaveAsImage
			? this.t("views.epubView.label.saveAsImageOn")
			: this.t("views.epubView.label.saveAsImageOff");
		const label = this.canUseExcerptNotes()
			? baseLabel
			: this.getFeatureActionLabel(baseLabel, PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
		const visible = this.canUseExcerptNotes() || this.isPremiumFeaturePreviewEnabled();
		this.applyActionButtonState(this.saveAsImageBtn, {
			icon,
			label,
			active: this.canUseExcerptNotes() ? this.screenshotSaveAsImage : false,
			visible,
		});
		this.applyActionButtonState(this.inlineSaveAsImageBtn, {
			icon,
			label,
			active: this.canUseExcerptNotes() ? this.screenshotSaveAsImage : false,
			visible,
		});
	}

	private updateScreenshotBtn(): void {
		const baseLabel = this.screenshotModeActive
			? this.t("views.epubView.label.screenshotToolOn")
			: this.t("views.epubView.label.screenshotToolOff");
		const label = this.canUseExcerptNotes()
			? baseLabel
			: this.getFeatureActionLabel(baseLabel, PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
		const visible = this.canUseExcerptNotes() || this.isPremiumFeaturePreviewEnabled();
		this.applyActionButtonState(this.screenshotBtn, {
			label,
			active: this.canUseExcerptNotes() ? this.screenshotModeActive : false,
			visible,
		});
		this.applyActionButtonState(this.inlineScreenshotBtn, {
			label,
			active: this.canUseExcerptNotes() ? this.screenshotModeActive : false,
			visible,
		});
	}

	private updateAutoInsertBtn(): void {
		const baseLabel = this.autoInsertEnabled
			? this.t("views.epubView.label.autoModeOn")
			: this.t("views.epubView.label.autoModeOff");
		const label = this.canUseExcerptNotes()
			? baseLabel
			: this.getFeatureActionLabel(baseLabel, PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
		const visible = this.canUseExcerptNotes() || this.isPremiumFeaturePreviewEnabled();
		this.applyActionButtonState(this.autoInsertBtn, {
			label,
			active: this.canUseExcerptNotes() ? this.autoInsertEnabled : false,
			visible,
		});
		this.applyActionButtonState(this.inlineAutoInsertBtn, {
			label,
			active: this.canUseExcerptNotes() ? this.autoInsertEnabled : false,
			visible,
		});
	}

	private updateReadingPositionAutoSaveBtn(): void {
		if (this.actionHandlers.getReadingPositionAutoSaveEnabled) {
			this.readingPositionAutoSaveEnabled = this.actionHandlers.getReadingPositionAutoSaveEnabled();
		}
		const visible = this.canUseReadingProgress() || this.isPremiumFeaturePreviewEnabled();
		const label = this.canUseReadingProgress()
			? this.readingPositionAutoSaveEnabled
				? this.t("views.epubView.label.readingPositionAutoSaveOn")
				: this.t("views.epubView.label.readingPositionAutoSaveOff")
			: this.getFeatureActionLabel(
				this.t("views.epubView.label.readingPositionAutoSaveOff"),
				PREMIUM_FEATURES.EPUB_READING_PROGRESS
			);
		const icon = this.readingPositionAutoSaveEnabled ? "locate-fixed" : "map-pinned";
		const active = this.canUseReadingProgress() ? this.readingPositionAutoSaveEnabled : false;
		this.applyActionButtonState(this.readingPositionAutoSaveBtn, {
			icon,
			label,
			active,
			visible,
		});
		this.applyActionButtonState(this.inlineReadingPositionAutoSaveBtn, {
			icon,
			label,
			active,
			visible,
		});
	}

	private updateReadingReferencePointBtn(): void {
		const baseLabel = this.hasReadingReferencePoint
			? this.t("views.epubView.label.readingReferencePointSet")
			: this.t("views.epubView.label.readingReferencePointUnset");
		const label = this.canUseReadingProgress()
			? baseLabel
			: this.getFeatureActionLabel(baseLabel, PREMIUM_FEATURES.EPUB_READING_PROGRESS);
		const visible = this.canUseReadingProgress() || this.isPremiumFeaturePreviewEnabled();
		this.applyActionButtonState(this.readingReferenceBtn, {
			icon: "flag",
			label,
			active: this.canUseReadingProgress() ? this.hasReadingReferencePoint : false,
			visible,
		});
		this.applyActionButtonState(this.inlineReadingReferenceBtn, {
			icon: "flag",
			label,
			active: this.canUseReadingProgress() ? this.hasReadingReferencePoint : false,
			visible,
		});
	}

	private updateResumePointBtn(): void {
		const visible = this.hasWeaveIncrementalReadingHost();
		const label = this.t("views.epubView.menu.markResumePoint");
		this.applyActionButtonState(this.resumePointBtn, {
			icon: "bookmark-plus",
			label,
			visible,
		});
		this.applyActionButtonState(this.inlineResumePointBtn, {
			icon: "bookmark-plus",
			label,
			visible,
		});
	}

	private updateCanvasBtn(): void {
		const label = this.canvasModeActive
			? this.t("views.epubView.label.canvasOn")
			: this.t("views.epubView.label.canvasOff");
		const visible = this.canUseCanvasExcerpts();
		this.applyActionButtonState(this.canvasBtn, {
			icon: "layout-dashboard",
			label,
			active: this.canvasModeActive,
			visible,
		});
		this.applyActionButtonState(this.inlineCanvasBtn, {
			icon: "layout-dashboard",
			label,
			active: this.canvasModeActive,
			visible,
		});
		this.applyActionButtonState(this.canvasDirBtn, {
			visible: visible && this.canvasModeActive,
		});
		this.applyActionButtonState(this.inlineCanvasDirBtn, {
			visible: visible && this.canvasModeActive,
		});
	}

	private addMobileToolsToMenu(menu: Menu): void {
		menu.addItem((_item) => {
			_item.setTitle(
				this.t("views.epubView.label.readingMode", {
					mode: this.t("views.epubView.label.readingModeScrolled"),
				})
			);
			_item.setIcon("scroll-text");
			_item.setChecked(this.flowMode === "scrolled");
			_item.onClick(() => {
				if (this.flowMode === "scrolled") return;
				this.flowMode = "scrolled";
				this.layoutMode = "paginated";
				this.updateFlowBtn();
				this.updateLayoutBtn();
				this.actionHandlers.setFlowMode?.("scrolled");
			});
		});
		menu.addItem((_item) => {
			_item.setTitle(
				this.t("views.epubView.label.readingMode", {
					mode: this.t("views.epubView.label.readingModePaginated"),
				})
			);
			_item.setIcon("arrow-up-down");
			_item.setChecked(this.flowMode === "paginated");
			_item.onClick(() => {
				if (this.flowMode === "paginated") return;
				this.flowMode = "paginated";
				this.updateFlowBtn();
				this.updateLayoutBtn();
				this.actionHandlers.setFlowMode?.("paginated");
			});
		});
		menu.addSeparator();
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.addBookmark"));
			_item.setIcon("bookmark");
			_item.onClick(() => {
				void this.actionHandlers.addBookmark?.();
			});
		});
		if (this.actionHandlers.saveLastOpenBookmark) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.saveLastReadingPoint"));
				_item.setIcon("bookmark-check");
				_item.onClick(() => {
					void this.actionHandlers.saveLastOpenBookmark?.();
				});
			});
		}
		if (this.actionHandlers.saveReadingReferencePoint) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.saveReadingReferencePoint"));
				_item.setIcon("flag");
				_item.setChecked(this.hasReadingReferencePoint);
				_item.onClick(() => {
					void this.actionHandlers.saveReadingReferencePoint?.();
				});
			});
		}
		if (this.canUseCanvasExcerpts()) {
			menu.addItem((_item) => {
				_item.setTitle(
					this.canvasModeActive
						? this.t("views.epubView.label.canvasOn")
						: this.t("views.epubView.label.canvasOff")
				);
				_item.setIcon("layout-dashboard");
				_item.setChecked(this.canvasModeActive);
				_item.onClick((e) => {
					this.showCanvasMenu(e);
				});
			});
		}
		if (this.canUseCanvasExcerpts() && this.canvasModeActive) {
			menu.addItem((_item) => {
				_item.setTitle(
					this.t("views.epubView.label.canvasDirection", {
						direction: this.getCanvasDirectionLabel(this.canvasDirection),
					})
				);
				_item.setIcon(
					{
						down: "arrow-down",
						right: "arrow-right",
						up: "arrow-up",
						left: "arrow-left",
					}[this.canvasDirection]
				);
				_item.onClick((e) => {
					this.showDirectionMenu(e);
				});
			});
		}
		if (this.hasWeaveIncrementalReadingHost()) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.markResumePoint"));
				_item.setIcon("bookmark-plus");
				_item.onClick((evt) => {
					void this.actionHandlers.markIRResumePoint?.(evt as MouseEvent);
				});
			});
		}
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.tutorial"));
			_item.setIcon("circle-help");
			_item.onClick(() => {
				this.actionHandlers.toggleTutorial?.();
			});
		});
	}

	private async toggleReadingPositionAutoSave(): Promise<void> {
		if (!this.canUseReadingProgress()) {
			this.showPremiumFeaturePreview(PREMIUM_FEATURES.EPUB_READING_PROGRESS);
			return;
		}
		if (!this.actionHandlers.setReadingPositionAutoSaveEnabled) {
			return;
		}
		const nextEnabled = await this.actionHandlers.setReadingPositionAutoSaveEnabled(
			!this.readingPositionAutoSaveEnabled
		);
		this.readingPositionAutoSaveEnabled = nextEnabled;
		this.updateReadingPositionAutoSaveBtn();
	}

	private showDirectionMenu(evt: MouseEvent | Event): void {
		const canvasService = this.actionHandlers.getCanvasService?.();
		if (!canvasService) return;

		const menu = new Menu();
		const dirs: { dir: CanvasLayoutDirection; icon: string; label: string }[] = [
			{ dir: "down", icon: "arrow-down", label: this.getCanvasDirectionLabel("down") },
			{ dir: "right", icon: "arrow-right", label: this.getCanvasDirectionLabel("right") },
			{ dir: "up", icon: "arrow-up", label: this.getCanvasDirectionLabel("up") },
			{ dir: "left", icon: "arrow-left", label: this.getCanvasDirectionLabel("left") },
		];

		for (const { dir, icon, label } of dirs) {
			menu.addItem((_item) => {
				_item.setTitle(label);
				_item.setIcon(icon);
				_item.setChecked(this.canvasDirection === dir);
				_item.onClick(() => {
					this.canvasDirection = dir;
					canvasService.setLayoutDirection(dir);
					this.updateDirectionBtn();
				});
			});
		}

		menu.showAtMouseEvent(evt as MouseEvent);
	}

	private updateDirectionBtn(): void {
		const iconMap: Record<CanvasLayoutDirection, string> = {
			down: "arrow-down",
			right: "arrow-right",
			up: "arrow-up",
			left: "arrow-left",
		};
		const label = this.t("views.epubView.label.canvasDirection", {
			direction: this.getCanvasDirectionLabel(this.canvasDirection),
		});
		const icon = iconMap[this.canvasDirection];
		this.applyActionButtonState(this.canvasDirBtn, {
			icon,
			label,
			visible: this.canvasModeActive,
		});
		this.applyActionButtonState(this.inlineCanvasDirBtn, {
			icon,
			label,
			visible: this.canvasModeActive,
		});
	}

	private showCanvasMenu(evt: MouseEvent | Event): void {
		if (!this.canUseCanvasExcerpts()) {
			return;
		}

		const canvasService = this.actionHandlers.getCanvasService?.();
		if (!canvasService) return;

		const menu = new Menu();

		if (this.canvasModeActive) {
			const currentPath = canvasService.getCanvasPath();
			if (currentPath) {
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.label.canvasCurrent", { path: currentPath }));
					_item.setIcon("file");
					_item.setDisabled(true);
				});
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.label.canvasOpen"));
					_item.setIcon("external-link");
					_item.onClick(() => this.openCanvasFile(currentPath));
				});
			}
			menu.addSeparator();
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.label.canvasDisconnect"));
				_item.setIcon("unlink");
				_item.onClick(() => {
					this.canvasModeActive = false;
					this.actionHandlers.unbindCanvas?.();
					this.updateCanvasBtn();
				});
			});
		} else {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.label.canvasNew"));
				_item.setIcon("plus");
				_item.onClick(() => this.createAndBindCanvas(canvasService));
			});

			const canvasFiles = this.app.vault
				.getFiles()
				.filter((f) => f.extension === "canvas")
				.sort((a, b) => b.stat.mtime - a.stat.mtime)
				.slice(0, 15);

			if (canvasFiles.length > 0) {
				menu.addSeparator();
				for (const file of canvasFiles) {
					menu.addItem((_item) => {
						_item.setTitle(file.path);
						_item.setIcon("file");
						_item.onClick(() => this.bindExistingCanvas(canvasService, file.path));
					});
				}
			}
		}

		menu.showAtMouseEvent(evt as MouseEvent);
	}

	private async createAndBindCanvas(canvasService: EpubCanvasService): Promise<void> {
		const title = this.bookTitle || "EPUB";
		const safeName = title
			.replace(/[\\/:*?"<>|]/g, "_")
			.substring(0, 40)
			.trim();
		const canvasPath = `${safeName}-mindmap.canvas`;

		try {
			await canvasService.createCanvas(canvasPath);
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(canvasPath);
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasCreated", { path: canvasPath }));

			this.openCanvasFile(canvasPath);
		} catch (e) {
			logger.error("[EpubView] Failed to create canvas:", e);
			new Notice(this.t("views.epubView.notice.canvasCreateFailed"));
		}
	}

	private async bindExistingCanvas(_canvasService: EpubCanvasService, path: string): Promise<void> {
		try {
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(path);
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasConnected", { path }));
		} catch (e) {
			logger.error("[EpubView] Failed to bind canvas:", e);
		}
	}

	private openCanvasFile(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf("split", "vertical");
			void leaf.openFile(file);
		}
	}
}
