/**
 * Read same-origin blob: URLs without fetch (restricted by Obsidian community lint).
 */
export function readBlobUrlAsText(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", url);
		xhr.responseType = "text";
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(xhr.responseText);
				return;
			}
			reject(new Error(`Failed to read blob URL (${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error("Failed to read blob URL"));
		xhr.send();
	});
}
