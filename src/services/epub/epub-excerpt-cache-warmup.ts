import type { App } from "obsidian";
import {
	scheduleEpubAnnotationIndexWarmup,
	warmEpubAnnotationIndexForPaths,
} from "./epub-annotation-index";

/** @deprecated Use scheduleEpubAnnotationIndexWarmup. */
export function scheduleEpubExcerptCacheWarmup(
	app: App,
	delayMs?: number,
	options?: { forceAll?: boolean }
): void {
	scheduleEpubAnnotationIndexWarmup(app, delayMs, options);
}

/** @deprecated Use warmEpubAnnotationIndexForPaths. */
export function warmEpubExcerptCachesForPaths(app: App, paths: string[]): void {
	warmEpubAnnotationIndexForPaths(app, paths);
}
