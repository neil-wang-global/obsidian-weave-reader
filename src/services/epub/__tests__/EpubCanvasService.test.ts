vi.mock('obsidian', () => ({
	App: class MockApp {},
	TFile: class MockTFile {
		path: string;
		constructor(path = '') {
			this.path = path;
		}
	},
	TFolder: class MockTFolder {
		path: string;
		constructor(path = '') {
			this.path = path;
		}
	},
	ItemView: class MockItemView {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	MarkdownView: class MockMarkdownView {},
	Notice: vi.fn(),
	Menu: class MockMenu {},
	Modal: class MockModal {},
	Plugin: class MockPlugin {},
	PluginSettingTab: class MockPluginSettingTab {},
	Platform: { isMobile: false },
	setIcon: vi.fn(),
	normalizePath: (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
}));

import { TFile, TFolder } from 'obsidian';
import { EpubCanvasService } from '../EpubCanvasService';
import type { CanvasData, CanvasEdge, CanvasNode } from '../canvas-types';

function createNode(id: string, x = 0, y = 0): CanvasNode {
	return {
		id,
		type: 'text',
		text: id,
		x,
		y,
		width: 300,
		height: 120,
	};
}

function createMockApp(initialFiles: Record<string, string>, canvasLeaves: any[] = []) {
	const files = new Map<string, string>(Object.entries(initialFiles));
	const folderSet = new Set<string>();
	for (const filePath of files.keys()) {
		const segments = filePath.split('/').filter(Boolean);
		let current = '';
		for (const segment of segments.slice(0, -1)) {
			current = current ? `${current}/${segment}` : segment;
			folderSet.add(current);
		}
	}

	const app: any = {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => {
				if (files.has(path)) {
					return new (TFile as any)(path);
				}
				if (folderSet.has(path)) {
					return new (TFolder as any)(path);
				}
				return null;
			}),
			read: vi.fn(async (file: { path: string }) => {
				const value = files.get(file.path);
				if (value === undefined) {
					throw new Error(`Missing file: ${file.path}`);
				}
				return value;
			}),
			modify: vi.fn(async (file: { path: string }, content: string) => {
				files.set(file.path, content);
			}),
			create: vi.fn(async (path: string, content: string) => {
				files.set(path, content);
				const segments = path.split('/').filter(Boolean);
				let current = '';
				for (const segment of segments.slice(0, -1)) {
					current = current ? `${current}/${segment}` : segment;
					folderSet.add(current);
				}
				return { path };
			}),
			createFolder: vi.fn(async (path: string) => {
				folderSet.add(path);
				return { path };
			}),
		},
		workspace: {
			getLeavesOfType: vi.fn((type: string) => (type === 'canvas' ? canvasLeaves : [])),
		},
	};

	return { app, files };
}

function readCanvas(files: Map<string, string>, path: string): CanvasData {
	return JSON.parse(files.get(path) || '{"nodes":[],"edges":[]}') as CanvasData;
}

describe('EpubCanvasService', () => {
	it('does not create orphan edges when the stored anchor node no longer exists', async () => {
		const canvasPath = 'Mind.canvas';
		const { app, files } = createMockApp({
			[canvasPath]: JSON.stringify({
				nodes: [createNode('root')],
				edges: [],
			} satisfies CanvasData),
		});
		const service = new EpubCanvasService(app);
		service.setCanvasPath(canvasPath);
		service.setAnchor({ nodeId: 'missing-node', parentNodeId: 'root' });

		const created = await service.addRawTextNode('Fresh note');

		expect(created).not.toBeNull();

		const saved = readCanvas(files, canvasPath);
		expect(saved.nodes).toHaveLength(2);
		expect(saved.edges).toHaveLength(0);
	});

	it('ignores canvas edge selections so new EPUB notes do not attach to non-node ids', async () => {
		const canvasPath = 'Mind.canvas';
		const edge: CanvasEdge = {
			id: 'edge-1',
			fromNode: 'root',
			toNode: 'child',
			fromSide: 'bottom',
			toSide: 'top',
		};
		const canvasData: CanvasData = {
			nodes: [createNode('root'), createNode('child', 0, 160)],
			edges: [edge],
		};
		const canvasLeaves = [
			{
				view: {
					file: { path: canvasPath },
					canvas: {
						selection: new Set([{ id: 'edge-1' }]),
						getData: () => canvasData,
					},
				},
			},
		];
		const { app, files } = createMockApp({
			[canvasPath]: JSON.stringify(canvasData),
		}, canvasLeaves);
		const service = new EpubCanvasService(app);
		service.setCanvasPath(canvasPath);

		service.updateAnchorFromCanvasSelection(app);
		expect(service.getAnchor()).toBeNull();

		await service.addRawTextNode('Detached note');

		const saved = readCanvas(files, canvasPath);
		expect(saved.nodes).toHaveLength(3);
		expect(saved.edges).toHaveLength(1);
		expect(saved.edges[0]).toEqual(edge);
	});

	it('persists highlight style metadata when adding styled EPUB excerpt nodes to canvas', async () => {
		const canvasPath = 'Styled.canvas';
		const { app, files } = createMockApp({
			[canvasPath]: JSON.stringify({
				nodes: [],
				edges: [],
			} satisfies CanvasData),
		});
		const service = new EpubCanvasService(app);
		service.setCanvasPath(canvasPath);

		const created = await service.addExcerptNode(
			'Styled excerpt',
			'readium:styled',
			'Books/demo.epub',
			2,
			'第二章',
			'green',
			undefined,
			'epubsrc-demo',
			'underline'
		);

		expect(created).not.toBeNull();

		const saved = readCanvas(files, canvasPath);
		expect(saved.nodes).toHaveLength(1);
		expect(saved.nodes[0]?.text).toContain('> [!EPUB|green+underline]');
		expect(saved.nodes[0]?.text).toContain(
			'[[Books/demo.epub#weave-cfi=readium:styled'
		);
		expect(saved.nodes[0]?.text).toContain('&sid=epubsrc-demo|demo]]');
	});
});
