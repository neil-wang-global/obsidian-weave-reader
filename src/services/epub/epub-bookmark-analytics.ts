import type { ReaderHighlightInput } from "./reader-engine-types";
import type {
	EpubBookmarkAnalytics,
	EpubBookmarkExcerptIndexRow,
} from "./epub-bookmark-page-types";

const HIGHLIGHT_COLORS = new Set(["yellow", "green", "blue", "red", "purple"]);

function isConcealedHighlight(highlight: ReaderHighlightInput): boolean {
	return highlight.presentation === "conceal" || highlight.color === "mask";
}

function normalizePreviewText(value: string, maxLength = 48): string {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized) {
		return "";
	}
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength)}…`;
}

export function buildEpubBookmarkAnalytics(
	highlights: ReaderHighlightInput[],
	now = Date.now()
): EpubBookmarkAnalytics {
	const highlightsByColor: Partial<Record<string, number>> = {};
	const chapterCounts = new Map<string, number>();
	const linkedNotePaths = new Set<string>();
	let highlightCount = 0;
	let commentCount = 0;
	let concealedCount = 0;
	let referenceHeatMax = 0;

	for (const highlight of highlights) {
		if (isConcealedHighlight(highlight)) {
			concealedCount += 1;
			continue;
		}

		highlightCount += 1;
		const color = String(highlight.color || "").trim().toLowerCase();
		if (HIGHLIGHT_COLORS.has(color)) {
			highlightsByColor[color] = (highlightsByColor[color] || 0) + 1;
		}

		if (String(highlight.commentText || "").trim()) {
			commentCount += 1;
		}

		const chapterTitle = String(highlight.chapterTitle || "").trim() || "未命名章节";
		chapterCounts.set(chapterTitle, (chapterCounts.get(chapterTitle) || 0) + 1);

		const sourceFile = String(highlight.sourceFile || "").trim();
		if (sourceFile) {
			linkedNotePaths.add(sourceFile);
		}

		const heat = typeof highlight.referenceHeat === "number" ? highlight.referenceHeat : 0;
		if (heat > referenceHeatMax) {
			referenceHeatMax = heat;
		}
	}

	const topChaptersByHighlights = Array.from(chapterCounts.entries())
		.map(([title, count]) => ({ title, count }))
		.sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, "zh-CN"))
		.slice(0, 5);

	const recentExcerpts = buildEpubBookmarkExcerptIndex(highlights).map((row) => ({
		chapterTitle: row.chapterTitle,
		preview: row.preview,
		notePath: row.notePath,
		createdTime: row.createdTime,
	}));

	return {
		updatedAt: now,
		highlightCount,
		highlightsByColor,
		excerptNoteCount: linkedNotePaths.size,
		commentCount,
		concealedCount,
		referenceHeatMax: referenceHeatMax > 0 ? referenceHeatMax : undefined,
		topChaptersByHighlights,
		linkedNotePaths: Array.from(linkedNotePaths)
			.sort((left, right) => left.localeCompare(right, "zh-CN"))
			.slice(0, 12),
		recentExcerpts,
	};
}

export function buildEpubBookmarkExcerptIndex(
	highlights: ReaderHighlightInput[],
	maxRows = 5
): EpubBookmarkExcerptIndexRow[] {
	const rows: EpubBookmarkExcerptIndexRow[] = [];

	for (const highlight of highlights) {
		if (isConcealedHighlight(highlight)) {
			continue;
		}
		const preview = normalizePreviewText(highlight.text || highlight.commentText || "");
		if (!preview) {
			continue;
		}
		rows.push({
			chapterTitle: String(highlight.chapterTitle || "").trim() || "未命名章节",
			preview,
			notePath: String(highlight.sourceFile || "").trim() || undefined,
			createdTime: typeof highlight.createdTime === "number" ? highlight.createdTime : 0,
		});
	}

	return rows
		.sort((left, right) => (right.createdTime || 0) - (left.createdTime || 0))
		.slice(0, maxRows);
}
