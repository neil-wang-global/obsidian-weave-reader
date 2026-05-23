import type { SupportedLanguage, TranslationKey } from './types';
import {
	appShellEpubTranslations,
	appShellEpubTranslationOverrides,
} from './resources/app-shell-epub';
import { epubTranslations, epubTranslationOverrides } from './resources/epub';

export const translations: Record<SupportedLanguage, TranslationKey> = {
	'zh-CN': {
		...appShellEpubTranslations['zh-CN'],
		...epubTranslations['zh-CN'],
	},
	'en-US': {
		...appShellEpubTranslations['en-US'],
		...epubTranslations['en-US'],
	},
};

export const translationOverrides: Partial<Record<SupportedLanguage, TranslationKey>> = {
	'zh-CN': {
		...appShellEpubTranslationOverrides['zh-CN'],
		...epubTranslationOverrides['zh-CN'],
	},
	'en-US': {
		...appShellEpubTranslationOverrides['en-US'],
		...epubTranslationOverrides['en-US'],
	},
};
