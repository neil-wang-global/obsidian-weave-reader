import { normalizePath, TFile, type App } from "obsidian";
import { isSupportedBookPath } from "./book-format";

/**
 * Resolve a wikilink / href path to the canonical vault path of an EPUB (or other book).
 * Uses direct lookup first, then Obsidian linkpath resolution from the source note context.
 */
export function resolveEpubVaultPath(
	app: App,
	linkPath: string,
	sourcePath = ""
): string | null {
	const normalizedLink = normalizePath(String(linkPath || "").trim());
	if (!normalizedLink) {
		return null;
	}

	const direct = app.vault.getAbstractFileByPath(normalizedLink);
	if (direct instanceof TFile && isSupportedBookPath(direct.path)) {
		return direct.path;
	}

	const contextPath = normalizePath(String(sourcePath || "").trim());
	if (typeof app.metadataCache?.getFirstLinkpathDest === "function") {
		const resolved = app.metadataCache.getFirstLinkpathDest(normalizedLink, contextPath);
		if (resolved instanceof TFile && isSupportedBookPath(resolved.path)) {
			return resolved.path;
		}
	}

	return null;
}

/** Whether two vault paths refer to the same book file (exact or nested suffix match). */
export function epubVaultPathsReferToSameBook(left: string, right: string): boolean {
	const normalizedLeft = normalizePath(String(left || "").trim());
	const normalizedRight = normalizePath(String(right || "").trim());
	if (!normalizedLeft || !normalizedRight) {
		return false;
	}
	if (normalizedLeft === normalizedRight) {
		return true;
	}
	return (
		normalizedLeft.endsWith(`/${normalizedRight}`) ||
		normalizedRight.endsWith(`/${normalizedLeft}`)
	);
}
