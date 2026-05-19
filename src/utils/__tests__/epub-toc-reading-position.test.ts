import { describe, expect, it } from "vitest";
import type { TocItem } from "../../services/epub";
import {
	findTocHrefForSectionHref,
	normalizeTocHref,
	resolveLastReadTocHref,
} from "../epub-toc-reading-position";

const sampleToc: TocItem[] = [
	{
		id: "part-1",
		label: "第一部",
		href: "OPS/part1.xhtml",
		level: 1,
		subitems: [
			{
				id: "chapter-1",
				label: "第一章",
				href: "OPS/chapter1.xhtml",
				level: 2,
			},
			{
				id: "chapter-2",
				label: "第二章",
				href: "OPS/chapter2.xhtml",
				level: 2,
			},
		],
	},
];

describe("epub-toc-reading-position", () => {
	it("normalizes href hash fragments", () => {
		expect(normalizeTocHref("OPS/chapter1.xhtml#section-2")).toBe("OPS/chapter1.xhtml");
	});

	it("finds the deepest toc entry for a section href", () => {
		expect(findTocHrefForSectionHref(sampleToc, "OPS/chapter2.xhtml")).toBe("OPS/chapter2.xhtml");
		expect(findTocHrefForSectionHref(sampleToc, "OPS/chapter2.xhtml#anchor")).toBe(
			"OPS/chapter2.xhtml"
		);
	});

	it("resolves last read toc href from saved book position", () => {
		const lastReadHref = resolveLastReadTocHref(
			{
				id: "book-1",
				filePath: "Books/demo.epub",
				metadata: { title: "Demo", author: "Author", chapterCount: 2 },
				currentPosition: {
					chapterIndex: 1,
					cfi: "epubcfi(/6/8)!/4/2",
					percent: 42,
				},
				readingStats: {
					totalReadTime: 0,
					lastReadTime: 1,
					createdTime: 1,
				},
			},
			{
				getSectionHrefForCfi: () => "OPS/chapter2.xhtml",
			},
			sampleToc
		);

		expect(lastReadHref).toBe("OPS/chapter2.xhtml");
	});
});
