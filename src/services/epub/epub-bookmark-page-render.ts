import { isBookCompleted } from "./book-progress";
import type { EpubLinkService } from "./EpubLinkService";
import type {
	EpubBookmarkAnalytics,
	EpubBookmarkFlatProperties,
	EpubBookmarkReadingStatePayload,
	EpubBookmarkReadingStatusCode,
	EpubBookmarkUserMetadata,
} from "./epub-bookmark-page-types";
import { EPUB_BOOKMARK_FILE_FORMAT_V2 } from "./epub-bookmark-page-types";
import type { ReadingStats } from "./types";
import { unknownPlainText } from "../../utils/unknown-plain-text";

export const EPUB_BOOKMARK_PAGE_CALLOUT = [
	"> [!abstract] 关于本页",
	"> 这是 **Weave EPUB 阅读器** 自动维护的书籍数据页。",
	"> - **YAML 中** `readingState`、`bookmarks`、`analytics` → 插件写入，请勿手改",
	"> - **YAML 中** `user` 与下方「我的标注」→ 你可自由编辑，供 AI 与 Dataview 使用",
	"> - 高亮原文在摘录笔记中，本页只保留索引与统计",
].join("\n");

export interface EpubBookmarkPageBookmark {
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt: number;
	preview?: string;
}

export interface EpubBookmarkPageRenderInput {
	stableKey: string;
	bookId: string;
	sourceId?: string;
	sourceFingerprint?: string;
	bookPath: string;
	bookTitle: string;
	bookAuthor?: string;
	bookLanguage?: string;
	wordCount?: number;
	chapterCount?: number;
	updatedAt: number;
	bookmarks: EpubBookmarkPageBookmark[];
	readingState?: EpubBookmarkReadingStatePayload;
	analytics?: EpubBookmarkAnalytics;
	user?: EpubBookmarkUserMetadata;
}

export function resolveEpubBookmarkReadingStatus(
	readingState?: EpubBookmarkReadingStatePayload
): EpubBookmarkReadingStatusCode {
	const stats = readingState?.readingStats;
	if (isBookCompleted(stats)) {
		return "finished";
	}
	const percent = readingState?.currentPosition?.percent ?? 0;
	const lastReadTime = stats?.lastReadTime ?? 0;
	const totalReadTime = stats?.totalReadTime ?? 0;
	if (percent > 0 || lastReadTime > 0 || totalReadTime > 0) {
		return "reading";
	}
	return "unstarted";
}

export function buildEpubBookmarkFlatProperties(
	input: Pick<EpubBookmarkPageRenderInput, "readingState" | "analytics">
): EpubBookmarkFlatProperties {
	const stats = input.readingState?.readingStats;
	const percent = input.readingState?.currentPosition?.percent ?? 0;
	const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
	const totalMs = stats?.totalReadTime ?? 0;
	const totalMinutes = Number.isFinite(totalMs) ? Math.max(0, Math.round(totalMs / 60_000)) : 0;
	const bookWpm = stats?.bookWpm ?? 0;

	return {
		"reading-progress": isBookCompleted(stats) ? 100 : safePercent,
		"reading-status": resolveEpubBookmarkReadingStatus(input.readingState),
		"reading-total-minutes": totalMinutes,
		"reading-wpm": Number.isFinite(bookWpm) && bookWpm > 0 ? Math.round(bookWpm) : 0,
		"highlight-count": input.analytics?.highlightCount ?? 0,
		"excerpt-note-count": input.analytics?.excerptNoteCount ?? 0,
	};
}

export function sanitizeReadingStatsForBookmark(stats: ReadingStats): ReadingStats {
	return {
		totalReadTime: stats.totalReadTime,
		lastReadTime: stats.lastReadTime,
		createdTime: stats.createdTime,
		completedTime: stats.completedTime,
		bookWpm: stats.bookWpm,
		paceSampleCount: stats.paceSampleCount,
		paceSampleWords: stats.paceSampleWords,
	};
}

