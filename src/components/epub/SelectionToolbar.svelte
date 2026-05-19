<script lang="ts">
	import { setIcon, Platform } from 'obsidian';
	import type { App } from 'obsidian';
	import { onMount, tick, untrack } from 'svelte';
	import { PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
	import { tr } from '../../utils/i18n';
	import { isWeaveMainPluginEnabled } from '../../utils/weave-reader-access';
	import { logger } from '../../utils/logger';
	import type { EpubBook, EpubHighlightStyle, EpubReaderEngine, ReaderFrame } from '../../services/epub';
	import { computeToolbarPosition, createEventBinder, isEventOutsideToolbar } from './toolbar-positioning';

	type ExternalSelectionState = {
		text: string;
		cfiRange: string;
		rect: DOMRect;
		rects?: DOMRect[];
		clear?: () => void;
	};

	interface Props {
		app: App;
		readerService: EpubReaderEngine;
		book: EpubBook | null;
		readerVersion?: number;
		autoInsert?: boolean;
		canvasMode?: boolean;
		canUseExcerptNotes?: boolean;
		canUseStyledExcerpts?: boolean;
		showPremiumFeaturePreviewEnabled?: boolean;
		onRequestPremiumFeaturePreview?: (featureId: string) => void;
		boundsEl?: HTMLElement | null;
		externalSelection?: ExternalSelectionState | null;
		onInsertToNote?: (text: string, cfiRange: string, color?: string, style?: EpubHighlightStyle) => void;
		onAutoInsert?: (text: string, cfiRange: string, color?: string, style?: EpubHighlightStyle) => void;
		onExtractToCard?: (text: string, cfiRange: string) => void;
		onCreateReadingPoint?: (text: string, cfiRange: string) => void;
		onOpenAIMenu: (event: MouseEvent, text: string, cfiRange: string) => void;
	}

	let {
		app,
		readerService,
		book,
		readerVersion = 0,
		autoInsert = false,
		canvasMode = false,
		canUseExcerptNotes = true,
		canUseStyledExcerpts = true,
		showPremiumFeaturePreviewEnabled = false,
		onRequestPremiumFeaturePreview,
		boundsEl = null,
		externalSelection = null,
		onInsertToNote,
		onAutoInsert,
		onExtractToCard,
		onCreateReadingPoint,
		onOpenAIMenu
	}: Props = $props();
	let t = $derived($tr);
	let canUseAiSplit = $derived(isWeaveMainPluginEnabled(app));

	let toolbarEl: HTMLDivElement | undefined = $state(undefined);
	let isVisible = $state(false);
	let posTop = $state(0);
	let posLeft = $state(0);
	let isBelowSelection = $state(false);
	let toolbarMode = $state<'floating' | 'docked'>('floating');
	let arrowOffset = $state(0);
	let selectedText = $state('');
	let currentCfiRange = $state('');
	let iframeDoc: Document | null = null;
	let teardownReaderTracking: (() => void) | null = null;
	let teardownPositionTracking: (() => void) | null = null;
	let activeFrame: ReaderFrame | null = null;
	let pendingSyncFrame: number | null = null;
	let activeClearSelection: (() => void) | null = null;
	let pendingExternalSelectionHideFrame: number | null = null;

	const isMobileToolbar = Platform.isMobile || document.body.classList.contains('is-mobile');

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

	function getFrameElement(frame: ReaderFrame | null | undefined): HTMLIFrameElement | null {
		const iframeWindow = frame?.window || frame?.document?.defaultView;
		return (iframeWindow?.frameElement as HTMLIFrameElement | null) || null;
	}

	function closestAcrossShadowHosts(node: Node | null | undefined, selector: string): HTMLElement | null {
		let current: Node | null | undefined = node;
		while (current) {
			if (current instanceof HTMLElement) {
				const matched = current.closest(selector) as HTMLElement | null;
				if (matched) {
					return matched;
				}
			}
			const rootNode = current.getRootNode?.();
			if (!(rootNode instanceof ShadowRoot) || !(rootNode.host instanceof HTMLElement)) {
				break;
			}
			current = rootNode.host;
		}
		return null;
	}

	function getViewportContainer(frame: ReaderFrame | null | undefined): HTMLElement | null {
		const iframe = getFrameElement(frame);
		return closestAcrossShadowHosts(iframe, '.epub-reader-viewport')
			|| boundsEl
			|| (document.querySelector('.epub-reader-viewport') as HTMLElement | null);
	}

	function getScrollTrackingHost(frame: ReaderFrame | null | undefined): HTMLElement | null {
		const iframe = getFrameElement(frame);
		return closestAcrossShadowHosts(iframe, '.epub-content-wrapper')
			|| (document.querySelector('.epub-content-wrapper') as HTMLElement | null);
	}

	function toAbsoluteViewportRect(rect: DOMRect, viewportEl: HTMLElement): DOMRect {
		const viewportRect = viewportEl.getBoundingClientRect();
		return new DOMRect(
			rect.left + viewportRect.left,
			rect.top + viewportRect.top,
			rect.width,
			rect.height
		);
	}

	function clearPendingSync() {
		if (pendingSyncFrame !== null) {
			window.cancelAnimationFrame(pendingSyncFrame);
			pendingSyncFrame = null;
		}
	}

	function clearPendingExternalSelectionHide() {
		if (pendingExternalSelectionHideFrame !== null) {
			window.cancelAnimationFrame(pendingExternalSelectionHideFrame);
			pendingExternalSelectionHideFrame = null;
		}
	}

	function stopPositionTracking() {
		clearPendingSync();
		teardownPositionTracking?.();
		teardownPositionTracking = null;
		activeFrame = null;
	}

	function hideToolbar() {
		clearPendingExternalSelectionHide();
		isVisible = false;
		isBelowSelection = false;
		toolbarMode = 'floating';
		arrowOffset = 0;
		selectedText = '';
		currentCfiRange = '';
		activeClearSelection = null;
		stopPositionTracking();
	}

	function clearAndHide() {
		if (activeClearSelection) {
			activeClearSelection();
		} else if (iframeDoc) {
			iframeDoc.getSelection()?.removeAllRanges();
		}
		hideToolbar();
	}

	function canPreviewLockedExcerptFeature(): boolean {
		return !canUseExcerptNotes && showPremiumFeaturePreviewEnabled;
	}

	function handlePremiumExcerptFeaturePreview(): void {
		onRequestPremiumFeaturePreview?.(PREMIUM_FEATURES.EPUB_EXCERPT_NOTES);
		clearAndHide();
	}

	function handlePremiumStyledExcerptFeaturePreview(): void {
		onRequestPremiumFeaturePreview?.(PREMIUM_FEATURES.EPUB_STYLED_EXCERPTS);
		clearAndHide();
	}

	async function handleHighlight(color: string, style?: EpubHighlightStyle) {
		if (!canUseExcerptNotes) {
			if (showPremiumFeaturePreviewEnabled) {
				handlePremiumExcerptFeaturePreview();
				return;
			}
			clearAndHide();
			return;
		}
		if (style && !canUseStyledExcerpts) {
			if (showPremiumFeaturePreviewEnabled) {
				handlePremiumStyledExcerptFeaturePreview();
				return;
			}
			clearAndHide();
			return;
		}
		if (!book || !selectedText || !currentCfiRange) {
			clearAndHide();
			return;
		}

		try {
			const highlight = { cfiRange: currentCfiRange, color, style, text: selectedText };
			if (autoInsert || canvasMode) {
				readerService.addHighlight(highlight);
			} else {
				readerService.addTemporaryHighlight(highlight, 2000);
			}
		} catch (e) {
			logger.warn('[SelectionToolbar] Failed to apply highlight:', e);
		}

		onAutoInsert?.(selectedText, currentCfiRange, color, style);
		clearAndHide();
	}

	function handleInsertToNote() {
		if (!canUseExcerptNotes && showPremiumFeaturePreviewEnabled) {
			handlePremiumExcerptFeaturePreview();
			return;
		}
		if (selectedText && currentCfiRange) {
			onInsertToNote?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleExtractToCard() {
		if (selectedText && currentCfiRange) {
			onExtractToCard?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleCreateReadingPoint() {
		if (selectedText && currentCfiRange) {
			onCreateReadingPoint?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleOpenAIMenu(event: MouseEvent) {
		if (selectedText && currentCfiRange) {
			onOpenAIMenu(event, selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleSearch() {
		if (!selectedText) return;
		const searchPlugin = (app as any).internalPlugins?.getPluginById?.('global-search');
		if (searchPlugin?.instance) {
			searchPlugin.instance.openGlobalSearch(selectedText);
		}
		clearAndHide();
	}

	function getSelectionRect(selection: Selection): DOMRect | null {
		if (!selection.rangeCount) return null;
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		if (rect.width || rect.height) {
			return rect;
		}

		const rects = range.getClientRects();
		if (!rects.length) return null;

		let left = rects[0].left;
		let top = rects[0].top;
		let right = rects[0].right;
		let bottom = rects[0].bottom;

		for (let i = 1; i < rects.length; i++) {
			const current = rects[i];
			left = Math.min(left, current.left);
			top = Math.min(top, current.top);
			right = Math.max(right, current.right);
			bottom = Math.max(bottom, current.bottom);
		}

		return new DOMRect(left, top, right - left, bottom - top);
	}

	function getSelectionRects(selection: Selection): DOMRect[] {
		if (!selection.rangeCount) return [];
		const range = selection.getRangeAt(0);
		const rects = Array.from(range.getClientRects());
		if (rects.length) {
			return rects.map((rect) => new DOMRect(rect.left, rect.top, rect.width, rect.height));
		}
		const rect = range.getBoundingClientRect();
		return rect.width || rect.height ? [new DOMRect(rect.left, rect.top, rect.width, rect.height)] : [];
	}

	async function positionToolbar(anchorRect: DOMRect, containerEl: HTMLElement, anchorRects: DOMRect[] = []) {
		isVisible = true;
		await tick();

		if (!toolbarEl) return;

		const containerRect = containerEl.getBoundingClientRect();
		const toRelativeRect = (rect: DOMRect) => ({
			top: rect.top - containerRect.top,
			left: rect.left - containerRect.left,
			bottom: rect.bottom - containerRect.top,
			right: rect.right - containerRect.left,
			width: rect.width,
			height: rect.height,
		});
		const position = computeToolbarPosition({
			anchorRect: toRelativeRect(anchorRect),
			anchorRects: anchorRects.map((rect) => toRelativeRect(rect)),
			containerWidth: containerEl.clientWidth,
			containerHeight: containerEl.clientHeight,
			toolbarWidth: toolbarEl.offsetWidth || 280,
			toolbarHeight: toolbarEl.offsetHeight || 72,
			mobile: isMobileToolbar,
		});

		toolbarMode = position.mode;
		posTop = position.top;
		posLeft = position.left;
		isBelowSelection = position.isBelowAnchor;
		arrowOffset = position.arrowOffset;
	}

	function scheduleActiveSync() {
		if (!activeFrame) return;
		const frame = activeFrame;
		clearPendingSync();
		pendingSyncFrame = window.requestAnimationFrame(() => {
			pendingSyncFrame = null;
			void syncSelection(frame);
		});
	}

	function startPositionTracking(frame: ReaderFrame) {
		if (activeFrame === frame && teardownPositionTracking) {
			return;
		}

		stopPositionTracking();
		activeFrame = frame;

		const iframeWindow = frame.window || frame.document?.defaultView;
		const iframeDocument = iframeWindow?.document;
		const scrollHost = getScrollTrackingHost(frame);
		const visualViewport = window.visualViewport;
		const binder = createEventBinder();

		binder.bind(scrollHost, 'scroll', scheduleActiveSync, { passive: true });
		binder.bind(iframeWindow, 'scroll', scheduleActiveSync, { passive: true });
		binder.bind(iframeWindow, 'resize', scheduleActiveSync);
		binder.bind(iframeDocument, 'mousedown', handleClickOutside);
		binder.bind(iframeDocument, 'touchstart', handleClickOutside, { passive: true });
		binder.bind(window, 'resize', scheduleActiveSync);
		binder.bind(window, 'orientationchange', scheduleActiveSync);
		binder.bind(visualViewport, 'resize', scheduleActiveSync);
		binder.bind(visualViewport, 'scroll', scheduleActiveSync);

		teardownPositionTracking = () => {
			binder.dispose();
		};
	}

	async function syncSelection(frame: ReaderFrame, cfiRange?: string) {
		try {
			const iframeWindow = frame.window || frame.document?.defaultView;
			if (!iframeWindow) {
				hideToolbar();
				return;
			}

			iframeDoc = iframeWindow.document;
			const selection = iframeWindow.getSelection();
			if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
				hideToolbar();
				return;
			}

			const text = selection.toString().trim();
			if (!text) {
				hideToolbar();
				return;
			}

			const range = selection.getRangeAt(0);
			const resolvedCfiRange = cfiRange || frame.cfiFromRange(range);
			if (!resolvedCfiRange) {
				hideToolbar();
				return;
			}

			const viewportEl = getViewportContainer(frame);
			if (!viewportEl) {
				hideToolbar();
				return;
			}

			selectedText = text;
			currentCfiRange = resolvedCfiRange;
			activeClearSelection = null;

			const rangeRect = getSelectionRect(selection);
			const rangeRects = getSelectionRects(selection);
			const iframe = getFrameElement(frame);
			let adjustedRect: DOMRect | null = null;
			let adjustedRects: DOMRect[] = [];
			if (rangeRect && iframe) {
				const iframeRect = iframe.getBoundingClientRect();
				adjustedRect = new DOMRect(
					rangeRect.left + iframeRect.left,
					rangeRect.top + iframeRect.top,
					rangeRect.width,
					rangeRect.height
				);
				adjustedRects = rangeRects.map((rect) =>
					new DOMRect(rect.left + iframeRect.left, rect.top + iframeRect.top, rect.width, rect.height)
				);
			} else if (rangeRect) {
				adjustedRect = rangeRect;
				adjustedRects = rangeRects;
			} else {
				const navigationRect = readerService.getNavigationTargetRect({ cfi: resolvedCfiRange, text });
				if (navigationRect) {
					adjustedRect = toAbsoluteViewportRect(navigationRect, viewportEl);
					adjustedRects = [adjustedRect];
				}
			}
			if (!adjustedRect) {
				hideToolbar();
				return;
			}

			startPositionTracking(frame);
			await positionToolbar(adjustedRect, viewportEl, adjustedRects);
		} catch (e) {
			logger.warn('[SelectionToolbar] Failed to sync selection:', e);
			hideToolbar();
		}
	}

	function handleClickOutside(e: Event) {
		if (isVisible && isEventOutsideToolbar(toolbarEl, e)) {
			hideToolbar();
		}
	}

	$effect(() => {
		const currentReaderService = readerService;

		// Keep teardown handles out of the effect dependency graph to avoid
		// self-triggered reruns when the toolbar updates its own subscriptions.
		untrack(() => {
			teardownReaderTracking?.();
			teardownReaderTracking = () => {
				stopPositionTracking();
			};
		});

		const offSelection = currentReaderService.onSelectionChange(({ cfiRange, frame }) => {
			void syncSelection(frame, cfiRange);
		});
		const offHighlightClick = currentReaderService.onHighlightClick(() => {
			hideToolbar();
		});

		untrack(() => {
			teardownReaderTracking = () => {
				offSelection();
				offHighlightClick();
				stopPositionTracking();
			};
		});

		return () => {
			untrack(() => {
				teardownReaderTracking?.();
				teardownReaderTracking = null;
			});
		};
	});

	$effect(() => {
		const _readerVersion = readerVersion;
		untrack(() => {
			hideToolbar();
		});
	});

	$effect(() => {
		const selection = externalSelection;
		if (!selection) {
			const hasActiveClearSelection = untrack(() => Boolean(activeClearSelection));
			if (hasActiveClearSelection) {
				clearPendingExternalSelectionHide();
				pendingExternalSelectionHideFrame = window.requestAnimationFrame(() => {
					pendingExternalSelectionHideFrame = null;
					if (!externalSelection) {
						hideToolbar();
					}
				});
			}
			return;
		}
		clearPendingExternalSelectionHide();

		const viewportEl = boundsEl || (document.querySelector('.epub-reader-viewport') as HTMLElement | null);
		if (!viewportEl) {
			untrack(() => {
				hideToolbar();
			});
			return;
		}

		untrack(() => {
			selectedText = selection.text;
			currentCfiRange = selection.cfiRange;
			activeClearSelection = selection.clear || null;
			stopPositionTracking();
		});
		void positionToolbar(selection.rect, viewportEl, selection.rects || [selection.rect]);
	});

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
			teardownReaderTracking?.();
			teardownReaderTracking = null;
			stopPositionTracking();
			clearPendingSync();
			clearPendingExternalSelectionHide();
		};
	});
</script>

<div
	class="epub-selection-toolbar epub-glass-panel"
	class:visible={isVisible}
	class:below-selection={isBelowSelection}
	class:mobile-docked={toolbarMode === 'docked'}
	style={`top: ${posTop}px; left: ${posLeft}px; --toolbar-arrow-offset: ${arrowOffset}px;`}
	bind:this={toolbarEl}
>
	<div class="selection-main-row">
		{#if canUseExcerptNotes || canPreviewLockedExcerptFeature()}
			<div class="selection-top-row">
				<div class="toolbar-row colors-row selection-color-row selection-primary-row">
					<button class="color-btn yellow" onclick={() => handleHighlight('yellow')} aria-label={t('epub.selectionToolbar.highlightYellow')} title={t('epub.selectionToolbar.highlightYellow')}><span class="color-btn-core"></span></button>
					<button class="color-btn blue" onclick={() => handleHighlight('blue')} aria-label={t('epub.selectionToolbar.highlightBlue')} title={t('epub.selectionToolbar.highlightBlue')}><span class="color-btn-core"></span></button>
					<button class="color-btn red" onclick={() => handleHighlight('red')} aria-label={t('epub.selectionToolbar.highlightRed')} title={t('epub.selectionToolbar.highlightRed')}><span class="color-btn-core"></span></button>
					<button class="color-btn purple" onclick={() => handleHighlight('purple')} aria-label={t('epub.selectionToolbar.highlightPurple')} title={t('epub.selectionToolbar.highlightPurple')}><span class="color-btn-core"></span></button>
					<button class="color-btn green" onclick={() => handleHighlight('green')} aria-label={t('epub.selectionToolbar.highlightGreen')} title={t('epub.selectionToolbar.highlightGreen')}><span class="color-btn-core"></span></button>
				</div>

					<div class="selection-style-shell">
						<div class="toolbar-row selection-style-row">
							<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'underline')} title={t('epub.selectionToolbar.underline')} aria-label={t('epub.selectionToolbar.underline')}>
								<span class="action-icon style-icon underline-style-icon" use:icon={'underline'}></span>
							</button>
							<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'strikethrough')} title={t('epub.selectionToolbar.strikethrough')} aria-label={t('epub.selectionToolbar.strikethrough')}>
								<span class="action-icon style-icon strikethrough-style-icon" use:icon={'strikethrough'}></span>
							</button>
							<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'wavy')} title={t('epub.selectionToolbar.wavy')} aria-label={t('epub.selectionToolbar.wavy')}>
								<span class="action-icon style-icon wavy-style-icon" use:icon={'pen-tool'}></span>
							</button>
						</div>
					</div>
			</div>
		{/if}

		<div class="selection-actions-shell">
			<div class="toolbar-row actions-row selection-actions-row">
				{#if canUseExcerptNotes || canPreviewLockedExcerptFeature()}
					<button class="action-item" onclick={handleInsertToNote} title={autoInsert ? t('epub.selectionToolbar.insert') : t('epub.selectionToolbar.copy')} aria-label={autoInsert ? t('epub.selectionToolbar.insert') : t('epub.selectionToolbar.copy')}>
						<span class="action-icon" use:icon={autoInsert ? 'clipboard-paste' : 'clipboard-copy'}></span>
						<span class="action-label">{autoInsert ? t('epub.selectionToolbar.insert') : t('epub.selectionToolbar.copy')}</span>
					</button>
				{/if}
				<button class="action-item" onclick={handleSearch} title={t('epub.selectionToolbar.search')} aria-label={t('epub.selectionToolbar.search')}>
					<span class="action-icon" use:icon={'search'}></span>
					<span class="action-label">{t('epub.selectionToolbar.search')}</span>
				</button>

				{#if onExtractToCard && (canUseExcerptNotes || canPreviewLockedExcerptFeature())}
					<div class="row-divider"></div>
				{/if}

				{#if onExtractToCard}
					<button class="action-item accent" onclick={handleExtractToCard} title={t('epub.selectionToolbar.createCardTitle')} aria-label={t('epub.selectionToolbar.createCardTitle')}>
						<span class="action-icon" use:icon={'scissors'}></span>
						<span class="action-label">{t('epub.selectionToolbar.createCard')}</span>
					</button>
				{/if}

				{#if onCreateReadingPoint}
					<button class="action-item accent" onclick={handleCreateReadingPoint} title={t('epub.selectionToolbar.readingPointTitle')} aria-label={t('epub.selectionToolbar.readingPointTitle')}>
						<span class="action-icon" use:icon={'book-plus'}></span>
						<span class="action-label">{t('epub.selectionToolbar.readingPoint')}</span>
					</button>
				{/if}
				{#if canUseAiSplit}
					<button class="action-item ai" onclick={handleOpenAIMenu} title="AI" aria-label="AI">
						<span class="action-icon" use:icon={'sparkles'}></span>
						<span class="action-label">AI</span>
					</button>
				{/if}
			</div>
		</div>
	</div>

	<div class="toolbar-arrow"></div>
</div>
