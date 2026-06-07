/**
 * Built-in web translation providers for selection toolbar.
 * URL templates must include `{query}` (URL-encoded on open).
 */
export interface BuiltinWebTranslationProviderDefinition {
	id: string;
	/** i18n key under epub.translationProviders.* */
	nameKey: string;
	urlTemplate: string;
	icon?: string;
}

export const BUILTIN_WEB_TRANSLATION_PROVIDERS: BuiltinWebTranslationProviderDefinition[] = [
	{
		id: "google-translate",
		nameKey: "googleTranslate",
		urlTemplate: "https://translate.google.com/?sl=auto&tl=zh-CN&op=translate&text={query}",
		icon: "languages",
	},
	{
		id: "deepl",
		nameKey: "deepl",
		urlTemplate: "https://www.deepl.com/translator#auto/zh/{query}",
		icon: "languages",
	},
	{
		id: "youdao-translate",
		nameKey: "youdaoTranslate",
		urlTemplate: "https://fanyi.youdao.com/index.html#/?query={query}",
		icon: "languages",
	},
	{
		id: "youdao-dict",
		nameKey: "youdaoDict",
		urlTemplate: "https://dict.youdao.com/result?word={query}&lang=en",
		icon: "book-open",
	},
	{
		id: "bing-translate",
		nameKey: "bingTranslate",
		urlTemplate: "https://www.bing.com/translator?text={query}",
		icon: "languages",
	},
	{
		id: "baidu-translate",
		nameKey: "baiduTranslate",
		urlTemplate: "https://fanyi.baidu.com/mtpe-individual/transText?query={query}&from=auto&to=zh",
		icon: "languages",
	},
];

export const BUILTIN_WEB_TRANSLATION_PROVIDER_IDS = new Set(
	BUILTIN_WEB_TRANSLATION_PROVIDERS.map((provider) => provider.id)
);
