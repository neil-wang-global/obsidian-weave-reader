import { type App, normalizePath } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import { safeReadJson } from "../../utils/safe-json-io";
import type { IRPointFileIndex } from "../../types/ir-point-storage-types";

export type IRWorkspaceSourceStamp = {
	path: string;
	mtime: number;
	size: number;
};

export type IRWorkspaceCacheManifest = {
	pointIndexPath: string;
	pointIndexMtime: number;
	pointIndexSize: number;
	pointFilePathsRevision: string;
	pointFiles: IRWorkspaceSourceStamp[];
	auxiliaryFiles: IRWorkspaceSourceStamp[];
};

export async function buildWorkspaceCacheManifest(app: App): Promise<IRWorkspaceCacheManifest> {
	const adapter = app.vault.adapter;
	const pluginPaths = getPluginPaths(app);
	const v2Paths = getV2PathsFromApp(app as any);
	const irState = pluginPaths.state.incrementalReading;

	const pointIndexPath = normalizePath(
		pluginPaths.cache.incrementalReading.pointFilesIndex ||
			`${pluginPaths.cache.incrementalReading.root}/point-files-index.json`
	);
	const pointIndexStamp = await buildFileStamp(adapter, pointIndexPath);
	const pointFiles: IRWorkspaceSourceStamp[] = [];

	const index = await readPointFilesIndexSnapshot(app, pointIndexPath, v2Paths.ir.pointFilesIndex);
	const root = normalizePath(v2Paths.ir.root);
	const pointFilePathsRevision = buildPointFilePathsRevision(index, root);

	for (const entry of index?.files || []) {
		const relativePath = normalizePath(String(entry?.file || "").trim().replace(/^\/+/, ""));
		if (!relativePath) {
			continue;
		}
		const absolutePath = normalizePath(`${root}/${relativePath}`);
		const stamp = await buildFileStamp(adapter, absolutePath);
		if (stamp) {
			pointFiles.push(stamp);
		}
	}

	const auxiliaryCandidates = [
		pointIndexPath,
		v2Paths.ir.pointFilesIndex,
		irState.history,
		irState.studySessions,
		irState.readingMaterialsRuntime,
		irState.monitoring,
		pluginPaths.state.studySession,
	].map((path) => normalizePath(String(path || "").trim()))
		.filter(Boolean);

	const auxiliaryFiles: IRWorkspaceSourceStamp[] = [];
	const seenAuxiliary = new Set<string>();
	for (const path of auxiliaryCandidates) {
		if (seenAuxiliary.has(path)) {
			continue;
		}
		seenAuxiliary.add(path);
		const stamp = await buildFileStamp(adapter, path);
		if (stamp) {
			auxiliaryFiles.push(stamp);
		}
	}

	pointFiles.sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
	auxiliaryFiles.sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));

	return normalizeWorkspaceCacheManifest({
		pointIndexPath,
		pointIndexMtime: pointIndexStamp?.mtime ?? 0,
		pointIndexSize: pointIndexStamp?.size ?? 0,
		pointFilePathsRevision,
		pointFiles,
		auxiliaryFiles,
	});
}

export async function refreshWorkspaceCacheManifest(
	app: App,
	manifest: IRWorkspaceCacheManifest
): Promise<IRWorkspaceCacheManifest | null> {
	const adapter = app.vault.adapter;
	const normalized = normalizeWorkspaceCacheManifest(manifest);
	if (!normalized.pointFilePathsRevision) {
		return null;
	}
	const v2Paths = getV2PathsFromApp(app as any);
	const index = await readPointFilesIndexSnapshot(
		app,
		normalized.pointIndexPath,
		v2Paths.ir.pointFilesIndex
	);
	const currentRevision = buildPointFilePathsRevision(index, normalizePath(v2Paths.ir.root));
	if (currentRevision !== normalized.pointFilePathsRevision) {
		return null;
	}

	const indexStamp = await buildFileStamp(adapter, normalized.pointIndexPath);
	if (
		!indexStamp ||
		indexStamp.mtime !== normalized.pointIndexMtime ||
		indexStamp.size !== normalized.pointIndexSize
	) {
		return null;
	}

	const pointFiles: IRWorkspaceSourceStamp[] = [];
	for (const stamp of normalized.pointFiles) {
		const current = await buildFileStamp(adapter, stamp.path);
		if (!current || current.mtime !== stamp.mtime || current.size !== stamp.size) {
			return null;
		}
		pointFiles.push(current);
	}

	const auxiliaryFiles: IRWorkspaceSourceStamp[] = [];
	for (const stamp of normalized.auxiliaryFiles) {
		const current = await buildFileStamp(adapter, stamp.path);
		if (!current || current.mtime !== stamp.mtime || current.size !== stamp.size) {
			return null;
		}
		auxiliaryFiles.push(current);
	}

	return normalizeWorkspaceCacheManifest({
		pointIndexPath: normalized.pointIndexPath,
		pointIndexMtime: indexStamp.mtime,
		pointIndexSize: indexStamp.size,
		pointFilePathsRevision: currentRevision,
		pointFiles,
		auxiliaryFiles,
	});
}

