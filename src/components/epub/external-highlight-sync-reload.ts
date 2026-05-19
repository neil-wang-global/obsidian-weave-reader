export interface ExternalHighlightSyncReloadOptions {
	canReload: () => boolean;
	onReload: (delayMs: number) => void;
	throttleMs?: number;
}

export function attachExternalHighlightSyncReload(
	options: ExternalHighlightSyncReloadOptions
): () => void {
	const throttleMs =
		typeof options.throttleMs === "number" && options.throttleMs > 0 ? options.throttleMs : 1200;
	let lastReloadAt = 0;

	const queueReload = (delayMs: number) => {
		if (!options.canReload()) {
			return;
		}

		const now = Date.now();
		if (now - lastReloadAt < throttleMs) {
			return;
		}
		lastReloadAt = now;
		options.onReload(delayMs);
	};

	const onVisibilityChange = () => {
		if (document.visibilityState === "visible") {
			queueReload(160);
		}
	};

	const onWindowFocus = () => {
		queueReload(200);
	};

	const onPageShow = () => {
		queueReload(120);
	};

	document.addEventListener("visibilitychange", onVisibilityChange);
	window.addEventListener("focus", onWindowFocus);
	window.addEventListener("pageshow", onPageShow);

	return () => {
		document.removeEventListener("visibilitychange", onVisibilityChange);
		window.removeEventListener("focus", onWindowFocus);
		window.removeEventListener("pageshow", onPageShow);
	};
}
