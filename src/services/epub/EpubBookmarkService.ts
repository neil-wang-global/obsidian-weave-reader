import { App, TFile, normalizePath, parseYaml } from "obsidian";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { getCompatiblePlugin } from "../../utils/plugin-access";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { EpubLinkService } from "./EpubLinkService";
import { getEpubRuntime } from "./epub-runtime";
import { normalizeReadingPaceStats } from "./reading-pace";
import type { EpubBook, ReadingPosition, ReadingStats } from "./types";

export const DEFAULT_EPUB_BOOKMARK_FOLDER = "weave/epub-bookmarks";
const EPUB_BOOKMARK_FILE_FORMAT = "weave-epub-bookmarks/v1";

/** Obsidian callout shown at the top of every EPUB bookmark file. */
export const EPUB_BOOKMARK_AUTO_MAINTAINED_CALLOUT = [
	"> [!warning] 自动维护 · 请勿手动编辑",
	"> 本页 YAML 前置元数据中的 `readingState` 字段（阅读进度与阅读统计）由 **Weave EPUB 阅读器** 自动写入。",
	"> 手动修改可能导致剩余阅读时间不准、进度冲突或数据损坏。请回到阅读器中阅读以更新数据。",
].join("\n");

export interface EpubBookmarkReadingState {
	currentPosition: ReadingPosition;
	readingStats: ReadingStats;
}

export interface EpubBookmarkRecord {
	id: string;
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt: number;
	preview?: string;
}

export interface EpubBookmarkCreateInput {
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt?: number;
	preview?: string;
}

export interface EpubBookmarkWriteResult {
	bookmark: EpubBookmarkRecord;
	created: boolean;
	filePath: string;
}

interface EpubBookmarkFileFrontmatter {
	format: string;
	weave_epub_bookmark_file: boolean;
	stableKey: string;
	bookId: string;
	sourceId?: string;
	sourceFingerprint?: string;
	bookPath: string;
	bookTitle: string;
	bookAuthor?: string;
	updatedAt: number;
	bookmarks: EpubBookmarkRecord[];
	readingState?: EpubBookmarkReadingState;
}

export function normalizeEpubBookmarkFolderPath(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	if (!normalized) {
		return "";
	}
	return normalizePath(normalized);
}

export function getEpubBookmarkFolderDisplayPath(value: unknown): string {
	const normalized = normalizeEpubBookmarkFolderPath(value);
	return normalized || "/";
}

export class EpubBookmarkService {
	private app: App;
	private linkService: EpubLinkService;

	constructor(app: App) {
		this.app = app;
		this.linkService = new EpubLinkService(app);
	}

	getBookmarkFolder(): string {
		const runtimePluginId = getEpubRuntime().pluginId;
		const pluginLookup = this.app as App & {
			plugins?: {
				getPlugin?: (id: string) => { settings?: { bookmarkFolder?: string } } | null;
			};
		};
		const plugin =
			pluginLookup.plugins?.getPlugin?.(runtimePluginId) ??
			(getCompatiblePlugin(pluginLookup as any) as { settings?: { bookmarkFolder?: string } } | null);
		return (
			normalizeEpubBookmarkFolderPath(plugin?.settings?.bookmarkFolder) ||
			DEFAULT_EPUB_BOOKMARK_FOLDER
		);
	}