export function renderEpubBookmarkFileContent(
	input: EpubBookmarkPageRenderInput,
	linkService: EpubLinkService
): string {
	const flat = buildEpubBookmarkFlatProperties(input);
	const yamlPayload: Record<string, unknown> = {
		format: EPUB_BOOKMARK_FILE_FORMAT_V2,
		weave_epub_bookmark_file: true,
		stableKey: input.stableKey,
		bookId: input.bookId,
		sourceId: input.sourceId,
		sourceFingerprint: input.sourceFingerprint,
		bookPath: input.bookPath,
		bookTitle: input.bookTitle,
		bookAuthor: input.bookAuthor,
		bookLanguage: input.bookLanguage,
		wordCount: input.wordCount,
		chapterCount: input.chapterCount,
		...flat,
	};

	if (input.readingState) {
		yamlPayload.readingState = {
			currentPosition: input.readingState.currentPosition,
			readingStats: sanitizeReadingStatsForBookmark(input.readingState.readingStats),
		};
	}

	yamlPayload.bookmarks = input.bookmarks;

	if (input.analytics) {
		yamlPayload.analytics = input.analytics;
	}

	if (input.user && Object.keys(input.user).length > 0) {
		yamlPayload.user = input.user;
	}

	yamlPayload.updatedAt = input.updatedAt;

	const yamlText = stringifyYamlObject(yamlPayload);
	return `---\n${yamlText}\n---\n\n${renderEpubBookmarkBody(input, linkService, flat)}`;
}

function renderEpubBookmarkBody(
	input: EpubBookmarkPageRenderInput,
	linkService: EpubLinkService,
	flat: EpubBookmarkFlatProperties
): string {
	const lines: string[] = [EPUB_BOOKMARK_PAGE_CALLOUT, ""];
	const title = input.bookTitle || "EPUB 书籍";
	const author = String(input.bookAuthor || "").trim();
	const statusLabel = formatReadingStatusLabel(flat["reading-status"]);
	const progressLabel = `${flat["reading-progress"]}%`;

	lines.push(`# ${title}`, "");
	if (author) {
		lines.push(`*${author}* · \`${statusLabel}\` · 进度 **${progressLabel}**`, "");
	} else {
		lines.push(`\`${statusLabel}\` · 进度 **${progressLabel}**`, "");
	}

	lines.push(`[[${input.bookPath}|打开书籍]]`, "");
	lines.push("---", "");
	lines.push(...renderOverviewSection(input, flat));
	lines.push("");

	if (input.readingState) {
		lines.push(...renderContinueReadingTip(input.readingState));
		lines.push("");
	}

	lines.push(...renderBookmarksSection(input, linkService));
	lines.push("");

	const excerptRows = input.analytics?.recentExcerpts || [];
	if (excerptRows.length > 0) {
		lines.push(...renderExcerptIndexSection(excerptRows));
		lines.push("");
	}

	if (input.analytics && input.analytics.highlightCount > 0) {
		lines.push(...renderAnalyticsSection(input.analytics));
		lines.push("");
	}

	if (input.user && hasUserMetadata(input.user)) {
		lines.push(...renderUserNotesSection(input.user));
		lines.push("");
	}

	lines.push("---", "", `*${EPUB_BOOKMARK_FILE_FORMAT_V2} · 由 Weave EPUB 阅读器自动维护*`);
	return lines.join("\n").trimEnd();
}

function renderOverviewSection(
	input: EpubBookmarkPageRenderInput,
	flat: EpubBookmarkFlatProperties
): string[] {
	const stats = input.readingState?.readingStats;
	const lines = ["## 概览", "", "| | |", "| :-- | --: |"];
	lines.push(`| 累计阅读 | ${formatDurationMinutes(flat["reading-total-minutes"])} |`);

	if (flat["reading-wpm"] > 0) {
		lines.push(`| 阅读速度 | ${flat["reading-wpm"]} 字/分钟 |`);
	}

	lines.push(`| 高亮 | ${flat["highlight-count"]} 处 |`);
	lines.push(`| 关联笔记 | ${flat["excerpt-note-count"]} 篇 |`);
	lines.push(`| 书签 | ${input.bookmarks.length} 个 |`);

	const lastRead = formatTimestamp(stats?.lastReadTime ?? 0);
	if (lastRead) {
		lines.push(`| 最近阅读 | ${lastRead} |`);
	}

	return lines;
}

function renderContinueReadingTip(state: EpubBookmarkReadingStatePayload): string[] {
	const bookmark = state.currentPosition;
	const percent = formatPercent(bookmark.percent);
	const chapterIndex = bookmark.chapterIndex;
	const chapterLabel =
		chapterIndex >= 0 ? `第 ${chapterIndex + 1} 章` : "当前章节";

	return [
		"> [!tip] 继续阅读",
		`> 当前停在 **${chapterLabel}**（约 ${percent}）。`,
		"> 在 EPUB 阅读器中打开本书即可从上次位置继续。",
	];
}

