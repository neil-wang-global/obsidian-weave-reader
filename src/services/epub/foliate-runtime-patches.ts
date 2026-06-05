import { Platform } from "obsidian";

function shouldPreferFetchForResourceUrl(resourceUrl: string): boolean {
	const protocolMatch = /^[a-z][a-z0-9+.-]*:/i.exec(String(resourceUrl || "").trim());
	if (!protocolMatch) {
		return false;
	}
	return !/^https?:$/i.test(protocolMatch[0]);
}

function readTextFromResourceUrl(resourceUrl: string): Promise<string> {
	if (shouldPreferFetchForResourceUrl(resourceUrl) && typeof globalThis.fetch === "function") {
		return globalThis.fetch(resourceUrl).then(async (response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}
			return response.text();
		});
	}

	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("GET", resourceUrl, true);
		request.responseType = "text";
		request.onload = () => {
			if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
				resolve(request.responseText || "");
				return;
			}
			reject(new Error(`HTTP ${request.status} ${request.statusText || "Unknown error"}`));
		};
		request.onerror = async () => {
			const fetchFn = globalThis.fetch;
			if (typeof fetchFn === "function") {
				try {
					const response = await fetchFn(resourceUrl);
					if (!response.ok) {
						throw new Error(`HTTP ${response.status} ${response.statusText}`);
					}
					resolve(await response.text());
					return;
				} catch (_error) {
					// Fall through to the shared rejection below.
				}
			}
			reject(new Error(`Failed to load resource: ${resourceUrl}`));
		};
		request.send();
	});
}

export function normalizeDesktopFoliateSandboxValue(
	attributeName: string,
	value: string,
	stack?: string | null,
	iframeElement?: Element | null
): string | null {
	if (Platform.isMobile || attributeName.toLowerCase() !== "sandbox") {
		return null;
	}
	const normalizedValue = String(value || "").trim();
	if (!normalizedValue || !/allow-scripts/i.test(normalizedValue)) {
		return null;
	}
	const normalizedStack = String(stack || "").toLowerCase();
	const iframePart = String(iframeElement?.getAttribute("part") || "").toLowerCase();
	const shadowHostTagName = String(
		iframeElement?.getRootNode() instanceof ShadowRoot
			? (iframeElement.getRootNode() as ShadowRoot).host?.tagName
			: ""
	).toLowerCase();
	const isFoliateDesktopFrame =
		normalizedStack.includes("node_modules/foliate-js/paginator.js") ||
		normalizedStack.includes("node_modules/foliate-js/fixed-layout.js") ||
		iframePart.split(/\s+/).includes("filter") ||
		shadowHostTagName === "foliate-view";
	if (!isFoliateDesktopFrame) {
		return null;
	}
	const seenTokens = new Set<string>();
	const filteredTokens = normalizedValue
		.split(/\s+/)
		.filter(Boolean)
		.filter((token) => {
			const normalizedToken = token.toLowerCase();
			if (normalizedToken === "allow-scripts" || seenTokens.has(normalizedToken)) {
				return false;
			}
			seenTokens.add(normalizedToken);
			return true;
		});
	return filteredTokens.join(" ");
}

let desktopFoliateIframeSandboxPatchInstalled = false;
let mobileBlobIframePatchInstalled = false;
let mobileBlobIframeLoadTokens = new WeakMap<HTMLIFrameElement, number>();

export function installDesktopFoliateIframeSandboxPatch(): void {
	if (desktopFoliateIframeSandboxPatchInstalled || typeof HTMLIFrameElement === "undefined") {
		return;
	}
	const setAttributeDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "setAttribute");
	const originalSetAttribute = setAttributeDescriptor?.value as
		| ((this: Element, qualifiedName: string, value: string) => void)
		| undefined;
	if (!originalSetAttribute) {
		desktopFoliateIframeSandboxPatchInstalled = true;
		return;
	}
	HTMLIFrameElement.prototype.setAttribute = function patchedSetAttribute(
		name: string,
		value: string
	): void {
		const patchedValue = normalizeDesktopFoliateSandboxValue(
			name,
			String(value || ""),
			new Error().stack,
			this
		);
		Reflect.apply(originalSetAttribute, this, [name, patchedValue ?? value]);
	};
	desktopFoliateIframeSandboxPatchInstalled = true;
}

export function installMobileBlobIframePatch(onLoadError: (error: unknown) => void): void {
	if (mobileBlobIframePatchInstalled || typeof HTMLIFrameElement === "undefined") {
		return;
	}
	const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
	if (!srcDescriptor?.set) {
		mobileBlobIframePatchInstalled = true;
		return;
	}
	const getIframeSrc = (iframe: HTMLIFrameElement): string =>
		srcDescriptor.get
			? (
					// eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply needs the raw getter from the prototype descriptor.
					Reflect.apply(srcDescriptor.get as (this: HTMLIFrameElement) => string, iframe, [])
			  )
			: iframe.getAttribute("src") || "";
	const setIframeSrc = (iframe: HTMLIFrameElement, value: string): void => {
		Reflect.apply(
			// eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply needs the raw setter from the prototype descriptor.
			srcDescriptor.set as (this: HTMLIFrameElement, value: string) => void,
			iframe,
			[value]
		);
	};
	Object.defineProperty(HTMLIFrameElement.prototype, "src", {
		configurable: true,
		enumerable: srcDescriptor?.enumerable ?? true,
		get() {
			return getIframeSrc(this);
		},
		set(value: string) {
			const normalizedValue = String(value || "");
			if (!Platform.isMobile || !normalizedValue.startsWith("blob:")) {
				setIframeSrc(this, normalizedValue);
				return;
			}
			const loadToken = (mobileBlobIframeLoadTokens.get(this) || 0) + 1;
			mobileBlobIframeLoadTokens.set(this, loadToken);
			void readTextFromResourceUrl(normalizedValue)
				.then((html) => {
					if (mobileBlobIframeLoadTokens.get(this) !== loadToken) {
						return;
					}
					this.srcdoc = html;
				})
				.catch((error) => {
					try {
						setIframeSrc(this, normalizedValue);
					} catch (_fallbackError) {
						// Keep the original load error as the primary signal.
					}
					onLoadError(error);
				});
		},
	});
	mobileBlobIframePatchInstalled = true;
}

export function resetMobileBlobIframePatchStateForTests(): void {
	mobileBlobIframePatchInstalled = false;
	mobileBlobIframeLoadTokens = new WeakMap<HTMLIFrameElement, number>();
}
