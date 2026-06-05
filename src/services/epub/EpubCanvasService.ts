import { Notice, TFile, TFolder, type App, normalizePath } from "obsidian";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import type { CanvasViewLike } from "../../types/obsidian-extensions";
import { generateCardUUID } from "../identifier/WeaveIDGenerator";
import { EpubLinkService } from "./EpubLinkService";
import type {
	CanvasAnchor,
	CanvasData,
	CanvasEdge,
	CanvasLayoutDirection,
	CanvasNode,
	CanvasSide,
} from "./canvas-types";
import type { EpubHighlightStyle } from "./types";
import {
	DEFAULT_NODE_HEIGHT,
	DEFAULT_NODE_WIDTH,
	HIGHLIGHT_TO_CANVAS_COLOR,
	NODE_GAP_X,
	NODE_GAP_Y,
} from "./canvas-types";

export class EpubCanvasService {
	private app: App;
	private linkService: EpubLinkService;
	private canvasPath: string | null = null;
	private anchor: CanvasAnchor | null = null;
	private layoutDirection: CanvasLayoutDirection = "down";

	constructor(app: App) {
		this.app = app;
		this.linkService = new EpubLinkService(app);
	}

	getCanvasPath(): string | null {
		return this.canvasPath;
	}

	setCanvasPath(path: string | null): void {
		this.canvasPath = path;
	}

	getLayoutDirection(): CanvasLayoutDirection {
		return this.layoutDirection;
	}

	setLayoutDirection(dir: CanvasLayoutDirection): void {
		this.layoutDirection = dir;
	}

	getAnchor(): CanvasAnchor | null {
		return this.anchor;
	}

	setAnchor(anchor: CanvasAnchor | null): void {
		this.anchor = anchor;
	}

	isActive(): boolean {
		return this.canvasPath !== null;
	}

	async createCanvas(canvasPath: string): Promise<void> {
		const normalizedPath = this.normalizeCanvasPath(canvasPath);
		await this.ensureVaultFolderExists(this.getParentFolderPath(normalizedPath));
		const emptyCanvas: CanvasData = { nodes: [], edges: [] };
		await this.writeVaultTextFile(normalizedPath, JSON.stringify(emptyCanvas));
		this.canvasPath = normalizedPath;
	}

	async readCanvas(): Promise<CanvasData> {
		if (!this.canvasPath) {
			return { nodes: [], edges: [] };
		}

		const file = this.app.vault.getAbstractFileByPath(this.canvasPath);
		if (!(file instanceof TFile)) {
			return { nodes: [], edges: [] };
		}

		try {
			const content = await this.app.vault.read(file);
			return JSON.parse(content) as CanvasData;
		} catch (e) {
			logger.warn("[EpubCanvasService] Failed to read canvas:", e);
			return { nodes: [], edges: [] };
		}
	}

	private async writeCanvas(data: CanvasData): Promise<void> {
		if (!this.canvasPath) return;
		await this.ensureVaultFolderExists(this.getParentFolderPath(this.canvasPath));
		await this.writeVaultTextFile(this.canvasPath, JSON.stringify(data));
	}

	private normalizeCanvasPath(canvasPath: string): string {
		const raw = String(canvasPath || "").trim();
		if (!raw) {
			throw new Error("Canvas path is required");
		}
		const withExtension = raw.endsWith(".canvas") ? raw : `${raw}.canvas`;
		return normalizePath(withExtension);
	}

	private getParentFolderPath(filePath: string): string {
		const lastSlashIndex = filePath.lastIndexOf("/");
		return lastSlashIndex > 0 ? filePath.slice(0, lastSlashIndex) : "";
	}

