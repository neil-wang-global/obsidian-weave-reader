import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("epub continuous scrollbar styling", () => {
	it("maps Obsidian styled scrollbars onto the foliate scrolled container part", () => {
		const stylesheetPath = resolve(process.cwd(), "src/styles/epub/epub-reader.css");
		const stylesheet = readFileSync(stylesheetPath, "utf8");

		expect(stylesheet).toContain(
			'.epub-reader-root[data-flow="scrolled"] .epub-viewer-container > .weave-epub-reader-host::part(container)'
		);
		expect(stylesheet).toContain(
			"body.styled-scrollbars\n\t.epub-reader-root[data-flow=\"scrolled\"]\n\t.epub-viewer-container\n\t> .weave-epub-reader-host::part(container)::-webkit-scrollbar"
		);
		expect(stylesheet).toContain("width: var(--scrollbar-width);");
		expect(stylesheet).toContain("background-color: var(--scrollbar-thumb-bg);");
		expect(stylesheet).toContain("background-color: var(--scrollbar-active-thumb-bg);");
	});

	it("keeps standard scrollbar-color as a fallback instead of the primary Chromium path", () => {
		const stylesheetPath = resolve(process.cwd(), "src/styles/epub/epub-reader.css");
		const stylesheet = readFileSync(stylesheetPath, "utf8");

		expect(stylesheet).toContain("@supports not selector(::-webkit-scrollbar)");
		expect(stylesheet).toContain("scrollbar-width: auto;");
		expect(stylesheet).toContain("scrollbar-color: var(--epub-scrollbar-thumb) var(--epub-scrollbar-track);");
	});
});
