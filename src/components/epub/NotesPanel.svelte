<script lang="ts">
	import { onMount } from 'svelte';
	import type { App } from 'obsidian';
	import { tr } from '../../utils/i18n';
	import { logger } from '../../utils/logger';
	import { parseSearchQuery, type DateRange, type SearchQuery } from '../../utils/search-parser';
	import type { EpubBook, EpubDisplayHighlight, EpubHighlightViewSnapshotService, EpubReaderEngine } from '../../services/epub';
	import { getEpubAnnotationIndexService } from '../../services/epub';
	import type { EpubAnnotationService } from '../../services/epub';
	import type { EpubBacklinkHighlightService } from '../../services/epub/EpubBacklinkHighlightService';
	import EpubAnnotationCard from './EpubAnnotationCard.svelte';
	import EpubLoadingState from './EpubLoadingState.svelte';

	interface HighlightSearchMeta {
		availableTags: string[];
		availableSources: string[];
		availableCommentStates: string[];
		availableNoteTypes: string[];
		availableHighlightColors: string[];
		matchCount: number;
		totalCount: number;
	}

	interface Props {
		app: App;
		book: EpubBook | null;
		readerService?: EpubReaderEngine | null;
		annotationService: EpubAnnotationService;
		snapshotService?: EpubHighlightViewSnapshotService | null;
		backlinkService?: EpubBacklinkHighlightService;
		filePath?: string;
		highlightRevision?: number;
		showStrikethroughHighlights?: boolean;
		searchQuery?: string;
		searchMeta?: HighlightSearchMeta;
		onNavigate?: (
			cfi: string,
			text?: string,
			color?: string,
			metadata?: {
				sourceFile?: string;
				sourceRef?: string;
				createdTime?: number;
			}
		) => void;
	}

	let {
		app,
		book,
		readerService = null,
		annotationService,
		snapshotService = null,
		backlinkService,
		filePath,
		highlightRevision = 0,
		showStrikethroughHighlights = false,
		searchQuery = $bindable(''),
		searchMeta = $bindable<HighlightSearchMeta>({
			availableTags: [],
			availableSources: [],
			availableCommentStates: [],
			availableNoteTypes: [],
			availableHighlightColors: [],
			matchCount: 0,
			totalCount: 0,
		}),
		onNavigate,
	}: Props = $props();
	let t = $derived($tr);

	let highlights = $state<EpubDisplayHighlight[]>([]);
	let preparing = $state(false);
	let syncing = $state(false);
	let annotationLoadToken = 0;
	let panelDisposed = false;
	let lastLoadContextKey = '';

	function normalizeSearchText(value: string | undefined): string {
		return typeof value === 'string' ? value.trim().toLowerCase() : '';
	}

	function buildUniqueSortedValues(values: Array<string | undefined>): string[] {
		return Array.from(new Set(values.map((value) => value?.trim() || '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
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

	function matchesArrayFieldValues(targets: string[], values: string[]): boolean {
		if (values.length === 0) {
			return true;
		}

		return values.some((value) => {
			const normalizedValue = normalizeSearchText(value);
			if (!normalizedValue) {
				return false;
			}

			return targets.some((target) => normalizeSearchText(target).includes(normalizedValue));
		});
	}

	function parseDateBoundary(value: string, boundary: 'start' | 'end'): number | null {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return null;
		}

		const timestamp = new Date(boundary === 'start' ? `${value}T00:00:00.000` : `${value}T23:59:59.999`).getTime();
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

	function formatTime(timestamp: number): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		const h = String(date.getHours()).padStart(2, '0');
		const min = String(date.getMinutes()).padStart(2, '0');
		return `${y}-${m}-${d} ${h}:${min}`;
	}

	function getSourceLabel(sourceFile?: string): string {
		if (!sourceFile) {
			return '';
		}
		const normalized = sourceFile.replace(/\\/g, '/');
		const basename = normalized.split('/').pop() || normalized;
		const displayName = basename.replace(/\.[^.]+$/, '');
		return displayName ? `- 《${displayName}》` : '';
	}

	function getEmptyExcerptHint(text?: string): string {
		return String(text || '').trim() ? '' : t('epub.notes.emptyExcerpt');
	}

	function navigateToHighlight(hl: EpubDisplayHighlight) {
		if (hl.cfiRange) {
			onNavigate?.(hl.cfiRange, hl.text, hl.color, {
				sourceFile: hl.sourceFile,
				sourceRef: hl.sourceRef,
				createdTime: hl.createdTime,
			});
		}
	}

	function matchesCommentValues(highlight: EpubDisplayHighlight, values: string[]): boolean {
		if (values.length === 0) {
			return true;
		}

		return values.some((value) => {
			const normalizedValue = normalizeSearchText(value);
			if (!normalizedValue) {
				return false;
			}

			if ([t('epub.notes.commented').toLowerCase(), '有', 'true', 'yes', '1', 'commented'].includes(normalizedValue)) {
				return highlight.hasCommentDivider;
			}

			if ([t('epub.notes.uncommented').toLowerCase(), '无', 'false', 'no', '0', 'none'].includes(normalizedValue)) {
				return !highlight.hasCommentDivider;
			}

			return highlight.commentStateLabel.toLowerCase().includes(normalizedValue);
		});
	}

	function matchesHighlightQuery(highlight: EpubDisplayHighlight, query: SearchQuery): boolean {
		if (!query.raw.trim()) {
			return true;
		}

		const noteTypeSearchTarget = `${highlight.noteType} ${highlight.noteTypeKey}`;
		const colorSearchTarget = `${highlight.colorLabel} ${highlight.color}`;

		return matchesSearchTermList(highlight.searchableValues, query.text)
			&& matchesExcludedSearchTerms(highlight.searchableValues, query.excludeText)
			&& matchesArrayFieldValues(highlight.tags, query.tags)
			&& matchesFieldValues(highlight.sourceFile, query.sources)
			&& matchesCommentValues(highlight, query.comments)
			&& matchesFieldValues(noteTypeSearchTarget, query.types)
			&& matchesFieldValues(colorSearchTarget, query.colors)
			&& matchesDateRanges(highlight.createdTime, query.dateRanges);
	}

	let parsedHighlightSearchQuery = $derived.by(() => parseSearchQuery(searchQuery));

	let filteredHighlights = $derived.by(() =>
		highlights.filter((highlight) => matchesHighlightQuery(highlight, parsedHighlightSearchQuery))
	);

	let availableTagOptions = $derived.by(() =>
		buildUniqueSortedValues(highlights.flatMap((highlight) => highlight.tags))
	);

	let availableSourceOptions = $derived.by(() =>
		buildUniqueSortedValues(highlights.map((highlight) => highlight.sourceFile))
	);

	let availableCommentStateOptions = $derived.by(() =>
		buildUniqueSortedValues(highlights.map((highlight) => highlight.commentStateLabel))
	);

	let availableNoteTypeOptions = $derived.by(() =>
		buildUniqueSortedValues(highlights.map((highlight) => highlight.noteType))
	);

	let availableHighlightColorOptions = $derived.by(() =>
		buildUniqueSortedValues(highlights.map((highlight) => highlight.colorLabel))
	);

	$effect(() => {
		searchMeta = {
			availableTags: availableTagOptions,
			availableSources: availableSourceOptions,
			availableCommentStates: availableCommentStateOptions,
			availableNoteTypes: availableNoteTypeOptions,
			availableHighlightColors: availableHighlightColorOptions,
			matchCount: filteredHighlights.length,
			totalCount: highlights.length,
		};
	});

	function isStaleAnnotationsLoad(loadToken: number, expectedBookId: string, expectedFilePath?: string): boolean {
		return panelDisposed
			|| loadToken !== annotationLoadToken
			|| book?.id !== expectedBookId
			|| (filePath ?? '') !== (expectedFilePath ?? '');
	}

	function applySnapshot(nextHighlights: EpubDisplayHighlight[]) {
		highlights = nextHighlights;
	}

	async function hydratePageLabelsInBackground(
		loadToken: number,
		expectedBook: NonNullable<typeof book>,
		expectedFilePath: string | undefined,
		showStrikethrough: boolean
	) {
		if (!snapshotService) {
			return;
		}
		try {
			const hydratedSnapshot = await snapshotService.hydratePageLabels({
				bookId: expectedBook.id,
				filePath: expectedFilePath ?? '',
				showStrikethroughHighlights: showStrikethrough,
				annotationService,
				backlinkService,
				readerService,
				highlightRevision,
			});
			if (!hydratedSnapshot || isStaleAnnotationsLoad(loadToken, expectedBook.id, expectedFilePath)) {
				return;
			}
			applySnapshot(hydratedSnapshot.highlights);
		} catch (error) {
			logger.error('[NotesPanel] Failed to hydrate page labels:', error);
		}
	}

	async function refreshAnnotationsInBackground(
		loadToken: number,
		expectedBook: NonNullable<typeof book>,
		expectedFilePath: string | undefined,
		showStrikethrough: boolean
	) {
		if (!snapshotService) {
			return;
		}
		syncing = true;
		try {
			const freshSnapshot = await snapshotService.revalidateSnapshot({
				bookId: expectedBook.id,
				filePath: expectedFilePath ?? '',
				showStrikethroughHighlights: showStrikethrough,
				annotationService,
				backlinkService,
				readerService,
				highlightRevision,
			});
			if (!freshSnapshot || isStaleAnnotationsLoad(loadToken, expectedBook.id, expectedFilePath)) {
				return;
			}
			applySnapshot(freshSnapshot.highlights);
			if (!freshSnapshot.pageLabelsResolved) {
				void hydratePageLabelsInBackground(
					loadToken,
					expectedBook,
					expectedFilePath,
					showStrikethrough
				);
			}
		} catch (error) {
			logger.error('[NotesPanel] Failed to refresh annotations:', error);
		} finally {
			if (!isStaleAnnotationsLoad(loadToken, expectedBook.id, expectedFilePath)) {
				syncing = false;
			}
		}
	}

	function buildSnapshotContext(
		currentBook: NonNullable<typeof book>,
		expectedFilePath: string | undefined
	) {
		return {
			bookId: currentBook.id,
			filePath: expectedFilePath ?? '',
			showStrikethroughHighlights,
		};
	}

	async function resolveDisplaySnapshot(
		currentBook: NonNullable<typeof book>,
		expectedFilePath: string | undefined
	) {
		const context = buildSnapshotContext(currentBook, expectedFilePath);
		const memorySnapshot = snapshotService?.getCachedSnapshot(context) || null;
		if (memorySnapshot) {
			return memorySnapshot;
		}
		if (!snapshotService) {
			return null;
		}
		return (await snapshotService.hydrateFromDisk(context)) || null;
	}

	async function loadAnnotations() {
		const currentBook = book;
		if (!currentBook) {
			highlights = [];
			preparing = false;
			syncing = false;
			return;
		}
		const expectedFilePath = filePath;
		const loadToken = ++annotationLoadToken;
		const snapshotContext = buildSnapshotContext(currentBook, expectedFilePath);
		const cachedSnapshot = await resolveDisplaySnapshot(currentBook, expectedFilePath);
		if (cachedSnapshot) {
			applySnapshot(cachedSnapshot.highlights);
			preparing = false;
			void refreshAnnotationsInBackground(
				loadToken,
				currentBook,
				expectedFilePath,
				showStrikethroughHighlights
			);
			return;
		}

		const annotationIndex = getEpubAnnotationIndexService(app);
		const readiness = annotationIndex.getReadiness(snapshotContext);
		if (readiness === 'preparing') {
			preparing = true;
			syncing = false;
			await annotationIndex.waitForReady(snapshotContext);
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}
			const warmedSnapshot = await resolveDisplaySnapshot(currentBook, expectedFilePath);
			if (warmedSnapshot) {
				applySnapshot(warmedSnapshot.highlights);
				preparing = false;
				void refreshAnnotationsInBackground(
					loadToken,
					currentBook,
					expectedFilePath,
					showStrikethroughHighlights
				);
				return;
			}
		}

		preparing = true;
		syncing = false;
		try {
			await annotationIndex.prefetchBook({
				...snapshotContext,
				annotationService,
				backlinkService,
				readerService,
				highlightRevision,
				priority: 'immediate',
			});
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}
			const freshSnapshot = await resolveDisplaySnapshot(currentBook, expectedFilePath);
			if (freshSnapshot) {
				applySnapshot(freshSnapshot.highlights);
				if (!freshSnapshot.pageLabelsResolved && snapshotService) {
					void hydratePageLabelsInBackground(
						loadToken,
						currentBook,
						expectedFilePath,
						showStrikethroughHighlights
					);
				}
				return;
			}

			const revalidatedSnapshot = snapshotService
				? await snapshotService.revalidateSnapshot({
					...snapshotContext,
					annotationService,
					backlinkService,
					readerService,
					highlightRevision,
				})
				: null;
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}
			if (revalidatedSnapshot) {
				applySnapshot(revalidatedSnapshot.highlights);
				if (!revalidatedSnapshot.pageLabelsResolved && snapshotService) {
					void hydratePageLabelsInBackground(
						loadToken,
						currentBook,
						expectedFilePath,
						showStrikethroughHighlights
					);
				}
			}
		} catch (error) {
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}
			logger.error('[NotesPanel] Failed to load annotations:', error);
			highlights = [];
		} finally {
			if (!isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				preparing = false;
			}
		}
	}

	$effect(() => {
		const contextKey = [book?.id ?? '', filePath ?? '', String(highlightRevision), showStrikethroughHighlights ? '1' : '0'].join('::');
		if (book && annotationService) {
			if (contextKey === lastLoadContextKey) {
				return;
			}
			lastLoadContextKey = contextKey;
			void loadAnnotations();
		} else {
			annotationLoadToken += 1;
			highlights = [];
			preparing = false;
			syncing = false;
			lastLoadContextKey = '';
		}
	});

	onMount(() => {
		return () => {
			panelDisposed = true;
			annotationLoadToken += 1;
		};
	});
