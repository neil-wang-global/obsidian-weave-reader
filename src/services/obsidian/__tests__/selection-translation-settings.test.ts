import { describe, expect, it } from "vitest";
import {
	listResolvedWebTranslationProviders,
	normalizeSelectionTranslationSettings,
} from "../../../config/selection-translation-settings";

describe("selection-translation-settings", () => {
	it("enables all built-in providers by default", () => {
		const providers = listResolvedWebTranslationProviders({
			settings: normalizeSelectionTranslationSettings(undefined),
			resolveBuiltinLabel: (provider) => provider.nameKey,
		});
		expect(providers.length).toBeGreaterThanOrEqual(4);
		expect(providers.some((provider) => provider.id === "google-translate")).toBe(true);
	});

	it("respects disabled built-in ids", () => {
		const providers = listResolvedWebTranslationProviders({
			settings: {
				disabledBuiltinIds: ["google-translate"],
				customProviders: [],
			},
			resolveBuiltinLabel: (provider) => provider.nameKey,
		});
		expect(providers.some((provider) => provider.id === "google-translate")).toBe(false);
	});

	it("includes enabled custom providers with {query} template", () => {
		const providers = listResolvedWebTranslationProviders({
			settings: {
				disabledBuiltinIds: [
					"google-translate",
					"deepl",
					"youdao-translate",
					"youdao-dict",
					"bing-translate",
					"baidu-translate",
				],
				customProviders: [
					{
						id: "custom-1",
						name: "My translator",
						urlTemplate: "https://example.com/?q={query}",
						enabled: true,
					},
				],
			},
			resolveBuiltinLabel: (provider) => provider.nameKey,
		});
		expect(providers).toEqual([
			expect.objectContaining({
				id: "custom-1",
				label: "My translator",
				builtin: false,
			}),
		]);
	});
});
