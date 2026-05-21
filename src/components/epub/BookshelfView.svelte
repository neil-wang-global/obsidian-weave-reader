<script lang="ts" module>
        const coverCache = new Map<string, string | null>();
</script>

<script lang="ts">
        import { onDestroy, onMount, untrack } from 'svelte';
        import { setIcon, TFile, TAbstractFile, Menu, Notice, normalizePath } from 'obsidian';
        import type { App } from 'obsidian';
        import { logger } from '../../utils/logger';
        import {
                EpubBacklinkHighlightService,
                EPUB_RUNTIME,
                getEpubStorageService,
                resolveEpubHost
        } from '../../services/epub';
        import { getBookFormatDisplayLabel, isSupportedBookFile, stripSupportedBookExtension } from '../../services/epub/book-format';
        import { FoliateVaultPublicationParser } from '../../services/epub/FoliateVaultPublicationParser';
        import type { BookMetadata, EpubBook } from '../../services/epub';
        import { epubActiveDocumentStore } from '../../stores/epub-active-document-store';
        import { openEpubInPreferredLeaf } from '../../utils/epub-leaf-utils';
        import { tr } from '../../utils/i18n';
        import CardSearchInput from '../search/CardSearchInput.svelte';
        import { parseSearchQuery, type DateRange, type SearchQuery } from '../../utils/search-parser';
        import {
                getBookshelfDisplayModeOptions,
                getBookshelfDisplayModeOption,
                normalizeBookshelfDisplayMode,
                resolveBookshelfViewMode,
                type BookshelfDisplayMode
        } from '../../services/epub/bookshelf-display-mode';
        import {
                BOOKSHELF_LIST_VIRTUAL_ITEM_HEIGHT,
                BOOKSHELF_LIST_VIRTUAL_OVERSCAN,
                shouldUseBookshelfGridPaintOptimization,
                shouldUseBookshelfListVirtualScroll,
        } from '../../services/epub/bookshelf-display-performance';
        import VirtualScroll from '../ui/VirtualScroll.svelte';
        import { isVaultImageFile, resolveVaultImageResourceUrl } from '../../utils/vault-image-cover';

        interface EpubFileInfo {
                path: string;
                name: string;
                folder: string;
                size: number;
                addedAt?: number;
                customCoverPath?: string;
        }

        interface BookshelfBookMeta {
                title: string;
                author: string;
                translator?: string;
                publisher?: string;
                coverImage?: string;
                progress: number;
                lastReadTime: number;
                createdTime: number;
        }

        interface DisplayBookItem extends EpubFileInfo {
                displayTitle: string;
                bylineText: string;
                tagValues: Array<{
                        value: string;
                        tone: 'primary' | 'secondary';
                }>;
                metaText: string;
                author: string;
                translator?: string;
                publisher?: string;
                formatLabel: string;
                progress: number;
                lastReadTime: number;
                addedAt: number;
                readingStatus: BookshelfReadingStatus;
        }

        interface ResolvedBookContext {
                requestedPath: string;
                targetPath: string;
                file: TFile;
                storedBook: EpubBook | null;
                metadata: BookMetadata;
        }

        interface BookNoteStats {
                totalHighlights: number;
                commentCount: number;
                sourceFileCount: number;
                available: boolean;
        }

        type BookshelfReadingStatus = '未开始' | '阅读中' | '已读完';

        interface Props {
                app: App;
                onSwitchBook?: (filePath: string) => void | Promise<void>;
                onClose?: () => void | Promise<void>;
                onBack?: () => void | Promise<void>;
                backButtonLabel?: string;
                refreshToken?: number;
                onSettingsClick?: (event: MouseEvent) => void;
                surfaceContext?: 'main' | 'sidebar';
        }

        let {
                app,
                onSwitchBook,
                onClose,
                onBack,
                backButtonLabel = '',
                refreshToken = 0,
                onSettingsClick,
                surfaceContext,
        }: Props = $props();
        let t = $derived($tr);
        let effectiveBackButtonLabel = $derived(backButtonLabel || t('epub.bookshelf.back'));

        let epubFiles = $state<EpubFileInfo[]>([]);
        let covers = $state<Map<string, string>>(new Map());
        let bookMetaByPath = $state<Map<string, BookshelfBookMeta>>(new Map());
        let searchQuery = $state('');
        let searching = $state(false);
        let bookshelfSearchReady = false;
        let bookshelfSearchPersistTimer: ReturnType<typeof setTimeout> | null = null;
        let bookshelfDisplayMode = $state<BookshelfDisplayMode>('adaptive');
        let detectedSurfaceContext = $state<'main' | 'sidebar'>('main');
        let bookshelfRootEl = $state<HTMLDivElement | null>(null);
        let surfaceContextObserver: MutationObserver | null = null;
        let loadingBooks = $state(false);
        let openingBookPath = $state<string | null>(null);
        let refreshRunId = 0;
        let pendingBookshelfReload = false;
        let pendingBookshelfRefresh = false;
        let pendingBookshelfRefreshNotice = false;
        let coverLoadTimer: ReturnType<typeof setTimeout> | null = null;
        const storageService = untrack(() => getEpubStorageService(app));
        let coverPersistTimer: ReturnType<typeof setTimeout> | null = null;
        const coverPersistPending = new Map<string, string | null>();
        const MAX_VISIBLE_COVER_LOADS = 18;
        const BOOKSHELF_DATA_CHANGED_EVENT = EPUB_RUNTIME.events.bookshelfDataChanged;
        const BOOKSHELF_REFRESH_REQUEST_EVENT = EPUB_RUNTIME.events.bookshelfRefreshRequest;
        const BOOKSHELF_DISPLAY_SETTINGS_CHANGED_EVENT = EPUB_RUNTIME.events.bookshelfDisplaySettingsChanged;
        const BOOKSHELF_READING_STATUS_OPTIONS: BookshelfReadingStatus[] = ['未开始', '阅读中', '已读完'];

        function getLocalizedReadingStatus(status: BookshelfReadingStatus): string {
                switch (status) {
                        case '阅读中':
                                return t('epub.bookshelf.status.reading');
                        case '已读完':
                                return t('epub.bookshelf.status.finished');
                        default:
                                return t('epub.bookshelf.status.unread');
                }
        }

        function normalizeSurfaceContext(value: unknown): 'main' | 'sidebar' {
                return value === 'sidebar' ? 'sidebar' : 'main';
        }

        function getBookshelfDisplayModeSetting(): BookshelfDisplayMode {
                return normalizeBookshelfDisplayMode(getEpubHost()?.settings?.bookshelfDisplayMode);
        }

        function readSurfaceContextFromDom(): 'main' | 'sidebar' {
                if (surfaceContext) {
                        return normalizeSurfaceContext(surfaceContext);
                }

                const contextHost = bookshelfRootEl?.closest('[data-weave-surface-context]') as HTMLElement | null;
                return normalizeSurfaceContext(contextHost?.dataset?.weaveSurfaceContext);
        }

        function syncSurfaceContext(): void {
                detectedSurfaceContext = readSurfaceContextFromDom();
        }

        function syncDisplayModePreferences(): void {
                bookshelfDisplayMode = getBookshelfDisplayModeSetting();
                syncSurfaceContext();
        }

        let effectiveViewMode = $derived.by(() =>
                resolveBookshelfViewMode(bookshelfDisplayMode, detectedSurfaceContext)
        );
        let listViewportEl = $state<HTMLDivElement | null>(null);
        let listViewportHeight = $state(320);

        function icon(node: HTMLElement, name: string) {
                setIcon(node, name);
                return {
                        update(newName: string) {
                                // /skip innerHTML is used to clear the trusted icon container before setIcon rerenders it
                                node.replaceChildren();
                                setIcon(node, newName);
                        }
                };
        }

        function getEpubHost(): any {
                return resolveEpubHost(app) as any;
        }

        function setBookshelfFiles(files: EpubFileInfo[]) {
                epubFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        }

        function buildBookMeta(book: EpubBook): BookshelfBookMeta {
                return {
                        title: book.metadata.title?.trim() || '',
                        author: book.metadata.author?.trim() || '',
                        translator: book.metadata.translator?.trim() || undefined,
                        publisher: book.metadata.publisher?.trim() || undefined,
                        coverImage: book.metadata.coverImage?.trim() || undefined,
                        progress: Number.isFinite(book.currentPosition?.percent) ? Math.max(0, Math.round(book.currentPosition.percent)) : 0,
                        lastReadTime: Number.isFinite(book.readingStats?.lastReadTime) ? book.readingStats.lastReadTime : 0,
                        createdTime: Number.isFinite(book.readingStats?.createdTime) ? book.readingStats.createdTime : 0
                };
        }

        function getReadingStatus(progress: number, lastReadTime: number): BookshelfReadingStatus {
                if (progress >= 100) {
                        return '已读完';
                }
                if (progress > 0 || lastReadTime > 0) {
                        return '阅读中';
                }
                return '未开始';
        }

        function normalizeSearchText(value: string | undefined): string {
                return typeof value === 'string' ? value.trim().toLowerCase() : '';
        }

        function hasActiveSearchCriteria(): boolean {
                return Boolean(searchQuery.trim());
        }

        function clearSearchCriteria(): void {
                searchQuery = '';
                if (!bookshelfSearchReady) {
                        return;
                }
                void storageService.saveBookshelfSearchQuery('');
        }

        async function hydrateBookshelfSearch(): Promise<void> {
                const saved = await storageService.loadBookshelfSearchQuery();
                if (saved.trim()) {
                        searchQuery = saved;
                        searching = true;
                }
                bookshelfSearchReady = true;
        }

        function scheduleBookshelfSearchPersist(query: string): void {
                if (!bookshelfSearchReady) {
                        return;
                }
                if (bookshelfSearchPersistTimer) {
                        clearTimeout(bookshelfSearchPersistTimer);
                }
                bookshelfSearchPersistTimer = setTimeout(() => {
                        bookshelfSearchPersistTimer = null;
                        void storageService.saveBookshelfSearchQuery(query);
                }, 300);
        }

        function flushBookshelfSearchPersist(): void {
                if (!bookshelfSearchReady) {
                        return;
                }
                if (bookshelfSearchPersistTimer) {
                        clearTimeout(bookshelfSearchPersistTimer);
                        bookshelfSearchPersistTimer = null;
                }
                void storageService.saveBookshelfSearchQuery(searchQuery);
        }

        function openBookshelfSearch(): void {
                searching = true;
        }

        function closeBookshelfSearch(): void {
                searching = false;
        }

        function toggleBookshelfSearch(): void {
                if (searching) {
                        closeBookshelfSearch();
                        return;
                }
                openBookshelfSearch();
        }

        function buildUniqueSortedValues(values: Array<string | undefined>): string[] {
                return Array.from(
                        new Set(values.map((value) => value?.trim() || '').filter(Boolean))
                ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        }

        function getBookshelfSearchableValues(file: DisplayBookItem): string[] {
                return [
                        file.displayTitle,
                        file.metaText,
                        file.name,
                        file.folder,
                        file.author,
                        file.translator || '',
                        file.publisher || '',
                        file.formatLabel,
                        file.readingStatus,
                        getLocalizedReadingStatus(file.readingStatus)
                ];
        }

        function matchesSearchTermList(values: string[], terms: string[]): boolean {
                if (terms.length === 0) {
                        return true;
                }

                return terms.every((term) => {
                        const normalizedTerm = normalizeSearchText(term);
                        if (!normalizedTerm) {
                                return true;
                        }
                        return values.some((value) => normalizeSearchText(value).includes(normalizedTerm));
                });
        }

        function matchesExcludedSearchTerms(values: string[], terms: string[]): boolean {
                if (terms.length === 0) {
                        return true;
                }

                return terms.every((term) => {
                        const normalizedTerm = normalizeSearchText(term);
                        if (!normalizedTerm) {
                                return true;
                        }
                        return values.every((value) => !normalizeSearchText(value).includes(normalizedTerm));
                });
        }

        function matchesFieldValues(target: string | undefined, values: string[]): boolean {
                if (values.length === 0) {
                        return true;
                }

                const normalizedTarget = normalizeSearchText(target);
                if (!normalizedTarget) {
                        return false;
                }

                return values.some((value) => {
                        const normalizedValue = normalizeSearchText(value);
                        return normalizedValue ? normalizedTarget.includes(normalizedValue) : false;
                });
        }

        function excludesFieldValues(target: string | undefined, values: string[]): boolean {
                if (values.length === 0) {
                        return true;
                }

                const normalizedTarget = normalizeSearchText(target);
                if (!normalizedTarget) {
                        return true;
                }

                return values.every((value) => {
                        const normalizedValue = normalizeSearchText(value);
                        return normalizedValue ? !normalizedTarget.includes(normalizedValue) : true;
                });
        }

        function parseDateBoundary(value: string, boundary: 'start' | 'end'): number | null {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        return null;
                }

                const timestamp = new Date(
                        boundary === 'start' ? `${value}T00:00:00.000` : `${value}T23:59:59.999`
                ).getTime();
                return Number.isFinite(timestamp) ? timestamp : null;
        }

        function matchesDateRange(timestamp: number, range: DateRange): boolean {
                if (!Number.isFinite(timestamp) || timestamp <= 0) {
                        return false;
                }

                const from = range.from ? parseDateBoundary(range.from, 'start') : null;
                if (range.from && from === null) {
                        return false;
                }

                const to = range.to ? parseDateBoundary(range.to, 'end') : null;
                if (range.to && to === null) {
                        return false;
                }

                if (from !== null && timestamp < from) {
                        return false;
                }

                if (to !== null && timestamp > to) {
                        return false;
                }

                return true;
        }

        function matchesDateRanges(timestamp: number, ranges: DateRange[]): boolean {
                if (ranges.length === 0) {
                        return true;
                }

                return ranges.some((range) => matchesDateRange(timestamp, range));
        }

        function matchesBookshelfQuery(file: DisplayBookItem, query: SearchQuery): boolean {
                if (!query.raw.trim()) {
                        return true;
                }

                const searchableValues = getBookshelfSearchableValues(file);
                const formatSearchTarget = `${file.formatLabel} ${file.path.split('.').pop() || ''}`.trim();
                const statusTarget = `${file.readingStatus} ${getLocalizedReadingStatus(file.readingStatus)}`;

                return matchesSearchTermList(searchableValues, query.text)
                        && matchesExcludedSearchTerms(searchableValues, query.excludeText)
                        && matchesFieldValues(statusTarget, query.statuses)
                        && excludesFieldValues(statusTarget, query.excludeStatuses)
                        && matchesFieldValues(file.author, query.authors)
                        && matchesFieldValues(file.publisher, query.publishers)
                        && matchesFieldValues(formatSearchTarget, query.formats)
                        && matchesDateRanges(file.addedAt, query.dateRanges);
        }

        function normalizeOptionalText(value: string | undefined): string | undefined {
                const normalized = typeof value === 'string' ? value.trim() : '';
                return normalized || undefined;
        }

        function pickFirstText(...values: Array<string | undefined>): string | undefined {
                for (const value of values) {
                        const normalized = normalizeOptionalText(value);
                        if (normalized) {
                                return normalized;
                        }
                }
                return undefined;
        }

        function mergeSubjects(...values: Array<string[] | undefined>): string[] | undefined {
                const next: string[] = [];
                const seen = new Set<string>();
                for (const entries of values) {
                        if (!Array.isArray(entries)) {
                                continue;
                        }
                        for (const entry of entries) {
                                const normalized = normalizeOptionalText(entry);
                                if (!normalized || seen.has(normalized)) {
                                        continue;
                                }
                                seen.add(normalized);
                                next.push(normalized);
                        }
                }
                return next.length > 0 ? next : undefined;
        }

        function mergeBookMetadata(
                storedMetadata: Partial<BookMetadata> | null | undefined,
                liveMetadata: Partial<BookMetadata> | null | undefined,
                coverImage?: string | undefined
        ): BookMetadata {
                return {
                        title: pickFirstText(liveMetadata?.title, storedMetadata?.title) || t('epub.bookshelf.untitled'),
                        author: pickFirstText(liveMetadata?.author, storedMetadata?.author) || t('epub.bookshelf.unknownAuthor'),
                        publisher: pickFirstText(liveMetadata?.publisher, storedMetadata?.publisher),
                        language: pickFirstText(liveMetadata?.language, storedMetadata?.language),
                        identifier: pickFirstText(liveMetadata?.identifier, storedMetadata?.identifier),
                        isbn: pickFirstText(liveMetadata?.isbn, storedMetadata?.isbn),
                        translator: pickFirstText(liveMetadata?.translator, storedMetadata?.translator),
                        description: pickFirstText(liveMetadata?.description, storedMetadata?.description),
                        publishDate: pickFirstText(liveMetadata?.publishDate, storedMetadata?.publishDate),
                        subjects: mergeSubjects(liveMetadata?.subjects, storedMetadata?.subjects),
                        series: pickFirstText(liveMetadata?.series, storedMetadata?.series),
                        rights: pickFirstText(liveMetadata?.rights, storedMetadata?.rights),
                        price: pickFirstText(liveMetadata?.price, storedMetadata?.price),
                        coverImage: pickFirstText(coverImage, liveMetadata?.coverImage, storedMetadata?.coverImage),
                        wordCount: liveMetadata?.wordCount ?? storedMetadata?.wordCount,
                        chapterCount: liveMetadata?.chapterCount ?? storedMetadata?.chapterCount ?? 0,
                };
        }

        function scheduleCoverPersist(filePath: string, coverUrl: string | null) {
                coverPersistPending.set(filePath, coverUrl);
                if (coverPersistTimer) {
                        clearTimeout(coverPersistTimer);
                }
                coverPersistTimer = setTimeout(() => {
                        coverPersistTimer = null;
                        const pending = Array.from(coverPersistPending.entries());
                        coverPersistPending.clear();
                        for (const [path, cover] of pending) {
                                void storageService.cacheBookshelfCoverImage(path, cover);
                        }
                }, 400);
        }

        function cacheResolvedCover(filePath: string, coverUrl: string | null | undefined) {
                const normalizedCover = typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl : null;
                coverCache.set(filePath, normalizedCover);

                if (normalizedCover) {
                        if (covers.get(filePath) !== normalizedCover) {
                                covers.set(filePath, normalizedCover);
                                covers = new Map(covers);
                        }
                        scheduleCoverPersist(filePath, normalizedCover);
                        return;
                }

                if (covers.delete(filePath)) {
                        covers = new Map(covers);
                }
        }

        function remapVaultPath(filePath: string, oldPath: string, newPath: string): string | null {
                const normalizedFilePath = normalizePath(filePath || '');
                const normalizedOldPath = normalizePath(oldPath || '');
                const normalizedNewPath = normalizePath(newPath || '');

                if (!normalizedFilePath || !normalizedOldPath || !normalizedNewPath) {
                        return null;
                }

                if (normalizedFilePath === normalizedOldPath) {
                        return normalizedNewPath;
                }

                if (normalizedFilePath.startsWith(`${normalizedOldPath}/`)) {
                        return `${normalizedNewPath}${normalizedFilePath.slice(normalizedOldPath.length)}`;
                }

                return null;
        }

        function remapMapKeys<T>(source: Map<string, T>, oldPath: string, newPath: string): Map<string, T> {
                const next = new Map<string, T>();

                for (const [path, value] of source.entries()) {
                        const remapped = remapVaultPath(path, oldPath, newPath) || path;
                        next.set(remapped, value);
                }

                return next;
        }

        function handleVaultRename(file: TAbstractFile, oldPath: string) {
                const newPath = normalizePath(file.path || '');
                const normalizedOldPath = normalizePath(oldPath || '');
                if (!normalizedOldPath || !newPath || normalizedOldPath === newPath) {
                        return;
                }

                const nextFiles = epubFiles
                        .map((entry) => {
                                const remappedPath = remapVaultPath(entry.path, normalizedOldPath, newPath);
                                if (!remappedPath) {
                                        return entry;
                                }

                                const newName = stripSupportedBookExtension(remappedPath.split('/').pop() || '') || entry.name;
                                const slashIndex = remappedPath.lastIndexOf('/');
                                const remappedCustomCoverPath = entry.customCoverPath
                                        ? remapVaultPath(entry.customCoverPath, normalizedOldPath, newPath) || entry.customCoverPath
                                        : undefined;

                                return {
                                        ...entry,
                                        path: remappedPath,
                                        name: newName,
                                        folder: slashIndex >= 0 ? remappedPath.slice(0, slashIndex) || '/' : '/',
                                        size: file instanceof TFile && remappedPath === newPath ? file.stat.size : entry.size,
                                        customCoverPath: remappedCustomCoverPath,
                                };
                        })
                        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

                const changed = nextFiles.length !== epubFiles.length
                        || nextFiles.some((entry, index) =>
                                entry.path !== epubFiles[index]?.path
                                || entry.name !== epubFiles[index]?.name
                                || entry.folder !== epubFiles[index]?.folder
                                || entry.size !== epubFiles[index]?.size
                        );

                if (!changed) {
                        void storageService.remapBookshelfMembershipPaths(normalizedOldPath, newPath);
                        return;
                }

                epubFiles = nextFiles;
                void storageService.remapBookshelfMembershipPaths(normalizedOldPath, newPath);
                covers = remapMapKeys(covers, normalizedOldPath, newPath);
                bookMetaByPath = remapMapKeys(bookMetaByPath, normalizedOldPath, newPath);

                const remappedCoverCache = new Map<string, string | null>();
                for (const [path, url] of coverCache.entries()) {
                        const remapped = remapVaultPath(path, normalizedOldPath, newPath) || path;
                        remappedCoverCache.set(remapped, url);
                }
                coverCache.clear();
                for (const [path, url] of remappedCoverCache.entries()) {
                        coverCache.set(path, url);
                }
        }

        async function loadBookMetadata(files: EpubFileInfo[], runId: number): Promise<void> {
                try {
                        const [books, scanEntries] = await Promise.all([
                                storageService.loadBooks({ hydrateStates: false }),
                                storageService.loadScanIndex(),
                        ]);
                        if (runId !== refreshRunId) return;

                        const validPaths = new Set(files.map((file) => file.path));
                        const nextMeta = new Map<string, BookshelfBookMeta>();
                        const scanCoverByPath = new Map(
                                scanEntries.map((entry) => [entry.path, entry.coverImage] as const)
                        );

                        for (const file of files) {
                                const cachedScanCover = scanCoverByPath.get(file.path);
                                if (cachedScanCover) {
                                        cacheResolvedCover(file.path, cachedScanCover);
                                }
                        }

                        for (const book of Object.values(books)) {
                                if (!validPaths.has(book.filePath)) continue;
                                const meta = buildBookMeta(book);
                                nextMeta.set(book.filePath, meta);
                                if (meta.coverImage) {
                                        cacheResolvedCover(book.filePath, meta.coverImage);
                                }
                        }

                        for (const file of files) {
                                if (!file.customCoverPath) continue;
                                cacheResolvedCover(
                                        file.path,
                                        resolveVaultImageResourceUrl(app, file.customCoverPath)
                                );
                        }

                        bookMetaByPath = nextMeta;
                } catch {
                        if (runId === refreshRunId) {
                                bookMetaByPath = new Map();
                        }
                }
        }

        function syncCoverCacheWithFiles() {
                const validPaths = new Set(epubFiles.map((file) => file.path));
                const nextCovers = new Map<string, string>();

                for (const [path, url] of covers.entries()) {
                        if (validPaths.has(path)) {
                                nextCovers.set(path, url);
                        }
                }

                covers = nextCovers;

                for (const path of Array.from(coverCache.keys())) {
                        if (!validPaths.has(path)) {
                                coverCache.delete(path);
                        }
                }
        }

        function cancelScheduledCoverLoading() {
                if (coverLoadTimer) {
                        clearTimeout(coverLoadTimer);
                        coverLoadTimer = null;
                }
        }

        async function loadCoverForFile(file: EpubFileInfo, runId: number): Promise<void> {
                if (runId !== refreshRunId) return;
                if (file.customCoverPath) {
                        cacheResolvedCover(
                                file.path,
                                resolveVaultImageResourceUrl(app, file.customCoverPath)
                        );
                        return;
                }
                if (coverCache.has(file.path)) {
                        const cachedCover = coverCache.get(file.path);
                        if (cachedCover && !covers.has(file.path)) {
                                covers.set(file.path, cachedCover);
                                covers = new Map(covers);
                        }
                        return;
                }

                const publicationParser = new FoliateVaultPublicationParser(app);
                try {
                        const loaded = await publicationParser.load(file.path);
                        const coverUrl = loaded.coverImage || null;
                        if (runId !== refreshRunId) return;
                        cacheResolvedCover(file.path, coverUrl);
                } catch {
                        if (runId === refreshRunId) {
                                cacheResolvedCover(file.path, null);
                        }
                } finally {
                        publicationParser.dispose();
                }
        }

        function updateListViewportHeight(): void {
                if (!listViewportEl) {
                        return;
                }
                listViewportHeight = Math.max(240, Math.floor(listViewportEl.clientHeight));
        }

        function handleVirtualItemsRendered(startIndex: number, endIndex: number): void {
                const visible = filteredFiles.slice(startIndex, Math.min(endIndex + 1, filteredFiles.length));
                scheduleVisibleCoverLoading(visible, refreshRunId);
        }

        function scheduleVisibleCoverLoading(files: EpubFileInfo[], runId: number) {
                cancelScheduledCoverLoading();
                const queue = files.slice(0, MAX_VISIBLE_COVER_LOADS);
                let index = 0;

                const step = () => {
                        if (runId !== refreshRunId || index >= queue.length) {
                                coverLoadTimer = null;
                                return;
                        }

                        const file = queue[index++];
                        void loadCoverForFile(file, runId).finally(() => {
                                if (runId !== refreshRunId) {
                                        coverLoadTimer = null;
                                        return;
                                }
                                coverLoadTimer = setTimeout(step, 0);
                        });
                };

                coverLoadTimer = setTimeout(step, 16);
        }

        function formatSize(bytes: number): string {
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        function clampProgress(progress: number): number {
                if (!Number.isFinite(progress)) return 0;
                return Math.max(0, Math.min(100, Math.round(progress)));
        }

        type BookshelfProgressTone = 'start' | 'low' | 'mid' | 'high' | 'near' | 'complete';

        function resolveBookshelfProgressTone(progress: number): BookshelfProgressTone {
                const value = clampProgress(progress);
                if (value >= 90) return 'complete';
                if (value >= 70) return 'near';
                if (value >= 45) return 'high';
                if (value >= 25) return 'mid';
                if (value >= 1) return 'low';
                return 'start';
        }

        function getBookshelfProgressToneClass(progress: number): string {
                return `is-progress-${resolveBookshelfProgressTone(progress)}`;
        }

        function handleBookKeydown(event: KeyboardEvent, path: string) {
                if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        switchBook(path);
                }
        }

        function flushPendingBookshelfWork() {
                if (loadingBooks) return;

                if (pendingBookshelfRefresh) {
                        const showNotice = pendingBookshelfRefreshNotice;
                        pendingBookshelfRefresh = false;
                        pendingBookshelfRefreshNotice = false;
                        pendingBookshelfReload = false;
                        void refreshBookshelf(showNotice);
                        return;
                }

                if (pendingBookshelfReload) {
                        pendingBookshelfReload = false;
                        void loadBookshelfFromCache();
                }
        }

        async function loadBookshelfMetadataAndCovers(files: EpubFileInfo[], runId: number): Promise<void> {
                await loadBookMetadata(files, runId);
                if (runId !== refreshRunId) {
                        return;
                }
                scheduleVisibleCoverLoading(files, runId);
        }

        async function loadBookshelfFromCache() {
                if (loadingBooks) {
                        pendingBookshelfReload = true;
                        return;
                }
                loadingBooks = true;
                try {
                        const currentRunId = ++refreshRunId;
                        const cached = await storageService.listBookshelfEntries();
                        setBookshelfFiles(cached);
                        syncCoverCacheWithFiles();
                        void loadBookshelfMetadataAndCovers(cached, currentRunId);
                } catch (error) {
                        logger.error('Failed to load EPUB bookshelf cache:', error);
                } finally {
                        loadingBooks = false;
                        flushPendingBookshelfWork();
                }
        }

        async function refreshBookshelf(showNotice = false) {
                if (loadingBooks) {
                        pendingBookshelfRefresh = true;
                        pendingBookshelfRefreshNotice = pendingBookshelfRefreshNotice || showNotice;
                        return;
                }
                loadingBooks = true;

                try {
                        const result = await storageService.pruneMissingBooks();
                        const currentRunId = ++refreshRunId;
                        cancelScheduledCoverLoading();
                        const rebuilt = await storageService.listBookshelfEntries({ pruneMissing: false });
                        setBookshelfFiles(rebuilt);
                        syncCoverCacheWithFiles();
                        await loadBookMetadata(rebuilt, currentRunId);
                        scheduleVisibleCoverLoading(rebuilt, currentRunId);

                        if (showNotice) {
                                const message = result.removedPaths.length > 0
                                        ? t('epub.bookshelf.refreshSuccessWithCleanup', { count: result.removedPaths.length })
                                        : t('epub.bookshelf.refreshSuccess');
                                new Notice(message);
                        }
                } catch (error) {
                        logger.error('Failed to refresh EPUB bookshelf:', error);
                        if (showNotice) {
                                new Notice(t('epub.bookshelf.refreshFailed'));
                        }
                } finally {
                        loadingBooks = false;
                        flushPendingBookshelfWork();
                }
        }

        function removeInvalidFile(filePath: string) {
                epubFiles = epubFiles.filter((file) => file.path !== filePath);
                covers.delete(filePath);
                covers = new Map(covers);
                coverCache.delete(filePath);
                bookMetaByPath.delete(filePath);
                bookMetaByPath = new Map(bookMetaByPath);
        }

        function resetBookStateInList(filePath: string) {
                bookMetaByPath.delete(filePath);
                bookMetaByPath = new Map(bookMetaByPath);
        }

        function getBookDisplayName(filePath: string): string {
                const file = app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                        return file.basename || t('epub.bookshelf.currentBook');
                }
                return stripSupportedBookExtension(filePath.split('/').pop() || '') || t('epub.bookshelf.currentBook');
        }

        async function resolveActiveBookPath(filePath: string): Promise<string | null> {
                const normalizedPath = normalizePath(filePath || '');
                if (!normalizedPath) {
                        return null;
                }

                const directFile = app.vault.getAbstractFileByPath(normalizedPath);
                if (directFile instanceof TFile && isSupportedBookFile(directFile)) {
                        return directFile.path;
                }

                const existingBook = await storageService.findBookByFilePath(normalizedPath);
                const resolvedPath = await storageService.resolveSourceFilePath(existingBook?.sourceId, normalizedPath);
                if (!resolvedPath) {
                        return null;
                }

                if (resolvedPath !== normalizedPath) {
                        await storageService.updateBookFileReferences(normalizedPath, resolvedPath);
                        await refreshBookshelf();
                }

                return resolvedPath;
        }

        function closeOpenEpubLeaves(filePath: string) {
                const leaves = app.workspace.getLeavesOfType(EPUB_RUNTIME.viewTypes.reader);
                for (const leaf of leaves) {
                        const state = leaf.getViewState();
                        const leafFilePath = state?.state?.filePath || state?.state?.file || '';
                        if (leafFilePath === filePath) {
                                leaf.detach();
                        }
                }
        }

        async function switchBook(filePath: string) {
                if (openingBookPath) return;
                openingBookPath = filePath;
                refreshRunId++;
                cancelScheduledCoverLoading();
                const resolvedPath = await resolveActiveBookPath(filePath);
                const file = resolvedPath ? app.vault.getAbstractFileByPath(resolvedPath) : null;
                if (!(file instanceof TFile) || !isSupportedBookFile(file)) {
                        removeInvalidFile(filePath);
                        await storageService.pruneMissingBooks();
                        new Notice(t('epub.bookshelf.notFoundRemoved'));
                        openingBookPath = null;
                        return;
                }

                if (onSwitchBook) {
                        const nextFilePath = file.path;
                        await Promise.resolve(onClose?.());
                        window.setTimeout(() => {
                                void Promise.resolve(onSwitchBook(nextFilePath)).finally(() => {
                                        openingBookPath = null;
                                });
                        }, 0);
                        return;
                }

                await Promise.resolve(onClose?.());
                window.setTimeout(() => {
                        void openBookInNewTab(file.path).finally(() => {
                                openingBookPath = null;
                        });
                }, 0);
        }

        async function openBookInNewTab(filePath: string) {
                try {
                        const plugin = getEpubHost();
                        if (plugin && typeof plugin.openEpubReader === 'function') {
                                await plugin.openEpubReader(filePath);
                                return;
                        }

                        await openEpubInPreferredLeaf(app, filePath);
                } catch (error) {
                        logger.error('Failed to open EPUB:', error);
                }
        }

        async function removeBookFromShelf(filePath: string) {
                try {
                        const result = await storageService.removeFromBookshelfByFilePath(filePath, { purgeCache: true });
                        await refreshBookshelf();
                        notifyBookshelfChanged(false);

                        if (result.removedBookId || result.removedMembership) {
                                new Notice(t('epub.bookshelf.removeSuccess'));
                                return;
                        }

                        new Notice(t('epub.bookshelf.removeMissing'));
                } catch (error) {
                        logger.error('Failed to remove book from bookshelf:', error);
                        new Notice(t('epub.bookshelf.removeFailed'));
                }
        }

        async function resolveBookContext(filePath: string): Promise<ResolvedBookContext | null> {
                const normalizedOriginalPath = normalizePath(filePath || '');
                if (!normalizedOriginalPath) {
                        return null;
                }

                const resolvedPath = await resolveActiveBookPath(filePath);
                const targetPath = normalizePath(resolvedPath || normalizedOriginalPath);
                const file = app.vault.getAbstractFileByPath(targetPath);

                if (!(file instanceof TFile) || !isSupportedBookFile(file)) {
                        removeInvalidFile(filePath);
                        await storageService.pruneMissingBooks();
                        new Notice(t('epub.bookshelf.notFoundRemoved'));
                        return null;
                }

                const storedBook = await storageService.findBookByFilePath(targetPath)
                        || (targetPath !== normalizedOriginalPath
                                ? await storageService.findBookByFilePath(normalizedOriginalPath)
                                : null);
                const parser = new FoliateVaultPublicationParser(app);

                try {
                        const loaded = await parser.load(targetPath);
                        return {
                                requestedPath: normalizedOriginalPath,
                                targetPath,
                                file,
                                storedBook,
                                metadata: mergeBookMetadata(storedBook?.metadata, loaded.metadata, loaded.coverImage),
                        };
                } finally {
                        parser.dispose();
                }
        }

        async function collectBookNoteStats(filePath: string): Promise<BookNoteStats> {
                const backlinkService = new EpubBacklinkHighlightService(app);
                try {
                        const highlights = await backlinkService.collectHighlights(filePath);
                        const sourceFiles = new Set<string>();
                        let commentCount = 0;

                        for (const highlight of highlights) {
                                if (highlight.hasCommentDivider) {
                                        commentCount += 1;
                                }
                                const primarySourceFile = normalizePath(highlight.sourceFile || '');
                                if (primarySourceFile) {
                                        sourceFiles.add(primarySourceFile);
                                }
                                for (const locator of highlight.sourceLocators || []) {
                                        const locatorPath = normalizePath(locator.sourceFile || '');
                                        if (locatorPath) {
                                                sourceFiles.add(locatorPath);
                                        }
                                }
                        }

                        return {
                                totalHighlights: highlights.length,
                                commentCount,
                                sourceFileCount: sourceFiles.size,
                                available: true,
                        };
                } catch (error) {
                        logger.error('Failed to collect book note stats:', error);
                        return {
                                totalHighlights: 0,
                                commentCount: 0,
                                sourceFileCount: 0,
                                available: false,
                        };
                } finally {
                        backlinkService.destroy();
                }
        }

        async function deleteBookFile(filePath: string) {
                try {
                        const context = await resolveBookContext(filePath);
                        if (!context) {
                                return;
                        }

                        const highlightStats = await collectBookNoteStats(context.targetPath);
                        const { EpubBookDeleteConfirmModal } = await import('../modals/EpubBookDeleteConfirmModal');
                        const modal = new EpubBookDeleteConfirmModal(app, {
                                filePath: context.targetPath,
                                fileName: context.file.name,
                                fileSize: context.file.stat.size,
                                metadata: context.metadata,
                                progress: context.storedBook?.currentPosition?.percent ?? 0,
                                highlightStats,
                        });
                        const confirmed = await modal.openAndWait();
                        if (!confirmed) {
                                return;
                        }

                        closeOpenEpubLeaves(context.targetPath);
                        if (context.requestedPath !== context.targetPath) {
                                closeOpenEpubLeaves(context.requestedPath);
                        }

                        const result = await storageService.deleteTrackedBookFile(context.targetPath);
                        await refreshBookshelf();
                        notifyBookshelfChanged(false);

                        if (result.fileDeleted) {
                                const retainedExcerptText = highlightStats.available
                                        ? t('epub.bookshelf.excerptsRetained', { count: highlightStats.totalHighlights })
                                        : t('epub.bookshelf.excerptsUntouched');
                                new Notice(t('epub.bookshelf.deleteSuccess', { extra: retainedExcerptText }));
                                return;
                        }

                        if (result.removedBookIds.length > 0 || result.removedMembershipEntries > 0 || result.removedScanEntries > 0) {
                                new Notice(t('epub.bookshelf.deleteMissingAndCleaned'));
                                return;
                        }

                        new Notice(t('epub.bookshelf.deleteMissing'));
                } catch (error) {
                        logger.error('Failed to delete tracked book file:', error);
                        new Notice(t('epub.bookshelf.deleteFailed'));
                }
        }

        async function showBookInfo(filePath: string) {
                try {
                        const context = await resolveBookContext(filePath);
                        if (!context) {
                                return;
                        }

                        const noteStats = await collectBookNoteStats(context.targetPath);
                        const { EpubBookInfoModal } = await import('../modals/EpubBookInfoModal');
                        const modal = new EpubBookInfoModal(app, {
                                filePath: context.targetPath,
                                fileName: context.file.name,
                                fileSize: context.file.stat.size,
                                metadata: context.metadata,
                                progress: context.storedBook?.currentPosition?.percent ?? 0,
                                readingStats: context.storedBook?.readingStats ?? null,
                                noteStats,
                        });
                        modal.open();
                } catch (error) {
                        logger.error('Failed to show EPUB book info:', error);
                        new Notice(t('epub.bookshelf.loadInfoFailed'));
                }
        }

        async function customizeBookCover(filePath: string) {
                try {
                        const resolvedPath = await resolveActiveBookPath(filePath);
                        if (!resolvedPath) {
                                return;
                        }

                        const { VaultFileSuggestModal } = await import('../../modals/VaultFileSuggestModal');
                        const modal = new VaultFileSuggestModal(app, {
                                placeholder: t('epub.bookshelf.customCover.placeholder'),
                                filter: isVaultImageFile,
                                allowEmptySelection: true,
                                emptySelectionLabel: t('epub.bookshelf.customCover.reset'),
                                emptySelectionDescription: t('epub.bookshelf.customCover.resetDescription'),
                                icon: 'image',
                        });
                        const selection = await modal.openAndGetSelection();
                        if (selection.status === 'cancelled') {
                                return;
                        }

                        const coverPath = selection.status === 'selected' ? selection.file.path : null;
                        const saved = await storageService.setBookshelfCustomCover(resolvedPath, coverPath);
                        if (!saved) {
                                new Notice(t('epub.bookshelf.customCover.notOnShelf'));
                                return;
                        }

                        epubFiles = epubFiles.map((file) => {
                                if (file.path !== resolvedPath && file.path !== filePath) {
                                        return file;
                                }

                                return {
                                        ...file,
                                        path: resolvedPath,
                                        customCoverPath: coverPath || undefined,
                                };
                        });

                        if (coverPath) {
                                cacheResolvedCover(resolvedPath, resolveVaultImageResourceUrl(app, coverPath));
                        } else {
                                coverCache.delete(resolvedPath);
                                const targetFile = epubFiles.find((file) => file.path === resolvedPath);
                                if (targetFile) {
                                        void loadCoverForFile(targetFile, refreshRunId);
                                }
                        }

                        new Notice(
                                coverPath
                                        ? t('epub.bookshelf.customCover.success')
                                        : t('epub.bookshelf.customCover.resetSuccess')
                        );
                } catch (error) {
                        logger.error('Failed to customize bookshelf cover:', error);
                        new Notice(t('epub.bookshelf.customCover.failed'));
                }
        }

        function handleContextMenu(e: MouseEvent, filePath: string) {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.openInNewTab'))
                                .setIcon('external-link')
                                .onClick(() => openBookInNewTab(filePath));
                });
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.viewFullInfo'))
                                .setIcon('info')
                                .onClick(() => {
                                        void showBookInfo(filePath);
                                });
                });
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.customCover'))
                                .setIcon('image')
                                .onClick(() => {
                                        void customizeBookCover(filePath);
                                });
                });
                menu.addSeparator();
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.removeFromShelf'))
                                .setIcon('trash')
                                .onClick(() => {
                                        void removeBookFromShelf(filePath);
                                });
                });
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.deleteBookFile'))
                                .setIcon('trash-2')
                                .onClick(() => {
                                        void deleteBookFile(filePath);
                                });
                });
                menu.showAtMouseEvent(e);
        }

        function buildBylineText(meta?: BookshelfBookMeta): string {
                const values = [
                        meta?.author?.trim() || '',
                        meta?.translator?.trim() ? t('epub.bookshelf.translator', { name: meta.translator.trim() }) : ''
                ].filter(Boolean);
                return values.join(' · ');
        }

        function buildBookTags(file: EpubFileInfo, meta?: BookshelfBookMeta): DisplayBookItem['tagValues'] {
                return [
                        {
                                value: getBookFormatDisplayLabel(file.path),
                                tone: 'primary' as const
                        },
                        {
                                value: meta?.publisher?.trim() || '',
                                tone: 'secondary' as const
                        },
                        {
                                value: formatSize(file.size),
                                tone: 'secondary' as const
                        }
                ].filter((tag) => Boolean(tag.value));
        }

        function buildMetaText(file: EpubFileInfo, meta?: BookshelfBookMeta): string {
                const bylineText = buildBylineText(meta);
                const tags = buildBookTags(file, meta);
                return [bylineText, ...tags.map((tag) => tag.value)]
                        .filter(Boolean)
                        .join(' · ');
        }

        let displayBooks = $derived.by(() => {
                return epubFiles
                        .map((file) => {
                                const meta = bookMetaByPath.get(file.path);
                                const bylineText = buildBylineText(meta);
                                const tagValues = buildBookTags(file, meta);
                                const progress = meta?.progress || 0;
                                const lastReadTime = meta?.lastReadTime || 0;
                                const formatLabel = getBookFormatDisplayLabel(file.path);
                                const addedAt = typeof file.addedAt === 'number' && file.addedAt > 0
                                        ? file.addedAt
                                        : (meta?.createdTime || 0);
                                return {
                                        ...file,
                                        displayTitle: meta?.title || file.name || 'EPUB',
                                        bylineText,
                                        tagValues,
                                        metaText: buildMetaText(file, meta),
                                        author: meta?.author?.trim() || '',
                                        translator: meta?.translator?.trim() || undefined,
                                        publisher: meta?.publisher?.trim() || undefined,
                                        formatLabel,
                                        progress,
                                        lastReadTime,
                                        addedAt,
                                        readingStatus: getReadingStatus(progress, lastReadTime)
                                } satisfies DisplayBookItem;
                        })
                        .sort((a, b) => {
                                const aRecent = a.lastReadTime > 0 ? 1 : 0;
                                const bRecent = b.lastReadTime > 0 ? 1 : 0;
                                if (aRecent !== bRecent) return bRecent - aRecent;
                                if (a.lastReadTime !== b.lastReadTime) return b.lastReadTime - a.lastReadTime;
                                return a.displayTitle.localeCompare(b.displayTitle, 'zh-CN');
                        });
        });

        let availableAuthorOptions = $derived.by(() =>
                buildUniqueSortedValues(displayBooks.map((book) => book.author))
        );

        let availablePublisherOptions = $derived.by(() =>
                buildUniqueSortedValues(displayBooks.map((book) => book.publisher))
        );

        let availableFormatOptions = $derived.by(() =>
                buildUniqueSortedValues(displayBooks.map((book) => book.formatLabel))
        );

        let localizedBookshelfReadingStatusOptions = $derived.by(() =>
                BOOKSHELF_READING_STATUS_OPTIONS.map((status) => getLocalizedReadingStatus(status))
        );

        let parsedBookshelfSearchQuery = $derived.by(() => parseSearchQuery(searchQuery));

        let filteredFiles = $derived.by(() =>
                displayBooks.filter((book) => matchesBookshelfQuery(book, parsedBookshelfSearchQuery))
        );
        let useListVirtualScroll = $derived.by(() =>
                shouldUseBookshelfListVirtualScroll(filteredFiles.length, effectiveViewMode)
        );
        let useGridPaintOptimization = $derived.by(() =>
                shouldUseBookshelfGridPaintOptimization(filteredFiles.length, effectiveViewMode)
        );

        let lastHandledRefreshToken = untrack(() => refreshToken);
        let activeSearchSummary = $derived.by(() => {
                return searchQuery.trim() ? t('epub.bookshelf.queryLabel', { query: searchQuery.trim() }) : '';
        });

        let emptyStateMessage = $derived.by(() => {
                if (epubFiles.length > 0) {
                        return activeSearchSummary ? t('epub.bookshelf.noMatchesWithQuery', { query: activeSearchSummary }) : t('epub.bookshelf.noMatches');
                }
                return t('epub.bookshelf.empty');
        });

        function handleBookshelfSettingsChanged() {
                void loadBookshelfFromCache();
        }

        function handleBookshelfRefreshRequest() {
                void refreshBookshelf(true);
        }

        function handleBookshelfDisplaySettingsChanged() {
                syncDisplayModePreferences();
        }

        async function persistBookshelfDisplayMode(mode: BookshelfDisplayMode): Promise<void> {
                if (bookshelfDisplayMode === mode) {
                        return;
                }

                const host = getEpubHost() as
                        | ({ settings?: Record<string, unknown>; saveSettings?: () => Promise<void> })
                        | null;

                if (host?.settings) {
                        host.settings.bookshelfDisplayMode = mode;
                        host.settings.bookshelfAutoViewByLocationEnabled = mode === 'adaptive';
                        if (typeof host.saveSettings === 'function') {
                                await host.saveSettings();
                        }
                }

                bookshelfDisplayMode = mode;
                window.dispatchEvent(new CustomEvent(BOOKSHELF_DISPLAY_SETTINGS_CHANGED_EVENT, {
                        detail: {
                                enabled: mode === 'adaptive',
                                mode
                        }
                }));
                new Notice(t('epub.bookshelf.switchDisplayMode', { mode: getBookshelfDisplayModeOption(mode).label }));
        }

        function notifyBookshelfChanged(includeRefreshRequest = false) {
                window.dispatchEvent(new CustomEvent(BOOKSHELF_DATA_CHANGED_EVENT));
                if (includeRefreshRequest) {
                        window.dispatchEvent(new CustomEvent(BOOKSHELF_REFRESH_REQUEST_EVENT));
                }
        }

        async function openScanImportModal(
                scanEntries?: Awaited<ReturnType<typeof storageService.loadScanIndex>>
        ) {
                const entries = scanEntries ?? await storageService.loadScanIndex();
                if (entries.length === 0) {
                        new Notice(t('epub.bookshelf.vaultScanEmpty'));
                        return;
                }

                const membership = await storageService.loadBookshelfMembership();
                const { EpubBookshelfImportModal } = await import('../modals/EpubBookshelfImportModal');
                const modal = new EpubBookshelfImportModal(app, {
                        entries,
                        membership,
                        title: t('epub.bookshelf.vaultScanTitle'),
                        onConfirm: async (paths: string[]) => {
                                const addedEntries = await storageService.addBooksToBookshelf(paths);
                                if (addedEntries.length === 0) {
                                        new Notice(t('epub.bookshelf.vaultScanAlreadyAdded'));
                                        return;
                                }

                                await refreshBookshelf();
                                notifyBookshelfChanged(false);
                                new Notice(t('epub.bookshelf.vaultScanAdded', { count: addedEntries.length }));
                        },
                });
                modal.open();
        }

        async function scanVaultAndPromptImport() {
                try {
                        const scanEntries = await storageService.scanVaultBooks();
                        notifyBookshelfChanged(false);

                        if (scanEntries.length === 0) {
                                new Notice(t('epub.bookshelf.vaultScanEmpty'));
                                return;
                        }

                        await openScanImportModal(scanEntries);
                } catch (error) {
                        logger.error('Failed to scan vault EPUB files:', error);
                        new Notice(t('epub.bookshelf.vaultScanFailed'));
                }
        }

	async function requestBookshelfRefresh() {
                try {
                        const result = await storageService.pruneMissingBooks();
                        await refreshBookshelf();
                        notifyBookshelfChanged(false);
                        const message = result.removedPaths.length > 0
                                ? t('epub.bookshelf.refreshSuccessWithCleanup', { count: result.removedPaths.length })
                                : t('epub.bookshelf.refreshSuccess');
                        new Notice(message);
                } catch (error) {
                        logger.error('Failed to refresh EPUB bookshelf:', error);
                        new Notice(t('epub.bookshelf.refreshFailed'));
                }
        }

        function openFallbackSettingsMenu(event: MouseEvent) {
                const menu = new Menu();
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.displayFeatures'))
                                .setIcon('library');
                        const subMenu = (item as any).setSubmenu();

                        for (const option of getBookshelfDisplayModeOptions()) {
                                subMenu.addItem((subItem: any) => {
                                        subItem.setTitle(option.label)
                                                .setIcon(option.icon)
                                                .setChecked(bookshelfDisplayMode === option.mode)
                                                .onClick(() => {
                                                        void persistBookshelfDisplayMode(option.mode);
                                                });
                                });
                        }
                });
                menu.addSeparator();
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.scanVault'))
                                .setIcon('scan-search')
                                .onClick(() => {
                                        void scanVaultAndPromptImport();
                                });
                });
                menu.addItem((item) => {
                        item.setTitle(t('epub.bookshelf.menu.refresh'))
                                .setIcon('refresh-cw')
                                .onClick(() => {
                                        void requestBookshelfRefresh();
                                });
                });
                menu.showAtMouseEvent(event);
        }

        function handleSettingsAction(event: MouseEvent) {
                if (onSettingsClick) {
                        onSettingsClick(event);
                        return;
                }
                openFallbackSettingsMenu(event);
        }

        function reconnectSurfaceContextObserver(): void {
                surfaceContextObserver?.disconnect();
                surfaceContextObserver = null;

                if (!bookshelfRootEl || typeof MutationObserver === 'undefined') {
                        return;
                }

                const observer = new MutationObserver(() => {
                        syncSurfaceContext();
                });

                let current: HTMLElement | null = bookshelfRootEl;
                while (current) {
                        observer.observe(current, {
                                attributes: true,
                                attributeFilter: ['data-weave-surface-context']
                        });
                        current = current.parentElement;
                }

                surfaceContextObserver = observer;
        }

        onMount(() => {
                syncDisplayModePreferences();
                reconnectSurfaceContextObserver();
                window.requestAnimationFrame(() => {
                        syncDisplayModePreferences();
                        reconnectSurfaceContextObserver();
                });
                void hydrateBookshelfSearch();
                void loadBookshelfFromCache();
                window.addEventListener(BOOKSHELF_DATA_CHANGED_EVENT, handleBookshelfSettingsChanged);
                window.addEventListener(BOOKSHELF_REFRESH_REQUEST_EVENT, handleBookshelfRefreshRequest);
                window.addEventListener(BOOKSHELF_DISPLAY_SETTINGS_CHANGED_EVENT, handleBookshelfDisplaySettingsChanged);
                const renameRef = app.vault.on('rename', (file, oldPath) => {
                        handleVaultRename(file, oldPath);
                });
                const deleteRef = app.vault.on('delete', (file) => {
                        const deletedPath = normalizePath(file.path || '');
                        if (!deletedPath) return;
                        removeInvalidFile(deletedPath);
                });
                return () => {
                        app.vault.offref(renameRef);
                        app.vault.offref(deleteRef);
                        surfaceContextObserver?.disconnect();
                        surfaceContextObserver = null;
                        flushBookshelfSearchPersist();
                        if (coverPersistTimer) {
                                clearTimeout(coverPersistTimer);
                                coverPersistTimer = null;
                        }
                        for (const [path, cover] of coverPersistPending.entries()) {
                                void storageService.cacheBookshelfCoverImage(path, cover);
                        }
                        coverPersistPending.clear();
                };
        });

        onDestroy(() => {
                window.removeEventListener(BOOKSHELF_DATA_CHANGED_EVENT, handleBookshelfSettingsChanged);
                window.removeEventListener(BOOKSHELF_REFRESH_REQUEST_EVENT, handleBookshelfRefreshRequest);
                window.removeEventListener(BOOKSHELF_DISPLAY_SETTINGS_CHANGED_EVENT, handleBookshelfDisplaySettingsChanged);
                flushBookshelfSearchPersist();
        });

        $effect(() => {
                surfaceContext;
                syncSurfaceContext();
                reconnectSurfaceContextObserver();
        });

        $effect(() => {
                bookshelfRootEl;
                syncSurfaceContext();
                reconnectSurfaceContextObserver();
        });

        $effect(() => {
                scheduleBookshelfSearchPersist(searchQuery);
        });

        $effect(() => {
                if (!useListVirtualScroll || !listViewportEl) {
                        return;
                }

                updateListViewportHeight();
                const observer = new ResizeObserver(() => {
                        updateListViewportHeight();
                });
                observer.observe(listViewportEl);
                return () => {
                        observer.disconnect();
                };
        });

        $effect(() => {
                if (!useListVirtualScroll || filteredFiles.length === 0) {
                        return;
                }

                const visibleCount =
                        Math.ceil(listViewportHeight / BOOKSHELF_LIST_VIRTUAL_ITEM_HEIGHT) +
                        BOOKSHELF_LIST_VIRTUAL_OVERSCAN * 2;
                handleVirtualItemsRendered(0, Math.min(filteredFiles.length - 1, visibleCount));
        });