export function hashWorkspaceCacheManifest(manifest: IRWorkspaceCacheManifest): string {
	return hashStableValue(normalizeWorkspaceCacheManifest(manifest));
}

export function normalizeWorkspaceCacheManifest(
	manifest: IRWorkspaceCacheManifest
): IRWorkspaceCacheManifest {
	return {
		pointIndexPath: normalizePath(String(manifest.pointIndexPath || "").trim()),
		pointIndexMtime: manifest.pointIndexMtime,
		pointIndexSize: manifest.pointIndexSize,
		pointFilePathsRevision: String(manifest.pointFilePathsRevision || ""),
		pointFiles: manifest.pointFiles.map((stamp) => ({
			path: normalizePath(stamp.path),
			mtime: stamp.mtime,
			size: stamp.size,
		})),
		auxiliaryFiles: manifest.auxiliaryFiles.map((stamp) => ({
			path: normalizePath(stamp.path),
			mtime: stamp.mtime,
			size: stamp.size,
		})),
	};
}

async function readPointFilesIndexSnapshot(
	app: App,
	primaryIndexPath: string,
	fallbackIndexPath: string
): Promise<IRPointFileIndex | null> {
	const adapter = app.vault.adapter;
	return (
		(await safeReadJson<IRPointFileIndex | null>(adapter, primaryIndexPath, app)) ||
		(await safeReadJson<IRPointFileIndex | null>(adapter, fallbackIndexPath, app))
	);
}

function buildPointFilePathsRevision(index: IRPointFileIndex | null, root: string): string {
	const entries = (index?.files || [])
		.map((entry) => {
			const relativePath = normalizePath(String(entry?.file || "").trim().replace(/^\/+/, ""));
			if (!relativePath) {
				return null;
			}
			return {
				path: normalizePath(`${root}/${relativePath}`),
				updatedAt: String(entry?.updatedAt || ""),
				pointCount:
					typeof entry?.pointCount === "number" && Number.isFinite(entry.pointCount)
						? entry.pointCount
						: 0,
			};
		})
		.filter((entry): entry is { path: string; updatedAt: string; pointCount: number } => !!entry)
		.sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
	return hashStableValue(entries);
}

async function buildFileStamp(
	adapter: App["vault"]["adapter"],
	path: string
): Promise<IRWorkspaceSourceStamp | null> {
	const normalizedPath = normalizePath(String(path || "").trim());
	if (!normalizedPath) {
		return null;
	}
	try {
		if (!(await adapter.exists(normalizedPath))) {
			return null;
		}
		const stat = await adapter.stat(normalizedPath);
		return {
			path: normalizedPath,
			mtime: typeof stat?.mtime === "number" ? stat.mtime : 0,
			size: typeof stat?.size === "number" ? stat.size : 0,
		};
	} catch {
		return null;
	}
}

function hashStableValue(value: unknown): string {
	return hashString(stableStringify(value));
}

function stableStringify(value: unknown): string {
	if (value === null || value === undefined) {
		return "null";
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : "null";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	if (value instanceof Date) {
		return JSON.stringify(value.toISOString());
	}
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort((left, right) => left.localeCompare(right))
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(String(value));
}

function hashString(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
