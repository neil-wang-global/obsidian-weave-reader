export type ToolbarMode = "floating" | "docked";

export type FloatingSidePreference = "top" | "bottom" | "auto";
export type FloatingAlign = "center" | "start" | "end";

export interface ToolbarRect {
	top: number;
	left: number;
	bottom: number;
	right: number;
	width: number;
	height: number;
}

export interface ToolbarPoint {
	x: number;
	y: number;
}

export interface ToolbarPositionResult {
	top: number;
	left: number;
	arrowOffset: number;
	isBelowAnchor: boolean;
	mode: ToolbarMode;
	anchorRect: ToolbarRect;
}

export interface ToolbarPositionOptions {
	anchorRect: ToolbarRect;
	anchorRects?: ToolbarRect[];
	anchorPoint?: ToolbarPoint;
	containerWidth: number;
	containerHeight: number;
	toolbarWidth: number;
	toolbarHeight: number;
	mobile: boolean;
	edgeMargin?: number;
	gap?: number;
	arrowPadding?: number;
	preferredSide?: FloatingSidePreference;
	align?: FloatingAlign;
}

export const TOOLBAR_EDGE_MARGIN = 12;
export const TOOLBAR_GAP = 12;
export const TOOLBAR_ARROW_PADDING = 18;

function clamp(value: number, min: number, max: number) {
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

function getRectCenterX(rect: ToolbarRect): number {
	return rect.left + rect.width / 2;
}

function normalizeAnchorRects(anchorRect: ToolbarRect, anchorRects?: ToolbarRect[]): ToolbarRect[] {
	const normalized = (anchorRects || []).filter(
		(rect) =>
			Number.isFinite(rect.left) &&
			Number.isFinite(rect.top) &&
			Number.isFinite(rect.right) &&
			Number.isFinite(rect.bottom) &&
			rect.width > 0 &&
			rect.height > 0
	);
	return normalized.length ? normalized : [anchorRect];
}

function chooseFloatingSide(
	anchorRect: ToolbarRect,
	containerHeight: number,
	toolbarHeight: number,
	gap: number,
	edgeMargin: number,
	preferredSide: FloatingSidePreference
): "top" | "bottom" {
	const availableAbove = anchorRect.top - gap - edgeMargin;
	const availableBelow = containerHeight - anchorRect.bottom - gap - edgeMargin;

	if (preferredSide === "bottom") {
		return availableBelow >= toolbarHeight || availableBelow >= availableAbove ? "bottom" : "top";
	}

	if (preferredSide === "auto") {
		return availableAbove >= toolbarHeight || availableAbove >= availableBelow ? "top" : "bottom";
	}

	return availableAbove >= toolbarHeight || availableAbove >= availableBelow ? "top" : "bottom";
}

function chooseAnchorRectForSide(
	rects: ToolbarRect[],
	side: "top" | "bottom",
	anchorPoint?: ToolbarPoint
): ToolbarRect {
	if (rects.length <= 1) {
		return rects[0];
	}

	const edgeValue = side === "top"
		? Math.min(...rects.map((rect) => rect.top))
		: Math.max(...rects.map((rect) => rect.bottom));
	const edgeRects = rects.filter((rect) =>
		side === "top"
			? Math.abs(rect.top - edgeValue) < 0.5
			: Math.abs(rect.bottom - edgeValue) < 0.5
	);
	if (edgeRects.length <= 1) {
		return edgeRects[0] || rects[0];
	}

	if (anchorPoint && Number.isFinite(anchorPoint.x)) {
		return edgeRects.reduce((best, current) => {
			const bestDistance = Math.abs(getRectCenterX(best) - anchorPoint.x);
			const currentDistance = Math.abs(getRectCenterX(current) - anchorPoint.x);
			return currentDistance < bestDistance ? current : best;
		});
	}

	return edgeRects.reduce((best, current) => {
		return getRectCenterX(current) < getRectCenterX(best) ? current : best;
	});
}

function getAnchorX(rect: ToolbarRect, anchorPoint: ToolbarPoint | undefined, align: FloatingAlign): number {
	if (align === "start") {
		return rect.left;
	}
	if (align === "end") {
		return rect.right;
	}
	if (anchorPoint && Number.isFinite(anchorPoint.x)) {
		return anchorPoint.x;
	}
	return getRectCenterX(rect);
}

export function computeToolbarPosition({
	anchorRect,
	anchorRects,
	anchorPoint,
	containerWidth,
	containerHeight,
	toolbarWidth,
	toolbarHeight,
	mobile,
	edgeMargin = TOOLBAR_EDGE_MARGIN,
	gap = TOOLBAR_GAP,
	arrowPadding = TOOLBAR_ARROW_PADDING,
	preferredSide = "top",
	align = "center",
}: ToolbarPositionOptions): ToolbarPositionResult {
	const normalizedRects = normalizeAnchorRects(anchorRect, anchorRects);
	const side = chooseFloatingSide(anchorRect, containerHeight, toolbarHeight, gap, edgeMargin, preferredSide);
	const activeAnchorRect = chooseAnchorRectForSide(normalizedRects, side, anchorPoint);

	if (mobile) {
		const minLeft = edgeMargin;
		const maxLeft = containerWidth - edgeMargin - toolbarWidth;
		return {
			top: 0,
			left: clamp((containerWidth - toolbarWidth) / 2, minLeft, maxLeft),
			arrowOffset: 0,
			isBelowAnchor: true,
			mode: "docked",
			anchorRect: activeAnchorRect,
		};
	}

	const anchorX = getAnchorX(activeAnchorRect, anchorPoint, align);
	const minLeft = edgeMargin;
	const maxLeft = containerWidth - edgeMargin - toolbarWidth;
	const idealLeft = align === "center"
		? anchorX - toolbarWidth / 2
		: align === "end"
			? anchorX - toolbarWidth
			: anchorX;
	const left = clamp(idealLeft, minLeft, maxLeft);
	const isBelowAnchor = side === "bottom";
	const preferredTop = isBelowAnchor
		? activeAnchorRect.bottom + gap
		: activeAnchorRect.top - toolbarHeight - gap;
	const maxTop = containerHeight - toolbarHeight - edgeMargin;
	const top = clamp(preferredTop, edgeMargin, maxTop);
	const arrowLimit = Math.max(0, toolbarWidth / 2 - arrowPadding);

	return {
		top,
		left,
		arrowOffset: clamp(anchorX - (left + toolbarWidth / 2), -arrowLimit, arrowLimit),
		isBelowAnchor,
		mode: "floating",
		anchorRect: activeAnchorRect,
	};
}

export function createEventBinder() {
	const listeners: Array<() => void> = [];

	return {
		bind(
			target: EventTarget | null | undefined,
			event: string,
			handler: EventListenerOrEventListenerObject,
			options?: AddEventListenerOptions | boolean
		) {
			if (!target?.addEventListener || !target?.removeEventListener) {
				return;
			}
			target.addEventListener(event, handler, options);
			listeners.push(() => target.removeEventListener(event, handler, options));
		},
		dispose() {
			for (const dispose of listeners.splice(0)) {
				dispose();
			}
		},
	};
}

export function isEventOutsideToolbar(toolbarEl: HTMLElement | undefined, event: Event): boolean {
	return Boolean(toolbarEl && !toolbarEl.contains(event.target as Node));
}
