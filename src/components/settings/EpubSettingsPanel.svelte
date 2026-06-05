<script lang="ts">
  import { Setting } from "obsidian";
  import { onMount } from "svelte";
  import TabNavigation from "../ui/TabNavigation.svelte";
  import { EPUB_RUNTIME, normalizeEpubBookmarkFolderPath } from "../../services/epub";
  import {
    DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_ENABLED,
    DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
    MAX_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
    MIN_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
    normalizeContinuousReadingPositionAutoSaveEnabled,
    normalizeContinuousReadingPositionAutoSavePages,
  } from "../../config/reading-position-auto-save";
  import EpubLicenseSettingsPanel from "./EpubLicenseSettingsPanel.svelte";
  import { FolderSuggest } from "../../utils/FolderSuggest";
  import { showNotification } from "../../utils/notifications";
  import { CURRENT_PLUGIN_DISPLAY_VERSION, CURRENT_PLUGIN_NAME } from "../../config/plugin-runtime";
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import { tr } from "../../utils/i18n";
  import { getEpubBacklinkHighlightService } from "../../services/epub/epub-backlink-highlight-access";
  import { scheduleEpubAnnotationIndexWarmup } from "../../services/epub/epub-annotation-index";

  interface Props {
    plugin: any;
  }

  type EpubSettingsTabId = "basic" | "license" | "about";

  let { plugin }: Props = $props();
  let t = $derived($tr);

  let activeTab = $state<EpubSettingsTabId>("basic");
  let stateVersion = $state(0);
  let premiumPreviewSettingsHost = $state<HTMLDivElement | null>(null);
  let readingSettingsHost = $state<HTMLDivElement | null>(null);
  let diagnosticsSettingsHost = $state<HTMLDivElement | null>(null);
  const premiumGuard = PremiumFeatureGuard.getInstance();

  let tabs = $derived.by<Array<{ id: EpubSettingsTabId; label: string; icon: string }>>(() => [
    { id: "basic", label: t("epub.settings.tabs.basic"), icon: "" },
    { id: "license", label: t("epub.settings.tabs.license"), icon: "" },
    { id: "about", label: t("epub.settings.tabs.about"), icon: "" },
  ]);

  const supportedFormats = ["EPUB", "MOBI", "AZW3", "FB2", "FBZ", "TXT", "CBZ"];

  let contactItems = $derived.by(() => [
    {
      label: t("epub.settings.contact.email"),
      href: "mailto:tutaoyuan8@outlook.com?subject=Weave%20EPUB%20Reader%20%E5%8F%8D%E9%A6%88",
    },
    {
      label: t("epub.settings.contact.docs"),
      href: "https://iwi05cktlph.feishu.cn/wiki/EAtZwld1uibt6ikU2SDcB2PenAb?fromScene=spaceOverview",
    },
    {
      label: t("epub.settings.contact.changelog"),
      href: "https://github.com/zhuzhige123/obsidian-weave-reader",
    },
    {
      label: t("epub.settings.contact.community"),
      href: "https://iwi05cktlph.feishu.cn/wiki/EAtZwld1uibt6ikU2SDcB2PenAb?fromScene=spaceOverview",
    },
  ]);

  let pluginDisplayName = $derived.by(() => plugin.manifest?.name ?? CURRENT_PLUGIN_NAME);

  let pluginDisplayVersion = $derived.by(() =>
    plugin.manifest?.version ? `v${plugin.manifest.version}` : CURRENT_PLUGIN_DISPLAY_VERSION
  );

  let aboutOverviewItems = $derived.by(() => [
    {
      label: t("epub.settings.about.supportedFormats"),
      value: supportedFormats.join(" / "),
    },
    {
      label: t("epub.settings.about.overview"),
      value: t("epub.settings.about.overviewValue"),
    },
  ]);

  let bookmarkFolderValue = $derived.by(() => {
    stateVersion;
    return normalizeEpubBookmarkFolderPath(plugin.settings?.bookmarkFolder);
  });

  let debugModeEnabled = $derived.by(() => {
    stateVersion;
    return plugin.settings?.enableDebugMode === true;
  });

  let sourceNavigationOpenInNewTab = $derived.by(() => {
    stateVersion;
    return plugin.settings?.sourceNavigationOpenInNewTab !== false;
  });

  let continuousReadingPositionAutoSaveEnabled = $derived.by(() => {
    stateVersion;
    return normalizeContinuousReadingPositionAutoSaveEnabled(
      plugin.settings?.continuousReadingPositionAutoSaveEnabled
    );
  });

  let continuousReadingPositionAutoSavePages = $derived.by(() => {
    stateVersion;
    return normalizeContinuousReadingPositionAutoSavePages(
      plugin.settings?.continuousReadingPositionAutoSavePages
    );
  });

  let premiumPreviewEnabled = $derived.by(() => {
    stateVersion;
    return plugin.settings?.showPremiumFeaturesPreview === true;
  });

  let bookmarkFolderInput = $state("");
  let continuousReadingPositionAutoSavePagesInput = $state("");

  async function save(): Promise<void> {
    await plugin.saveSettings();
    stateVersion += 1;
  }

  $effect(() => {
    stateVersion;
    bookmarkFolderInput = bookmarkFolderValue;
    continuousReadingPositionAutoSavePagesInput = String(continuousReadingPositionAutoSavePages);
  });

  async function updateBookmarkFolder(folderPath: string): Promise<void> {
    const normalizedFolderPath = normalizeEpubBookmarkFolderPath(folderPath);

    if (normalizedFolderPath === bookmarkFolderValue) {
      bookmarkFolderInput = bookmarkFolderValue;
      return;
    }

    plugin.settings.bookmarkFolder = normalizedFolderPath;
    await save();
    showNotification(t("epub.settings.notifications.bookmarkFolderUpdated"), "success");
  }

	async function updatePremiumPreview(enabled: boolean): Promise<void> {
		if (premiumPreviewEnabled === enabled) {
			return;
		}

		plugin.settings.showPremiumFeaturesPreview = enabled;
		await save();
		showNotification(enabled ? t("epub.settings.notifications.premiumPreviewEnabled") : t("epub.settings.notifications.premiumPreviewDisabled"), "success");
	}

  async function updateSourceNavigationOpenInNewTab(enabled: boolean): Promise<void> {
    if (sourceNavigationOpenInNewTab === enabled) {
      return;
    }

    plugin.settings.sourceNavigationOpenInNewTab = enabled;
    await save();
  }

  async function updateDebugMode(enabled: boolean): Promise<void> {
    if (debugModeEnabled === enabled) {
      return;
    }

    plugin.settings.enableDebugMode = enabled;
    await save();
    showNotification(enabled ? t("epub.settings.notifications.debugEnabled") : t("epub.settings.notifications.debugDisabled"), "success");
  }

  async function updateContinuousReadingPositionAutoSaveEnabled(enabled: boolean): Promise<void> {
    const normalizedEnabled = normalizeContinuousReadingPositionAutoSaveEnabled(enabled);
    if (continuousReadingPositionAutoSaveEnabled === normalizedEnabled) {
      return;
    }

    plugin.settings.continuousReadingPositionAutoSaveEnabled = normalizedEnabled;
    if (plugin.settings.continuousReadingPositionAutoSavePages == null) {
      plugin.settings.continuousReadingPositionAutoSavePages =
        DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES;
    }
    await save();
    showNotification(normalizedEnabled ? t("epub.settings.notifications.autoSaveEnabled") : t("epub.settings.notifications.autoSaveDisabled"), "success");
  }

  async function updateContinuousReadingPositionAutoSavePages(value: string): Promise<void> {
    const normalizedPages = normalizeContinuousReadingPositionAutoSavePages(value);
    continuousReadingPositionAutoSavePagesInput = String(normalizedPages);

    if (continuousReadingPositionAutoSavePages === normalizedPages) {
      return;
    }

    plugin.settings.continuousReadingPositionAutoSavePages = normalizedPages;
    if (plugin.settings.continuousReadingPositionAutoSaveEnabled == null) {
      plugin.settings.continuousReadingPositionAutoSaveEnabled =
        DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_ENABLED;
    }
    await save();
    showNotification(t("epub.settings.notifications.autoSavePagesUpdated", { pages: normalizedPages }), "success");
  }

	function canUsePremiumSetting(featureId: string): boolean {
		return premiumGuard.canUseFeature(featureId, { page: "epub-settings" });
	}

	function shouldShowPremiumSetting(featureId: string): boolean {
		return premiumGuard.shouldShowFeatureEntry(featureId, undefined, { page: "epub-settings" });
	}

	function getPremiumSettingTitle(baseTitle: string, featureId: string): string {
		return premiumGuard.getFeatureEntryTitle(baseTitle, featureId, { page: "epub-settings" });
	}

	function openPremiumFeaturePreviewForSetting(featureId: string): void {
		if (typeof window === "undefined") {
			return;
		}
		window.dispatchEvent(
			new CustomEvent(EPUB_RUNTIME.events.premiumFeaturePreviewRequest, {
				detail: { featureId },
			})
		);
	}

	function handlePremiumUiStateChanged(): void {
		stateVersion += 1;
	}

	onMount(() => {
		const unsubscribePremium = premiumGuard.isPremiumActive.subscribe(() => {
			handlePremiumUiStateChanged();
		});
		const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe(() => {
			handlePremiumUiStateChanged();
		});
		if (typeof window !== "undefined") {
			window.addEventListener(EPUB_RUNTIME.events.premiumUiStateChanged, handlePremiumUiStateChanged);
		}
		return () => {
			unsubscribePremium();
			unsubscribePreview();
			if (typeof window !== "undefined") {
				window.removeEventListener(EPUB_RUNTIME.events.premiumUiStateChanged, handlePremiumUiStateChanged);
			}
		};
	});

  $effect(() => {
    if (
      activeTab !== "basic"
      || !premiumPreviewSettingsHost
      || !readingSettingsHost
      || !diagnosticsSettingsHost
    ) {
      return;
    }

    const clearBasicSettingsHosts = () => {
      premiumPreviewSettingsHost?.replaceChildren();
      readingSettingsHost?.replaceChildren();
      diagnosticsSettingsHost?.replaceChildren();
    };

    clearBasicSettingsHosts();

    const cleanupFns: Array<() => void> = [];

		new Setting(premiumPreviewSettingsHost)
			.setName(t("epub.settings.basic.showPremiumPreview"))
			.setDesc(t("epub.settings.basic.showPremiumPreviewDesc"))
			.setClass("epub-premium-preview-toggle-setting")
			.addToggle((toggle) => {
				toggle.setValue(premiumPreviewEnabled);
				toggle.onChange(async (value) => {
					await updatePremiumPreview(value);
				});
			});

    const bookmarkFolderSetting = new Setting(readingSettingsHost)
      .setName(t("epub.settings.basic.bookmarkFolder"))
      .setDesc(t("epub.settings.basic.bookmarkFolderDesc"))
      .setClass("epub-bookmark-setting");

    bookmarkFolderSetting.addSearch((search) => {
      search.setPlaceholder(t("epub.settings.basic.bookmarkFolderPlaceholder"));
      search.setValue(bookmarkFolderValue);
      search.onChange((value) => {
        bookmarkFolderInput = value;
      });

      const inputEl = search.inputEl;
      const suggest = new FolderSuggest(plugin.app, inputEl);

      const handleFocus = () => {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      };

      const handleBlur = () => {
        void updateBookmarkFolder(inputEl.value);
      };

      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void updateBookmarkFolder(inputEl.value);
          return;
        }

        if (event.key === "Escape") {
          bookmarkFolderInput = bookmarkFolderValue;
          search.setValue(bookmarkFolderValue);
          inputEl.blur();
        }
      };

      inputEl.addEventListener("focus", handleFocus);
      inputEl.addEventListener("blur", handleBlur);
      inputEl.addEventListener("keydown", handleKeydown);

      cleanupFns.push(() => inputEl.removeEventListener("focus", handleFocus));
      cleanupFns.push(() => inputEl.removeEventListener("blur", handleBlur));
      cleanupFns.push(() => inputEl.removeEventListener("keydown", handleKeydown));
      cleanupFns.push(() => suggest.close());
    });

    const autoSaveSetting = new Setting(readingSettingsHost)
      .setName(t("epub.settings.basic.autoSaveReadingPosition"))
      .setDesc(t("epub.settings.basic.autoSaveReadingPositionDesc"))
      .setClass("epub-reading-position-auto-save-toggle-setting");

    autoSaveSetting.addToggle((toggle) => {
      toggle.setValue(continuousReadingPositionAutoSaveEnabled);
      toggle.onChange(async (value) => {
        await updateContinuousReadingPositionAutoSaveEnabled(value);
      });
    });

    const autoSavePagesSetting = new Setting(readingSettingsHost)
      .setName(t("epub.settings.basic.autoSavePages"))
      .setDesc(t("epub.settings.basic.autoSavePagesDesc", {
        min: MIN_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
        max: MAX_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
        default: DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES,
      }))
      .setClass("epub-reading-position-auto-save-pages-setting");

    autoSavePagesSetting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = String(MIN_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES);
      text.inputEl.max = String(MAX_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES);
      text.setPlaceholder(String(DEFAULT_CONTINUOUS_READING_POSITION_AUTO_SAVE_PAGES));
      text.setValue(continuousReadingPositionAutoSavePagesInput);
      text.setDisabled(!continuousReadingPositionAutoSaveEnabled);
      text.onChange((value) => {
        continuousReadingPositionAutoSavePagesInput = value;
      });

      const inputEl = text.inputEl;

      const commitValue = () => {
        if (!continuousReadingPositionAutoSaveEnabled) {
          continuousReadingPositionAutoSavePagesInput = String(continuousReadingPositionAutoSavePages);
          text.setValue(String(continuousReadingPositionAutoSavePages));
          return;
        }
        void updateContinuousReadingPositionAutoSavePages(inputEl.value);
      };

      const handleBlur = () => {
        commitValue();
      };

      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue();
          return;
        }

        if (event.key === "Escape") {
          continuousReadingPositionAutoSavePagesInput = String(continuousReadingPositionAutoSavePages);
          text.setValue(String(continuousReadingPositionAutoSavePages));
          inputEl.blur();
        }
      };

      inputEl.addEventListener("blur", handleBlur);
      inputEl.addEventListener("keydown", handleKeydown);

      cleanupFns.push(() => inputEl.removeEventListener("blur", handleBlur));
      cleanupFns.push(() => inputEl.removeEventListener("keydown", handleKeydown));
    });

    new Setting(diagnosticsSettingsHost)
      .setName(t("epub.settings.basic.sourceNavigationOpenInNewTab"))
      .setDesc(t("epub.settings.basic.sourceNavigationOpenInNewTabDesc"))
      .setClass("epub-source-navigation-setting")
      .addToggle((toggle) => {
        toggle.setValue(sourceNavigationOpenInNewTab);
        toggle.onChange(async (value) => {
          await updateSourceNavigationOpenInNewTab(value);
        });
      });

    new Setting(diagnosticsSettingsHost)
      .setName(t("epub.settings.basic.debugMode"))
      .setDesc(t("epub.settings.basic.debugModeDesc"))
      .setClass("epub-debug-setting")
      .addToggle((toggle) => {
        toggle.setValue(debugModeEnabled);
        toggle.onChange(async (value) => {
          await updateDebugMode(value);
        });
      });

    new Setting(diagnosticsSettingsHost)
      .setName(t("epub.settings.basic.rebuildHighlightIndex"))
      .setDesc(t("epub.settings.basic.rebuildHighlightIndexDesc"))
      .setClass("epub-rebuild-highlight-index-setting")
      .addButton((button) => {
        button.setButtonText(t("epub.settings.basic.rebuildHighlightIndexAction"));
        button.onClick(async () => {
          button.setDisabled(true);
          try {
            const service = getEpubBacklinkHighlightService(plugin.app);
            await service.rebuildHighlightIndexes();
            scheduleEpubAnnotationIndexWarmup(plugin.app, 2_000, { forceAll: true });
            showNotification(t("epub.settings.basic.rebuildHighlightIndexSuccess"), "success");
          } catch (error) {
            console.error("[EpubSettings] rebuild highlight index failed:", error);
            showNotification(t("epub.settings.basic.rebuildHighlightIndexFailed"), "error");
          } finally {
            button.setDisabled(false);
          }
        });
      });

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
      clearBasicSettingsHosts();
    };
  });

  function switchTab(tabId: EpubSettingsTabId): void {
    activeTab = tabId;
  }