</script>

<style>
                .epub-bookshelf-root {
                        --weave-bookshelf-card-radius: var(--radius-xl);
                        --weave-bookshelf-card-padding: var(--size-4-3);
                        --weave-bookshelf-card-gap: var(--size-4-3);
                        --weave-bookshelf-card-shadow: 0 8px 18px rgba(0, 0, 0, 0.035);
                        --weave-bookshelf-card-shadow-hover: 0 12px 24px rgba(0, 0, 0, 0.05);
                        --weave-bookshelf-grid-card-shadow-hover: 0 12px 24px rgba(0, 0, 0, 0.06);
                        --weave-bookshelf-cover-tile-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
                        --weave-bookshelf-cover-tile-shadow-hover: 0 16px 34px rgba(0, 0, 0, 0.09);
                        --weave-bookshelf-thumb-width: 56px;
                        --weave-bookshelf-thumb-height: 78px;
                        --weave-bookshelf-thumb-radius: var(--radius-l);
                        --weave-bookshelf-thumb-icon-size: 20px;
                        --weave-bookshelf-title-size: calc(var(--font-text-size) * 0.9375);
                        --weave-bookshelf-meta-size: var(--font-ui-smaller);
                        --weave-bookshelf-chip-size: calc(var(--font-ui-smaller) * 0.9);
                        --weave-bookshelf-chip-primary-size: calc(var(--font-ui-smaller) * 0.95);
                        --weave-bookshelf-progress-size: 52px;
                        --weave-bookshelf-progress-font-size: var(--font-ui-smaller);
                        --weave-bookshelf-grid-gap: var(--size-4-3);
                        --weave-bookshelf-grid-padding-inline: var(--size-4-4);
                        --weave-bookshelf-grid-padding-bottom: 22px;
                        --weave-bookshelf-card-cover-height: 170px;
                        --weave-bookshelf-card-cover-radius: 10px;
                        --weave-bookshelf-card-title-size: var(--font-ui-small);
                        --weave-bookshelf-card-author-size: calc(var(--font-ui-smaller) * 0.92);
                        --weave-bookshelf-cover-placeholder-icon-size: 28px;
                        --weave-bookshelf-cover-tile-title-size: 14px;
                        container-type: inline-size;
                        display: flex;
                        flex: 1 1 auto;
                        flex-direction: column;
                        width: 100%;
                        height: 100%;
                        min-height: 0;
                        overflow-x: hidden;
                        overflow-y: auto;
                        overscroll-behavior: contain;
                }

                .epub-bookshelf-root.is-list-virtualized {
                        overflow-y: hidden;
                }

                .epub-bookshelf-list.is-virtualized {
                        flex: 1 1 auto;
                        min-height: 0;
                        display: flex;
                        flex-direction: column;
                        padding: var(--size-4-2) var(--weave-bookshelf-grid-padding-inline) var(--weave-bookshelf-grid-padding-bottom);
                }

                .epub-bookshelf-list.is-virtualized :global(.virtual-scroll-container.epub-bookshelf-virtual-scroll) {
                        flex: 1 1 auto;
                        min-height: 0;
                        width: 100%;
                }

                .epub-bookshelf-list.is-virtualized :global(.virtual-scroll-item) {
                        border-bottom: none;
                        align-items: stretch;
                }

                .epub-bookshelf-root.is-list-virtualized .epub-book-item {
                        animation: none;
                }

                .epub-bookshelf-grid.is-paint-optimized .epub-book-card,
                .epub-bookshelf-cover-grid.is-paint-optimized .epub-book-cover-tile {
                        content-visibility: auto;
                        contain-intrinsic-size: 280px 220px;
                }

                .epub-bookshelf-toolbar.nav-header {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 0;
                        min-height: var(--header-height);
                        padding: var(--size-4-2);
                        border-bottom: none;
                        background-color: transparent;
                        box-sizing: border-box;
                }

                .epub-bookshelf-toolbar .epub-bookshelf-actions.nav-buttons-container {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: var(--size-2-1);
                        width: fit-content;
                        max-width: 100%;
                        flex-wrap: nowrap;
                        margin-inline: auto;
                        padding: var(--size-2-1);
                        border-radius: var(--radius-m);
                        background-color: var(--nav-button-container-bg, var(--background-secondary-alt));
                        box-sizing: border-box;
                }

        .epub-bookshelf-toolbar .epub-toolbar-btn.nav-action-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: var(--size-2-2) var(--size-2-3);
                border: none;
                border-radius: var(--clickable-icon-radius);
                background-color: transparent;
                color: var(--icon-color);
                box-shadow: none;
                opacity: var(--icon-opacity);
                transition:
                        opacity var(--anim-duration-fast) ease-in-out,
                        color var(--anim-duration-fast) ease-in-out,
                        background-color var(--anim-duration-fast) ease-in-out;
        }

        .epub-bookshelf-toolbar .epub-toolbar-btn.nav-action-button:hover {
                color: var(--icon-color-hover);
        }

        .epub-bookshelf-toolbar .epub-toolbar-btn.nav-action-button :global(.svg-icon) {
                width: var(--icon-size);
                height: var(--icon-size);
        }

        .epub-bookshelf-search {
                padding: var(--size-2-3) var(--size-4-5) var(--size-2-1);
        }

        .epub-bookshelf-search :global(.card-search-container) {
                width: 100%;
        }

        .epub-bookshelf-search :global(.search-input-wrapper) {
                min-height: calc(var(--input-height) + var(--size-4-3));
                padding: 0 var(--size-4-2) 0 var(--size-4-3);
                border-radius: var(--modal-radius, var(--radius-l));
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
                box-shadow: none;
        }

        .epub-bookshelf-search :global(.search-input-wrapper:focus-within) {
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                box-shadow: 0 0 0 3px rgba(var(--interactive-accent-rgb), 0.08);
        }

        .epub-bookshelf-search :global(.search-icon) {
                margin-right: var(--size-4-1);
                color: var(--text-muted);
        }

        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell .search-input),
        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell input.search-input[type="text"]),
        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell input.search-input[type="text"]:hover),
        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell input.search-input[type="text"]:focus),
        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell input.search-input[type="text"]:focus-visible),
        .epub-bookshelf-search :global(.search-input-wrapper.is-unified-shell input.search-input[type="text"]:active) {
                appearance: none;
                -webkit-appearance: none;
                min-width: 0;
                min-height: calc(var(--input-height) + var(--size-4-2));
                padding: var(--size-2-3) var(--size-2-1);
                font-size: var(--font-ui-small);
                color: var(--text-normal);
                border: none !important;
                background: transparent !important;
                background-color: transparent !important;
                box-shadow: none !important;
                outline: none !important;
                border-radius: 0 !important;
        }

        .epub-bookshelf-search :global(.search-input::placeholder) {
                color: var(--text-faint);
        }

        .epub-bookshelf-search :global(.match-count) {
                font-size: var(--font-ui-smaller);
                color: var(--text-muted);
        }

        .epub-bookshelf-search :global(.clear-button),
        .epub-bookshelf-search :global(.filter-button) {
                width: calc(var(--input-height) - 2px);
                height: calc(var(--input-height) - 2px);
                padding: 0;
                border-radius: var(--clickable-icon-radius);
                color: var(--text-muted);
        }

        .epub-bookshelf-search :global(.clear-button:hover),
        .epub-bookshelf-search :global(.filter-button:hover) {
                background: color-mix(in srgb, var(--background-modifier-hover) 64%, transparent);
                color: var(--text-normal);
        }

        .epub-bookshelf-list {
                display: flex;
                flex-direction: column;
                gap: var(--size-4-2);
                padding: var(--size-4-2) var(--weave-bookshelf-grid-padding-inline) var(--weave-bookshelf-grid-padding-bottom);
        }

        .epub-placeholder {
                padding: 28px var(--size-4-5);
                border-radius: var(--weave-bookshelf-card-radius);
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-secondary)) 88%, transparent);
                color: var(--text-muted);
                font-size: var(--font-ui-small);
                line-height: 1.7;
                text-align: center;
        }

        .epub-book-item {
                display: flex;
                align-items: center;
                gap: var(--weave-bookshelf-card-gap);
                padding: var(--weave-bookshelf-card-padding);
                border-radius: var(--weave-bookshelf-card-radius);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 97%, transparent);
                box-shadow: var(--weave-bookshelf-card-shadow);
                transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease, background 0.14s ease;
        }

        .epub-book-item.is-opening {
                opacity: 0.68;
                pointer-events: none;
        }

        .epub-book-item:hover,
        .epub-book-item:focus-visible {
                transform: translateY(-1px);
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 100%, transparent);
                box-shadow: var(--weave-bookshelf-card-shadow-hover);
                outline: none;
        }

        .book-thumb,
        .book-thumb-placeholder {
                width: var(--weave-bookshelf-thumb-width);
                height: var(--weave-bookshelf-thumb-height);
                border-radius: var(--weave-bookshelf-thumb-radius);
                flex: 0 0 var(--weave-bookshelf-thumb-width);
                overflow: hidden;
                background: color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 92%, transparent);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
        }

        .book-thumb {
                object-fit: cover;
                display: block;
        }

        .book-thumb-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-faint);
        }

        .book-thumb-placeholder :global(.svg-icon) {
                width: var(--weave-bookshelf-thumb-icon-size);
                height: var(--weave-bookshelf-thumb-icon-size);
        }

        .book-info {
                min-width: 0;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: var(--size-2-3);
        }

        .book-name {
                font-size: var(--weave-bookshelf-title-size);
                font-weight: 600;
                line-height: 1.42;
                color: var(--text-normal);
                display: -webkit-box;
                -webkit-line-clamp: 2;
                line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-word;
        }

        .book-meta-text {
                font-size: var(--weave-bookshelf-meta-size);
                line-height: 1.45;
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
        }

        .book-meta-chips {
                display: flex;
                flex-wrap: wrap;
                gap: calc(var(--size-2-2) + 1px);
                margin-top: var(--size-2-1);
        }

        .book-meta-chip {
                display: inline-flex;
                align-items: center;
                min-height: 22px;
                padding: 0 8px;
                border-radius: 999px;
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 54%, transparent);
                background: color-mix(in srgb, var(--background-primary) 70%, transparent);
                color: var(--text-faint);
                font-size: var(--weave-bookshelf-chip-size);
                line-height: 1.15;
                white-space: nowrap;
        }

        .book-meta-chip.is-primary {
                background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
                border-color: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-modifier-border));
                color: var(--text-normal);
                font-weight: 600;
                font-size: var(--weave-bookshelf-chip-primary-size);
        }

        .book-meta-chip.is-secondary {
                background: color-mix(in srgb, var(--background-primary) 46%, transparent);
                border-color: color-mix(in srgb, var(--background-modifier-border) 42%, transparent);
                color: color-mix(in srgb, var(--text-muted) 82%, var(--text-faint));
        }

        .book-progress-badge {
                --book-progress: 0%;
                --book-progress-ring: color-mix(in srgb, var(--interactive-accent) 82%, white 8%);
                width: var(--weave-bookshelf-progress-size);
                height: var(--weave-bookshelf-progress-size);
                flex: 0 0 var(--weave-bookshelf-progress-size);
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                position: relative;
                color: var(--text-normal);
                font-size: var(--weave-bookshelf-progress-font-size);
                font-weight: 700;
                letter-spacing: -0.02em;
                background:
                        radial-gradient(circle at center, color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent) 60%, transparent 61%),
                        conic-gradient(
                                from -90deg,
                                var(--book-progress-ring) 0 var(--book-progress),
                                color-mix(in srgb, var(--background-modifier-border) 78%, transparent) var(--book-progress) 100%
                        );
                box-shadow:
                        inset 0 0 0 1px color-mix(in srgb, var(--background-modifier-border) 72%, transparent),
                        0 10px 18px rgba(0, 0, 0, 0.06);
        }

        .book-progress-badge::after {
                content: '';
                position: absolute;
                inset: 6px;
                border-radius: 50%;
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 98%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
        }

        .book-progress-badge span {
                position: relative;
                z-index: 1;
                line-height: 1;
        }

        .book-progress-badge.is-progress-start {
                --book-progress-ring: #9aa3b2;
        }

        .book-progress-badge.is-progress-low {
                --book-progress-ring: #6d9eff;
        }

        .book-progress-badge.is-progress-mid {
                --book-progress-ring: #4ec7d8;
        }

        .book-progress-badge.is-progress-high {
                --book-progress-ring: #f0b44b;
        }

        .book-progress-badge.is-progress-near {
                --book-progress-ring: #ff8f5c;
        }

        .book-progress-badge.is-progress-complete {
                --book-progress-ring: #3ecf8e;
        }

        .book-progress-badge.is-progress-complete span {
                color: color-mix(in srgb, #3ecf8e 72%, var(--text-normal));
        }

        /* -- View Toggle -- */
        .epub-view-toggle {
                display: inline-flex;
                align-items: center;
                border-radius: var(--clickable-icon-radius);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
                overflow: hidden;
        }

        .epub-view-toggle-btn {
                width: var(--input-height);
                height: var(--input-height);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: none;
                border-radius: 0;
                background: transparent;
                color: var(--text-faint);
                box-shadow: none;
                transition: background-color 0.14s ease, color 0.14s ease;
        }

        .epub-view-toggle-btn:hover {
                color: var(--text-muted);
                background: color-mix(in srgb, var(--background-modifier-hover) 50%, transparent);
        }

        .epub-view-toggle-btn.is-active {
                color: var(--text-normal);
                background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
        }

        .epub-view-toggle-btn :global(.svg-icon) {
                width: var(--icon-xs);
                height: var(--icon-xs);
        }

        /* -- Grid Layout -- */
        .epub-bookshelf-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: var(--weave-bookshelf-grid-gap);
                padding: var(--size-4-2) var(--weave-bookshelf-grid-padding-inline) var(--weave-bookshelf-grid-padding-bottom);
        }

        .epub-bookshelf-cover-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
                gap: var(--weave-bookshelf-card-gap) var(--weave-bookshelf-grid-gap);
                padding: var(--weave-bookshelf-card-padding) var(--weave-bookshelf-grid-padding-inline) var(--weave-bookshelf-grid-padding-bottom);
        }

        /* -- Grid Card -- */
        .epub-book-card {
                display: flex;
                flex-direction: column;
                padding: 8px;
                border-radius: var(--radius-xl);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 97%, transparent);
                box-shadow: var(--weave-bookshelf-card-shadow);
                cursor: pointer;
                transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
        }

        .epub-book-card.is-opening {
                opacity: 0.68;
                pointer-events: none;
        }

        .epub-book-card:hover,
        .epub-book-card:focus-visible {
                transform: translateY(-2px);
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                box-shadow: var(--weave-bookshelf-grid-card-shadow-hover);
                outline: none;
        }

        .card-cover-img {
                width: 100%;
                height: var(--weave-bookshelf-card-cover-height);
                object-fit: cover;
                border-radius: var(--weave-bookshelf-card-cover-radius);
                display: block;
        }

        .card-cover-placeholder {
                width: 100%;
                height: var(--weave-bookshelf-card-cover-height);
                border-radius: var(--weave-bookshelf-card-cover-radius);
                display: flex;
                align-items: center;
                justify-content: center;
                background: color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 92%, transparent);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
                color: var(--text-faint);
        }

        .card-cover-placeholder :global(.svg-icon) {
                width: var(--weave-bookshelf-cover-placeholder-icon-size);
                height: var(--weave-bookshelf-cover-placeholder-icon-size);
        }

        .card-body {
                padding: 8px 4px 4px;
                display: flex;
                flex-direction: column;
                flex: 1;
                gap: 4px;
                min-height: 0;
        }

        .card-title {
                font-size: var(--weave-bookshelf-card-title-size);
                font-weight: 600;
                line-height: 1.38;
                color: var(--text-normal);
                display: -webkit-box;
                -webkit-line-clamp: 2;
                line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-word;
        }

        .card-author {
                font-size: var(--weave-bookshelf-card-author-size);
                line-height: 1.35;
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
        }

        .card-progress {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: auto;
                padding-top: 8px;
        }

        .card-progress-bar {
                flex: 1;
                height: 4px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
                overflow: hidden;
        }

        .card-progress-fill {
                --book-progress-ring: color-mix(in srgb, var(--interactive-accent) 82%, white 8%);
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(
                        90deg,
                        var(--book-progress-ring),
                        color-mix(in srgb, var(--book-progress-ring) 82%, white)
                );
                transition: width 0.3s ease;
        }

        .card-progress-fill.is-progress-start {
                --book-progress-ring: #9aa3b2;
        }

        .card-progress-fill.is-progress-low {
                --book-progress-ring: #6d9eff;
        }

        .card-progress-fill.is-progress-mid {
                --book-progress-ring: #4ec7d8;
        }

        .card-progress-fill.is-progress-high {
                --book-progress-ring: #f0b44b;
        }

        .card-progress-fill.is-progress-near {
                --book-progress-ring: #ff8f5c;
        }

        .card-progress-fill.is-progress-complete {
                --book-progress-ring: #3ecf8e;
        }

        .card-progress-text {
                flex: 0 0 auto;
                font-size: var(--weave-bookshelf-chip-size);
                font-weight: 700;
                color: var(--text-muted);
                letter-spacing: -0.02em;
        }

        .epub-book-cover-tile {
                display: flex;
                flex-direction: column;
                border-radius: var(--radius-xl);
                overflow: hidden;
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 58%, transparent);
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent);
                box-shadow: var(--weave-bookshelf-cover-tile-shadow);
                transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
        }

        .epub-book-cover-tile.is-opening {
                opacity: 0.68;
                pointer-events: none;
        }

        .epub-book-cover-tile:hover,
        .epub-book-cover-tile:focus-visible {
                transform: translateY(-2px);
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                box-shadow: var(--weave-bookshelf-cover-tile-shadow-hover);
                outline: none;
        }

        .cover-tile-media {
                overflow: hidden;
                border-radius: 15px 15px 0 0;
                background: color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 84%, transparent);
        }

        .cover-tile-img,
        .cover-tile-placeholder {
                display: block;
                width: 100%;
                aspect-ratio: 0.72;
        }

        .cover-tile-img {
                object-fit: cover;
        }

        .cover-tile-placeholder {
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                gap: 12px;
                padding: 14px 12px 12px;
                background:
                        linear-gradient(180deg, rgba(var(--interactive-accent-rgb), 0.18), rgba(0, 0, 0, 0.04)),
                        color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 90%, transparent);
                color: var(--text-normal);
        }

        .cover-tile-placeholder-title {
                display: -webkit-box;
                -webkit-line-clamp: 4;
                line-clamp: 4;
                -webkit-box-orient: vertical;
                overflow: hidden;
                font-size: var(--weave-bookshelf-cover-tile-title-size);
                font-weight: 700;
                line-height: 1.35;
                letter-spacing: -0.02em;
        }

        .cover-tile-placeholder-icon {
                display: inline-flex;
                align-items: center;
                justify-content: flex-end;
                color: color-mix(in srgb, var(--text-normal) 62%, white);
        }

        .cover-tile-placeholder-icon :global(.svg-icon) {
                width: var(--weave-bookshelf-thumb-icon-size);
                height: var(--weave-bookshelf-thumb-icon-size);
        }

        .cover-tile-footer {
                display: flex;
                align-items: center;
                padding: 8px 10px 10px;
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 98%, transparent);
        }

        .cover-tile-progress {
                --cover-progress: 0%;
                --book-progress-ring: color-mix(in srgb, var(--interactive-accent) 88%, black 6%);
                width: 100%;
                height: 4px;
                border-radius: 999px;
                background: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
                overflow: hidden;
                box-shadow:
                        inset 0 0 0 1px color-mix(in srgb, var(--background-modifier-border) 44%, transparent),
                        0 1px 4px rgba(0, 0, 0, 0.08);
        }

        .cover-tile-progress.is-progress-start {
                --book-progress-ring: #9aa3b2;
        }

        .cover-tile-progress.is-progress-low {
                --book-progress-ring: #6d9eff;
        }

        .cover-tile-progress.is-progress-mid {
                --book-progress-ring: #4ec7d8;
        }

        .cover-tile-progress.is-progress-high {
                --book-progress-ring: #f0b44b;
        }

        .cover-tile-progress.is-progress-near {
                --book-progress-ring: #ff8f5c;
        }

        .cover-tile-progress.is-progress-complete {
                --book-progress-ring: #3ecf8e;
        }

        .cover-tile-progress::before {
                content: '';
                display: block;
                width: var(--cover-progress);
                height: 100%;
                border-radius: inherit;
                background: var(--book-progress-ring);
        }

        /* -- Shelf Entrance Animation -- */
        @keyframes epub-shelf-enter {
                from {
                        opacity: 0;
                        transform: translateY(8px);
                }
                to {
                        opacity: 1;
                        transform: translateY(0);
                }
        }

        .epub-book-item,
        .epub-book-card,
        .epub-book-cover-tile {
                animation: epub-shelf-enter 0.28s ease both;
        }

        @container (max-width: 360px) {
                .epub-book-item {
                        gap: 12px;
                        padding: 11px;
                }

                .epub-bookshelf-toolbar.nav-header {
                        padding-inline: 8px;
                }

                .epub-bookshelf-cover-grid {
                        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
                        gap: 12px 10px;
                }

                .book-progress-badge {
                        width: calc(var(--weave-bookshelf-progress-size) - var(--size-4-2) + 2px);
                        height: calc(var(--weave-bookshelf-progress-size) - var(--size-4-2) + 2px);
                        flex-basis: calc(var(--weave-bookshelf-progress-size) - var(--size-4-2) + 2px);
                        font-size: 10px;
                }

                .book-progress-badge::after {
                        inset: 5px;
                }
        }
