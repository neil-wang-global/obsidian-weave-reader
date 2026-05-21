import { TagExtractor } from "../../utils/tag-extractor";
import type { EpubBacklinkHighlightService } from "./EpubBacklinkHighlightService";
import type { EpubAnnotationService } from "./EpubAnnotationService";
import type { EpubReaderEngine, ReaderHighlight } from "./reader-engine-types";

export type EpubHighlightColor = "yellow" | "green" | "blue" | "red" | "purple";
export type EpubHighlightNoteType = "高亮" | "下划线" | "删除线" | "波浪线";

export interface EpubDisplayHighlight {
	cfiRange: string;
	text: string;
	commentText?: string;
	hasCommentDivider: boolean;
	commentStateLabel: string;
	color: EpubHighlightColor;
	colorLabel: string;
	noteType: EpubHighlightNoteType;
	noteTypeKey: string;
	tags: string[];
	createdTime: number;
	pageLabel?: string;
	sourceFile?: string;
	sourceRef?: string;
	searchableValues: string[];
}

export interface EpubHighlightRenderSnapshot {
	contextKey: string;
	bookId: string;
	filePath: string;
	showStrikethroughHighlights: boolean;
	revision: number;
	updatedAt: number;
	pageLabelsResolved: boolean;
	highlights: EpubDisplayHighlight[];
}

export interface EpubHighlightSnapshotContextInput {
	bookId: string;
	filePath: string;
	showStrikethroughHighlights?: boolean;
}

export interface EpubHighlightSnapshotRevalidateInput
	extends EpubHighlightSnapshotContextInput {
	annotationService?: EpubAnnotationService;
	backlinkService?: EpubBacklinkHighlightService;
	readerService?: EpubReaderEngine | null;
	highlightRevision?: number;
}

interface SnapshotCacheEntry {
	snapshot: EpubHighlightRenderSnapshot | null;
	dirty: boolean;
	inflightRevalidate: Promise<EpubHighlightRenderSnapshot> | null;
	inflightPageLabels: Promise<EpubHighlightRenderSnapshot | null> | null;
	version: number;
}

export class EpubHighlightViewSnapshotService {
	private snapshotCache = new Map<string, SnapshotCacheEntry>();

	buildContextKey(input: EpubHighlightSnapshotContextInput): string {
		return [
			String(input.bookId || "").trim(),
			String(input.filePath || "").trim(),
			input.showStrikethroughHighlights ? "1" : "0",
		].join("::");
	}

	getCachedSnapshot(
		input: EpubHighlightSnapshotContextInput
	): EpubHighlightRenderSnapshot | null {
		const entry = this.snapshotCache.get(this.buildContextKey(input));
		return entry?.snapshot ? this.cloneSnapshot(entry.snapshot) : null;
	}

	publishFromHighlights(input: {
		bookId: string;
		filePath: string;
		showStrikethroughHighlights?: boolean;
		revision: number;
		highlights: ReaderHighlight[];
		readerService?: EpubReaderEngine | null;
	}): EpubHighlightRenderSnapshot {
		const contextKey = this.buildContextKey(input);
		const entry = this.getOrCreateEntry(contextKey);
		const normalizedRevision = this.normalizeRevision(input.revision);
		const previousPageLabels = new Map<string, string>();
		for (const highlight of entry.snapshot?.highlights || []) {
			if (highlight.pageLabel) {
				previousPageLabels.set(highlight.cfiRange, highlight.pageLabel);
			}
		}

		const highlights = input.highlights
			.filter((highlight) =>
				this.shouldDisplayHighlight(highlight, Boolean(input.showStrikethroughHighlights))
			)
			.map((highlight) =>
				this.mapDisplayHighlight(
					highlight,
					previousPageLabels.get(String(highlight.cfiRange || ""))
				)
			)
			.sort((left, right) => (right.createdTime || 0) - (left.createdTime || 0));

		const snapshot: EpubHighlightRenderSnapshot = {
			contextKey,
			bookId: String(input.bookId || "").trim(),
			filePath: String(input.filePath || "").trim(),
			showStrikethroughHighlights: Boolean(input.showStrikethroughHighlights),
			revision: normalizedRevision,
			updatedAt: Date.now(),
			pageLabelsResolved:
				!input.readerService ||
				highlights.every((highlight) => !highlight.cfiRange || Boolean(highlight.pageLabel)),
			highlights,
		};

		entry.snapshot = snapshot;
		entry.dirty = false;
		entry.version += 1;
		entry.inflightRevalidate = null;

		if (input.readerService && !snapshot.pageLabelsResolved) {
			setTimeout(() => {
				void this.hydratePageLabels({
					bookId: input.bookId,
					filePath: input.filePath,
					showStrikethroughHighlights: input.showStrikethroughHighlights,
					readerService: input.readerService,
					highlightRevision: normalizedRevision,
				});
			}, 0);
		}

		return this.cloneSnapshot(snapshot);
	}

