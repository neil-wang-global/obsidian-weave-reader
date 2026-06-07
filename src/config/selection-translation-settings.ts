import {
	BUILTIN_WEB_TRANSLATION_PROVIDERS,
	BUILTIN_WEB_TRANSLATION_PROVIDER_IDS,
	type BuiltinWebTranslationProviderDefinition,
} from "./web-translation-providers";

export interface CustomWebTranslationProvider {
	id: string;
	name: string;
	urlTemplate: string;
	enabled: boolean;
}

export interface SelectionTranslationSettings {
	disabledBuiltinIds: string[];
	customProviders: CustomWebTranslationProvider[];
}

export interface ResolvedWebTranslationProvider {
	id: string;
	label: string;
	urlTemplate: string;
	icon: string;
	builtin: boolean;
}

export const DEFAULT_SELECTION_TRANSLATION_SETTINGS: SelectionTranslationSettings = {
	disabledBuiltinIds: [],
	customProviders: [],
};

export function normalizeSelectionTranslationSettings(
	value: unknown
): SelectionTranslationSettings {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_SELECTION_TRANSLATION_SETTINGS };
	}

	const record = value as Partial<SelectionTranslationSettings>;
	const disabledBuiltinIds = Array.isArray(record.disabledBuiltinIds)
		? record.disabledBuiltinIds
				.map((id) => String(id || "").trim())
				.filter((id) => BUILTIN_WEB_TRANSLATION_PROVIDER_IDS.has(id))
		: [];

	const customProviders: CustomWebTranslationProvider[] = [];
	if (Array.isArray(record.customProviders)) {
		for (const entry of record.customProviders) {
			if (!entry || typeof entry !== "object") {
				continue;
			}
			const item = entry as Partial<CustomWebTranslationProvider>;
			const id = String(item.id || "").trim() || `custom-${customProviders.length + 1}`;
			const name = String(item.name || "").trim();
			const urlTemplate = String(item.urlTemplate || "").trim();
			if (!name || !urlTemplate.includes("{query}")) {
				continue;
			}
			customProviders.push({
				id,
				name,
				urlTemplate,
				enabled: item.enabled !== false,
			});
		}
	}

	return {
		disabledBuiltinIds,
		customProviders,
	};
}

export function isBuiltinTranslationEnabled(
	settings: SelectionTranslationSettings,
	providerId: string
): boolean {
	if (!BUILTIN_WEB_TRANSLATION_PROVIDER_IDS.has(providerId)) {
		return false;
	}
	return !settings.disabledBuiltinIds.includes(providerId);
}

export function createCustomTranslationProvider(input?: {
	name?: string;
	urlTemplate?: string;
}): CustomWebTranslationProvider {
	return {
		id: `custom-${Date.now()}`,
		name: String(input?.name || "").trim() || "Custom",
		urlTemplate:
			String(input?.urlTemplate || "").trim() ||
			"https://translate.google.com/?sl=auto&tl=zh-CN&text={query}",
		enabled: true,
	};
}

export function listResolvedWebTranslationProviders(input: {
	settings: SelectionTranslationSettings;
	resolveBuiltinLabel: (provider: BuiltinWebTranslationProviderDefinition) => string;
}): ResolvedWebTranslationProvider[] {
	const providers: ResolvedWebTranslationProvider[] = [];

	for (const builtin of BUILTIN_WEB_TRANSLATION_PROVIDERS) {
		if (!isBuiltinTranslationEnabled(input.settings, builtin.id)) {
			continue;
		}
		providers.push({
			id: builtin.id,
			label: input.resolveBuiltinLabel(builtin),
			urlTemplate: builtin.urlTemplate,
			icon: builtin.icon || "languages",
			builtin: true,
		});
	}

	for (const custom of input.settings.customProviders) {
		if (!custom.enabled) {
			continue;
		}
		const name = String(custom.name || "").trim();
		const urlTemplate = String(custom.urlTemplate || "").trim();
		if (!name || !urlTemplate.includes("{query}")) {
			continue;
		}
		providers.push({
			id: custom.id,
			label: name,
			urlTemplate,
			icon: "globe",
			builtin: false,
		});
	}

	return providers;
}
