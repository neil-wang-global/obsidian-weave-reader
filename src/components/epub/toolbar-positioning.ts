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
	insetTop?: number;
	insetBottom?: number;
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
	insetTop: number,
	insetBottom: number,
	preferredSide: FloatingSidePreference
): "top" | "bottom" {
	const availableAbove = anchorRect.top - gap - edgeMargin - insetTop;
	const availableBelow = containerHeight - insetBottom - anchorRect.bottom - gap - edgeMargin;

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

function toolbarOverlapsAnchor(
	top: number,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	gap: number
): boolean {
	const toolbarBottom = top + toolbarHeight;
	return toolbarBottom > anchorRect.top - gap && top < anchorRect.bottom + gap;
}

function floatingClearsAnchor(
	top: number,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	gap: number,
	isBelowAnchor: boolean
): boolean {
	if (isBelowAnchor) {
		return top >= anchorRect.bottom + gap - 0.5;
	}
	return top + toolbarHeight <= anchorRect.top - gap + 0.5;
}

function createDockedPosition(left: number, activeAnchorRect: ToolbarRect): ToolbarPositionResult {
	return {
		top: 0,
		left,
		arrowOffset: 0,
		isBelowAnchor: true,
		mode: "docked",
		anchorRect: activeAnchorRect,
	};
}

interface FloatingPlacementInput {
	activeAnchorRect: ToolbarRect;
	anchorX: number;
	left: number;
	side: "top" | "bottom";
	containerHeight: number;
	toolbarWidth: number;
	toolbarHeight: number;
	insetTop: number;
	insetBottom: number;
	edgeMargin: number;
	gap: number;
	arrowPadding: number;
}

function computeFloatingPlacement({
	activeAnchorRect,
	anchorX,
	left,
	side,
	containerHeight,
	toolbarWidth,
	toolbarHeight,
	insetTop,
	insetBottom,
	edgeMargin,
	gap,
	arrowPadding,
}: FloatingPlacementInput): ToolbarPositionResult {
	const isBelowAnchor = side === "bottom";
	const preferredTop = isBelowAnchor
		? activeAnchorRect.bottom + gap
		: activeAnchorRect.top - toolbarHeight - gap;
	const minTop = edgeMargin + insetTop;
	const maxTop = containerHeight - insetBottom - toolbarHeight - edgeMargin;
	const top = clamp(preferredTop, minTop, maxTop);
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

function shouldUseMobileDockedFallback(
	floating: ToolbarPositionResult,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	gap: number
): boolean {
	if (
		!floatingClearsAnchor(
			floating.top,
			toolbarHeight,
			anchorRect,
			gap,
			floating.isBelowAnchor
		)
	) {
		return true;
	}

	return toolbarOverlapsAnchor(floating.top, toolbarHeight, anchorRect, gap);
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
	insetTop = 0,
	insetBottom = 0,
	edgeMargin = TOOLBAR_EDGE_MARGIN,
	gap = TOOLBAR_GAP,
	arrowPadding = TOOLBAR_ARROW_PADDING,
	preferredSide = "top",
	align = "center",
}: ToolbarPositionOptions): ToolbarPositionResult {
	const normalizedRects = normalizeAnchorRects(anchorRect, anchorRects);
	const sideSelectionBounds =
		normalizedRects.length > 1
			? {
				top: Math.min(...normalizedRects.map((rect) => rect.top)),
				left: Math.min(...normalizedRects.map((rect) => rect.left)),
				bottom: Math.max(...normalizedRects.map((rect) => rect.bottom)),
				right: Math.max(...normalizedRects.map((rect) => rect.right)),
				width: 0,
				height: 0,
			}
			: anchorRect;
	if (normalizedRects.length > 1) {
		sideSelectionBounds.width = sideSelectionBounds.right - sideSelectionBounds.left;
		sideSelectionBounds.height = sideSelectionBounds.bottom - sideSelectionBounds.top;
	}
	const resolvedPreferredSide: FloatingSidePreference = mobile ? "auto" : preferredSide;
	const side = chooseFloatingSide(
		sideSelectionBounds,
		containerHeight,
		toolbarHeight,
		gap,
		edgeMargin,
		insetTop,
		insetBottom,
		resolvedPreferredSide
	);
	const activeAnchorRect = chooseAnchorRectForSide(normalizedRects, side, anchorPoint);
	const anchorX = getAnchorX(activeAnchorRect, anchorPoint, align);
	const minLeft = edgeMargin;
	const maxLeft = containerWidth - edgeMargin - toolbarWidth;
	const idealLeft = align === "center"
		? anchorX - toolbarWidth / 2
		: align === "end"
			? anchorX - toolbarWidth
			: anchorX;
	const left = clamp(idealLeft, minLeft, maxLeft);

	const floating = computeFloatingPlacement({
		activeAnchorRect,
		anchorX,
		left,
		side,
		containerHeight,
		toolbarWidth,
		toolbarHeight,
		insetTop,
		insetBottom,
		edgeMargin,
		gap,
		arrowPadding,
	});

	if (!mobile) {
		return floating;
	}

	if (shouldUseMobileDockedFallback(floating, toolbarHeight, activeAnchorRect, gap)) {
		return createDockedPosition(left, activeAnchorRect);
	}

	return floating;
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
