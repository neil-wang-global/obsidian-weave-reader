export type SupportedLanguage = "zh-CN" | "en-US" | "ja-JP" | "ko-KR";

export interface TranslationKey {
	[key: string]: string | TranslationKey;
}

export interface I18nConfig {
	defaultLanguage: SupportedLanguage;
	fallbackLanguage: SupportedLanguage;
	supportedLanguages: SupportedLanguage[];
}
