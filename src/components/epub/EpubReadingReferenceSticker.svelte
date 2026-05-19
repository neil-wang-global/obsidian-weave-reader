<script lang="ts">
	import type { EpubReadingReferencePoint } from '../../services/epub';

	interface Props {
		referencePoint: EpubReadingReferencePoint;
		deltaPercent: number;
		deltaText: string;
		startText: string;
		titleText: string;
		onOpenMenu: (event: MouseEvent | KeyboardEvent) => void;
		wiggleEnabled?: boolean;
	}

	let { referencePoint, deltaPercent, deltaText, startText, titleText, onOpenMenu, wiggleEnabled = true }: Props = $props();

	const toneClass = $derived.by(() => {
		if (deltaPercent >= 1) {
			return 'is-ahead';
		}
		if (deltaPercent <= -1) {
			return 'is-behind';
		}
		return 'is-aligned';
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}
		event.preventDefault();
		onOpenMenu(event);
	}
</script>

<button
	type="button"
	class={`epub-reading-reference-sticker priority-sticky-note ${toneClass}`}
	data-wiggle-enabled={wiggleEnabled ? 'true' : 'false'}
	aria-label={titleText}
	title={titleText}
	onclick={onOpenMenu}
	onkeydown={handleKeydown}
>
	<span class="sticky-number">{deltaText}</span>
	<span class="sticky-label">{startText}</span>
</button>

<style>
	.epub-reading-reference-sticker.priority-sticky-note {
		--weave-sticker-size: 72px;
		--weave-sticky-paper: var(--epub-sticker-paper);
		--weave-sticky-surface: var(--epub-sticker-surface);
		position: relative;
		width: var(--weave-sticker-size, 72px);
		height: var(--weave-sticker-size, 72px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.22rem;
		padding: 0;
		border-radius: 4px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary)) 0%,
			color-mix(in srgb, var(--background-secondary) 38%, var(--background-primary)) 100%
		);
		color: var(--text-normal);
		cursor: pointer;
		user-select: none;
		z-index: var(--epub-z-overlay, 200);
		border: 1px solid var(--epub-sticker-border);
		box-shadow: var(--epub-sticker-shadow);
		transform: rotate(var(--epub-sticker-rotate-base));
		animation: var(--epub-sticker-animation, none);
		transition: all 0.3s cubic-bezier(0, 0, 0.2, 1);
		overflow: hidden;
	}

	.epub-reading-reference-sticker.priority-sticky-note[data-wiggle-enabled='true'] {
		--epub-sticker-animation: epub-sticker-wiggle 0.8s ease-in-out 0.3s infinite;
	}

	.epub-reading-reference-sticker.priority-sticky-note::before {
		content: '';
		position: absolute;
		top: -7px;
		left: 50%;
		transform: translateX(-50%);
		width: calc(var(--weave-sticker-size, 72px) * 0.7);
		height: calc(var(--weave-sticker-size, 72px) * 0.235);
		background: var(--epub-sticker-tape);
		border: 1px solid var(--epub-sticker-tape-border);
		border-radius: 2px;
		backdrop-filter: blur(4px);
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.epub-reading-reference-sticker:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 3px;
	}

	.epub-reading-reference-sticker.is-ahead {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-blue, #3b82f6) 10%, var(--background-primary)) 0%,
			color-mix(in srgb, var(--color-green, #22c55e) 7%, var(--background-secondary)) 100%
		);
		color: var(--epub-sticker-text-ahead);
	}

	.epub-reading-reference-sticker.is-behind {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-orange, #f59e0b) 10%, var(--background-primary)) 0%,
			color-mix(in srgb, var(--color-red, #ef4444) 6%, var(--background-secondary)) 100%
		);
		color: var(--epub-sticker-text-behind);
	}

	.epub-reading-reference-sticker.is-aligned {
		color: var(--text-normal);
	}

	.epub-reading-reference-sticker .sticky-number {
		margin-bottom: 0.2rem;
		font-size: clamp(0.98rem, calc(var(--weave-sticker-size, 72px) * 0.28), 1.3rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.epub-reading-reference-sticker .sticky-label {
		font-size: clamp(0.5rem, calc(var(--weave-sticker-size, 72px) * 0.15), 0.66rem);
		font-weight: 700;
		line-height: 1.15;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.88;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 768px) {
		.epub-reading-reference-sticker.priority-sticky-note {
			--weave-sticker-size: 64px;
		}

		.epub-reading-reference-sticker.priority-sticky-note::before {
			top: -6px;
		}
	}
</style>
