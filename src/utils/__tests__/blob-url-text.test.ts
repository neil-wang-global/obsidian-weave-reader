import {
	isBlobResourceUrl,
	readBlobUrlAsArrayBuffer,
	readBlobUrlAsText,
	shouldPreferFetchForResourceUrl,
} from "../blob-url-text";

describe("blob-url-text", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("detects blob resource URLs", () => {
		expect(isBlobResourceUrl("blob:abc-123")).toBe(true);
		expect(isBlobResourceUrl(" BLOB:abc-123 ")).toBe(true);
		expect(isBlobResourceUrl("https://example.com/a.css")).toBe(false);
	});

	it("never prefers fetch for blob resources", () => {
		expect(shouldPreferFetchForResourceUrl("blob:chapter.css")).toBe(false);
		expect(shouldPreferFetchForResourceUrl("app://local/resource")).toBe(true);
		expect(shouldPreferFetchForResourceUrl("https://example.com/a.css")).toBe(false);
	});

	it("reads blob text via xhr", async () => {
		const xhrInstances: Array<{
			open: ReturnType<typeof vi.fn>;
			send: ReturnType<typeof vi.fn>;
			onload: (() => void) | null;
			responseText: string;
			status: number;
		}> = [];

		class MockXMLHttpRequest {
			responseType = "";
			responseText = "";
			status = 0;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			open = vi.fn();
			send = vi.fn();
			getResponseHeader = vi.fn(() => null);

			constructor() {
				xhrInstances.push(this);
			}
		}

		vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);

		const promise = readBlobUrlAsText("blob:chapter.css");
		const xhr = xhrInstances[0];
		xhr.status = 0;
		xhr.responseText = "body { color: red; }";
		xhr.onload?.();

		await expect(promise).resolves.toBe("body { color: red; }");
		expect(xhr.open).toHaveBeenCalledWith("GET", "blob:chapter.css");
		expect(xhr.responseType).toBe("text");
	});

	it("reads blob binary via xhr", async () => {
		const xhrInstances: Array<{
			open: ReturnType<typeof vi.fn>;
			send: ReturnType<typeof vi.fn>;
			onload: (() => void) | null;
			response: ArrayBuffer;
			status: number;
			getResponseHeader: ReturnType<typeof vi.fn>;
		}> = [];

		class MockXMLHttpRequest {
			responseType = "";
			response = new ArrayBuffer(0);
			status = 0;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			open = vi.fn();
			send = vi.fn();
			getResponseHeader = vi.fn(() => "image/png");

			constructor() {
				xhrInstances.push(this);
			}
		}

		vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);

		const bytes = new Uint8Array([137, 80, 78, 71]);
		const promise = readBlobUrlAsArrayBuffer("blob:image.png");
		const xhr = xhrInstances[0];
		xhr.status = 200;
		xhr.response = bytes.buffer;
		xhr.onload?.();

		await expect(promise).resolves.toEqual({
			bytes,
			mimeType: "image/png",
		});
		expect(xhr.open).toHaveBeenCalledWith("GET", "blob:image.png");
		expect(xhr.responseType).toBe("arraybuffer");
	});
});
