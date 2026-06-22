import { DEFAULT_BOOK_NOTES_EXPORT_TEMPLATE_FOLDER } from "./constants";
import { normalizeVaultFolderPath } from "../../../utils/vault-folder-markdown-filter";

export function resolveBookNotesExportTemplateFolder(
	settings?: { bookNotesExportTemplateFolder?: string | null } | null
): string {
	const normalized = normalizeVaultFolderPath(settings?.bookNotesExportTemplateFolder);
	return normalized || DEFAULT_BOOK_NOTES_EXPORT_TEMPLATE_FOLDER;
}