	private async ensureVaultFolderExists(folderPath: string): Promise<void> {
		const normalizedFolderPath = normalizePath(String(folderPath || "").trim());
		if (!normalizedFolderPath) {
			return;
		}

		const existing = this.app.vault.getAbstractFileByPath(normalizedFolderPath);
		if (existing instanceof TFolder) {
			return;
		}
		if (existing && !(existing instanceof TFolder)) {
			throw new Error(`Path exists and is not a folder: ${normalizedFolderPath}`);
		}

		const segments = normalizedFolderPath.split("/").filter(Boolean);
		let currentPath = "";
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const currentEntry = this.app.vault.getAbstractFileByPath(currentPath);
			if (currentEntry instanceof TFolder) {
				continue;
			}
			if (currentEntry && !(currentEntry instanceof TFolder)) {
				throw new Error(`Path exists and is not a folder: ${currentPath}`);
			}
			await this.app.vault.createFolder(currentPath);
		}
	}

	private async writeVaultTextFile(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			return;
		}
		if (existing) {
			throw new Error(`Path exists and is not a file: ${path}`);
		}
		await this.app.vault.create(path, content);
	}

	async addExcerptNode(
		text: string,
		cfiRange: string,
		filePath: string,
		chapterIndex?: number,
		chapterTitle?: string,
		color?: string,
		timestamp?: string,
		sourceId?: string,
		style?: EpubHighlightStyle
	): Promise<CanvasNode | null> {
		if (!this.canvasPath) return null;

		try {
			const data = await this.readCanvas();

			const noteContent = this.linkService.buildQuoteBlock(
				filePath,
				cfiRange,
				text,
				chapterIndex,
				color,
				chapterTitle,
				timestamp,
				this.canvasPath || undefined,
				sourceId,
				undefined,
				style
			);

			const nodeId = this.generateNodeId();
			const canvasColor = color ? HIGHLIGHT_TO_CANVAS_COLOR[color] : undefined;
			const position = this.calculateNodePosition(data);

			const node: CanvasNode = {
				id: nodeId,
				type: "text",
				text: noteContent,
				x: position.x,
				y: position.y,
				width: DEFAULT_NODE_WIDTH,
				height: DEFAULT_NODE_HEIGHT,
				...(canvasColor && { color: canvasColor }),
			};

			data.nodes.push(node);

			const parentId = this.resolveParentNodeId(data);
			if (parentId) {
				const sides = this.getEdgeSides();
				const edge: CanvasEdge = {
					id: this.generateNodeId(),
					fromNode: parentId,
					toNode: nodeId,
					fromSide: sides.fromSide,
					toSide: sides.toSide,
				};
				data.edges.push(edge);
			}

			await this.writeCanvas(data);

			this.anchor = {
				nodeId,
				parentNodeId: parentId,
			};

			return node;
		} catch (e) {
			logger.error("[EpubCanvasService] Failed to add excerpt node:", e);
			new Notice(i18n.t("views.epubView.notice.canvasAddNodeFailed"));
			return null;
		}
	}

	async addRawTextNode(content: string, color?: string): Promise<CanvasNode | null> {
		if (!this.canvasPath) return null;

		try {
			const data = await this.readCanvas();
			const nodeId = this.generateNodeId();
			const canvasColor = color ? HIGHLIGHT_TO_CANVAS_COLOR[color] : undefined;
			const position = this.calculateNodePosition(data);

			const node: CanvasNode = {
				id: nodeId,
				type: "text",
				text: content,
				x: position.x,
				y: position.y,
				width: DEFAULT_NODE_WIDTH,
				height: DEFAULT_NODE_HEIGHT,
				...(canvasColor && { color: canvasColor }),
			};

			data.nodes.push(node);

			const parentId = this.resolveParentNodeId(data);
			if (parentId) {
				const sides = this.getEdgeSides();
				const edge: CanvasEdge = {
					id: this.generateNodeId(),
					fromNode: parentId,
					toNode: nodeId,
					fromSide: sides.fromSide,
					toSide: sides.toSide,
				};
				data.edges.push(edge);
			}

			await this.writeCanvas(data);

			this.anchor = {
				nodeId,
				parentNodeId: parentId,
			};

			return node;
		} catch (e) {
			logger.error("[EpubCanvasService] Failed to add raw text node:", e);
			new Notice(i18n.t("views.epubView.notice.canvasAddNodeFailed"));
			return null;
		}
	}

	private resolveParentNodeId(data: CanvasData): string | null {
		return this.resolveAnchorNode(data)?.id || null;
	}

	private getEdgeSides(): { fromSide: CanvasSide; toSide: CanvasSide } {
		switch (this.layoutDirection) {
			case "down":
				return { fromSide: "bottom", toSide: "top" };
			case "up":
				return { fromSide: "top", toSide: "bottom" };
			case "right":
				return { fromSide: "right", toSide: "left" };
			case "left":
				return { fromSide: "left", toSide: "right" };
		}
	}

	private calculateNodePosition(data: CanvasData): { x: number; y: number } {
		const anchorNode = this.resolveAnchorNode(data);
		if (!anchorNode) {
			return this.calculateRootPosition(data);
		}

		return this.calculateDirectionalPosition(anchorNode);
	}

	private resolveAnchorNode(data: CanvasData): CanvasNode | null {
		if (!this.anchor?.nodeId) {
			return null;
		}
		return data.nodes.find((node) => node.id === this.anchor?.nodeId) || null;
	}

	private calculateRootPosition(data: CanvasData): { x: number; y: number } {
		if (data.nodes.length === 0) {
			return { x: 0, y: 0 };
		}

		switch (this.layoutDirection) {
			case "down": {
				let maxY = -Infinity;
				for (const node of data.nodes) {
					const bottom = node.y + node.height;
					if (bottom > maxY) maxY = bottom;
				}
				return { x: 0, y: maxY + NODE_GAP_Y };
			}
			case "up": {
				let minY = Infinity;
				for (const node of data.nodes) {
					if (node.y < minY) minY = node.y;
				}
				return { x: 0, y: minY - DEFAULT_NODE_HEIGHT - NODE_GAP_Y };
			}
			case "right": {
				let maxX = -Infinity;
				for (const node of data.nodes) {
					const right = node.x + node.width;
					if (right > maxX) maxX = right;
				}
				return { x: maxX + NODE_GAP_X, y: 0 };
			}
			case "left": {
				let minX = Infinity;
				for (const node of data.nodes) {
					if (node.x < minX) minX = node.x;
				}
				return { x: minX - DEFAULT_NODE_WIDTH - NODE_GAP_X, y: 0 };
			}
		}
	}

	private calculateDirectionalPosition(anchor: CanvasNode): { x: number; y: number } {
		switch (this.layoutDirection) {
			case "down":
				return { x: anchor.x, y: anchor.y + anchor.height + NODE_GAP_Y };
			case "up":
				return { x: anchor.x, y: anchor.y - DEFAULT_NODE_HEIGHT - NODE_GAP_Y };
			case "right":
				return { x: anchor.x + anchor.width + NODE_GAP_X, y: anchor.y };
			case "left":
				return { x: anchor.x - DEFAULT_NODE_WIDTH - NODE_GAP_X, y: anchor.y };
		}
	}

	updateAnchorFromCanvasSelection(app: App): void {
		try {
			const canvasLeaves = app.workspace.getLeavesOfType("canvas");
			for (const leaf of canvasLeaves) {
				const canvasView = leaf.view as CanvasViewLike;
				if (!canvasView?.canvas) continue;

				const filePath = canvasView.file?.path;
				if (filePath !== this.canvasPath) continue;

				const selection = canvasView.canvas.selection;
				if (!selection || selection.size === 0) {
					return;
				}

				const rawData = canvasView.canvas.getData?.();
				const data =
					rawData && typeof rawData === "object" && !Array.isArray(rawData)
						? (rawData as CanvasData)
						: null;
				const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
				let selectedNode: string | null = null;
				for (const item of selection.values()) {
					const itemRecord =
						item && typeof item === "object" ? (item as Record<string, unknown>) : null;
					const itemId = typeof itemRecord?.id === "string" ? itemRecord.id : null;
					if (
						itemId &&
						nodes.some((node) => {
							const nodeRecord =
								node && typeof node === "object"
									? (node as unknown as Record<string, unknown>)
									: null;
							return typeof nodeRecord?.id === "string" && nodeRecord.id === itemId;
						})
					) {
						selectedNode = itemId;
						break;
					}
				}
				if (!selectedNode) {
					this.anchor = null;
					return;
				}

				let parentNodeId: string | null = null;
				if (Array.isArray(data?.edges)) {
					const parentEdge = data.edges.find(
						(edge): edge is CanvasEdge =>
							Boolean(edge && typeof edge === "object") && edge.toNode === selectedNode
					);
					if (parentEdge && typeof parentEdge.fromNode === "string") {
						parentNodeId = parentEdge.fromNode;
					}
				}

				this.anchor = {
					nodeId: selectedNode,
					parentNodeId,
				};
				return;
			}
		} catch (e) {
			logger.warn("[EpubCanvasService] Failed to read canvas selection:", e);
		}
	}

	async listCanvasFiles(): Promise<string[]> {
		const files = this.app.vault.getFiles();
		return files
			.filter((f) => f.extension === "canvas")
			.map((f) => f.path)
			.sort();
	}

	private generateNodeId(): string {
		return generateCardUUID().replace(/-/g, "").substring(0, 16);
	}
}
