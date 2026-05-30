import { describe, expect, it } from "vitest";
import {
	getReaderHighlightIdentityKey,
	mergeReaderHighlightsByIdentity,
} from "../highlight/highlight-identity";
import type { ReaderHighlight } from "../reader-engine-types";

describe("highlight-identity", () => {
	it("uses excerpt id as the primary identity discriminator", () => {
		const base = {
			cfiRange: "epubcfi(/6/26)",
			text: "same quote",
		};
		expect(getReaderHighlightIdentityKey({ ...base, excerptId: "a" })).not.toBe(
			getReaderHighlightIdentityKey({ ...base, excerptId: "b" })
		);
	});

	it("merges same quote at same cfi from different source files", () => {
		const merged = mergeReaderHighlightsByIdentity(
			[
				{
					cfiRange: "readium:shared",
					color: "green",
					text: "Shared highlight",
					sourceFile: "Notes/demo.md",
				},
			],
			[
				{
					cfiRange: "readium:shared",
					color: "green",
					text: "Shared highlight",
					sourceFile: "weave/memory/deck-files/demo.wdeck",
					sourceRef: "card:card-a",
				},
			]
		);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.sourceLocators).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceFile: "Notes/demo.md" }),
				expect.objectContaining({
					sourceFile: "weave/memory/deck-files/demo.wdeck",
					sourceRef: "card:card-a",
				}),
			])
		);
	});

	it("keeps distinct highlights when quote text differs at the same cfi", () => {
		const merged = mergeReaderHighlightsByIdentity([], [
			{
				cfiRange: "epubcfi(/6/26)",
				color: "yellow",
				text: "第一段",
			},
			{
				cfiRange: "epubcfi(/6/26)",
				color: "green",
				text: "第二段",
			},
		] as ReaderHighlight[]);

		expect(merged).toHaveLength(2);
	});
});
