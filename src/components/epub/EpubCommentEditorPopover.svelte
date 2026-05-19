<script lang="ts">
 	import { Platform } from 'obsidian';
 	import { onMount, tick, untrack } from 'svelte';
	import { tr } from '../../utils/i18n';
	import EnhancedModal from '../ui/EnhancedModal.svelte';
 	import type { EpubReaderEngine, HighlightClickInfo } from '../../services/epub';
 	import { computeToolbarPosition } from './toolbar-positioning';

 	interface Props {
		open: boolean;
		info: HighlightClickInfo | null;
		readerService?: EpubReaderEngine | null;
		boundsEl?: HTMLElement | null;
		draftText: string;
		saving?: boolean;
		onDraftTextChange: (value: string) => void;
		onSave: () => void;
		onClose: () => void;
	}

	let {
		open,
		info,
		readerService = null,
		boundsEl = null,
		draftText,
		saving = false,
		onDraftTextChange,
		onSave,
		onClose,
	}: Props = $props();
	let t = $derived($tr);

	let popoverEl: HTMLDivElement | undefined = $state(undefined);
 	let textareaEl: HTMLTextAreaElement | undefined = $state(undefined);
 	let posTop = $state(0);
 	let posLeft = $state(0);
 	let popoverWidth = $state(340);
 	let preferBelow = $state(true);
 	let mobileMode = $state(false);
	let pendingFocusFrame = 0;
	let pendingFocusTimeout = 0;
	let hasFocusedCurrentSession = false;

	function clearPendingFocus() {
		if (pendingFocusFrame) {
			window.cancelAnimationFrame(pendingFocusFrame);
			pendingFocusFrame = 0;
		}
		if (pendingFocusTimeout) {
			window.clearTimeout(pendingFocusTimeout);
			pendingFocusTimeout = 0;
		}
	}

	function getFallbackBoundsRect() {
		return boundsEl?.getBoundingClientRect?.() || {
			top: 0,
			left: 0,
			right: window.innerWidth || 0,
			bottom: window.innerHeight || 0,
			width: window.innerWidth || 0,
			height: window.innerHeight || 0,
		};
	}

	function isMobileCommentEditor(): boolean {
		return Platform.isMobile
			|| document.body.classList.contains('is-mobile')
			|| document.body.classList.contains('is-phone');
	}

 	function focusTextareaIfNeeded() {
 		if (!textareaEl || saving) {
 			return;
 		}
 		if (document.activeElement === textareaEl) {
 			hasFocusedCurrentSession = true;
 			return;
 		}

 		const applyFocus = () => {
 			if (!open || !textareaEl || saving) {
 				return;
 			}
 			try {
 				textareaEl.focus({ preventScroll: true });
 			} catch {
 				textareaEl.focus();
 			}
 			textareaEl.setSelectionRange(draftText.length, draftText.length);
 			hasFocusedCurrentSession = true;
 		};

 		if (mobileMode) {
 			if (hasFocusedCurrentSession) {
 				return;
 			}
 			clearPendingFocus();
 			pendingFocusFrame = window.requestAnimationFrame(() => {
 				pendingFocusFrame = 0;
 				pendingFocusTimeout = window.setTimeout(() => {
 					pendingFocusTimeout = 0;
 					applyFocus();
 				}, 40);
 			});
 			return;
 		}

 		applyFocus();
 	}

 	async function positionPopover() {
		if (!open || !info) {
			mobileMode = false;
			clearPendingFocus();
			hasFocusedCurrentSession = false;
			return;
		}
		await tick();
		mobileMode = isMobileCommentEditor();
		if (mobileMode) {
			focusTextareaIfNeeded();
			return;
		}
		if (!popoverEl) {
			return;
		}
		const currentInfo = readerService?.getHighlightClickInfo?.(
			info.cfiRange,
			info.interactionTarget || 'highlight'
		) || info;
		const boundsRect = getFallbackBoundsRect();
		const width = Math.min(360, Math.max(260, (boundsRect.width || window.innerWidth || 0) - 24));
		popoverWidth = width;
 		const height = popoverEl.offsetHeight || 220;
 		const toRelativeRect = (rect: HighlightClickInfo['rect']) => ({
			top: rect.top - boundsRect.top,
			left: rect.left - boundsRect.left,
			bottom: rect.bottom - boundsRect.top,
			right: rect.right - boundsRect.left,
			width: rect.width,
			height: rect.height,
		});
		const position = computeToolbarPosition({
			anchorRect: toRelativeRect(currentInfo.rect),
			anchorRects: (currentInfo.rects || []).map((rect) => toRelativeRect(rect)),
			anchorPoint: currentInfo.anchorPoint
				? {
					x: currentInfo.anchorPoint.x - boundsRect.left,
					y: currentInfo.anchorPoint.y - boundsRect.top,
				}
				: undefined,
			containerWidth: boundsRect.width || window.innerWidth || 0,
			containerHeight: boundsRect.height || window.innerHeight || 0,
			toolbarWidth: width,
			toolbarHeight: height,
			mobile: false,
			preferredSide: 'bottom',
			align: 'center',
		});
		popoverWidth = width;
		posLeft = position.left;
		posTop = position.top;
		preferBelow = position.isBelowAnchor;
		focusTextareaIfNeeded();
	}

 	function handlePointerDownOutside(event: MouseEvent) {
 		if (!open || !popoverEl) {
 			return;
 		}
 		if (mobileMode) {
 			return;
 		}
 		if (popoverEl.contains(event.target as Node)) {
			return;
		}
		onClose();
	}

 	function handleKeydown(event: KeyboardEvent) {
 		if (!open) {
 			return;
 		}
 		if (event.key === 'Escape') {
 			event.preventDefault();
 			onClose();
 			return;
 		}
 		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
 			event.preventDefault();
 			onSave();
 		}
 	}

 	$effect(() => {
		const currentOpen = open;
		const currentInfo = info;
		const currentReaderService = readerService;
		const currentBoundsEl = boundsEl;
 		void currentInfo;
		void currentReaderService;
		void currentBoundsEl;
		untrack(() => {
			mobileMode = currentOpen ? isMobileCommentEditor() : false;
		});
		if (!currentOpen) {
			untrack(() => {
				clearPendingFocus();
				hasFocusedCurrentSession = false;
			});
		}
		if (currentOpen) {
			untrack(() => {
				void positionPopover();
			});
		}
	});

 	onMount(() => {
 		document.addEventListener('mousedown', handlePointerDownOutside);
		document.addEventListener('touchstart', handlePointerDownOutside as unknown as EventListener);
 		window.addEventListener('resize', positionPopover);
 		window.addEventListener('scroll', positionPopover, true);
 		window.addEventListener('keydown', handleKeydown);
		return () => {
			clearPendingFocus();
			document.removeEventListener('mousedown', handlePointerDownOutside);
			document.removeEventListener('touchstart', handlePointerDownOutside as unknown as EventListener);
			window.removeEventListener('resize', positionPopover);
			window.removeEventListener('scroll', positionPopover, true);
 			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if open && info}
	{#if mobileMode}
		<EnhancedModal
			open={open}
			onClose={onClose}
			size="md"
			width="min(100%, 560px)"
			centered={false}
			closable={false}
			mask={true}
			maskClosable={true}
			destroyOnClose={true}
			class="epub-comment-editor-modal"
			accentColor="purple"
		>
			{#snippet children()}
				<div class="epub-comment-editor-modal__content" bind:this={popoverEl}>
					<textarea
						class="epub-comment-editor__textarea epub-comment-editor__textarea--modal"
						bind:this={textareaEl}
						value={draftText}
						placeholder={t('epub.reader.commentEditor.placeholder')}
						aria-label={t('epub.reader.commentEditor.ariaLabel')}
						disabled={saving}
						oninput={(event) => onDraftTextChange((event.currentTarget as HTMLTextAreaElement).value)}
					></textarea>
				</div>
			{/snippet}

			{#snippet footer()}
				<div class="epub-comment-editor__actions epub-comment-editor__actions--modal">
					<button type="button" class="epub-comment-editor__cancel" disabled={saving} onclick={onClose}>{t('epub.reader.commentEditor.cancel')}</button>
					<button type="button" class="mod-cta" disabled={saving} onclick={onSave}>{saving ? t('epub.reader.commentEditor.saving') : t('epub.reader.commentEditor.save')}</button>
				</div>
			{/snippet}
		</EnhancedModal>
	{:else}
		<div
			class="epub-comment-editor epub-glass-panel"
			class:epub-comment-editor--below={preferBelow}
			style={`top: ${posTop}px; left: ${posLeft}px; width: ${popoverWidth}px;`}
			bind:this={popoverEl}
		>
			<textarea
				class="epub-comment-editor__textarea"
				bind:this={textareaEl}
				value={draftText}
				placeholder={t('epub.reader.commentEditor.placeholder')}
				aria-label={t('epub.reader.commentEditor.ariaLabel')}
				disabled={saving}
				oninput={(event) => onDraftTextChange((event.currentTarget as HTMLTextAreaElement).value)}
			></textarea>
			<div class="epub-comment-editor__actions">
				<button type="button" class="epub-comment-editor__cancel" disabled={saving} onclick={onClose}>{t('epub.reader.commentEditor.cancel')}</button>
				<button type="button" class="mod-cta" disabled={saving} onclick={onSave}>{saving ? t('epub.reader.commentEditor.saving') : t('epub.reader.commentEditor.save')}</button>
			</div>
		</div>
	{/if}
{/if}

<style>
	.epub-comment-editor {
		position: absolute;
		z-index: 1200;
		display: flex;
		flex-direction: column;
		gap: var(--size-4-2);
		padding: var(--size-4-3);
		border-radius: var(--modal-radius, var(--radius-l));
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 74%, transparent);
		background: color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary) 6%);
		box-shadow: var(--shadow-s);
	}

	.epub-comment-editor__textarea {
		min-height: 116px;
		max-height: 220px;
		resize: vertical;
		padding: var(--size-4-3);
		border-radius: var(--input-radius);
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
		background: color-mix(in srgb, var(--background-primary) 96%, transparent);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		line-height: 1.7;
	}

	.epub-comment-editor__textarea--modal {
		width: 100%;
		min-height: min(320px, 46vh);
		max-height: none;
		resize: none;
		box-sizing: border-box;
	}

	.epub-comment-editor__textarea::placeholder {
		color: var(--text-faint);
	}

	.epub-comment-editor__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--size-4-2);
	}

	.epub-comment-editor__actions button {
		border: 0;
		box-shadow: none;
	}

	.epub-comment-editor__actions--modal {
		width: 100%;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	:global(.epub-comment-editor-modal) {
		max-width: min(100%, 560px);
	}

	:global(.epub-comment-editor-modal .weave-modal__body) {
		padding-top: 18px;
		padding-bottom: 12px;
	}

	:global(.epub-comment-editor-modal .weave-modal__footer) {
		padding-top: 12px;
	}

	.epub-comment-editor-modal__content {
		display: flex;
		flex-direction: column;
	}

	.epub-comment-editor__cancel {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: 0;
	}

	@media (max-width: 768px) {
		.epub-comment-editor:not(.epub-comment-editor--mobile) {
			left: 12px !important;
			right: 12px;
			width: auto !important;
			max-width: none;
		}
	}
</style>
