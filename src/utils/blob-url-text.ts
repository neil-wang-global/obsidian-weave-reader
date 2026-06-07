/**
 * Read same-origin blob: URLs without fetch (restricted by Obsidian community lint).
 */

export function isBlobResourceUrl(url: string): boolean {
	return String(url || "").trim().toLowerCase().startsWith("blob:");
}

export function shouldPreferFetchForResourceUrl(resourceUrl: string): boolean {
	if (isBlobResourceUrl(resourceUrl)) {
		return false;
	}
	const protocolMatch = /^[a-z][a-z0-9+.-]*:/i.exec(String(resourceUrl || "").trim());
	if (!protocolMatch) {
		return false;
	}
	return !/^https?:$/i.test(protocolMatch[0]);
}

function isSuccessfulBlobXhrStatus(status: number): boolean {
	return status === 0 || (status >= 200 && status < 300);
}

export function readBlobUrlAsText(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url);
		xhr.responseType = "text";
		xhr.onload = () => {
			if (isSuccessfulBlobXhrStatus(xhr.status)) {
				resolve(xhr.responseText || "");
				return;
			}
			reject(new Error(`Failed to read blob URL (${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error("Failed to read blob URL"));
		xhr.send();
	});
}

export function readBlobUrlAsArrayBuffer(
	url: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url);
		xhr.responseType = "arraybuffer";
		xhr.onload = () => {
			if (isSuccessfulBlobXhrStatus(xhr.status) && xhr.response instanceof ArrayBuffer) {
				const mimeType = String(xhr.getResponseHeader("content-type") || "application/octet-stream")
					.trim()
					.toLowerCase();
				resolve({
					bytes: new Uint8Array(xhr.response),
					mimeType,
				});
				return;
			}
			reject(new Error(`Failed to read blob URL (${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error("Failed to read blob URL"));
		xhr.send();
	});
}