</script>

<div class="epub-notes-panel">
	{#if preparing}
		<EpubLoadingState message={t('epub.notes.preparing')} surface />
	{:else if filteredHighlights.length === 0}
		<div class="epub-placeholder">
			{#if highlights.length === 0}
				{t('epub.notes.empty')}
			{:else}
				{t('epub.notes.noMatches')}
			{/if}
		</div>
	{:else}
		{#if syncing}
			<div class="epub-notes-sync-hint" aria-live="polite">{t('epub.notes.syncing')}</div>
		{/if}
		{#if filteredHighlights.length > 0}
			<section class="notes-section">
				<div class="notes-section-list">
					{#each filteredHighlights as hl}
						<EpubAnnotationCard
							clickable={true}
							onActivate={() => navigateToHighlight(hl)}
							color={hl.color}
							quoteText={hl.text}
							commentText={hl.hasCommentDivider ? (hl.commentText || t('epub.notes.emptyComment')) : getEmptyExcerptHint(hl.text)}
							commentMuted={!hl.hasCommentDivider}
							metaLeft={getSourceLabel(hl.sourceFile)}
							metaRightPrefix={formatTime(hl.createdTime)}
							metaRight={hl.pageLabel}
						/>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.epub-notes-sync-hint {
		flex: 0 0 auto;
		padding: 4px 12px 0;
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.epub-notes-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px 12px 22px;
	}

	.epub-placeholder {
		padding: 22px 14px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--weave-elevated-background, var(--background-secondary)) 88%, transparent);
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.7;
	}

	.notes-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.notes-section-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
