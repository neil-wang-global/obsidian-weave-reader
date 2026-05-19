import { parseMarkdownSections } from "../../utils/card-markdown-serializer";
import { extractBodyContent } from "../../utils/yaml-utils";

export interface SplitPreviewSections {
	front: string;
	back: string;
	combined: string;
}

function normalizePreviewText(value: string | undefined): string {
	return String(value || "")
		.replace(/\r\n?/g, "\n")
		.trim();
}

export function getAISplitPreviewSections(content: string): SplitPreviewSections {
	const bodyContent = extractBodyContent(String(content || ""));
	const normalizedBody = normalizePreviewText(bodyContent);

	if (!normalizedBody) {
		return {
			front: "",
			back: "",
			combined: "",
		};
	}

	const parsedSections = parseMarkdownSections(normalizedBody);
	const front = normalizePreviewText(parsedSections.front);
	const back = normalizePreviewText(parsedSections.back);

	if (front || back) {
		return {
			front,
			back,
			combined: [front, back].filter(Boolean).join("\n\n"),
		};
	}

	return {
		front: normalizedBody,
		back: "",
		combined: normalizedBody,
	};
}