</script>

<div class="epub-settings-root">
  <div class="epub-settings-tabs">
    <TabNavigation
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => switchTab(tabId as EpubSettingsTabId)}
      useObsidianIcons={false}
      variant="plain"
    />
  </div>

  <div class="epub-settings-tab-panel" id={`epub-settings-panel-${activeTab}`}>
    {#if activeTab === "basic"}
      <section class="epub-settings-section epub-settings-section--compact">
        <div class="epub-settings-group epub-settings-group--panel epub-settings-group--preview-first">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.premiumPreview")}</h3>
          </div>
          <div bind:this={premiumPreviewSettingsHost} class="epub-native-settings-host"></div>
        </div>

        <div class="epub-settings-group epub-settings-group--panel">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.reading")}</h3>
          </div>

          <div bind:this={readingSettingsHost} class="epub-native-settings-host"></div>
        </div>

        <div class="epub-settings-group epub-settings-group--panel">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title with-accent-bar accent-cyan">{t("epub.settings.groups.diagnostics")}</h3>
          </div>

          <div bind:this={diagnosticsSettingsHost} class="epub-native-settings-host"></div>
        </div>
      </section>
    {/if}

    {#if activeTab === "license"}
      <section class="epub-settings-section">
        <EpubLicenseSettingsPanel {plugin} />
      </section>
    {/if}

    {#if activeTab === "about"}
      <section class="epub-settings-section epub-settings-section--about">
        <div class="epub-settings-group">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title with-accent-bar accent-cyan">{t("epub.settings.about.panelTitle")}</h3>
            <p class="epub-settings-group-description">{t("epub.settings.about.panelDescription")}</p>
          </div>

          <div class="epub-about-overview-list">
            <div class="epub-about-overview-section-label">{t("epub.settings.about.pluginInfo")}</div>
            <div class="epub-about-overview-item">
              <div class="epub-about-overview-label">{t("epub.settings.about.pluginName")}</div>
              <div class="epub-about-overview-value">{pluginDisplayName}</div>
            </div>
            <div class="epub-about-overview-item">
              <div class="epub-about-overview-label">{t("epub.settings.about.version")}</div>
              <div class="epub-about-overview-value">{pluginDisplayVersion}</div>
            </div>
            <div class="epub-about-overview-item">
              <div class="epub-about-overview-label">{t("epub.settings.about.series")}</div>
              <div class="epub-about-overview-value">{t("epub.settings.about.seriesValue")}</div>
            </div>
            <div class="epub-about-overview-item">
              <div class="epub-about-overview-label">{t("epub.settings.about.platform")}</div>
              <div class="epub-about-overview-value">{t("epub.settings.about.platformValue")}</div>
            </div>
            <div class="epub-about-overview-item">
              <div class="epub-about-overview-label">{t("epub.settings.about.licensedDevices")}</div>
              <div class="epub-about-overview-value">{t("epub.settings.about.licensedDevicesValue")}</div>
            </div>

            <div class="epub-about-overview-section-label epub-about-overview-section-label--separated">{t("epub.settings.about.readingOverview")}</div>
            {#each aboutOverviewItems as item}
              <div class="epub-about-overview-item">
                <div class="epub-about-overview-label">{item.label}</div>
                <div class="epub-about-overview-value">{item.value}</div>
              </div>
            {/each}
          </div>
        </div>

        <div class="epub-settings-group epub-settings-group--panel">
          <div class="epub-settings-group-header">
            <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.about.contactTitle")}</h3>
          </div>

          <div class="epub-about-links">
            {#each contactItems as item}
              <a
                class="epub-about-link"
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {item.label}
              </a>
            {/each}
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .epub-settings-root {
    /* Semantic typography scale aligned with standalone IR settings */
    --epub-settings-font-size-title: var(--font-ui-medium, 1rem);
    --epub-settings-font-size-label: var(--font-ui-small, 0.95rem);
    --epub-settings-font-size-desc: var(--font-ui-smaller, 0.85rem);
    /* Spacing scale aligned with settings UI rhythm */
    --epub-settings-gap-xs: 0.25rem;
    --epub-settings-gap-sm: 0.35rem;
    --epub-settings-gap-md: 0.75rem;
    --epub-settings-gap-lg: 1rem;
    --epub-settings-gap-xl: 1.5rem;
    --epub-settings-panel-padding: 1rem;
    --epub-settings-row-padding-y: 1.25rem;
    --epub-settings-row-padding-x: 1.5rem;
    --epub-settings-radius-row: 14px;
    --epub-settings-radius-panel: 18px;
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-lg);
    padding: 0 0 1.5rem;
  }

  .epub-settings-tabs {
    min-width: 0;
  }

  .epub-settings-tabs :global(.tab-navigation) {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: var(--epub-settings-gap-sm);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .epub-settings-tabs :global(.tab-navigation::-webkit-scrollbar) {
    display: none;
  }

  .epub-settings-tab-panel {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-xl);
    min-width: 0;
    padding-inline: 0.5rem;
  }

  .epub-settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-xl);
    min-width: 0;
  }

  .epub-settings-section--compact {
    gap: var(--epub-settings-gap-lg);
  }

  .epub-settings-section--compact .epub-settings-group-header {
    padding-bottom: 0.15rem;
  }

  .epub-native-settings-host {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-md);
    min-width: 0;
  }

  .epub-native-settings-host :global(.setting-item) {
    border: none;
    border-radius: var(--epub-settings-radius-row);
    background: var(--background-secondary);
    padding: var(--epub-settings-row-padding-y) var(--epub-settings-row-padding-x);
  }

  .epub-native-settings-host :global(.epub-premium-preview-setting.setting-item) {
    cursor: pointer;
  }

  .epub-native-settings-host :global(.setting-item-info) {
    min-width: 0;
  }

  .epub-native-settings-host :global(.setting-item-name) {
    font-size: var(--epub-settings-font-size-label);
    font-weight: 600;
    line-height: 1.4;
  }

  .epub-native-settings-host :global(.setting-item-description) {
    font-size: var(--epub-settings-font-size-desc);
    line-height: 1.55;
    color: var(--text-muted);
  }

  .epub-native-settings-host :global(.epub-bookmark-setting .setting-item-control) {
    flex: 0 1 clamp(16rem, 42%, 24rem);
    width: clamp(16rem, 42%, 24rem);
    max-width: 100%;
  }

  .epub-native-settings-host :global(.epub-reading-position-auto-save-pages-setting .setting-item-control) {
    flex: 0 1 clamp(9rem, 24%, 12rem);
    width: clamp(9rem, 24%, 12rem);
    max-width: 100%;
  }

  .epub-native-settings-host :global(.epub-top-sticker-layout-setting .setting-item-control),
  .epub-native-settings-host :global(.epub-book-notes-template-setting .setting-item-control) {
    flex: 0 1 clamp(10rem, 28%, 14rem);
    width: clamp(10rem, 28%, 14rem);
    max-width: 100%;
  }

  .epub-native-settings-host :global(.epub-bookmark-setting input[type="search"]) {
    width: 100%;
  }

  .epub-native-settings-host :global(.epub-reading-position-auto-save-pages-setting input[type="number"]) {
    width: 100%;
  }

  .epub-native-settings-host :global(.epub-top-sticker-layout-setting select),
  .epub-native-settings-host :global(.epub-book-notes-template-setting select) {
    width: 100%;
  }

  .epub-native-settings-host :global(.epub-bookmark-setting .search-input-container) {
    width: 100%;
    max-width: 100%;
  }

  .epub-settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-xs);
    min-width: 0;
  }

  .epub-settings-group--panel {
    padding: var(--epub-settings-panel-padding);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--epub-settings-radius-panel);
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
  }

  .epub-settings-group-header {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-sm);
    padding-bottom: 0.4rem;
  }

  .epub-settings-group-title {
    margin: 0;
    font-size: var(--epub-settings-font-size-title);
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .epub-settings-group-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .epub-settings-group-title.with-accent-bar::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: var(--radius-s, 2px);
  }

  .epub-settings-group-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .epub-settings-group-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .epub-settings-group-description {
    margin: 0;
    font-size: var(--epub-settings-font-size-desc);
    color: var(--text-muted);
    line-height: 1.55;
  }

  .epub-about-overview-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 12px);
    background: var(--background-secondary);
    overflow: hidden;
  }

  .epub-about-overview-section-label {
    padding: var(--epub-settings-gap-md) var(--epub-settings-row-padding-y);
    color: var(--text-muted);
    font-size: var(--epub-settings-font-size-desc);
    font-weight: 600;
    line-height: 1.4;
    background: color-mix(in oklab, var(--background-secondary), var(--background-primary) 28%);
  }

  .epub-about-overview-section-label--separated {
    border-top: 1px solid var(--background-modifier-border);
  }

  .epub-about-overview-item {
    display: grid;
    grid-template-columns: minmax(7.5rem, 10rem) minmax(0, 1fr);
    gap: var(--epub-settings-gap-lg);
    padding: var(--epub-settings-gap-lg) var(--epub-settings-row-padding-y);
  }

  .epub-about-overview-item + .epub-about-overview-item {
    border-top: 1px solid var(--background-modifier-border);
  }

  .epub-about-overview-label {
    color: var(--text-normal);
    font-weight: 600;
    font-size: var(--epub-settings-font-size-label);
    line-height: 1.5;
  }

  .epub-about-overview-value {
    color: var(--text-muted);
    font-size: var(--epub-settings-font-size-desc);
    line-height: 1.65;
  }

  .epub-about-links {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--epub-settings-gap-xs) var(--epub-settings-gap-md);
    width: 100%;
  }

  .epub-about-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem 0.45rem;
    border: none;
    border-radius: var(--radius-m, 8px);
    background: transparent;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.15s ease, background-color 0.15s ease;
    text-align: center;
  }

  .epub-about-link:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  @media (max-width: 720px) {
    .epub-settings-tabs :global(.tab-navigation) {
      gap: var(--epub-settings-gap-xs);
    }

    .epub-native-settings-host :global(.epub-bookmark-setting .setting-item-control) {
      width: 100%;
      max-width: 100%;
      flex-basis: auto;
    }

    .epub-native-settings-host :global(.epub-reading-position-auto-save-pages-setting .setting-item-control) {
      width: 100%;
      max-width: 100%;
      flex-basis: auto;
    }

    .epub-native-settings-host :global(.epub-top-sticker-layout-setting .setting-item-control),
    .epub-native-settings-host :global(.epub-book-notes-template-setting .setting-item-control) {
      width: 100%;
      max-width: 100%;
      flex-basis: auto;
    }

    .epub-native-settings-host :global(.setting-item) {
      padding: var(--epub-settings-panel-padding);
    }

    .epub-settings-group--panel {
      padding: calc(var(--epub-settings-panel-padding) - 0.1rem);
    }

    .epub-about-overview-item {
      grid-template-columns: 1fr;
      gap: var(--epub-settings-gap-sm);
    }

    .epub-about-links {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 480px) {
    .epub-about-links {
      grid-template-columns: 1fr;
    }
  }
</style>