function renderBookmarksSection(
	input: EpubBookmarkPageRenderInput,
	linkService: EpubLinkService
): string[] {
	const lines = ["## 书签", ""];

	if (input.bookmarks.length === 0) {
		lines.push("暂无书签");
		return lines;
	}

	for (const bookmark of input.bookmarks) {
		const chapterTitle = bookmark.chapterTitle || `第 ${bookmark.chapterIndex + 1} 章`;
		const pageLabel = buildPageLabel(bookmark);
		const createdLabel = formatTimestamp(bookmark.createdAt);
		const link = linkService.buildEpubLink(
			input.bookPath,
			bookmark.cfi,
			bookmark.chapterTitle,
			bookmark.chapterIndex,
			bookmark.chapterTitle,
			undefined,
			input.sourceId
		);

		lines.push(`> [!note]- ${chapterTitle}`);
		lines.push(`> **${pageLabel}** · ${createdLabel}`);
		lines.push(">");
		if (bookmark.preview) {
			lines.push(`> > ${normalizeInlineText(bookmark.preview)}`);
			lines.push(">");
		}
		lines.push(`> ${link}`);
		lines.push("");
	}

	return lines;
}

function renderExcerptIndexSection(
	rows: Array<{
		chapterTitle: string;
		preview: string;
		notePath?: string;
	}>
): string[] {
	const lines = [
		"## 摘录索引",
		"",
		"高亮全文保存在关联笔记中；此处仅列出最近条目。",
		"",
		"| 章节 | 摘录预览 | 笔记 |",
		"| :-- | :-- | :-- |",
	];

	for (const row of rows) {
		const noteCell = row.notePath ? `[[${row.notePath}]]` : "—";
		lines.push(`| ${row.chapterTitle} | ${row.preview} | ${noteCell} |`);
	}

	return lines;
}

function renderAnalyticsSection(analytics: EpubBookmarkAnalytics): string[] {
	const lines = [
		"## 阅读分析",
		"",
		"> [!info] 派生数据",
		"> 由插件根据 vault 内 EPUB 溯源链接定期汇总；权威计数见 YAML `analytics`。",
		"",
		"**高亮分布**",
		"",
		"| 颜色 | 数量 |",
		"| :-- | --: |",
	];

	const colorLabels: Record<string, string> = {
		yellow: "黄",
		green: "绿",
		blue: "蓝",
		red: "红",
		purple: "紫",
	};

	for (const [color, count] of Object.entries(analytics.highlightsByColor)) {
		if (!count) {
			continue;
		}
		lines.push(`| ${colorLabels[color] || color} | ${count} |`);
	}

	if (analytics.topChaptersByHighlights.length > 0) {
		lines.push("", "**高亮最多的章节**", "");
		analytics.topChaptersByHighlights.forEach((entry, index) => {
			lines.push(`${index + 1}. ${entry.title} — ${entry.count} 处`);
		});
	}

	if (typeof analytics.referenceHeatMax === "number" && analytics.referenceHeatMax > 0) {
		lines.push("", `**引用热度** · 最高单段被引用 **${analytics.referenceHeatMax}** 次`);
	}

	return lines;
}

function renderUserNotesSection(user: EpubBookmarkUserMetadata): string[] {
	const lines = [
		"## 我的标注",
		"",
		"> [!quote] 可编辑区",
		"> 以下内容不会被插件覆盖。",
		"",
	];

	const tags = Array.isArray(user.tags)
		? user.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
		: [];
	if (tags.length > 0) {
		lines.push(`**标签** ${tags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" ")}`, "");
	}

	if (typeof user.rating === "number" && user.rating > 0) {
		const rounded = Math.max(1, Math.min(5, Math.round(user.rating)));
		lines.push(`**评分** ${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}（${rounded} / 5）`, "");
	}

	if (user.priority) {
		lines.push(`**优先级** ${formatPriorityLabel(user.priority)}`, "");
	}

	const notes = String(user.notes || "").trim();
	if (notes) {
		lines.push("**备注**", "", notes, "");
	}

	return lines;
}

