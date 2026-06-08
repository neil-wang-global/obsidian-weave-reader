import { describe, expect, it } from 'vitest';
import {
	avoidNodeOverlap,
	calculateLockedHubNodePosition,
	normalizeCanvasExcerptAnchorRecord,
	normalizeCanvasExcerptAnchorsMap,
	readCanvasExcerptAnchorStateFromCache,
	resolveCanvasExcerptAnchorNodeId,
} from '../canvas-excerpt-anchor';
import type { CanvasNode } from '../canvas-types';

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

describe('canvas-excerpt-anchor', () => {
	it('prefers locked anchor over selection and chain', () => {
		const resolution = resolveCanvasExcerptAnchorNodeId(
			{ lockedNodeId: 'lock', lastCreatedNodeId: 'last' },
			['selected'],
			new Set(['lock', 'selected', 'last'])
		);
		expect(resolution).toEqual({ nodeId: 'lock', mode: 'locked' });
	});

	it('uses a single selected node when selection changed since last insert', () => {
		const resolution = resolveCanvasExcerptAnchorNodeId(
			{ lockedNodeId: null, lastCreatedNodeId: 'last' },
			['selected'],
			new Set(['selected', 'last']),
			''
		);
		expect(resolution).toEqual({ nodeId: 'selected', mode: 'selection' });
	});

	it('continues chain when selection unchanged since last insert', () => {
		const resolution = resolveCanvasExcerptAnchorNodeId(
			{ lockedNodeId: null, lastCreatedNodeId: 'last' },
			['selected'],
			new Set(['selected', 'last']),
			'selected'
		);
		expect(resolution).toEqual({ nodeId: 'last', mode: 'chain' });
	});

	it('spreads locked hub children without overlapping the first sibling slot', () => {
		const hub = createNode('hub', 100, 200);
		const firstChild = createNode('child-a', 100, 360);
		const position = calculateLockedHubNodePosition(hub, [firstChild], 'down');
		expect(position).toEqual({ x: 450, y: 360 });
	});

	it('nudges candidate positions away from occupied nodes', () => {
		const occupied = createNode('occupied', 100, 360);
		const position = avoidNodeOverlap(
			{ x: 100, y: 360 },
			{ width: 300, height: 120 },
			[occupied],
			'down'
		);
		expect(position.x).toBeGreaterThan(occupied.x);
	});

	it('ignores canvas group nodes when avoiding overlap', () => {
		const group: CanvasNode = {
			id: 'group-1',
			type: 'group',
			x: 0,
			y: 0,
			width: 800,
			height: 600,
		};
		const position = avoidNodeOverlap(
			{ x: 100, y: 360 },
			{ width: 300, height: 120 },
			[group],
			'down'
		);
		expect(position).toEqual({ x: 100, y: 360 });
	});

	it('normalizes persisted anchor map keys and values', () => {
		expect(
			normalizeCanvasExcerptAnchorsMap({
				'Canvas/demo.canvas': { lockedNodeId: 'a', lastCreatedNodeId: 'b', layoutDirection: 'right' },
				'': { lockedNodeId: 'x' },
			})
		).toEqual({
			'Canvas/demo.canvas': { lockedNodeId: 'a', lastCreatedNodeId: 'b', layoutDirection: 'right' },
		});
	});

	it('returns default anchor state when cache is empty', () => {
		expect(readCanvasExcerptAnchorStateFromCache({} as any, 'Demo.canvas')).toEqual({
			lockedNodeId: null,
			lastCreatedNodeId: null,
			layoutDirection: 'down',
		});
	});

	it('normalizes empty anchor records', () => {
		expect(normalizeCanvasExcerptAnchorRecord({})).toEqual({
			lockedNodeId: null,
			lastCreatedNodeId: null,
			layoutDirection: 'down',
		});
	});
});
