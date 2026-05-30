<script lang="ts">
  import EnhancedActivationForm from "./components/EnhancedActivationForm.svelte";
  import EnhancedLicenseStatusCard from "./components/EnhancedLicenseStatusCard.svelte";
  import {
    getPluginEffectiveLicenseState,
    getPluginActivationRemovalKind,
    removePluginActivation,
  } from "../../utils/plugin-license";
  import { emitWeaveLicenseChanged } from "../../utils/license-sync-bridge";
  import { createSafeNotice } from "../../utils/obsidian-api-safe";
  import { showObsidianConfirm } from "../../utils/obsidian-confirm";
  import { showNotification } from "../../utils/notifications";
  import { tr } from "../../utils/i18n";

  interface Props {
    plugin: any;
  }

  let { plugin }: Props = $props();
  let t = $derived($tr);

  let stateVersion = $state(0);
  let isRemoving = $state(false);
  let isSavingCode = $state(false);

  function refreshSnapshot(): void {
		stateVersion += 1;
	}

  let effectiveLicenseState = $derived.by(() => {
		stateVersion;
		return getPluginEffectiveLicenseState(plugin);
	});

  let currentLicense = $derived.by(() => {
		stateVersion;
		return effectiveLicenseState.primaryLicense || plugin.settings?.license || null;
	});

  async function save(): Promise<void> {
		await plugin.saveSettings();
		refreshSnapshot();
	}

  async function saveActivationCode(): Promise<void> {
    if (isSavingCode || isRemoving) {
      return;
    }

    const activationCode = currentLicense?.activationCode?.trim();

    if (!activationCode) {
      createSafeNotice(t("epub.settings.license.noSavableCode"), 2600);
      return;
    }

    isSavingCode = true;

    try {
      await navigator.clipboard.writeText(activationCode);
      createSafeNotice(t("epub.settings.license.codeCopied"), 2600);
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = activationCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        createSafeNotice(t("epub.settings.license.codeCopied"), 2600);
      } catch {
        createSafeNotice(t("epub.settings.license.codeCopyFailed"), 3000);
      }
    } finally {
      isSavingCode = false;
    }
  }

  async function resetLicense(): Promise<void> {
    if (isRemoving || isSavingCode) {
      return;
    }

    const removalKind = getPluginActivationRemovalKind(plugin, { disableInheritedLicenses: true });

	if (removalKind === "none") {
		await plugin.refreshPremiumState?.();
		refreshSnapshot();
		showNotification(t("epub.settings.license.noActivationToRemove"), "info");
		return;
	}

    const confirmed = await showObsidianConfirm(
      plugin.app,
      t("epub.settings.license.confirmRemove"),
      { title: t("epub.settings.license.confirmRemoveTitle") }
    );

    if (!confirmed) {
      return;
    }

    isRemoving = true;

    try {
      const result = removePluginActivation(plugin, { disableInheritedLicenses: true });
      await plugin.saveSettings();
      emitWeaveLicenseChanged(plugin.app);

      const nextState = result.nextState;
      refreshSnapshot();

      if (nextState.isPremiumActive) {
        showNotification(t("epub.settings.license.removeAbnormal"), "error");
        return;
      }

      if (result.removalKind === "inherited-only") {
		showNotification(t("epub.settings.license.inheritedRemoved"), "success");
		return;
	  }

      showNotification(t("epub.settings.license.removed"), "success");
    } catch {
      showNotification(t("epub.settings.license.removeFailed"), "error");
    } finally {
      isRemoving = false;
    }
  }
</script>

<section class="epub-license-settings-panel">
  <div class="epub-license-settings-card">
    <div class="epub-license-settings-header">
      <h3 class="section-title with-accent-bar accent-purple">{t("epub.settings.license.title")}</h3>
      <p class="section-description">{t("epub.settings.license.description")}</p>
    </div>

    <div class="epub-license-settings-content">
    {#if effectiveLicenseState.isPremiumActive}
      <EnhancedLicenseStatusCard
        license={currentLicense}
        app={plugin.app}
        effectiveState={effectiveLicenseState}
        showActions={true}
        isSavingCode={isSavingCode}
        isResetting={isRemoving}
        onSaveCode={saveActivationCode}
        onReset={resetLicense}
      />
    {/if}

    {#if !effectiveLicenseState.isPremiumActive}
      <EnhancedActivationForm
        {plugin}
        onSave={save}
        showHeader={false}
        displayState={effectiveLicenseState}
        standalone={false}
      />
    {/if}
    </div>
  </div>
</section>

<style>
  .epub-license-settings-panel {
    /* Spacing tokens aligned with settings panel */
    --epub-settings-gap-sm: 0.35rem;
    --epub-settings-gap-lg: 1rem;
    --epub-settings-panel-padding: 1rem;
    --epub-settings-radius-panel: 18px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .epub-license-settings-card {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-lg);
    padding: var(--epub-settings-panel-padding);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--epub-settings-radius-panel);
    background: color-mix(in oklab, var(--background-primary), var(--background-secondary) 26%);
  }

  .epub-license-settings-header {
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-sm);
    min-width: 0;
  }

  .epub-license-settings-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--epub-settings-gap-lg);
  }

  .section-title {
    margin: 0;
    font-size: var(--epub-settings-font-size-title, var(--font-ui-medium, 1rem));
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.4;
  }

  .section-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .section-title.with-accent-bar::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: var(--radius-s, 2px);
  }

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .section-description {
    margin: 0;
    font-size: var(--epub-settings-font-size-desc, var(--font-ui-smaller, 0.85rem));
    color: var(--text-muted);
    line-height: 1.55;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .activation-form) {
    gap: 1.1rem;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child)) {
    display: grid;
    grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr);
    column-gap: var(--epub-settings-gap-lg);
    row-gap: var(--epub-settings-gap-sm);
    align-items: start;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-label) {
    display: block;
    grid-column: 1;
    padding-top: 0.4rem;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-hint) {
    display: none;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-input),
  .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-hint) {
    grid-column: 2;
    width: 100%;
  }

  .epub-license-settings-content :global(.enhanced-activation-form .action-section) {
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .epub-license-settings-card {
      padding: calc(var(--epub-settings-panel-padding) - 0.1rem);
      border-radius: var(--radius-l, 14px);
    }

    .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child)) {
      grid-template-columns: 1fr;
      row-gap: 0.25rem;
    }

    .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .input-label),
    .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-input),
    .epub-license-settings-content :global(.enhanced-activation-form .input-section:not(:first-child) .email-hint) {
      grid-column: 1;
    }

    .epub-license-settings-content :global(.enhanced-activation-form .action-section) {
      justify-content: center;
    }
  }

</style>
