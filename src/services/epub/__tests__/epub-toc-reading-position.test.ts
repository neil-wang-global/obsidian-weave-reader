import { describe, expect, it } from "vitest";
import type { TocItem } from "../types";
import {
	findTocHrefForSectionHref,
	isTocHrefActive,
	resolveActiveTocHref,
} from "../../../utils/epub-toc-reading-position";

const nestedToc: TocItem[] = [
	{
		id: "1",
		label: "Chapter 1",
		href: "Text/chapter1.xhtml",
		level: 1,
		subitems: [
			{
				id: "2",
				label: "Section 1",
				href: "Text/chapter1.xhtml#section-1",
				level: 2,
			},
		],
	},
];

describe("epub-toc-reading-position", () => {
	it("resolves the shallowest toc href for a spine section file", () => {
		expect(findTocHrefForSectionHref(nestedToc, "Text/chapter1.xhtml")).toBe(
			"Text/chapter1.xhtml"
		);
	});

	it("resolves anchored toc hrefs for fragment section hrefs", () => {
		expect(findTocHrefForSectionHref(nestedToc, "Text/chapter1.xhtml#section-1")).toBe(
			"Text/chapter1.xhtml#section-1"
		);
	});

	it("resolves active toc href through the helper alias", () => {
		expect(resolveActiveTocHref(nestedToc, "Text/chapter1.xhtml")).toBe("Text/chapter1.xhtml");
	});

	it("matches toc hrefs by basename when directory prefixes differ", () => {
		const prefixedToc: TocItem[] = [
			{
				id: "1",
				label: "Chapter 1",
				href: "OEBPS/Text/chapter1.xhtml",
				level: 1,
				subitems: [
					{
						id: "2",
						label: "Section 1",
						href: "OEBPS/Text/chapter1.xhtml#section-1",
						level: 2,
					},
				],
			},
		];
		expect(findTocHrefForSectionHref(prefixedToc, "Text/chapter1.xhtml")).toBe(
			"OEBPS/Text/chapter1.xhtml"
		);
		expect(findTocHrefForSectionHref(prefixedToc, "Text/chapter1.xhtml#section-1")).toBe(
			"OEBPS/Text/chapter1.xhtml#section-1"
		);
	});

	it("matches active toc hrefs exactly", () => {
		expect(
			isTocHrefActive("Text/chapter1.xhtml#section-1", "Text/chapter1.xhtml#section-1")
		).toBe(true);
		expect(isTocHrefActive("Text/chapter1.xhtml", "Text/chapter1.xhtml#section-1")).toBe(false);
		expect(isTocHrefActive("Text/other.xhtml", "Text/chapter1.xhtml")).toBe(false);
	});
});
