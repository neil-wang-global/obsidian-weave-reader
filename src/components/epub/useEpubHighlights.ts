import { EpubLinkService } from "../../services/epub/EpubLinkService";
import type { ReaderHighlight } from "../../services/epub";

export function mergeReaderHighlightsByCfi(
	existing: ReaderHighlight[],
	incoming: ReaderHighlight[]
): ReaderHighlight[] {
	const merged = new Map<string, ReaderHighlight>();
	for (const highlight of [...existing, ...incoming]) {
		const key = EpubLinkService.normalizeCfi(highlight.cfiRange);
		if (!key) {
			continue;
		}
		const prior = merged.get(key);
		merged.set(key, prior ? { ...prior, ...highlight } : { ...highlight });
	}
	return Array.from(merged.values());
}
