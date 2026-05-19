type CleanupFn = () => void;

const SETTINGS_CONTAINER_SELECTOR = ".weave-settings";
const ROW_SELECTOR = ".row";
const SETTING_ITEM_SELECTOR = ".setting-item";

const FLAG_RULES: Array<{ className: string; selector: string }> = [
	{ className: "weave-setting-has-description", selector: ".setting-description, .setting-item-description" },
	{ className: "weave-setting-has-toggle-switch", selector: ".toggle-switch" },
	{ className: "weave-setting-has-modern-switch", selector: ".modern-switch" },
	{ className: "weave-setting-has-checkbox-toggle", selector: ".checkbox-container.mod-toggle" },
	{ className: "weave-setting-has-dropdown", selector: ".obsidian-dropdown-trigger" },
	{ className: "weave-setting-has-select", selector: "select" },
	{ className: "weave-setting-has-number-input-compact", selector: ".number-input-compact" },
	{ className: "weave-setting-has-label-with-desc", selector: ".label-with-desc" },
];

function syncFlags(element: Element): void {
	for (const rule of FLAG_RULES) {
		element.classList.toggle(rule.className, Boolean(element.querySelector(rule.selector)));
	}
}

function syncContainer(container: ParentNode): void {
	for (const element of container.querySelectorAll(`${ROW_SELECTOR}, ${SETTING_ITEM_SELECTOR}`)) {
		syncFlags(element);
	}
}

export function initWeaveSettingsLayoutClasses(): CleanupFn {
	if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
		return () => {};
	}

	let frameId = 0;

	const flush = () => {
		frameId = 0;
		for (const container of document.querySelectorAll(SETTINGS_CONTAINER_SELECTOR)) {
			syncContainer(container);
		}
	};

	const scheduleFlush = () => {
		if (frameId !== 0) {
			return;
		}
		frameId = window.requestAnimationFrame(flush);
	};

	const observer = new MutationObserver(() => {
		scheduleFlush();
	});

	scheduleFlush();

	if (document.body) {
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	window.addEventListener("resize", scheduleFlush);

	return () => {
		if (frameId !== 0) {
			window.cancelAnimationFrame(frameId);
		}
		window.removeEventListener("resize", scheduleFlush);
		observer.disconnect();
	};
}
