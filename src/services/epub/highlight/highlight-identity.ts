import { EpubLinkService } from "../EpubLinkService";
import type { HighlightSourceLocator, ReaderHighlight } from "../reader-engine-types";

export type HighlightIdentityFields = Pick<
	ReaderHighlight,
	"cfiRange" | "excerptId" | "sourceFile" | "sourceRef" | "createdTime" | "text"
>;

/** Normalizes excerpt quote text for stable identity comparison. */
export function normalizeHighlightQuoteText(text: string | undefined): string {
	return String(text || "")
		.replace(/^>\s?/gm, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/**
 * Stable identity for one in-book highlight mark.
 * Same CFI + different excerpt or quote text => different keys.
 * Same CFI + same quote + multiple source files => one key (merged locators).
 */
export function getReaderHighlightIdentityKey(highlight: HighlightIdentityFields): string {
	const cfiKey = EpubLinkService.normalizeCfi(highlight.cfiRange);
	if (!cfiKey) {
		return "";
	}

	const excerptId = String(highlight.excerptId || "").trim();
	if (excerptId) {
		return `${cfiKey}\0eid:${excerptId}`;
	}

	const textKey = normalizeHighlightQuoteText(highlight.text);
	if (textKey) {
		return `${cfiKey}\0text:${textKey}`;
	}

	const sourceFile = String(highlight.sourceFile || "").trim();
	const sourceRef = String(highlight.sourceRef || "").trim();
	return `${cfiKey}\0src:${sourceFile}\0${sourceRef}\0${highlight.createdTime ?? ""}`;
}

function mergeHighlightSourceLocators(
	existing: HighlightSourceLocator[],
	incoming: HighlightSourceLocator[]
): HighlightSourceLocator[] {
	const merged = new Map<string, HighlightSourceLocator>();
	for (const locator of [...existing, ...incoming]) {
		const sourceFile = String(locator?.sourceFile || "").trim();
		if (!sourceFile) {
			continue;
		}
		const sourceRef = String(locator?.sourceRef || "").trim();
		const excerptId = String(locator?.excerptId || "").trim();
		const key = `${sourceFile}\0${sourceRef}\0${excerptId}`;
		if (!merged.has(key)) {
			merged.set(key, {
				sourceFile,
				...(sourceRef ? { sourceRef } : {}),
				...(excerptId ? { excerptId } : {}),
			});
		}
	}
	return Array.from(merged.values());
}

function collectHighlightSourceLocators(highlight: ReaderHighlight): HighlightSourceLocator[] {
	const locators: HighlightSourceLocator[] = [];
	const sourceFile = String(highlight.sourceFile || "").trim();
	if (sourceFile) {
		locators.push({
			sourceFile,
			sourceRef: highlight.sourceRef,
			...(highlight.excerptId ? { excerptId: highlight.excerptId } : {}),
		});
	}
	for (const locator of highlight.sourceLocators || []) {
		const path = String(locator?.sourceFile || "").trim();
		if (!path) {
			continue;
		}
		locators.push({
			sourceFile: path,
			sourceRef: locator.sourceRef,
			...(locator.excerptId ? { excerptId: locator.excerptId } : {}),
		});
	}
	return mergeHighlightSourceLocators([], locators);
}

function mergeReaderHighlightRecords(
	existing: ReaderHighlight,
	incoming: ReaderHighlight
): ReaderHighlight {
	const sourceLocators = mergeHighlightSourceLocators(
		collectHighlightSourceLocators(existing),
		collectHighlightSourceLocators(incoming)
	);
	return {
		...existing,
		...incoming,
		sourceLocators,
		sourceFile: incoming.sourceFile || existing.sourceFile,
		sourceRef: incoming.sourceRef ?? existing.sourceRef,
		excerptId: incoming.excerptId || existing.excerptId,
		commentText: incoming.commentText || existing.commentText,
		hasCommentDivider: existing.hasCommentDivider || incoming.hasCommentDivider,
		chapterIndex: existing.chapterIndex ?? incoming.chapterIndex,
		chapterTitle: existing.chapterTitle || incoming.chapterTitle,
		style: incoming.style ?? existing.style,
		createdTime: existing.createdTime ?? incoming.createdTime,
	};
}

export function mergeReaderHighlightsByIdentity(
	existing: ReaderHighlight[],
	incoming: ReaderHighlight[]
): ReaderHighlight[] {
	const merged = new Map<string, ReaderHighlight>();
	for (const highlight of [...existing, ...incoming]) {
		const key = getReaderHighlightIdentityKey(highlight);
		if (!key) {
			continue;
		}
		const prior = merged.get(key);
		merged.set(key, prior ? mergeReaderHighlightRecords(prior, highlight) : { ...highlight });
	}
	return Array.from(merged.values());
}