</style>

<div class="epub-bookshelf-root" class:is-list-virtualized={useListVirtualScroll} bind:this={bookshelfRootEl}>
        <div class="epub-bookshelf-toolbar nav-header" role="toolbar" aria-label={t('epub.bookshelf.toolbar.aria')}>
                <div class="epub-bookshelf-actions nav-buttons-container">
                        <button
                                type="button"
                                class="epub-toolbar-btn clickable-icon nav-action-button"
                                title={t('epub.bookshelf.toolbar.import')}
                                aria-label={t('epub.bookshelf.toolbar.import')}
                                onclick={() => {
                                        void scanVaultAndPromptImport();
                                }}
                        >
                                <span use:icon={'scan-search'}></span>
                        </button>
                        <button
                                type="button"
                                class="epub-toolbar-btn clickable-icon nav-action-button"
                                title={searching ? t('epub.bookshelf.toolbar.searchClose') : t('epub.bookshelf.toolbar.search')}
                                aria-label={searching ? t('epub.bookshelf.toolbar.searchClose') : t('epub.bookshelf.toolbar.search')}
                                onclick={toggleBookshelfSearch}
                        >
                                <span use:icon={searching ? 'x' : 'search'}></span>
                        </button>
                        <button
                                type="button"
                                class="epub-toolbar-btn clickable-icon nav-action-button"
                                title={effectiveBackButtonLabel}
                                aria-label={effectiveBackButtonLabel}
                                onclick={() => {
                                        void Promise.resolve(onBack?.());
                                }}
                        >
                                <span use:icon={'arrow-left'}></span>
                        </button>
                        <button
                                type="button"
                                class="epub-toolbar-btn clickable-icon nav-action-button"
                                title={t('epub.bookshelf.toolbar.settings')}
                                aria-label={t('epub.bookshelf.toolbar.settings')}
                                onclick={handleSettingsAction}
                        >
                                <span use:icon={'settings'}></span>
                        </button>
                </div>
        </div>

