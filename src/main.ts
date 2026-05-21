import "./utils/group-by-compat";
import { Menu, Notice, Plugin, TAbstractFile, TFile, normalizePath } from "obsidian";
import { EpubSettingsTab } from "./components/settings/EpubSettingsTab";
import { isSupportedBookFile, isSupportedBookPath } from "./services/epub/book-format";
import {
	DEFAULT_EPUB_BOOKMARK_FOLDER,
	EPUB_RUNTIME,
	EpubStorageService,
	exportBookNotesToMarkdown,
	exportBookSectionToMarkdown,
	normalizeEpubBookmarkFolderPath,
} from "./services/epub";
import {
	DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_ENABLED,
	DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
	normalizeContinuousReadingPositionAutoSaveEnabled,
	normalizeContinuousReadingPositionAutoSavePages,
} from "./config/reading-position-auto-save";
import { PremiumFeatureGuard } from "./services/premium/PremiumFeatureGuard";
import {
	registerEpubHost,
	resolveEpubHost,
	unregisterEpubHost,
	type EpubHostAISplitConfigModalInput,
	type EpubHostCapabilities,
	type EpubHostExportBookNotesInput,
	type EpubHostExportChapterInput,
	type EpubWeaveOfficialAPI,
} from "./services/epub";
import { EpubExcerptOfficialApiService } from "./services/epub/EpubExcerptOfficialApiService";
import {
	openEpubBookshelf,
	openEpubReader,
	registerEpubMarkdownPostProcessor,
	registerEpubProtocolHandler,
	registerEpubWorkspaceViews,
} from "./services/epub/epub-plugin-support";
import { getVisibleSplitActionsFromHost } from "./services/ai/ai-action-config";
import { aiConfigStore } from "./stores/ai-config.store";
import type {
	EffectiveLicenseState,
	LicenseInfo,
	LicenseStore,
	LicensedProduct,
} from "./types/license";
import { DEFAULT_LICENSE_INFO, DEFAULT_LICENSE_STORE } from "./types/license";
import {
	getWeaveMainPlugin,
	isWeaveMainPluginEnabled,
	requireWeaveMainPlugin,
} from "./utils/weave-reader-access";
import { safeOpenSettings } from "./utils/obsidian-api-safe";
import {
	getCompatibleAISelectedTextPanelHost,
	getInheritedLicensesFromLegacyWeave,
} from "./utils/plugin-access";
import {
	getLegacyPrimaryLicense,
	LICENSED_PRODUCTS,
	normalizeLicenseStore,
	resolveEffectiveLicenseState,
} from "./utils/license-state";
import { registerLicenseSyncBridge } from "./utils/license-sync-bridge";
import { logger } from "./utils/logger";
import { initI18n, i18n, syncI18nWithObsidianLanguage } from "./utils/i18n";
import type { AIConfig } from "./types/plugin-settings";
import {
	DEFAULT_BOOKSHELF_DISPLAY_MODE,
	normalizeBookshelfDisplayMode,
	type BookshelfDisplayMode,
} from "./services/epub/bookshelf-display-mode";

interface StandaloneEpubPluginSettings {
	license: LicenseInfo;
	licenseState: LicenseStore;
	aiConfig?: AIConfig;
	allowInheritedLicenses: boolean;
	enableDebugMode: boolean;
	showPremiumFeaturesPreview: boolean;
	bookshelfAutoViewByLocationEnabled: boolean;
	bookshelfDisplayMode: BookshelfDisplayMode;
	bookmarkFolder: string;
	continuousReadingPositionAutoSaveEnabled: boolean;
	continuousReadingPositionAutoSavePages: number;
	lastSelectedIRDeckId: string;
	selectionQuickCreateLastFolder: string;
	epubMarkdownExportLastFolder: string;
}

const DEFAULT_STANDALONE_EPUB_SETTINGS: StandaloneEpubPluginSettings = {
	license: DEFAULT_LICENSE_INFO,
	licenseState: DEFAULT_LICENSE_STORE,
	allowInheritedLicenses: true,
	enableDebugMode: false,
	showPremiumFeaturesPreview: false,
	bookshelfAutoViewByLocationEnabled: true,
	bookshelfDisplayMode: DEFAULT_BOOKSHELF_DISPLAY_MODE,
	bookmarkFolder: DEFAULT_EPUB_BOOKMARK_FOLDER,
	continuousReadingPositionAutoSaveEnabled:
		DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_ENABLED,
	continuousReadingPositionAutoSavePages: DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
	lastSelectedIRDeckId: "",
	selectionQuickCreateLastFolder: "",
	epubMarkdownExportLastFolder: "",
};