	async loadBookmarksForBook(book: EpubBook): Promise<EpubBookmarkRecord[]> {
		const fileData = await this.readBookmarkFileForBook(book);
		if (!fileData) {
			return [];
		}
		return [...fileData.bookmarks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	async getBookmarkCountForBook(book: EpubBook): Promise<number> {
		return (await this.loadBookmarksForBook(book)).length;
	}

	async addBookmark(
		book: EpubBook,
		input: EpubBookmarkCreateInput
	): Promise<EpubBookmarkWriteResult> {
		const filePath = await this.resolveBookmarkFilePath(book);
		const existing =
			(await this.readBookmarkFileByPath(filePath)) ?? this.createEmptyFileFrontmatter(book);
		const normalizedBookmark = this.normalizeBookmarkRecord(
			{
				...input,
				id: this.createBookmarkId(existing.stableKey, input.cfi, input.createdAt ?? Date.now()),
			},
			existing.stableKey
		);
		if (!normalizedBookmark) {
			throw new Error("Invalid EPUB bookmark payload");
		}

		const normalizedCfi = EpubLinkService.normalizeCfi(normalizedBookmark.cfi);
		const existingIndex = existing.bookmarks.findIndex(
			(bookmark) => EpubLinkService.normalizeCfi(bookmark.cfi) === normalizedCfi
		);
		let created = false;
		let bookmark = normalizedBookmark;

		if (existingIndex >= 0) {
			const preserved = existing.bookmarks[existingIndex];
			bookmark = {
				...normalizedBookmark,
				id: preserved.id,
				createdAt: preserved.createdAt,
			};
			existing.bookmarks[existingIndex] = bookmark;
		} else {
			created = true;
			existing.bookmarks = [bookmark, ...existing.bookmarks];
		}

		existing.bookId = String(book.id || "").trim();
		existing.sourceId = typeof book.sourceId === "string" ? book.sourceId : undefined;
		existing.sourceFingerprint =
			typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined;
		existing.bookPath = normalizePath(String(book.filePath || "").trim());
		existing.bookTitle = this.resolveBookTitle(book);
		existing.bookAuthor = this.resolveBookAuthor(book);
		existing.updatedAt = Date.now();
		existing.bookmarks = existing.bookmarks
			.filter((item) => Boolean(item.cfi))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

		await this.writeBookmarkFile(filePath, existing);
		return {
			bookmark,
			created,
			filePath,
		};
	}

	async deleteBookmark(book: EpubBook, bookmarkId: string): Promise<boolean> {
		const normalizedBookmarkId = String(bookmarkId || "").trim();
		if (!normalizedBookmarkId) {
			return false;
		}

		const filePath = await this.findCompatibleBookmarkFilePath(book);
		if (!filePath) {
			return false;
		}

		const existing = await this.readBookmarkFileByPath(filePath);
		if (!existing) {
			return false;
		}

		const nextBookmarks = existing.bookmarks.filter(
			(bookmark) => String(bookmark.id || "").trim() !== normalizedBookmarkId
		);
		if (nextBookmarks.length === existing.bookmarks.length) {
			return false;
		}

		existing.bookmarks = nextBookmarks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
		existing.updatedAt = Date.now();
		await this.writeBookmarkFile(filePath, existing);
		return true;
	}

	async readReadingState(book: EpubBook): Promise<EpubBookmarkReadingState | null> {
		const fileData = await this.readBookmarkFileForBook(book);
		return fileData?.readingState ?? null;
	}

	async writeReadingState(
		book: EpubBook,
		state: EpubBookmarkReadingState
	): Promise<string> {
		const filePath = await this.resolveBookmarkFilePath(book);
		const existing =
			(await this.readBookmarkFileByPath(filePath)) || this.createEmptyFileFrontmatter(book);
		const nextFrontmatter: EpubBookmarkFileFrontmatter = {
			...existing,
			stableKey: this.buildStableKey(book),
			bookId: String(book.id || "").trim(),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			bookPath: normalizePath(String(book.filePath || "").trim()),
			bookTitle: this.resolveBookTitle(book),
			bookAuthor: this.resolveBookAuthor(book),
			updatedAt: Date.now(),
			readingState: this.normalizeReadingState(state),
		};
		await this.writeBookmarkFile(filePath, nextFrontmatter);
		return filePath;
	}

	async updateBookFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(String(oldPath || "").trim());
		const normalizedNewPath = normalizePath(String(newPath || "").trim());
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const folderPath = this.getBookmarkFolder();
		const candidates = this.app.vault
			.getFiles()
			.filter(
				(file) => file.extension === "md" && this.isBookmarkFileInsideFolder(file.path, folderPath)
			);
		let updated = 0;

		for (const file of candidates) {
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData || normalizePath(fileData.bookPath) !== normalizedOldPath) {
				continue;
			}
			fileData.bookPath = normalizedNewPath;
			fileData.updatedAt = Date.now();
			await this.writeBookmarkFile(file.path, fileData);
			updated += 1;
		}

		return updated;
	}

	private async readBookmarkFileForBook(
		book: EpubBook
	): Promise<EpubBookmarkFileFrontmatter | null> {
		const filePath = await this.findCompatibleBookmarkFilePath(book);
		if (!filePath) {
			return null;
		}
		const canonicalPath = await this.migrateBookmarkFileForBook(book, filePath);
		return await this.readBookmarkFileByPath(canonicalPath || filePath);
	}

	private async resolveBookmarkFilePath(book: EpubBook): Promise<string> {
		const existingPath = await this.findCompatibleBookmarkFilePath(book);
		if (!existingPath) {
			return this.getPreferredBookmarkFilePath(book);
		}
		return (await this.migrateBookmarkFileForBook(book, existingPath)) || existingPath;
	}