function hasUserMetadata(user: EpubBookmarkUserMetadata): boolean {
	return (
		(Array.isArray(user.tags) && user.tags.length > 0) ||
		(typeof user.rating === "number" && user.rating > 0) ||
		Boolean(String(user.priority || "").trim()) ||
		Boolean(String(user.notes || "").trim())
	);
}

function formatReadingStatusLabel(status: EpubBookmarkReadingStatusCode): string {
	switch (status) {
		case "finished":
			return "已读完";
		case "reading":
			return "阅读中";
		default:
			return "未开始";
	}
}

function formatPriorityLabel(priority: string): string {
	switch (priority) {
		case "high":
			return "高";
		case "low":
			return "低";
		default:
			return "中";
	}
}

function formatDurationMinutes(totalMinutes: number): string {
	const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, totalMinutes) : 0;
	if (safeMinutes < 60) {
		return `${safeMinutes} 分钟`;
	}
	const hours = Math.floor(safeMinutes / 60);
	const minutes = safeMinutes % 60;
	return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

function buildPageLabel(bookmark: EpubBookmarkPageBookmark): string {
	if (typeof bookmark.pageNumber === "number" && bookmark.pageNumber > 0) {
		if (typeof bookmark.totalPages === "number" && bookmark.totalPages >= bookmark.pageNumber) {
			return `第 ${bookmark.pageNumber} / ${bookmark.totalPages} 页`;
		}
		return `第 ${bookmark.pageNumber} 页`;
	}
	return `进度 ${formatPercent(bookmark.percent)}`;
}

function formatPercent(percent: number): string {
	const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
	return `${Math.round(safe)}%`;
}

function formatTimestamp(timestamp: number): string {
	if (!timestamp) {
		return "";
	}
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeInlineText(value: string): string {
	return String(value || "")
		.replace(/\s+/g, " ")
		.trim();
}

function stringifyYamlObject(value: Record<string, unknown>, indent = ""): string {
	const lines: string[] = [];
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined) {
			continue;
		}
		appendYamlProperty(lines, key, entry, indent);
	}
	return lines.join("\n");
}

function appendYamlProperty(lines: string[], key: string, value: unknown, indent: string): void {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push(`${indent}${key}: []`);
			return;
		}
		lines.push(`${indent}${key}:`);
		for (const item of value) {
			appendYamlArrayItem(lines, item, `${indent}  `);
		}
		return;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).filter(
			([, entry]) => entry !== undefined
		);
		if (entries.length === 0) {
			lines.push(`${indent}${key}: {}`);
			return;
		}
		lines.push(`${indent}${key}:`);
		for (const [childKey, childValue] of entries) {
			appendYamlProperty(lines, childKey, childValue, `${indent}  `);
		}
		return;
	}
	lines.push(`${indent}${key}: ${formatYamlScalar(value)}`);
}

function appendYamlArrayItem(lines: string[], value: unknown, indent: string): void {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push(`${indent}- []`);
			return;
		}
		lines.push(`${indent}-`);
		for (const item of value) {
			appendYamlArrayItem(lines, item, `${indent}  `);
		}
		return;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).filter(
			([, entry]) => entry !== undefined
		);
		if (entries.length === 0) {
			lines.push(`${indent}- {}`);
			return;
		}
		const [firstKey, firstValue] = entries[0];
		if (Array.isArray(firstValue) || (firstValue && typeof firstValue === "object")) {
			lines.push(`${indent}- ${firstKey}:`);
			appendComplexYamlValue(lines, firstValue, `${indent}    `);
		} else {
			lines.push(`${indent}- ${firstKey}: ${formatYamlScalar(firstValue)}`);
		}
		for (const [key, entry] of entries.slice(1)) {
			appendYamlProperty(lines, key, entry, `${indent}  `);
		}
		return;
	}
	lines.push(`${indent}- ${formatYamlScalar(value)}`);
}

function appendComplexYamlValue(lines: string[], value: unknown, indent: string): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			appendYamlArrayItem(lines, item, indent);
		}
		return;
	}
	if (value && typeof value === "object") {
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			if (entry === undefined) {
				continue;
			}
			appendYamlProperty(lines, key, entry, indent);
		}
	}
}

function formatYamlScalar(value: unknown): string {
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : "0";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (value == null) {
		return "null";
	}
	return JSON.stringify(unknownPlainText(value));
}
