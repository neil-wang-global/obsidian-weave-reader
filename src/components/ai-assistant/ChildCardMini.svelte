<script lang="ts">
  import type { Card } from '../../data/types';
  import { getAISplitPreviewSections } from '../../services/ai/ai-split-preview';

  interface Props {
    card: Card;
    index: number;
    selected?: boolean;
    regenerating?: boolean;
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    card,
    index,
    selected = false,
    regenerating = false,
    disabled = false,
    onclick
  }: Props = $props();

  let preview = $derived.by(() => {
    return getAISplitPreviewSections(card.content || '');
  });
</script>

<button
  class:selected
  class:regenerating
  class="child-card-mini"
  type="button"
  {disabled}
  onclick={onclick}
>
  <div class="card-index">#{index + 1}</div>
  <div class="card-preview">
    {#if preview.front}
      <div class="card-face card-face-front">{preview.front}</div>
    {/if}

    {#if preview.front && preview.back}
      <div class="card-divider" aria-hidden="true">---</div>
    {/if}

    {#if preview.back}
      <div class="card-face card-face-back">{preview.back}</div>
    {/if}

    {#if !preview.combined}
      <div class="card-empty">空白卡片</div>
    {/if}
  </div>
  {#if regenerating}
    <div class="card-meta">生成中</div>
  {/if}
</button>

<style>
  .child-card-mini {
    width: 220px;
    min-width: 220px;
    min-height: var(--weave-ai-preview-card-height, 220px);
    height: var(--weave-ai-preview-card-height, 220px);
    max-height: var(--weave-ai-preview-card-height, 220px);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    background: var(--background-primary);
    color: var(--text-normal);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
    box-sizing: border-box;
    overflow: hidden;
  }

  .child-card-mini:hover {
    border-color: var(--interactive-accent);
    transform: translateY(-1px);
  }

  .child-card-mini.selected {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
  }

  .child-card-mini:disabled {
    cursor: default;
    opacity: 0.6;
    transform: none;
  }

  .card-index {
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
  }

  .card-preview {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-normal);
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
    overflow-x: hidden;
    overflow-y: auto;
    white-space: normal !important;
    text-align: left;
    padding-right: 0.2rem;
    scrollbar-width: thin;
  }

  .card-preview::-webkit-scrollbar {
    width: 6px;
  }

  .card-preview::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-muted) 35%, transparent);
    border-radius: 999px;
  }

  .card-face,
  .card-empty {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    white-space: pre-wrap !important;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .card-face-front {
    font-weight: 600;
  }

  .card-face-back {
    margin-top: 0.15rem;
    color: var(--text-muted);
  }

  .card-divider {
    margin: 0.2rem 0 0.1rem;
    color: var(--text-faint);
    letter-spacing: 0.08em;
  }

  .card-empty {
    color: var(--text-faint);
  }

  .card-meta {
    margin-top: auto;
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
