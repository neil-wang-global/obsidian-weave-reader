<script lang="ts">
  interface DeckOption {
    id: string;
    name: string;
  }

  interface Props {
    showChildOverlay?: boolean;
    selectedCount?: number;
    onReturn?: () => void;
    onRegenerate?: () => void | Promise<void>;
    onSave?: () => void | Promise<void>;
    isRegenerating?: boolean;
    showDeckSelector?: boolean;
    availableDecks?: DeckOption[];
    selectedDeckId?: string;
    onDeckChange?: (deckId: string) => void;
  }

  let {
    showChildOverlay = false,
    selectedCount = 0,
    onReturn,
    onRegenerate,
    onSave,
    isRegenerating = false,
    showDeckSelector = false,
    availableDecks = [],
    selectedDeckId = '',
    onDeckChange
  }: Props = $props();

  function handleDeckChange(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement | null;
    onDeckChange?.(target?.value ?? '');
  }
</script>

<div class="unified-actions-bar" data-overlay={showChildOverlay ? 'true' : 'false'}>
  <div class="actions-left">
    <button class="text-action" type="button" onclick={() => onReturn?.()}>
      返回
    </button>
    <button class="text-action" type="button" onclick={() => onRegenerate?.()} disabled={isRegenerating}>
      重新生成
    </button>
  </div>

  <div class="actions-right">
    {#if showDeckSelector}
      <label class="deck-selector">
        <span>目标牌组</span>
        <select value={selectedDeckId} onchange={handleDeckChange}>
          <option value="" disabled={availableDecks.length > 0}>请选择</option>
          {#each availableDecks as deck}
            <option value={deck.id}>{deck.name}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="selection-count">已选 {selectedCount} 项</div>

    <button class="text-action text-action-primary" type="button" onclick={() => onSave?.()} disabled={isRegenerating || selectedCount === 0}>
      导入所选
    </button>
  </div>
</div>

<style>
  .unified-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .actions-left,
  .actions-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .text-action {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    border: none !important;
    border-radius: 0;
    background: none !important;
    background-color: transparent !important;
    box-shadow: none !important;
    color: var(--text-normal);
    padding: 4px 2px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.35;
  }

  .text-action:hover:not(:disabled) {
    color: var(--interactive-accent);
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    background-color: transparent !important;
  }

  .text-action:focus-visible:not(:disabled) {
    outline: 2px solid color-mix(in srgb, var(--interactive-accent) 55%, transparent);
    outline-offset: 2px;
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    background-color: transparent !important;
  }

  .text-action:disabled {
    color: var(--text-faint);
    cursor: default;
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    background-color: transparent !important;
  }

  .text-action-primary {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .deck-selector {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 12px;
    color: var(--text-muted);
  }

  .deck-selector select {
    min-width: 160px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    background: var(--background-primary);
    color: var(--text-normal);
    padding: 0.25rem 0.5rem;
    font-size: 12px;
  }

  .selection-count {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
