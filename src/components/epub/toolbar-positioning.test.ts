import { computeToolbarPosition, createEventBinder, isEventOutsideToolbar } from './toolbar-positioning';

describe('toolbar-positioning', () => {
	it('returns docked placement for mobile toolbars', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 20, left: 40, bottom: 36, right: 96, width: 56, height: 16 },
			containerWidth: 320,
			containerHeight: 480,
			toolbarWidth: 280,
			toolbarHeight: 72,
			mobile: true,
		});

		expect(result).toEqual({
			top: 0,
			left: 20,
			arrowOffset: 0,
			isBelowAnchor: true,
			mode: 'docked',
			anchorRect: { top: 20, left: 40, bottom: 36, right: 96, width: 56, height: 16 },
		});
	});

	it('places floating toolbars above the anchor when space is available', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 120, left: 100, bottom: 144, right: 164, width: 64, height: 24 },
			containerWidth: 360,
			containerHeight: 280,
			toolbarWidth: 140,
			toolbarHeight: 60,
			mobile: false,
		});

		expect(result.mode).toBe('floating');
		expect(result.isBelowAnchor).toBe(false);
		expect(result.top).toBe(48);
		expect(result.left).toBe(62);
		expect(result.arrowOffset).toBe(0);
	});

	it('flips below and clamps arrow offset near viewport edges', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 18, left: 8, bottom: 34, right: 40, width: 32, height: 16 },
			containerWidth: 240,
			containerHeight: 180,
			toolbarWidth: 120,
			toolbarHeight: 56,
			mobile: false,
		});

		expect(result.isBelowAnchor).toBe(true);
		expect(result.left).toBe(12);
		expect(result.top).toBe(46);
		expect(result.arrowOffset).toBe(-42);
	});

	it('chooses the top-most line rect for multi-line selections when floating above', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 80, left: 24, bottom: 152, right: 212, width: 188, height: 72 },
			anchorRects: [
				{ top: 80, left: 120, bottom: 104, right: 212, width: 92, height: 24 },
				{ top: 128, left: 24, bottom: 152, right: 116, width: 92, height: 24 },
			],
			containerWidth: 320,
			containerHeight: 260,
			toolbarWidth: 120,
			toolbarHeight: 56,
			mobile: false,
		});

		expect(result.isBelowAnchor).toBe(false);
		expect(result.anchorRect).toEqual({ top: 80, left: 120, bottom: 104, right: 212, width: 92, height: 24 });
		expect(result.top).toBe(12);
		expect(result.left).toBe(106);
	});

	it('chooses the bottom-most line rect and anchor point when preferred below', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 48, left: 32, bottom: 136, right: 196, width: 164, height: 88 },
			anchorRects: [
				{ top: 48, left: 32, bottom: 72, right: 164, width: 132, height: 24 },
				{ top: 112, left: 84, bottom: 136, right: 196, width: 112, height: 24 },
			],
			anchorPoint: { x: 180, y: 124 },
			containerWidth: 320,
			containerHeight: 260,
			toolbarWidth: 140,
			toolbarHeight: 72,
			mobile: false,
			preferredSide: 'bottom',
		});

		expect(result.isBelowAnchor).toBe(true);
		expect(result.anchorRect).toEqual({ top: 112, left: 84, bottom: 136, right: 196, width: 112, height: 24 });
		expect(result.left).toBe(110);
		expect(result.top).toBe(148);
		expect(result.arrowOffset).toBe(0);
	});

	it('disposes bound listeners together', () => {
		const binder = createEventBinder();
		const target = document.createElement('div');
		const handler = vi.fn();

		binder.bind(target, 'click', handler);
		target.dispatchEvent(new Event('click'));
		expect(handler).toHaveBeenCalledTimes(1);

		binder.dispose();
		target.dispatchEvent(new Event('click'));
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('detects outside toolbar events', () => {
		const toolbar = document.createElement('div');
		const child = document.createElement('button');
		toolbar.appendChild(child);
		document.body.appendChild(toolbar);
		const outside = document.createElement('div');
		document.body.appendChild(outside);

		const insideEvent = new MouseEvent('mousedown', { bubbles: true });
		Object.defineProperty(insideEvent, 'target', { value: child });
		expect(isEventOutsideToolbar(toolbar, insideEvent)).toBe(false);

		const outsideEvent = new MouseEvent('mousedown', { bubbles: true });
		Object.defineProperty(outsideEvent, 'target', { value: outside });
		expect(isEventOutsideToolbar(toolbar, outsideEvent)).toBe(true);

		expect(isEventOutsideToolbar(undefined, outsideEvent)).toBe(false);
	});
});
