import type { App } from "obsidian";
import { EpubStorageService } from "./EpubStorageService";
import { resolveEpubHost } from "./epub-host";

const fallbackStorageServiceByApp = new WeakMap<App, EpubStorageService>();

export function getEpubStorageService(app: App): EpubStorageService {
	const host = resolveEpubHost(app) as { getEpubStorageService?: () => EpubStorageService } | null;
	if (typeof host?.getEpubStorageService === "function") {
		return host.getEpubStorageService();
	}

	let service = fallbackStorageServiceByApp.get(app);
	if (!service) {
		service = new EpubStorageService(app);
		fallbackStorageServiceByApp.set(app, service);
	}
	return service;
}
