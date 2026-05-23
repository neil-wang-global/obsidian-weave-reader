import { normalizePath, TFile, type App } from "obsidian";
import { isSupportedBookFile, isSupportedBookPath } from "./book-format";

function normalizeComparableVaultPath(path: string): string {
	return normalizePath(String(path || "").trim())
		.replace(/^\/+/, "")
		.normalize("NFC")
		.toLowerCase();
}

const EXCLUDED_VAULT_BOOK_ROOTS = [".trash", ".obsidian"] as const;

/** Paths that should not appear in bookshelf scan/import (trash, plugin config, dot-folders). */
export function isVisibleVaultBookPath(filePath: string): boolean {
	const normalizedPath = normalizePath(String(filePath || "").trim()).replace(/^\/+/, "");
	if (!normalizedPath || !isSupportedBookPath(normalizedPath)) {
		return false;
	}

	for (const excludedRoot of EXCLUDED_VAULT_BOOK_ROOTS) {
		if (normalizedPath === excludedRoot || normalizedPath.startsWith(`${excludedRoot}/`)) {
			return false;
		}
	}

	return !normalizedPath.split("/").some((segment) => segment.startsWith("."));
}

/** Join adapter.list folder + entry into a vault-root path. */
export function joinListedVaultPath(folderPath: string, listedPath: string): string {
	const normalizedFolder = normalizePath(String(folderPath || "").trim()).replace(/^\/+/, "");
	const normalizedListed = normalizePath(String(listedPath || "").trim()).replace(/^\/+/, "");
	if (!normalizedListed) {
		return "";
	}
	if (!normalizedFolder || normalizedListed.includes("/")) {
		return normalizedListed;
	}
	return normalizePath(`${normalizedFolder}/${normalizedListed}`);
}

function buildVaultBookPathCandidates(filePath: string): string[] {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath) {
		return [];
	}

	const candidates = new Set<string>([normalizedPath]);
	const withoutLeadingDot = normalizedPath.replace(/^\.\/+/, "");
	if (withoutLeadingDot) {
		candidates.add(withoutLeadingDot);
	}
	const withoutLeadingSlash = normalizedPath.replace(/^\/+/, "");
	if (withoutLeadingSlash) {
		candidates.add(withoutLeadingSlash);
	}
	return Array.from(candidates);
}

/**
 * Resolve a stored bookshelf path to the canonical vault TFile.
 * Falls back to vault.getFiles() when adapter paths and the file index disagree.
 */
export function resolveSupportedBookFile(app: App, filePath: string): TFile | null {
	const normalizedPath = normalizePath(String(filePath || "").trim());
	if (!normalizedPath || !isVisibleVaultBookPath(normalizedPath)) {
		return null;
	}

	for (const candidate of buildVaultBookPathCandidates(normalizedPath)) {
		const direct = app.vault.getAbstractFileByPath(candidate);
		if (direct instanceof TFile && isSupportedBookFile(direct)) {
			return direct;
		}
	}

	const targetComparable = normalizeComparableVaultPath(normalizedPath);
	const targetName = normalizedPath.split("/").pop()?.toLowerCase() || "";
	const suffixMatches: TFile[] = [];
	const basenameMatches: TFile[] = [];

	for (const file of app.vault.getFiles()) {
		if (!isSupportedBookFile(file)) {
			continue;
		}
		const fileComparable = normalizeComparableVaultPath(file.path);
		if (fileComparable === targetComparable) {
			return file;
		}
		if (fileComparable.endsWith(`/${targetComparable}`)) {
			suffixMatches.push(file);
			continue;
		}
		if (targetName && file.name.toLowerCase() === targetName) {
			basenameMatches.push(file);
		}
	}

	if (suffixMatches.length === 1) {
		return suffixMatches[0];
	}
	if (basenameMatches.length === 1) {
		return basenameMatches[0];
	}

	return null;
}

export function isPathAlreadyOnBookshelf(
	filePath: string,
	membershipPaths: Iterable<string>
): boolean {
	for (const memberPath of membershipPaths) {
		if (epubVaultPathsReferToSameBook(memberPath, filePath)) {
			return true;
		}
	}
	return false;
}

export function resolveSupportedBookFilePath(app: App, filePath: string): string | null {
	return resolveSupportedBookFile(app, filePath)?.path ?? null;
}

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

	const resolvedBook = resolveSupportedBookFile(app, normalizedLink);
	if (resolvedBook) {
		return resolvedBook.path;
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

export function isPathAlreadyOnBookshelfForApp(
	app: App,
	filePath: string,
	membershipPaths: Iterable<string>
): boolean {
	const canonicalPath = resolveSupportedBookFilePath(app, filePath);
	if (!canonicalPath) {
		return false;
	}
	for (const memberPath of membershipPaths) {
		if (epubVaultPathsReferToSameBook(memberPath, canonicalPath)) {
			return true;
		}
	}
	return false;
}

/** Whether two vault paths refer to the same book file (exact or nested suffix match). */
export function epubVaultPathsReferToSameBook(left: string, right: string): boolean {
	const normalizedLeft = normalizeComparableVaultPath(left);
	const normalizedRight = normalizeComparableVaultPath(right);
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