{#snippet listBookItem(file: DisplayBookItem, index: number, animateEntry = true)}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="epub-book-item"
		class:is-opening={openingBookPath === file.path}
		style={animateEntry ? `animation-delay: ${Math.min(index, 8) * 36}ms` : undefined}
		onclick={() => switchBook(file.path)}
		oncontextmenu={(e) => handleContextMenu(e, file.path)}
		onkeydown={(event) => handleBookKeydown(event, file.path)}
		role="button"
		tabindex="0"
	>
		{#if covers.get(file.path)}
			<img src={covers.get(file.path)} alt="" class="book-thumb" />
		{:else}
			<div class="book-thumb-placeholder">
				<span use:icon={'book-text'}></span>
			</div>
		{/if}
		<div class="book-info">
			<div class="book-name">{file.displayTitle}</div>
			{#if file.bylineText}
				<div class="book-meta-text">{file.bylineText}</div>
			{/if}
			{#if file.tagValues.length > 0}
				<div class="book-meta-chips">
					{#each file.tagValues as tagValue}
						<div class={`book-meta-chip is-${tagValue.tone}`}>{tagValue.value}</div>
					{/each}
				</div>
			{/if}
		</div>
		<div
			class={`book-progress-badge ${getBookshelfProgressToneClass(file.progress)}`}
			style={`--book-progress:${clampProgress(file.progress)}%;`}
			role="img"
			aria-label={t('epub.bookshelf.progress', { progress: clampProgress(file.progress) })}
			title={t('epub.bookshelf.progress', { progress: clampProgress(file.progress) })}
		>
			<span>{clampProgress(file.progress)}%</span>
		</div>
	</div>
{/snippet}

{#if searching}
        <div class="epub-bookshelf-search">
                <CardSearchInput
                        app={app}
                        bind:value={searchQuery}
                        onClear={clearSearchCriteria}
                        placeholder={t('epub.bookshelf.searchPlaceholder')}
                        dataSource="bookshelf"
                        availableStatuses={localizedBookshelfReadingStatusOptions}
                        availableAuthors={availableAuthorOptions}
                        availablePublishers={availablePublisherOptions}
                        availableFormats={availableFormatOptions}
                        matchCount={filteredFiles.length}
                        totalCount={displayBooks.length}
                        showSortButton={false}
                        autoFocus={!hasActiveSearchCriteria()}
                />
        </div>
{/if}

{#key `${effectiveViewMode}:${bookshelfDisplayMode}:${detectedSurfaceContext}:${useListVirtualScroll}`}
        {#if loadingBooks && epubFiles.length === 0}
                <div class="epub-placeholder">{t('epub.bookshelf.refreshing')}</div>
        {:else if filteredFiles.length === 0}
                <div class="epub-placeholder">
                        {emptyStateMessage}
                </div>
        {:else if useListVirtualScroll}
                <div class="epub-bookshelf-list is-virtualized" bind:this={listViewportEl}>
                        <VirtualScroll
                                items={filteredFiles}
                                itemHeight={BOOKSHELF_LIST_VIRTUAL_ITEM_HEIGHT}
                                containerHeight={listViewportHeight}
                                overscan={BOOKSHELF_LIST_VIRTUAL_OVERSCAN}
                                className="epub-bookshelf-virtual-scroll"
                                onItemsRendered={handleVirtualItemsRendered}
                        >
                                {#snippet children(file, index)}
                                        {@render listBookItem(file as DisplayBookItem, index, false)}
                                {/snippet}
                        </VirtualScroll>
                </div>
        {:else}
                <div
                        class={
                                effectiveViewMode === 'covers'
                                        ? `epub-bookshelf-cover-grid${useGridPaintOptimization ? ' is-paint-optimized' : ''}`
                                        : (effectiveViewMode === 'grid'
                                                ? `epub-bookshelf-grid${useGridPaintOptimization ? ' is-paint-optimized' : ''}`
                                                : 'epub-bookshelf-list')
                        }
                >
                {#each filteredFiles as file, index (file.path)}
			{#if effectiveViewMode === 'covers'}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="epub-book-cover-tile"
					class:is-opening={openingBookPath === file.path}
					style="animation-delay: {index * 28}ms"
					onclick={() => switchBook(file.path)}
					oncontextmenu={(e) => handleContextMenu(e, file.path)}
					onkeydown={(event) => handleBookKeydown(event, file.path)}
					role="button"
					tabindex="0"
					aria-label={`${file.displayTitle}, ${t('epub.bookshelf.progress', { progress: clampProgress(file.progress) })}`}
					title={`${file.displayTitle} · ${clampProgress(file.progress)}%`}
				>
					<div class="cover-tile-media">
						{#if covers.get(file.path)}
							<img src={covers.get(file.path)} alt="" class="cover-tile-img" />
						{:else}
							<div class="cover-tile-placeholder">
								<span class="cover-tile-placeholder-title">{file.displayTitle}</span>
								<span class="cover-tile-placeholder-icon" use:icon={'book-text'}></span>
							</div>
						{/if}
					</div>
					<div class="cover-tile-footer">
						<div
							class={`cover-tile-progress ${getBookshelfProgressToneClass(file.progress)}`}
							style={`--cover-progress:${clampProgress(file.progress)}%;`}
							aria-hidden="true"
						></div>
					</div>
				</div>
			{:else if effectiveViewMode === 'grid'}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="epub-book-card"
					class:is-opening={openingBookPath === file.path}
					style="animation-delay: {index * 36}ms"
					onclick={() => switchBook(file.path)}
					oncontextmenu={(e) => handleContextMenu(e, file.path)}
					onkeydown={(event) => handleBookKeydown(event, file.path)}
					role="button"
					tabindex="0"
				>
					{#if covers.get(file.path)}
						<img src={covers.get(file.path)} alt="" class="card-cover-img" />
					{:else}
						<div class="card-cover-placeholder">
							<span use:icon={'book-text'}></span>
						</div>
					{/if}
					<div class="card-body">
						<div class="card-title">{file.displayTitle}</div>
						{#if file.bylineText}
							<div class="card-author">{file.bylineText}</div>
						{/if}
						{#if file.tagValues.length > 0}
							<div class="book-meta-chips">
								{#each file.tagValues as tagValue}
									<div class={`book-meta-chip is-${tagValue.tone}`}>{tagValue.value}</div>
								{/each}
							</div>
						{/if}
						<div class="card-progress">
							<div class="card-progress-bar">
								<div
									class={`card-progress-fill ${getBookshelfProgressToneClass(file.progress)}`}
									style="width: {clampProgress(file.progress)}%"
								></div>
							</div>
							<span class="card-progress-text">{clampProgress(file.progress)}%</span>
						</div>
					</div>
				</div>
			{:else}
				{@render listBookItem(file, index, true)}
			{/if}
		{/each}
                </div>
	{/if}
{/key}
</div>