	invalidate(bookId?: string, filePath?: string): void {
		const normalizedBookId = String(bookId || "").trim();
		const normalizedFilePath = String(filePath || "").trim();
		if (!normalizedBookId && !normalizedFilePath) {
			for (const entry of this.snapshotCache.values()) {
				entry.dirty = true;
				entry.inflightRevalidate = null;
				entry.inflightPageLabels = null;
			}
			return;
		}

		for (const [key, entry] of this.snapshotCache.entries()) {
			const [cachedBookId = "", cachedFilePath = ""] = key.split("::");
			if (normalizedBookId && cachedBookId !== normalizedBookId) {
				continue;
			}
			if (normalizedFilePath && cachedFilePath !== normalizedFilePath) {
				continue;
			}
			entry.dirty = true;
			entry.inflightRevalidate = null;
			entry.inflightPageLabels = null;
		}
	}

	async revalidateSnapshot(
		input: EpubHighlightSnapshotRevalidateInput
	): Promise<EpubHighlightRenderSnapshot> {
		const contextKey = this.buildContextKey(input);
		const entry = this.getOrCreateEntry(contextKey);
		const normalizedRevision = this.normalizeRevision(input.highlightRevision);
		if (
			entry.snapshot &&
			!entry.dirty &&
			entry.snapshot.revision === normalizedRevision
		) {
			return this.cloneSnapshot(entry.snapshot);
		}

		if (entry.inflightRevalidate) {
			return this.cloneSnapshot(await entry.inflightRevalidate);
		}

		const revalidatePromise = (async () => {
			const allHighlights =
				input.annotationService && input.backlinkService && input.filePath
					? await input.annotationService.collectAllHighlights(
							input.bookId,
							input.filePath,
							input.backlinkService
					  )
					: [];

			const previousSnapshot = entry.snapshot;
			const previousPageLabels = new Map<string, string>();
			for (const highlight of previousSnapshot?.highlights || []) {
				if (highlight.pageLabel) {
					previousPageLabels.set(highlight.cfiRange, highlight.pageLabel);
				}
			}

			const highlights = allHighlights
				.filter((highlight) =>
					this.shouldDisplayHighlight(highlight, Boolean(input.showStrikethroughHighlights))
				)
				.map((highlight) =>
					this.mapDisplayHighlight(
						highlight,
						previousPageLabels.get(String(highlight.cfiRange || ""))
					)
				)
				.sort((left, right) => (right.createdTime || 0) - (left.createdTime || 0));

			const snapshot: EpubHighlightRenderSnapshot = {
				contextKey,
				bookId: String(input.bookId || "").trim(),
				filePath: String(input.filePath || "").trim(),
				showStrikethroughHighlights: Boolean(input.showStrikethroughHighlights),
				revision: normalizedRevision,
				updatedAt: Date.now(),
				pageLabelsResolved:
					!input.readerService ||
					highlights.every((highlight) => !highlight.cfiRange || Boolean(highlight.pageLabel)),
				highlights,
			};

			entry.snapshot = snapshot;
			entry.dirty = false;
			entry.version += 1;

			if (input.readerService && !snapshot.pageLabelsResolved) {
				setTimeout(() => {
					void this.hydratePageLabels(input);
				}, 0);
			}

			return snapshot;
		})();

		entry.inflightRevalidate = revalidatePromise;
		try {
			return this.cloneSnapshot(await revalidatePromise);
		} finally {
			if (entry.inflightRevalidate === revalidatePromise) {
				entry.inflightRevalidate = null;
			}
		}
	}

	async hydratePageLabels(
		input: EpubHighlightSnapshotRevalidateInput
	): Promise<EpubHighlightRenderSnapshot | null> {
		const readerService = input.readerService;
		if (!readerService) {
			return this.getCachedSnapshot(input);
		}

		const contextKey = this.buildContextKey(input);
		const entry = this.snapshotCache.get(contextKey);
		if (!entry?.snapshot) {
			return null;
		}
		if (entry.snapshot.pageLabelsResolved) {
			return this.cloneSnapshot(entry.snapshot);
		}
		if (entry.inflightPageLabels) {
			const inflightResult = await entry.inflightPageLabels;
			return inflightResult ? this.cloneSnapshot(inflightResult) : null;
		}

		const baseVersion = entry.version;
		const baseSnapshot = entry.snapshot;
		const inflightPromise = (async () => {
			const nextHighlights = await Promise.all(
				baseSnapshot.highlights.map(async (highlight) => {
					if (highlight.pageLabel || !highlight.cfiRange) {
						return highlight;
					}
					return {
						...highlight,
						pageLabel: await this.resolveHighlightPageLabel(
							readerService,
							highlight.cfiRange,
							highlight.text
						),
					};
				})
			);

			if (entry.version !== baseVersion || entry.snapshot !== baseSnapshot) {
				return entry.snapshot ? this.cloneSnapshot(entry.snapshot) : null;
			}

			const nextSnapshot: EpubHighlightRenderSnapshot = {
				...baseSnapshot,
				updatedAt: Date.now(),
				pageLabelsResolved: true,
				highlights: nextHighlights,
			};
			entry.snapshot = nextSnapshot;
			entry.version += 1;
			return nextSnapshot;
		})();

		entry.inflightPageLabels = inflightPromise;
		try {
			const result = await inflightPromise;
			return result ? this.cloneSnapshot(result) : null;
		} finally {
			if (entry.inflightPageLabels === inflightPromise) {
				entry.inflightPageLabels = null;
			}
		}
	}

