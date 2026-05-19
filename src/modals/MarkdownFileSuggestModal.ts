import { App, FuzzySuggestModal, TFile, type FuzzyMatch } from "obsidian";
import {
	buildVaultFileSearchText,
	getVaultFileDisplayName,
	getVaultFileFolderNote,
	renderComplexSuggestion,
} from "./weaveComplexSuggestion";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";

interface AnchorRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

interface MarkdownFileSuggestModalOptions {
	placeholder?: string;
	excludePath?: string;
	files?: TFile[];
	filter?: (file: TFile) => boolean;
	allowEmptySelection?: boolean;
	emptySelectionLabel?: string;
	emptySelectionDescription?: string | null;
	anchorRect?: AnchorRect;
	preferredWidth?: number;
	showPath?: boolean;
	showIcon?: boolean;
}

export type MarkdownFileSuggestItem =
	| {
			kind: "file";
			file: TFile;
	  }
	| {
			kind: "empty";
			label: string;
			description?: string;
	  };

export class MarkdownFileSuggestModal extends FuzzySuggestModal<MarkdownFileSuggestItem> {
	private readonly items: MarkdownFileSuggestItem[];
	private readonly anchorRect: AnchorRect | null;
	private readonly preferredWidth: number | null;
	private readonly showPath: boolean;
	private readonly showIcon: boolean;
	private resolver: ((item: MarkdownFileSuggestItem | null) => void) | null = null;
	private selectedItem: MarkdownFileSuggestItem | null = null;
	private settled = false;
	private closeTimer: number | null = null;

	constructor(app: App, options: MarkdownFileSuggestModalOptions = {}) {
		super(app);
		this.anchorRect = options.anchorRect ?? null;
		this.preferredWidth = options.preferredWidth ?? null;
		this.showPath = options.showPath ?? true;
		this.showIcon = options.showIcon ?? true;

		const files = (options.files ?? app.vault.getMarkdownFiles())
			.filter((file) => !options.excludePath || file.path !== options.excludePath)
			.filter((file) => (options.filter ? options.filter(file) : true));

		this.items = [
			...(options.allowEmptySelection
				? [
						{
							kind: "empty" as const,
							label: options.emptySelectionLabel ?? "不使用 Markdown 文件",
							description:
								options.emptySelectionDescription === undefined
									? "清空当前选择"
									: options.emptySelectionDescription ?? undefined,
						},
				  ]
				: []),
			...files.map((file) => ({ kind: "file" as const, file })),
		];

		this.setPlaceholder(options.placeholder ?? "选择 Markdown 笔记...");
	}

	onOpen(): void {
		void super.onOpen();
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-markdown-file-suggest-popover");
		this.positionNearAnchor();
	}

	getItems(): MarkdownFileSuggestItem[] {
		return this.items;
	}

	getItemText(item: MarkdownFileSuggestItem): string {
		if (item.kind === "empty") {
			return `${item.label} ${item.description || ""}`.trim();
		}

		return buildVaultFileSearchText(item.file);
	}

	renderSuggestion(match: FuzzyMatch<MarkdownFileSuggestItem>, el: HTMLElement): void {
		const item = match.item;

		if (item.kind === "empty") {
			renderComplexSuggestion(el, {
				title: item.label,
				note: item.description,
				icon: "file-x",
			});
			return;
		}

		renderComplexSuggestion(el, {
			title: this.getDisplayName(item.file),
			note: this.showPath ? getVaultFileFolderNote(item.file.path) : undefined,
			icon: "file-text",
			showIcon: this.showIcon,
		});
	}

	private settle(item: MarkdownFileSuggestItem | null): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}

		const resolver = this.resolver;
		this.resolver = null;
		resolver?.(item);
	}

	onChooseItem(item: MarkdownFileSuggestItem): void {
		this.selectedItem = item;
		this.settle(item);
	}

	onClose(): void {
		super.onClose();
		if (this.settled) {
			this.selectedItem = null;
			return;
		}

		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
		}

		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = null;
			const selectedItem = this.selectedItem;
			this.selectedItem = null;
			this.settle(selectedItem);
		}, 0);
	}

	openAndSelectItem(): Promise<MarkdownFileSuggestItem | null> {
		return new Promise((resolve) => {
			if (this.closeTimer !== null) {
				window.clearTimeout(this.closeTimer);
				this.closeTimer = null;
			}
			this.resolver = resolve;
			this.selectedItem = null;
			this.settled = false;
			this.open();
		});
	}

	openAndSelect(): Promise<TFile | null> {
		return this.openAndSelectItem().then((item) => (item?.kind === "file" ? item.file : null));
	}

	private getDisplayName(file: TFile): string {
		return getVaultFileDisplayName(file);
	}

	private positionNearAnchor(): void {
		if (!this.anchorRect || typeof window === "undefined") {
			return;
		}

		const anchorRect = this.anchorRect;
		const place = () => {
			const modalEl = this.modalEl;
			const containerEl = this.containerEl;
			if (!modalEl || !containerEl) {
				return;
			}

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const spacing = 8;
			const preferredWidth = Math.min(this.preferredWidth ?? 520, viewportWidth - 24);
			const maxHeight = Math.max(220, viewportHeight - anchorRect.bottom - spacing - 12);

			containerEl.classList.add("weave-suggest-modal-container--anchored");
			modalEl.classList.add("weave-suggest-modal--anchored");
			containerEl.setCssProps({
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
				"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
			});
			modalEl.setCssProps({
				"--weave-suggest-popover-width": `${preferredWidth}px`,
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
				"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
			});

			const modalRect = modalEl.getBoundingClientRect();
			const left = Math.max(12, Math.min(anchorRect.left, viewportWidth - modalRect.width - 12));
			const top = Math.min(anchorRect.bottom + spacing, viewportHeight - 12);

			modalEl.setCssProps({
				"--weave-suggest-popover-left": `${Math.round(left)}px`,
				"--weave-suggest-popover-top": `${Math.round(top)}px`,
			});
		};

		window.requestAnimationFrame(place);
	}
}
