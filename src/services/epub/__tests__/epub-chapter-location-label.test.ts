import { describe, expect, it } from "vitest";
import type { TocItem } from "../types";
import {
	formatChapterLocationLabel,
	normalizeChapterLocationFormat,
	resolveChapterLocationLabel,
	resolveTocLabelPathForSectionHref,
	tocHrefMatchesSectionHref,
} from "../../../utils/epub-chapter-location-label";

const nestedToc: TocItem[] = [
	{
		id: "1",
		label: "第一部 出入世",
		href: "part1.xhtml",
		level: 1,
		subitems: [
			{
				id: "2",
				label: "第三章 出离",
				href: "part1.xhtml#chapter-3",
				level: 2,
				subitems: [
					{
						id: "3",
						label: "3.1 告别",
						href: "part1.xhtml#section-3-1",
						level: 3,
					},
				],
			},
		],
	},
];

describe("epub-chapter-location-label", () => {
	it("matches section hrefs with and without hash fragments", () => {
		expect(tocHrefMatchesSectionHref("part1.xhtml#section-3-1", "part1.xhtml")).toBe(true);
		expect(tocHrefMatchesSectionHref("part1.xhtml", "part1.xhtml#section-3-1")).toBe(true);
		expect(tocHrefMatchesSectionHref("other.xhtml", "part1.xhtml")).toBe(false);
	});

	it("resolves the deepest toc label path for a section href", () => {
		expect(resolveTocLabelPathForSectionHref(nestedToc, "part1.xhtml#section-3-1")).toEqual([
			"第一部 出入世",
			"第三章 出离",
			"3.1 告别",
		]);
	});

	it("formats chapter location labels by root, leaf, and full modes", () => {
		const labels = ["第一部 出入世", "第三章 出离", "3.1 告别"];
		expect(formatChapterLocationLabel(labels, "root")).toBe("第一部 出入世");
		expect(formatChapterLocationLabel(labels, "leaf")).toBe("3.1 告别");
		expect(formatChapterLocationLabel(labels, "full")).toBe("第一部 出入世/第三章 出离/3.1 告别");
	});

	it("falls back to section title when toc path is unavailable", () => {
		expect(
			resolveChapterLocationLabel([], "missing.xhtml", "3.1 告别", "full")
		).toBe("3.1 告别");
	});

	it("normalizes unknown chapter location formats to leaf", () => {
		expect(normalizeChapterLocationFormat("full")).toBe("full");
		expect(normalizeChapterLocationFormat("root")).toBe("root");
		expect(normalizeChapterLocationFormat("invalid")).toBe("leaf");
	});
});
