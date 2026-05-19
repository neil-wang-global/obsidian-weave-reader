import { describe, expect, it } from "vitest";

import { getAISplitPreviewSections } from "../../ai/ai-split-preview";

describe("getAISplitPreviewSections", () => {
	it("splits front and back around the standard divider", () => {
		const result = getAISplitPreviewSections("问题内容\n\n---div---\n\n答案内容");

		expect(result).toEqual({
			front: "问题内容",
			back: "答案内容",
			combined: "问题内容\n\n答案内容",
		});
	});

	it("strips yaml frontmatter before building preview sections", () => {
		const result = getAISplitPreviewSections(
			"---\nwe_decks:\n  - 标签树\n---\n问题内容\n\n---div---\n\n答案内容"
		);

		expect(result.front).toBe("问题内容");
		expect(result.back).toBe("答案内容");
	});

	it("falls back to the original body when no divider exists", () => {
		const result = getAISplitPreviewSections("只有正面内容");

		expect(result).toEqual({
			front: "只有正面内容",
			back: "",
			combined: "只有正面内容",
		});
	});
});