	private getOrCreateEntry(contextKey: string): SnapshotCacheEntry {
		const existing = this.snapshotCache.get(contextKey);
		if (existing) {
			return existing;
		}
		const created: SnapshotCacheEntry = {
			snapshot: null,
			dirty: true,
			inflightRevalidate: null,
			inflightPageLabels: null,
			version: 0,
		};
		this.snapshotCache.set(contextKey, created);
		return created;
	}

	private normalizeRevision(value?: number): number {
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	private shouldDisplayHighlight(
		highlight: Pick<ReaderHighlight, "style" | "presentation">,
		showStrikethroughHighlights: boolean
	): boolean {
		if (highlight.presentation === "conceal") {
			return showStrikethroughHighlights;
		}
		return highlight.style !== "strikethrough" || showStrikethroughHighlights;
	}

	private mapDisplayHighlight(
		highlight: ReaderHighlight,
		pageLabel?: string
	): EpubDisplayHighlight {
		const color = this.normalizeColor(highlight.color);
		const noteType = this.getHighlightNoteType(highlight.style);
		const noteTypeKey = highlight.style || "highlight";
		const hasCommentDivider = Boolean(highlight.hasCommentDivider);
		const mappedHighlight: EpubDisplayHighlight = {
			cfiRange: highlight.cfiRange,
			text: highlight.text || "",
			commentText: highlight.commentText || "",
			hasCommentDivider,
			commentStateLabel: hasCommentDivider ? "有批注" : "无批注",
			color,
			colorLabel: this.getHighlightColorLabel(color),
			noteType,
			noteTypeKey,
			tags: this.extractHighlightTags(highlight.text, highlight.commentText),
			createdTime: highlight.createdTime || 0,
			pageLabel: pageLabel || "",
			sourceFile: highlight.sourceFile,
			sourceRef: highlight.sourceRef,
			searchableValues: [],
		};

		mappedHighlight.searchableValues = [
			mappedHighlight.text,
			mappedHighlight.commentText || "",
			mappedHighlight.sourceFile || "",
			mappedHighlight.noteType,
			mappedHighlight.noteTypeKey,
			mappedHighlight.colorLabel,
			mappedHighlight.color,
			mappedHighlight.commentStateLabel,
			...mappedHighlight.tags,
		].filter(Boolean);

		return mappedHighlight;
	}

	private normalizeColor(color?: string): EpubHighlightColor {
		switch (color) {
			case "green":
			case "blue":
			case "red":
			case "purple":
				return color;
			case "pink":
				return "red";
			default:
				return "yellow";
		}
	}

	private getHighlightColorLabel(color: EpubHighlightColor): string {
		switch (color) {
			case "green":
				return "绿色";
			case "blue":
				return "蓝色";
			case "red":
				return "红色";
			case "purple":
				return "紫色";
			default:
				return "黄色";
		}
	}

	private getHighlightNoteType(style?: ReaderHighlight["style"]): EpubHighlightNoteType {
		switch (style) {
			case "underline":
				return "下划线";
			case "strikethrough":
				return "删除线";
			case "wavy":
				return "波浪线";
			default:
				return "高亮";
		}
	}

	private extractHighlightTags(text?: string, commentText?: string): string[] {
		const combined = [text, commentText]
			.map((value) => (typeof value === "string" ? value.trim() : ""))
			.filter(Boolean)
			.join("\n");

		return combined ? TagExtractor.extractTagsExcludingCode(combined) : [];
	}

	private async resolveHighlightPageLabel(
		readerService: EpubReaderEngine,
		cfiRange: string,
		text?: string
	): Promise<string> {
		if (!cfiRange) {
			return "";
		}
		try {
			const canonical =
				typeof readerService.canonicalizeLocation === "function"
					? (await readerService.canonicalizeLocation(cfiRange, text)) || cfiRange
					: cfiRange;
			const pageNumber = await readerService.getPageNumberFromCfi(canonical);
			return typeof pageNumber === "number" && Number.isFinite(pageNumber) && pageNumber > 0
				? `p.${pageNumber}`
				: "";
		} catch {
			return "";
		}
	}

	private cloneSnapshot(
		snapshot: EpubHighlightRenderSnapshot
	): EpubHighlightRenderSnapshot {
		return {
			...snapshot,
			highlights: snapshot.highlights.map((highlight) => ({
				...highlight,
				tags: [...highlight.tags],
				searchableValues: [...highlight.searchableValues],
			})),
		};
	}
}
