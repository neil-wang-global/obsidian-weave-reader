import type { ReadingStats } from "./types";

export const EPUB_BOOKMARK_FILE_FORMAT_V1 = "weave-epub-bookmarks/v1";
export const EPUB_BOOKMARK_FILE_FORMAT_V2 = "weave-epub-bookmarks/v2";
export const EPUB_BOOKMARK_ACCEPTED_FORMATS = [
	EPUB_BOOKMARK_FILE_FORMAT_V1,
	EPUB_BOOKMARK_FILE_FORMAT_V2,
] as const;

export type EpubBookmarkReadingStatusCode = "unstarted" | "reading" | "finished";

export interface EpubBookmarkUserMetadata {
	tags?: string[];
	rating?: number | null;
	priority?: string;
	notes?: string;
}

export interface EpubBookmarkChapterHighlightCount {
	title: string;
	count: number;
}

export interface EpubBookmarkRecentExcerpt {
	chapterTitle: string;
	preview: string;
	notePath?: string;
	createdTime: number;
}

export interface EpubBookmarkAnalytics {
	updatedAt: number;
	highlightCount: number;
	highlightsByColor: Partial<Record<string, number>>;
	excerptNoteCount: number;
	commentCount: number;
	concealedCount: number;
	referenceHeatMax?: number;
	topChaptersByHighlights: EpubBookmarkChapterHighlightCount[];
	linkedNotePaths: string[];
	recentExcerpts?: EpubBookmarkRecentExcerpt[];
}

export interface EpubBookmarkExcerptIndexRow {
	chapterTitle: string;
	preview: string;
	notePath?: string;
	createdTime: number;
}

export interface EpubBookmarkFlatProperties {
	"reading-progress": number;
	"reading-status": EpubBookmarkReadingStatusCode;
	"reading-total-minutes": number;
	"reading-wpm": number;
	"highlight-count": number;
	"excerpt-note-count": number;
}

export interface EpubBookmarkReadingStatePayload {
	currentPosition: {
		chapterIndex: number;
		cfi: string;
		percent: number;
	};
	readingStats: ReadingStats;
}
