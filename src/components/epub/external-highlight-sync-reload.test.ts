import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachExternalHighlightSyncReload } from "./external-highlight-sync-reload";

describe("attachExternalHighlightSyncReload", () => {
	let cleanup: (() => void) | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup?.();
		cleanup = null;
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("reloads when the document becomes visible again", () => {
		const onReload = vi.fn();
		cleanup = attachExternalHighlightSyncReload({
			canReload: () => true,
			onReload,
		});

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		});
		document.dispatchEvent(new Event("visibilitychange"));

		expect(onReload).toHaveBeenCalledWith(160);
	});

	it("reloads on window focus and pageshow with the expected delays", () => {
		const onReload = vi.fn();
		cleanup = attachExternalHighlightSyncReload({
			canReload: () => true,
			onReload,
			throttleMs: 10,
		});

		window.dispatchEvent(new Event("focus"));
		expect(onReload).toHaveBeenNthCalledWith(1, 200);

		vi.advanceTimersByTime(11);
		window.dispatchEvent(new Event("pageshow"));
		expect(onReload).toHaveBeenNthCalledWith(2, 120);
	});

	it("does not reload when re-entry is throttled or reloading is disabled", () => {
		const onReload = vi.fn();
		let canReload = true;
		cleanup = attachExternalHighlightSyncReload({
			canReload: () => canReload,
			onReload,
			throttleMs: 1000,
		});

		window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("pageshow"));

		canReload = false;
		vi.advanceTimersByTime(1001);
		window.dispatchEvent(new Event("focus"));

		expect(onReload).toHaveBeenCalledTimes(1);
		expect(onReload).toHaveBeenCalledWith(200);
	});

	it("removes listeners during cleanup", () => {
		const onReload = vi.fn();
		cleanup = attachExternalHighlightSyncReload({
			canReload: () => true,
			onReload,
		});

		cleanup();
		cleanup = null;

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		});
		document.dispatchEvent(new Event("visibilitychange"));
		window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("pageshow"));

		expect(onReload).not.toHaveBeenCalled();
	});
});