	private getPreferredBookmarkFilePath(book: EpubBook): string {
		const folderPath = this.getBookmarkFolder();
		const titleSegment = sanitizeForSync(this.resolveBookTitle(book), 64);
		const stableKey = this.buildStableKey(book);
		const fileName = `${titleSegment || "EPUB"}--${stableKey}.md`;
		return folderPath ? normalizePath(`${folderPath}/${fileName}`) : fileName;
	}

	private async findExistingBookmarkFilePath(book: EpubBook): Promise<string | null> {
		const preferredPath = this.getPreferredBookmarkFilePath(book);
		if (await this.app.vault.adapter.exists(preferredPath)) {
			return preferredPath;
		}
		const stableKey = this.buildStableKey(book);
		const suffix = `--${stableKey}.md`;
		const folderPath = this.getBookmarkFolder();
		const match = this.app.vault
			.getFiles()
			.find(
				(file) =>
					file.extension === "md" &&
					this.isBookmarkFileInsideFolder(file.path, folderPath) &&
					file.name.endsWith(suffix)
			);
		return match?.path ?? null;
	}

	private async findCompatibleBookmarkFilePath(book: EpubBook): Promise<string | null> {
		const preferredPath = await this.findExistingBookmarkFilePath(book);
		if (preferredPath) {
			return preferredPath;
		}

		const normalizedBookPath = normalizePath(String(book.filePath || "").trim());
		const normalizedSourceFingerprint = String(book.sourceFingerprint || "").trim();
		const normalizedSourceId = String(book.sourceId || "").trim();
		const normalizedBookId = String(book.id || "").trim();
		const folderPath = this.getBookmarkFolder();

		for (const file of this.app.vault.getFiles()) {
			if (
				file.extension !== "md" ||
				!this.isBookmarkFileInsideFolder(file.path, folderPath)
			) {
				continue;
			}
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData) {
				continue;
			}
			if (
				normalizePath(String(fileData.bookPath || "").trim()) === normalizedBookPath ||
				(normalizedSourceFingerprint &&
					String(fileData.sourceFingerprint || "").trim() === normalizedSourceFingerprint) ||
				(normalizedSourceId && String(fileData.sourceId || "").trim() === normalizedSourceId) ||
				(normalizedBookId && String(fileData.bookId || "").trim() === normalizedBookId)
			) {
				return file.path;
			}
		}

