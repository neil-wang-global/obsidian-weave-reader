import { normalizePath } from "obsidian";
import type { EpubCanvasService } from "../../services/epub/EpubCanvasService";

export function getBoundCanvasPath(canvasService: EpubCanvasService): string | null {
	const canvasPath = normalizePath(String(canvasService.getCanvasPath() || "").trim());
	return canvasPath || null;
}