type PersistedStandaloneEpubPluginSettings = Omit<
	StandaloneEpubPluginSettings,
	"lastSelectedIRDeckId" | "selectionQuickCreateLastFolder" | "epubMarkdownExportLastFolder"
>;

export type WeavePlugin = StandaloneEpubPlugin & Record<string, any>;

export default class StandaloneEpubPlugin extends Plugin implements EpubHostCapabilities {
	private workspaceViewsRegistered = false;
	private pendingBookshelfRefreshTimer: number | null = null;
	private epubStorageService: EpubStorageService | null = null;
	private epubOfficialApiService: EpubExcerptOfficialApiService | null = null;
	settings: StandaloneEpubPluginSettings = DEFAULT_STANDALONE_EPUB_SETTINGS;

	getLicensedProductId(): LicensedProduct {
		return LICENSED_PRODUCTS.EPUB;
	}

	getLocalLicenses(): LicenseInfo[] {
		return this.settings.licenseState?.localLicenses ?? [];
	}

	getInheritedLicenses(): LicenseInfo[] {
		if (this.settings.allowInheritedLicenses === false) {
			return [];
		}

		return getInheritedLicensesFromLegacyWeave(this.app as any);
	}

	getEffectiveLicenseState(): EffectiveLicenseState {
		return resolveEffectiveLicenseState({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
	}

	hasEpubPremiumAccess(): boolean {
		return this.getEffectiveLicenseState().isPremiumActive;
	}

	openEpubPremiumSettings(): void {
		safeOpenSettings(this.app, this.manifest.id);
	}

	async refreshPremiumState(): Promise<void> {
		await PremiumFeatureGuard.getInstance().updateLicenseState({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
	}

	private syncLicenseSettings(): boolean {
		const previousSnapshot = JSON.stringify({
			license: this.settings.license,
			licenseState: this.settings.licenseState,
		});
		const normalizedStore = normalizeLicenseStore(
			this.settings.license,
			this.settings.licenseState
		);
		this.settings.licenseState = normalizedStore;
		this.settings.license = getLegacyPrimaryLicense(normalizedStore.localLicenses);
		return (
			JSON.stringify({
				license: this.settings.license,
				licenseState: this.settings.licenseState,
			}) !== previousSnapshot
		);
	}

	private syncDebugSettings(): void {
		this.settings.enableDebugMode = this.settings.enableDebugMode === true;
		logger.setDebugMode(this.settings.enableDebugMode);
	}

	private syncPremiumPreviewSettings(): void {
		this.settings.showPremiumFeaturesPreview = this.settings.showPremiumFeaturesPreview === true;
		PremiumFeatureGuard.getInstance().setPremiumFeaturesPreview(
			this.settings.showPremiumFeaturesPreview
		);
	}

	private syncBookshelfDisplaySettings(): void {
		const normalizedMode = normalizeBookshelfDisplayMode(this.settings.bookshelfDisplayMode);
		this.settings.bookshelfDisplayMode =
			this.settings.bookshelfDisplayMode == null
				? this.settings.bookshelfAutoViewByLocationEnabled !== false
					? DEFAULT_BOOKSHELF_DISPLAY_MODE
					: "list"
				: normalizedMode;
		this.settings.bookshelfAutoViewByLocationEnabled =
			this.settings.bookshelfDisplayMode === DEFAULT_BOOKSHELF_DISPLAY_MODE;
	}

	private syncReadingPositionAutoSaveSettings(): void {
		this.settings.continuousReadingPositionAutoSaveEnabled =
			normalizeContinuousReadingPositionAutoSaveEnabled(
				this.settings.continuousReadingPositionAutoSaveEnabled
			);
		this.settings.continuousReadingPositionAutoSavePages =
			normalizeContinuousReadingPositionAutoSavePages(
				this.settings.continuousReadingPositionAutoSavePages
			);
	}

	getEpubStorageService(): EpubStorageService {
		if (!this.epubStorageService) {
			this.epubStorageService = new EpubStorageService(this.app);
		}
		return this.epubStorageService;
	}

	getOfficialAPI(): EpubWeaveOfficialAPI {
		if (!this.epubOfficialApiService) {
			this.epubOfficialApiService = new EpubExcerptOfficialApiService(this.app);
		}
		return this.epubOfficialApiService;
	}

	private getPersistedSettings(): PersistedStandaloneEpubPluginSettings {
		const {
			lastSelectedIRDeckId: _lastSelectedIRDeckId,
			selectionQuickCreateLastFolder: _selectionQuickCreateLastFolder,
			epubMarkdownExportLastFolder: _epubMarkdownExportLastFolder,
			...persistedSettings
		} = this.settings;
		return persistedSettings;
	}

	private getRememberedUiMemory() {
		return {
			lastSelectedIRDeckId: String(this.settings.lastSelectedIRDeckId || "").trim(),
			selectionQuickCreateLastFolder: this.normalizeRememberedFolder(
				this.settings.selectionQuickCreateLastFolder
			),
			epubMarkdownExportLastFolder: this.normalizeRememberedFolder(
				this.settings.epubMarkdownExportLastFolder
			),
		};
	}

	private hasLegacyRememberedUiKeys(value: unknown): boolean {
		if (!value || typeof value !== "object") {
			return false;
		}
		const record = value as Record<string, unknown>;
		return [
			"lastSelectedIRDeckId",
			"selectionQuickCreateLastFolder",
			"epubMarkdownExportLastFolder",
		].some((key) => Object.prototype.hasOwnProperty.call(record, key));
	}

	private async persistSettingsData(): Promise<void> {
		await this.saveData(this.getPersistedSettings());
	}

	async loadSettings(): Promise<void> {
		const loadedData = await this.loadData();
		this.settings = {
			...DEFAULT_STANDALONE_EPUB_SETTINGS,
			...(loadedData ?? {}),
		};
		this.settings.bookmarkFolder =
			normalizeEpubBookmarkFolderPath(this.settings.bookmarkFolder) || DEFAULT_EPUB_BOOKMARK_FOLDER;
		this.settings.selectionQuickCreateLastFolder = this.normalizeRememberedFolder(
			this.settings.selectionQuickCreateLastFolder
		);
		this.settings.epubMarkdownExportLastFolder = this.normalizeRememberedFolder(
			this.settings.epubMarkdownExportLastFolder
		);
		this.settings.lastSelectedIRDeckId = String(this.settings.lastSelectedIRDeckId || "").trim();
		const hasLocalUiMemory = await this.getEpubStorageService().hasPluginUiMemory();
		const localUiMemory = await this.getEpubStorageService().loadPluginUiMemory();
		this.settings.selectionQuickCreateLastFolder = this.normalizeRememberedFolder(
			hasLocalUiMemory
				? localUiMemory.selectionQuickCreateLastFolder
				: localUiMemory.selectionQuickCreateLastFolder || this.settings.selectionQuickCreateLastFolder
		);
		this.settings.epubMarkdownExportLastFolder = this.normalizeRememberedFolder(
			hasLocalUiMemory
				? localUiMemory.epubMarkdownExportLastFolder
				: localUiMemory.epubMarkdownExportLastFolder || this.settings.epubMarkdownExportLastFolder
		);
		this.settings.lastSelectedIRDeckId =
			String(
				hasLocalUiMemory
					? localUiMemory.lastSelectedIRDeckId
					: localUiMemory.lastSelectedIRDeckId || this.settings.lastSelectedIRDeckId || ""
			).trim();
		const licenseSettingsChanged = this.syncLicenseSettings();
		this.syncDebugSettings();
		this.syncPremiumPreviewSettings();
		this.syncBookshelfDisplaySettings();
		this.syncReadingPositionAutoSaveSettings();
		if (licenseSettingsChanged || this.hasLegacyRememberedUiKeys(loadedData)) {
			if (this.hasLegacyRememberedUiKeys(loadedData)) {
				await this.getEpubStorageService().savePluginUiMemory(this.getRememberedUiMemory());
			}
			await this.persistSettingsData();
		}
	}

	async saveSettings(): Promise<void> {
		this.syncLicenseSettings();

		this.syncDebugSettings();
		this.syncPremiumPreviewSettings();
		this.syncBookshelfDisplaySettings();
		this.syncReadingPositionAutoSaveSettings();
		this.settings.bookmarkFolder =
			normalizeEpubBookmarkFolderPath(this.settings.bookmarkFolder) || DEFAULT_EPUB_BOOKMARK_FOLDER;
		this.settings.selectionQuickCreateLastFolder = this.normalizeRememberedFolder(
			this.settings.selectionQuickCreateLastFolder
		);
		this.settings.epubMarkdownExportLastFolder = this.normalizeRememberedFolder(
			this.settings.epubMarkdownExportLastFolder
		);
		this.settings.lastSelectedIRDeckId = String(this.settings.lastSelectedIRDeckId || "").trim();
		await this.getEpubStorageService().savePluginUiMemory(this.getRememberedUiMemory());
		await this.persistSettingsData();
		await this.refreshPremiumState();
	}

	private normalizeRememberedFolder(folderPath?: string | null): string {
		const raw = String(folderPath || "").trim();
		if (!raw) {
			return "";
		}
		if (raw === "/" || raw === ".") {
			return "/";
		}
		return normalizePath(raw);
	}

	private extractParentFolder(filePath: string): string {
		const normalized = normalizePath(String(filePath || "").trim());
		const slashIndex = normalized.lastIndexOf("/");
		if (slashIndex <= 0) {
			return "/";
		}
		return normalizePath(normalized.slice(0, slashIndex));
	}

	private async persistPreferenceSettings(): Promise<void> {
		this.settings.selectionQuickCreateLastFolder = this.normalizeRememberedFolder(
			this.settings.selectionQuickCreateLastFolder
		);
		this.settings.epubMarkdownExportLastFolder = this.normalizeRememberedFolder(
			this.settings.epubMarkdownExportLastFolder
		);
		this.settings.lastSelectedIRDeckId = String(this.settings.lastSelectedIRDeckId || "").trim();
		await this.getEpubStorageService().savePluginUiMemory(this.getRememberedUiMemory());
		await this.persistSettingsData();
	}

	private queueBookshelfRefreshEvent(): void {
		if (typeof window === "undefined") {
			return;
		}
		if (this.pendingBookshelfRefreshTimer !== null) {
			window.clearTimeout(this.pendingBookshelfRefreshTimer);
		}
		this.pendingBookshelfRefreshTimer = window.setTimeout(() => {
			this.pendingBookshelfRefreshTimer = null;
			window.dispatchEvent(new CustomEvent(EPUB_RUNTIME.events.bookshelfDataChanged));
			window.dispatchEvent(new CustomEvent(EPUB_RUNTIME.events.bookshelfRefreshRequest));
		}, 120);
	}

	private registerBookshelfVaultRefreshBridge(): void {
		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				if (isSupportedBookFile(file)) {
					this.queueBookshelfRefreshEvent();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (isSupportedBookFile(file)) {
					this.queueBookshelfRefreshEvent();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				if (isSupportedBookPath(file.path)) {
					this.queueBookshelfRefreshEvent();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (isSupportedBookPath(oldPath) || isSupportedBookFile(file)) {
					this.queueBookshelfRefreshEvent();
				}
			})
		);
	}

	private registerWorkspaceViews(): void {
		if (this.workspaceViewsRegistered) {
			return;
		}

		registerEpubWorkspaceViews(this, "[Standalone EPUB]", "独立 EPUB 插件");
		this.workspaceViewsRegistered = true;
	}

	private notifyWeaveRequired(): void {
		new Notice(i18n.t("epub.reader.weaveRequired"));
	}

	openSelectedTextAISplitMenu(options: {
		event: MouseEvent | KeyboardEvent;
		selectedText: string;
		onSelectAction: (actionId: string) => void;
	}): void {
		if (!isWeaveMainPluginEnabled(this.app)) {
			this.notifyWeaveRequired();
			return;
		}

		const actions = getVisibleSplitActionsFromHost(
			getCompatibleAISelectedTextPanelHost(this.app as any) ?? this
		);
		const menu = new Menu();
		if (actions.length > 0) {
			for (const action of actions) {
				menu.addItem((item) => {
					item.setTitle(action.name);
					item.setIcon(action.icon || "sparkles");
					item.onClick(() => {
						options.onSelectAction(action.id);
					});
				});
			}
		} else {
			menu.addItem((item) => {
				item.setTitle("暂无可用的自定义 AI 拆分功能");
				item.setIcon("info");
				item.setDisabled(true);
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("AI拆分配置");
			item.setIcon("settings");
			item.onClick(() => {
				if (!this.tryOpenAISplitConfigModalFromMainPlugin()) {
					safeOpenSettings(this.app, this.manifest.id);
				}
			});
		});

		if (options.event instanceof MouseEvent) {
			menu.showAtMouseEvent(options.event);
			return;
		}

		const target = options.event.target instanceof HTMLElement ? options.event.target : null;
		if (target) {
			const rect = target.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
			return;
		}

		menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
	}

	private tryOpenAISplitConfigModalFromMainPlugin(): boolean {
		const input: EpubHostAISplitConfigModalInput = { mode: "split" };
		const host = resolveEpubHost(this.app);
		const openAISplitConfigModal = host?.openAISplitConfigModal;
		if (typeof openAISplitConfigModal !== "function") {
			return false;
		}

		try {
			openAISplitConfigModal(input);
			return true;
		} catch (_error) {
			return false;
		}
	}

	async openSelectedTextAIPanelFromEpub(input: {
		filePath: string;
		selectedText: string;
		actionId: string;
		sourceLink?: string;
	}): Promise<void> {
		const weave = requireWeaveMainPlugin(this.app);
		if (!weave?.openSelectedTextAIPanelFromEpub) {
			this.notifyWeaveRequired();
			return;
		}
		await weave.openSelectedTextAIPanelFromEpub(input);
	}

	async closeSelectedTextAIPanelFromEpub(filePath: string): Promise<void> {
		const weave = getWeaveMainPlugin(this.app);
		await weave?.closeSelectedTextAIPanelFromEpub?.(filePath);
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		initI18n();
		registerEpubHost(this.app, this);
		aiConfigStore.initialize(this as WeavePlugin);
		this.addSettingTab(new EpubSettingsTab(this.app, this));
		await PremiumFeatureGuard.getInstance().initializeForProduct({
			product: this.getLicensedProductId(),
			localLicenses: this.getLocalLicenses(),
			inheritedLicenses: this.getInheritedLicenses(),
		});
		registerLicenseSyncBridge(this, this);
		this.registerWorkspaceViews();
		registerEpubMarkdownPostProcessor(this, this.app);
		registerEpubProtocolHandler(this, this.app, "[Standalone EPUB Protocol]");
		this.registerBookshelfVaultRefreshBridge();
		this.registerEvent(this.app.workspace.on("layout-change", () => {
			syncI18nWithObsidianLanguage();
		}));
		this.registerDomEvent(window, "focus", () => {
			syncI18nWithObsidianLanguage();
		});
		this.registerDomEvent(document, "visibilitychange", () => {
			if (!document.hidden) {
				syncI18nWithObsidianLanguage();
			}
		});
		this.addRibbonIcon("library", i18n.t("views.epubBookshelfSidebar.title"), () => {
			void this.openEpubBookshelf();
		});

		this.addCommand({
			id: "open-epub-bookshelf",
			name: i18n.t("views.epubBookshelfSidebar.title"),
			callback: () => {
				void this.openEpubBookshelf();
			},
		});
		this.addCommand({
			id: "open-active-epub-reader",
			name: i18n.t("commands.openEpubReader.name"),
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				const canOpen = activeFile instanceof TFile && isSupportedBookFile(activeFile);
				if (!checking && canOpen) {
					void this.openEpubReader(activeFile.path);
				}
				return canOpen;
			},
		});
	}

	onunload(): void {
		if (this.pendingBookshelfRefreshTimer !== null && typeof window !== "undefined") {
			window.clearTimeout(this.pendingBookshelfRefreshTimer);
			this.pendingBookshelfRefreshTimer = null;
		}
		logger.setDebugMode(false);
		unregisterEpubHost(this.app);
	}

	private async openEpubBookshelf(): Promise<void> {
		await openEpubBookshelf(
			this.app,
			"[Standalone EPUB]",
			`${i18n.t("views.epubBookshelfSidebar.title")}${i18n.t("notifications.error.openFailed")}`
		);
	}

	async openEpubReader(filePath: string): Promise<void> {
		await openEpubReader(
			this.app,
			filePath,
			"[Standalone EPUB]",
			i18n.t("views.epubView.notice.bookFileMissing"),
			i18n.t("views.epubView.notice.bookOpenFailed")
		);
	}

	async exportEpubChapterToMarkdown(input: EpubHostExportChapterInput): Promise<void> {
		const exportedFile = await exportBookSectionToMarkdown(this.app, {
			...input,
			lastSelectedFolder: this.settings.epubMarkdownExportLastFolder,
		});
		this.settings.epubMarkdownExportLastFolder = this.extractParentFolder(exportedFile.path);
		await this.persistPreferenceSettings();
	}

	async exportEpubBookNotesToMarkdown(input: EpubHostExportBookNotesInput): Promise<void> {
		const exportedFile = await exportBookNotesToMarkdown(this.app, {
			...input,
			lastSelectedFolder: this.settings.epubMarkdownExportLastFolder,
		});
		this.settings.epubMarkdownExportLastFolder = this.extractParentFolder(exportedFile.path);
		await this.persistPreferenceSettings();
	}
}
