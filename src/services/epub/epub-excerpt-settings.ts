import type { EpubStrikethroughDisplayMode } from "./types";

export type BookNotesExportTargetMode = "new" | "append";
export type BookNotesExportLegacyTemplate = "classic" | "callout";
export type EpubChapterLocationFormat = "root" | "leaf" | "full";

export interface EpubExcerptSettings {
	addCreationTime: boolean;
	chapterLocationFormat: EpubChapterLocationFormat;
	strikethroughDisplayMode: EpubStrikethroughDisplayMode;
	showStrikethroughInSidebar: boolean;
	bookNotesExportTemplatePath: string | null;
	bookNotesExportTemplateFolder: string | null;
	bookNotesExportLegacyTemplate: BookNotesExportLegacyTemplate;
	bookNotesExportTargetMode: BookNotesExportTargetMode;
	bookNotesExportAppendPath: string | null;
	bookNotesExportTrimBlocks: boolean;
	bookNotesExportIncludeHighlight: boolean;
	bookNotesExportIncludeUnderline: boolean;
	bookNotesExportIncludeStrikethrough: boolean;
	bookNotesExportIncludeWavy: boolean;
}

export const DEFAULT_EPUB_EXCERPT_SETTINGS: EpubExcerptSettings = {
	addCreationTime: false,
	chapterLocationFormat: "leaf",
	strikethroughDisplayMode: "conceal",
	showStrikethroughInSidebar: false,
	bookNotesExportTemplatePath: null,
	bookNotesExportTemplateFolder: null,
	bookNotesExportLegacyTemplate: "classic",
	bookNotesExportTargetMode: "new",
	bookNotesExportAppendPath: null,
	bookNotesExportTrimBlocks: true,
	bookNotesExportIncludeHighlight: true,
	bookNotesExportIncludeUnderline: true,
	bookNotesExportIncludeStrikethrough: true,
	bookNotesExportIncludeWavy: true,
};
