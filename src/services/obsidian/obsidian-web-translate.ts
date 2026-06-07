import type { App } from "obsidian";
import {
	listResolvedWebTranslationProviders,
	normalizeSelectionTranslationSettings,
	type ResolvedWebTranslationProvider,
	type SelectionTranslationSettings,
} from "../../config/selection-translation-settings";
import type { BuiltinWebTranslationProviderDefinition } from "../../config/web-translation-providers";
import { getEpubRuntime } from "../epub/epub-runtime";
import { buildWebUrlFromTemplate, openObsidianWebUrl } from "./obsidian-open-web-url";

type PluginWithSelectionTranslation = {
	settings?: {
		selectionTranslation?: unknown;
	};
};

export async function openWebTranslationProvider(
	app: App,
	provider: ResolvedWebTranslationProvider,
	query: string
): Promise<boolean> {
	const url = buildWebUrlFromTemplate(provider.urlTemplate, query);
	if (!url) {
		return false;
	}
	return openObsidianWebUrl(app, url);
}

export function readSelectionTranslationSettings(app: App): SelectionTranslationSettings {
	const pluginId = getEpubRuntime().pluginId;
	const plugin = (app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins
		?.getPlugin?.(pluginId) as PluginWithSelectionTranslation | null;
	return normalizeSelectionTranslationSettings(plugin?.settings?.selectionTranslation);
}

export function listActiveWebTranslationProviders(input: {
	app: App;
	resolveBuiltinLabel: (provider: BuiltinWebTranslationProviderDefinition) => string;
}): ResolvedWebTranslationProvider[] {
	return listResolvedWebTranslationProviders({
		settings: readSelectionTranslationSettings(input.app),
		resolveBuiltinLabel: input.resolveBuiltinLabel,
	});
}

export type { SelectionTranslationSettings, ResolvedWebTranslationProvider };
