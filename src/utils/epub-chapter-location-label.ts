import type { TocItem } from "../services/epub/types";
import type { EpubChapterLocationFormat } from "../services/epub/epub-excerpt-settings";
import { normalizeTocHref } from "./epub-toc-reading-position";

export const EPUB_CHAPTER_LOCATION_PATH_SEPARATOR = "/";

export function tocHrefMatchesSectionHref(tocHref: string, sectionHref: string): boolean {
	const trimmedToc = String(tocHref || "").trim();
	const trimmedSection = String(sectionHref || "").trim();
	if (!trimmedToc || !trimmedSection) {
		return false;
	}
	if (trimmedToc === trimmedSection) {
		return true;
	}

	const normalizedToc = normalizeTocHref(trimmedToc);
	const normalizedSection = normalizeTocHref(trimmedSection);
	if (!normalizedToc || !normalizedSection) {
		return false;
	}
	if (normalizedToc === normalizedSection) {
		return true;
	}
	return (
		normalizedSection.startsWith(`${normalizedToc}/`) ||
		normalizedToc.startsWith(`${normalizedSection}/`)
	);
}

export function resolveTocLabelPathForSectionHref(
	tocItems: TocItem[],
	sectionHref: string | null | undefined
): string[] {
	const trimmedSection = String(sectionHref || "").trim();
	if (!trimmedSection || tocItems.length === 0) {
		return [];
	}

	let bestPath: string[] = [];
	let bestDepth = -1;

	const visit = (entries: TocItem[], ancestors: string[]) => {
		for (const item of entries) {
			const label = String(item.label || "").trim();
			const path = label ? [...ancestors, label] : [...ancestors];
			if (tocHrefMatchesSectionHref(item.href, trimmedSection) && path.length > bestDepth) {
				bestDepth = path.length;
				bestPath = path;
			}
			if (item.subitems?.length) {
				visit(item.subitems, path);
			}
		}
	};

	visit(tocItems, []);
	return bestPath;
}

export function formatChapterLocationLabel(
	labels: string[],
	format: EpubChapterLocationFormat,
	separator = EPUB_CHAPTER_LOCATION_PATH_SEPARATOR
): string {
	const path = labels.map((label) => label.trim()).filter(Boolean);
	if (path.length === 0) {
		return "";
	}
	switch (format) {
		case "root":
			return path[0] || "";
		case "full":
			return path.join(separator);
		case "leaf":
		default:
			return path[path.length - 1] || "";
	}
}

export function normalizeChapterLocationFormat(value: unknown): EpubChapterLocationFormat {
	return value === "root" || value === "full" ? value : "leaf";
}

export function resolveChapterLocationLabel(
	tocItems: TocItem[],
	sectionHref: string | null | undefined,
	fallbackTitle: string,
	format: EpubChapterLocationFormat
): string {
	const path = resolveTocLabelPathForSectionHref(tocItems, sectionHref);
	const effectivePath = path.length > 0 ? path : [String(fallbackTitle || "").trim()].filter(Boolean);
	return formatChapterLocationLabel(effectivePath, format);
}