		return null;
	}

	private isBookmarkFileInsideFolder(filePath: string, folderPath: string): boolean {
		const normalizedFilePath = normalizePath(String(filePath || "").trim());
		const normalizedFolderPath = normalizeEpubBookmarkFolderPath(folderPath);
		if (!normalizedFolderPath) {
			return !normalizedFilePath.includes("/");
		}
		const parentPath = normalizedFilePath.split("/").slice(0, -1).join("/");
		return parentPath === normalizedFolderPath;
	}

	private buildStableKey(book: EpubBook): string {
		const raw =
			String(book.sourceFingerprint || "").trim() ||
			String(book.sourceId || "").trim() ||
			String(book.id || "").trim() ||
			this.resolveBookTitle(book);
		return sanitizeForSync(raw, 56) || "epub-book";
	}

	private async migrateBookmarkFileForBook(
		book: EpubBook,
		filePath: string
	): Promise<string | null> {
		const current = await this.readBookmarkFileByPath(filePath);
		if (!current) {
			return null;
		}

		const preferredPath = this.getPreferredBookmarkFilePath(book);
		const nextStableKey = this.buildStableKey(book);
		const normalizedCurrentPath = normalizePath(String(filePath || "").trim());
		const normalizedPreferredPath = normalizePath(String(preferredPath || "").trim());
		const nextFrontmatter: EpubBookmarkFileFrontmatter = {
			...current,
			stableKey: nextStableKey,
			bookId: String(book.id || "").trim(),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			bookPath: normalizePath(String(book.filePath || "").trim()),
			bookTitle: this.resolveBookTitle(book),
			bookAuthor: this.resolveBookAuthor(book),
			updatedAt: Date.now(),
			bookmarks: this.normalizeBookmarkRecords(current.bookmarks, nextStableKey),
		};

		if (normalizedCurrentPath === normalizedPreferredPath) {
			await this.writeBookmarkFile(normalizedPreferredPath, nextFrontmatter);
			return normalizedPreferredPath;
		}

		const existingPreferred = await this.readBookmarkFileByPath(normalizedPreferredPath);
		if (existingPreferred) {
			nextFrontmatter.bookmarks = this.mergeBookmarkRecords(
				existingPreferred.bookmarks,
				nextFrontmatter.bookmarks,
				nextStableKey
			);
		}

		await this.writeBookmarkFile(normalizedPreferredPath, nextFrontmatter);
		await this.app.vault.adapter.remove(normalizedCurrentPath);
		return normalizedPreferredPath;
	}

	private mergeBookmarkRecords(
		existing: EpubBookmarkRecord[],
		incoming: EpubBookmarkRecord[],
		stableKey: string
	): EpubBookmarkRecord[] {
		const merged = new Map<string, EpubBookmarkRecord>();
		for (const item of [...existing, ...incoming]) {
			const normalized = this.normalizeBookmarkRecord(item, stableKey);
			if (!normalized) {
				continue;
			}
			const key = EpubLinkService.normalizeCfi(normalized.cfi);
			const current = merged.get(key);
			if (!current || (normalized.createdAt || 0) >= (current.createdAt || 0)) {
				merged.set(key, normalized);
			}
		}
		return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	private resolveBookTitle(book: EpubBook): string {
		return (
			String(book.metadata?.title || "").trim() ||
			EpubLinkService.extractShortBookName(String(book.filePath || "").trim()) ||
			"EPUB"
		);
	}

	private resolveBookAuthor(book: EpubBook): string | undefined {
		const author = String(book.metadata?.author || "").trim();
		return author || undefined;
	}

	private createEmptyFileFrontmatter(book: EpubBook): EpubBookmarkFileFrontmatter {
		return {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey: this.buildStableKey(book),
			bookId: String(book.id || "").trim(),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			bookPath: normalizePath(String(book.filePath || "").trim()),
			bookTitle: this.resolveBookTitle(book),
			bookAuthor: this.resolveBookAuthor(book),
			updatedAt: Date.now(),
			bookmarks: [],
		};
	}

	private createBookmarkId(stableKey: string, cfi: string, createdAt: number): string {
		const seed = `${stableKey}::${createdAt}::${cfi}`;
		return `epub-bm-${this.hashString(seed).toString(36)}`;
	}

	private hashString(value: string): number {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
		}
		return hash;
	}

	private async readBookmarkFileByPath(
		filePath: string
	): Promise<EpubBookmarkFileFrontmatter | null> {
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (!(existing instanceof TFile)) {
			return null;
		}
		try {
			const content = await this.app.vault.read(existing);
			return this.parseBookmarkFileContent(content);
		} catch (error) {
			logger.warn("[EpubBookmarkService] Failed to read bookmark file:", error);
			return null;
		}
	}

	private parseBookmarkFileContent(content: string): EpubBookmarkFileFrontmatter | null {
		const match = String(content || "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
		if (!match) {
			return null;
		}
		try {
			const parsed = parseYaml(match[1]);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return null;
			}
			return this.normalizeBookmarkFileFrontmatter(parsed as Record<string, unknown>);
		} catch (error) {
			logger.warn("[EpubBookmarkService] Failed to parse bookmark frontmatter:", error);
			return null;
		}
	}

	private normalizeBookmarkFileFrontmatter(
		value: Record<string, unknown>
	): EpubBookmarkFileFrontmatter | null {
		const format = String(value.format || "").trim();
		const stableKey = String(value.stableKey || "").trim();
		const bookId = String(value.bookId || "").trim();
		const bookPath = normalizePath(String(value.bookPath || "").trim());
		const bookTitle = String(value.bookTitle || "").trim();
		if ((format && format !== EPUB_BOOKMARK_FILE_FORMAT) || !stableKey || !bookPath) {
			return null;
		}
		return {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey,
			bookId,
			sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
			sourceFingerprint:
				typeof value.sourceFingerprint === "string" ? value.sourceFingerprint : undefined,
			bookPath,
			bookTitle,
			bookAuthor: typeof value.bookAuthor === "string" ? value.bookAuthor : undefined,
			updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
			bookmarks: this.normalizeBookmarkRecords(value.bookmarks, stableKey),
			readingState: this.normalizeReadingState(value.readingState) || undefined,
		};
	}

	private normalizeReadingState(value: unknown): EpubBookmarkReadingState | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const currentPosition = this.normalizeReadingPosition(record.currentPosition);
		const readingStats = this.normalizeReadingStats(record.readingStats);
		if (!currentPosition && !readingStats) {
			return null;
		}
		const now = Date.now();
		return {
			currentPosition: currentPosition ?? { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats:
				readingStats ?? normalizeReadingPaceStats({ createdTime: now, lastReadTime: now }),
		};
	}

	private normalizeReadingPosition(value: unknown): ReadingPosition | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const position = value as Partial<ReadingPosition>;
		const cfi = String(position.cfi || "").trim();
		if (!cfi && typeof position.percent !== "number") {
			return null;
		}
		return {
			chapterIndex: typeof position.chapterIndex === "number" ? position.chapterIndex : 0,
			cfi,
			percent: typeof position.percent === "number" ? position.percent : 0,
		};
	}

	private normalizeReadingStats(value: unknown): ReadingStats | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		return normalizeReadingPaceStats(value as Partial<ReadingStats>);
	}

	private normalizeBookmarkRecords(value: unknown, stableKey: string): EpubBookmarkRecord[] {
		if (!Array.isArray(value)) {
			return [];
		}
		return value
			.map((item) => this.normalizeBookmarkRecord(item, stableKey))
			.filter((item): item is EpubBookmarkRecord => Boolean(item))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	private normalizeBookmarkRecord(value: unknown, stableKey: string): EpubBookmarkRecord | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const cfi = EpubLinkService.normalizeCfi(String(record.cfi || "").trim());
		if (!cfi) {
			return null;
		}
		const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
		const chapterTitle = String(record.chapterTitle || "").trim();
		return {
			id:
				typeof record.id === "string" && record.id.trim().length > 0
					? record.id.trim()
					: this.createBookmarkId(stableKey, cfi, createdAt),
			cfi,
			chapterIndex: typeof record.chapterIndex === "number" ? record.chapterIndex : 0,
			percent: typeof record.percent === "number" ? record.percent : 0,
			chapterTitle,
			pageNumber: typeof record.pageNumber === "number" ? record.pageNumber : undefined,
			totalPages: typeof record.totalPages === "number" ? record.totalPages : undefined,
			createdAt,
			preview: typeof record.preview === "string" ? record.preview : undefined,
		};
	}

	private async writeBookmarkFile(
		filePath: string,
		frontmatter: EpubBookmarkFileFrontmatter
	): Promise<void> {
		const content = this.renderBookmarkFileContent(frontmatter);
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, filePath);
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			return;
		}
		await this.app.vault.create(filePath, content);
	}

	private renderBookmarkFileContent(frontmatter: EpubBookmarkFileFrontmatter): string {
		const yamlPayload: Record<string, unknown> = {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey: frontmatter.stableKey,
			bookId: frontmatter.bookId,
			sourceId: frontmatter.sourceId,
			sourceFingerprint: frontmatter.sourceFingerprint,
			bookPath: frontmatter.bookPath,
			bookTitle: frontmatter.bookTitle,
			bookAuthor: frontmatter.bookAuthor,
			updatedAt: frontmatter.updatedAt,
			bookmarks: frontmatter.bookmarks,
		};
		if (frontmatter.readingState) {
			yamlPayload.readingState = {
				currentPosition: frontmatter.readingState.currentPosition,
				readingStats: frontmatter.readingState.readingStats,
			};
		}
		const yamlText = this.stringifyYamlObject(yamlPayload);
		return `---\n${yamlText}\n---\n\n${this.renderBookmarkBody(frontmatter)}`;
	}

	private renderBookmarkBody(frontmatter: EpubBookmarkFileFrontmatter): string {
		const lines: string[] = [EPUB_BOOKMARK_AUTO_MAINTAINED_CALLOUT, ""];
		lines.push(`# ${frontmatter.bookTitle || "EPUB 书签"}`, "");
		if (frontmatter.readingState) {
			lines.push(...this.renderReadingStateSummary(frontmatter.readingState));
			lines.push("");
		}
		if (frontmatter.bookmarks.length === 0) {
			lines.push("## 书签", "", "暂无书签");
			return lines.join("\n").trimEnd();
		}
		lines.push("## 书签", "");
		for (const bookmark of frontmatter.bookmarks) {
			const chapterTitle = bookmark.chapterTitle || `第 ${bookmark.chapterIndex + 1} 章`;
			const pageLabel = this.buildPageLabel(bookmark);
			const createdLabel = this.formatTimestamp(bookmark.createdAt);
			const link = this.linkService.buildEpubLink(
				frontmatter.bookPath,
				bookmark.cfi,
				bookmark.chapterTitle,
				bookmark.chapterIndex,
				bookmark.chapterTitle,
				undefined,
				frontmatter.sourceId
			);
			lines.push(`## ${chapterTitle}`);
			lines.push("");
			lines.push(`- 页位：${pageLabel}`);
			lines.push(`- 创建：${createdLabel}`);
			lines.push(`- 跳转：${link}`);
			if (bookmark.preview) {
				lines.push(`- 预览：${this.normalizeInlineText(bookmark.preview)}`);
			}
			lines.push("");
		}
		return lines.join("\n").trimEnd();
	}

	private renderReadingStateSummary(state: EpubBookmarkReadingState): string[] {
		const stats = state.readingStats;
		const lines: string[] = [
			"## 阅读状态摘要",
			"",
			"> [!note] 以下为自动生成的可读摘要；权威数据以页面顶部 YAML 中的 `readingState` 为准。",
			"",
			`| 项目 | 值 |`,
			`| --- | --- |`,
			`| 阅读进度 | ${this.formatPercent(state.currentPosition.percent)} |`,
			`| 累计阅读 | ${this.formatDurationMs(stats.totalReadTime)} |`,
		];
		if (typeof stats.bookWpm === "number" && stats.bookWpm > 0) {
			lines.push(`| 本书阅读速度 | ${Math.round(stats.bookWpm)} 字/分钟 |`);
		}
		if ((stats.paceSampleCount || 0) > 0) {
			lines.push(`| 速度采样次数 | ${stats.paceSampleCount} |`);
		}
		const lastRead = this.formatTimestamp(stats.lastReadTime);
		if (lastRead) {
			lines.push(`| 最近阅读 | ${lastRead} |`);
		}
		return lines;
	}

	private formatDurationMs(ms: number): string {
		const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
		const totalMinutes = Math.max(1, Math.round(safeMs / 60_000));
		if (totalMinutes < 60) {
			return `${totalMinutes} 分钟`;
		}
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
	}

	private buildPageLabel(bookmark: EpubBookmarkRecord): string {
		if (typeof bookmark.pageNumber === "number" && bookmark.pageNumber > 0) {
			if (typeof bookmark.totalPages === "number" && bookmark.totalPages >= bookmark.pageNumber) {
				return `第 ${bookmark.pageNumber} / ${bookmark.totalPages} 页`;
			}
			return `第 ${bookmark.pageNumber} 页`;
		}
		return `进度 ${this.formatPercent(bookmark.percent)}`;
	}

	private formatPercent(percent: number): string {
		const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
		return `${Math.round(safe)}%`;
	}

	private formatTimestamp(timestamp: number): string {
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

	private normalizeInlineText(value: string): string {
		return String(value || "")
			.replace(/\s+/g, " ")
			.trim();
	}

	private stringifyYamlObject(value: Record<string, unknown>, indent = ""): string {
		const lines: string[] = [];
		for (const [key, entry] of Object.entries(value)) {
			if (entry === undefined) {
				continue;
			}
			this.appendYamlProperty(lines, key, entry, indent);
		}
		return lines.join("\n");
	}

	private appendYamlProperty(lines: string[], key: string, value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${indent}${key}: []`);
				return;
			}
			lines.push(`${indent}${key}:`);
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, `${indent}  `);
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
				this.appendYamlProperty(lines, childKey, childValue, `${indent}  `);
			}
			return;
		}
		lines.push(`${indent}${key}: ${this.formatYamlScalar(value)}`);
	}

	private appendYamlArrayItem(lines: string[], value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${indent}- []`);
				return;
			}
			lines.push(`${indent}-`);
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, `${indent}  `);
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
				this.appendComplexYamlValue(lines, firstValue, `${indent}    `);
			} else {
				lines.push(`${indent}- ${firstKey}: ${this.formatYamlScalar(firstValue)}`);
			}
			for (const [key, entry] of entries.slice(1)) {
				this.appendYamlProperty(lines, key, entry, `${indent}  `);
			}
			return;
		}
		lines.push(`${indent}- ${this.formatYamlScalar(value)}`);
	}

	private appendComplexYamlValue(lines: string[], value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, indent);
			}
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
				if (entry === undefined) {
					continue;
				}
				this.appendYamlProperty(lines, key, entry, indent);
			}
		}
	}

	private formatYamlScalar(value: unknown): string {
		if (typeof value === "number") {
			return Number.isFinite(value) ? String(value) : "0";
		}
		if (typeof value === "boolean") {
			return value ? "true" : "false";
		}
		if (value == null) {
			return "null";
		}
		return JSON.stringify(String(value));
	}
}
