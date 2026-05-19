import type { EpubBook, EpubReaderEngine, TocItem } from "../services/epub";

export type FlatTocItem = TocItem & { depth: number };

export function flattenTocItems(source: TocItem[], depth = 0): FlatTocItem[] {
	const result: FlatTocItem[] = [];
	for (const item of source) {
		result.push({ ...item, depth });
		if (item.subitems?.length) {
			result.push(...flattenTocItems(item.subitems, depth + 1));
		}
	}
	return result;
}

export function normalizeTocHref(href: string): string {
	const normalized = String(href || "").trim();
	if (!normalized) {
		return "";
	}

	const hashIndex = normalized.indexOf("#");
	return (hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized).trim();
}

export function resolveSavedReadingSectionHref(
	book: EpubBook | null | undefined,
	readerService: EpubReaderEngine | null | undefined
): string | null {
	if (!book?.currentPosition) {
		return null;
	}

	const position = book.currentPosition;
	const hasMeaningfulProgress =
		(typeof position.percent === "number" && position.percent > 0)
		|| Boolean(String(position.cfi || "").trim())
		|| (typeof position.chapterIndex === "number" && position.chapterIndex > 0);

	if (!hasMeaningfulProgress) {
		return null;
	}

	const cfi = String(position.cfi || "").trim();
	if (cfi && typeof readerService?.getSectionHrefForCfi === "function") {
		const hrefFromCfi = readerService.getSectionHrefForCfi(cfi);
		if (hrefFromCfi) {
			return hrefFromCfi;
		}
	}

	if (typeof readerService?.getSectionHrefByChapterIndex === "function") {
		const chapterIndex =
			typeof position.chapterIndex === "number" && Number.isFinite(position.chapterIndex)
				? Math.max(0, Math.floor(position.chapterIndex))
				: 0;
		const hrefFromIndex = readerService.getSectionHrefByChapterIndex(chapterIndex);
		if (hrefFromIndex) {
			return hrefFromIndex;
		}
	}

	return null;
}

export function findTocHrefForSectionHref(
	items: TocItem[],
	sectionHref: string | null | undefined
): string | null {
	if (!sectionHref) {
		return null;
	}

	const flatItems = flattenTocItems(items);
	if (flatItems.length === 0) {
		return null;
	}

	const normalizedTarget = normalizeTocHref(sectionHref);
	const trimmedTarget = String(sectionHref || "").trim();

	for (const item of flatItems) {
		if (item.href === trimmedTarget || normalizeTocHref(item.href) === normalizedTarget) {
			return item.href;
		}
	}

	let bestMatch: FlatTocItem | null = null;
	for (const item of flatItems) {
		const normalizedItemHref = normalizeTocHref(item.href);
		if (!normalizedItemHref) {
			continue;
		}

		const matchesSection =
			normalizedTarget === normalizedItemHref
			|| normalizedTarget.startsWith(`${normalizedItemHref}/`)
			|| normalizedItemHref.startsWith(`${normalizedTarget}/`);

		if (!matchesSection) {
			continue;
		}

		if (!bestMatch || item.depth > bestMatch.depth) {
			bestMatch = item;
		}
	}

	return bestMatch?.href ?? null;
}

export function resolveLastReadTocHref(
	book: EpubBook | null | undefined,
	readerService: EpubReaderEngine | null | undefined,
	tocItems: TocItem[]
): string | null {
	const sectionHref = resolveSavedReadingSectionHref(book, readerService);
	return findTocHrefForSectionHref(tocItems, sectionHref);
}
