import {
	getBookExtensionFromPath,
	isSupportedBookLocatorHref,
	isSupportedBookPath,
	splitSupportedBookLocatorHref,
	stripSupportedBookExtension,
	usesFoliateGenericBookLoader,
} from "../book-format";

describe("book-format", () => {
	it("recognizes cbz as a supported foliate generic book format", () => {
		expect(getBookExtensionFromPath("Books/demo.cbz")).toBe("cbz");
		expect(isSupportedBookPath("Books/demo.cbz")).toBe(true);
		expect(usesFoliateGenericBookLoader("Books/demo.cbz")).toBe(true);
		expect(stripSupportedBookExtension("demo.cbz")).toBe("demo");
	});

	it("detects supported locator hrefs for non-epub book extensions", () => {
		const href =
			"附件/demo.mobi#weave-cfi=epubcfi(/6/62!/4/12,/1:0,/1:136)";

		expect(isSupportedBookLocatorHref(href)).toBe(true);
		expect(splitSupportedBookLocatorHref(href)).toEqual({
			filePath: "附件/demo.mobi",
			subpath: "#weave-cfi=epubcfi(/6/62!/4/12,/1:0,/1:136)",
		});
		expect(isSupportedBookLocatorHref("Books/demo.epub")).toBe(false);
	});
});
