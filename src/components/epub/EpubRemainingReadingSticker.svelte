<script lang="ts">
	interface Props {
		valueText: string;
		labelText: string;
		titleText: string;
		wiggleEnabled?: boolean;
	}

	let { valueText, labelText, titleText, wiggleEnabled = true }: Props = $props();
</script>

<div
	class="epub-remaining-reading-sticker priority-sticky-note"
	data-wiggle-enabled={wiggleEnabled ? 'true' : 'false'}
	role="img"
	aria-label={titleText}
	title={titleText}
>
	<span class="sticky-number">{valueText}</span>
	<span class="sticky-label">{labelText}</span>
</div>

<style>
	.epub-remaining-reading-sticker.priority-sticky-note {
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
			color-mix(in srgb, var(--color-blue, #3b82f6) 16%, var(--weave-sticky-paper)) 0%,
			color-mix(in srgb, var(--color-blue, #3b82f6) 28%, var(--weave-sticky-surface)) 100%
		);
		color: var(--epub-sticker-text-neutral);
		user-select: none;
		z-index: var(--epub-z-overlay, 200);
		border: 1px solid var(--epub-sticker-border);
		box-shadow: var(--epub-sticker-shadow);
		transform: rotate(var(--epub-sticker-rotate-base));
		animation: var(--epub-sticker-animation, none);
		transition: all 0.3s cubic-bezier(0, 0, 0.2, 1);
		overflow: hidden;
	}

	.epub-remaining-reading-sticker.priority-sticky-note[data-wiggle-enabled='true'] {
		--epub-sticker-animation: epub-sticker-wiggle 0.8s ease-in-out 0.3s infinite;
	}

	.epub-remaining-reading-sticker.priority-sticky-note::before {
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

	.epub-remaining-reading-sticker .sticky-number {
		margin-bottom: 0.2rem;
		font-size: clamp(0.92rem, calc(var(--weave-sticker-size, 72px) * 0.24), 1.18rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
	}

	.epub-remaining-reading-sticker .sticky-label {
		font-size: clamp(0.5rem, calc(var(--weave-sticker-size, 72px) * 0.15), 0.66rem);
		font-weight: 700;
		line-height: 1.15;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.9;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 768px) {
		.epub-remaining-reading-sticker.priority-sticky-note {
			--weave-sticker-size: 64px;
		}

		.epub-remaining-reading-sticker.priority-sticky-note::before {
			top: -6px;
		}
	}
</style>
