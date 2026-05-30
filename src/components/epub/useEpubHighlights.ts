import type { ReaderHighlight } from "../../services/epub";
import {
	getReaderHighlightIdentityKey,
	mergeReaderHighlightsByIdentity,
} from "../../services/epub/highlight/highlight-identity";

export { getReaderHighlightIdentityKey, mergeReaderHighlightsByIdentity };

/** @deprecated Use mergeReaderHighlightsByIdentity — merges by excerpt/quote identity, not CFI alone. */
export function mergeReaderHighlightsByCfi(
	existing: ReaderHighlight[],
	incoming: ReaderHighlight[]
): ReaderHighlight[] {
	return mergeReaderHighlightsByIdentity(existing, incoming);
}
