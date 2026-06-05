import type { BookLocateIntent, PendingLocateState } from "../../services/navigation/navigation-intent";
import { bookLocateFromPending } from "../../services/navigation/navigation-intent";
import type { EpubReaderEngine } from "../../services/epub";

export interface EpubNavigationControllerOptions {
	getReaderReady: () => boolean;
	getReaderService: () => EpubReaderEngine;
	getSourceLocateOverlay: () => {
		showAtRect: (
			rect: DOMRect,
			options: { label: string; icon: string; durationMs?: number }
		) => boolean;
	};
	getLocateOverlayLabel: () => string;
	onPendingChange?: (hasPending: boolean) => void;
}

export function createEpubNavigationController(options: EpubNavigationControllerOptions) {
	let pendingBookLocate: BookLocateIntent | null = null;

	function notifyPendingChange(): void {
		options.onPendingChange?.(Boolean(pendingBookLocate));
	}

	async function applyBookLocate(nav: BookLocateIntent): Promise<void> {
		const readerService = options.getReaderService();
		try {
			if (nav.flashStyle && nav.flashStyle !== "none") {
				await readerService.navigateAndHighlight({
					cfi: nav.cfi,
					href: nav.href,
					text: nav.text,
					flashStyle: nav.flashStyle,
				});
			} else {
				await readerService.navigateTo({
					cfi: nav.cfi,
					href: nav.href,
					text: nav.text,
				});
			}
			if (nav.showLocateOverlay) {
				window.setTimeout(() => {
					const rect = readerService.getNavigationTargetRect({
						cfi: nav.cfi,
						href: nav.href,
						text: nav.text,
					});
					if (rect) {
						options.getSourceLocateOverlay().showAtRect(rect, {
							label: options.getLocateOverlayLabel(),
							icon: "map-pinned",
							durationMs: 2200,
						});
					}
				}, 80);
			}
		} catch {
			/* caller logs */
		}
	}

	function requestBookLocate(nav: BookLocateIntent): void {
		if (!nav.cfi && !nav.href) {
			return;
		}
		if (!options.getReaderReady()) {
			pendingBookLocate = nav;
			notifyPendingChange();
			return;
		}
		void applyBookLocate(nav);
	}

	function flushPendingBookLocate(): void {
		if (!pendingBookLocate) {
			return;
		}
		const nav = pendingBookLocate;
		pendingBookLocate = null;
		notifyPendingChange();
		void applyBookLocate(nav);
	}

	function flushPendingLocateFromProps(
		pendingLocate: PendingLocateState | null,
		pendingCfi: string,
		pendingText: string
	): void {
		const fromLocate = bookLocateFromPending(pendingLocate);
		if (fromLocate) {
			requestBookLocate({
				...fromLocate,
				flashStyle: fromLocate.flashStyle ?? "highlight",
				showLocateOverlay: fromLocate.showLocateOverlay ?? true,
			});
			return;
		}
		const legacyCfi = String(pendingCfi || "").trim();
		if (legacyCfi) {
			requestBookLocate({
				cfi: legacyCfi,
				text: pendingText || "",
				flashStyle: "highlight",
				showLocateOverlay: true,
			});
		}
	}

	function buildLocateFromEventDetail(detail: Record<string, unknown>): BookLocateIntent | null {
		const nav: BookLocateIntent = {};
		if (typeof detail.cfi === "string" && detail.cfi) {
			nav.cfi = detail.cfi;
		} else if (typeof detail.href === "string" && detail.href) {
			nav.href = detail.href;
		}
		if (typeof detail.text === "string" && detail.text.trim()) {
			nav.text = detail.text;
		}
		if (detail.flashStyle === "pulse" || detail.flashStyle === "highlight" || detail.flashStyle === "none") {
			nav.flashStyle = detail.flashStyle;
		}
		if (typeof detail.showLocateOverlay === "boolean") {
			nav.showLocateOverlay = detail.showLocateOverlay;
		}
		if (!nav.cfi && !nav.href) {
			return null;
		}
		return nav;
	}

	return {
		requestBookLocate,
		requestIRNavigation: requestBookLocate,
		applyBookLocate,
		flushPendingBookLocate,
		flushPendingLocateFromProps,
		buildLocateFromEventDetail,
		hasPendingBookLocate: () => Boolean(pendingBookLocate),
	};
}
