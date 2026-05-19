import { beforeEach, describe, expect, it, vi } from "vitest";
import { Vault } from "obsidian";
import { FoliateReaderService } from "../FoliateReaderService";

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");

	class MockTFile {
		path: string;
		basename: string;
		extension: string;

		constructor(path: string) {
			this.path = path;
			const parts = path.split("/");
			const name = parts[parts.length - 1] || path;
			const dotIndex = name.lastIndexOf(".");
			this.basename = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
			this.extension = dotIndex >= 0 ? name.slice(dotIndex + 1) : "";
		}
	}

	class MockVault {
		adapter = {
			readBinary: vi.fn(async () => new ArrayBuffer(0)),
		};
		getAbstractFileByPath(path: string) {
			return new MockTFile(path);
		}
	}

	return {
		...actual,
		TFile: MockTFile,
		Vault: MockVault,
		Platform: { isDesktopApp: true },
	};
});

function createMockApp(buffer: ArrayBuffer) {
	return {
		vault: {
			adapter: {
				readBinary: vi.fn(async () => buffer),
			},
			getAbstractFileByPath: vi.fn((path: string) => ({
				path,
				basename: path.split("/").pop()?.replace(/\.[^.]+$/, "") || path,
				extension: path.split(".").pop() || "",
			})),
		} as unknown as Vault,
	} as any;
}

describe("FoliateReaderService comment marker layering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps a single foliate annotation for commented highlights so the shared overlayer key does not overwrite prior layers", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const highlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				style: "underline" as const,
				text: "Selection text for testing",
				hasCommentDivider: true,
				presentation: "highlight" as const,
			};

			const rendered = (service as any).createRenderedAnnotation(highlight);

			expect(rendered.annotation).toMatchObject({
				style: "underline",
				hasCommentDivider: true,
			});
			expect(rendered.renderSignature).toContain("style:underline");
			expect(rendered.renderSignature).toContain("comment:visible");
		} finally {
			service.destroy();
		}
	});

	it("draws the base style and comment marker together inside one composite overlay", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const annotation = (service as any).createAnnotation(
				{
					cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
					color: "purple",
					style: "wavy",
					text: "Selection text for testing",
					hasCommentDivider: true,
					presentation: "highlight",
				},
				{
					focusColor: "blue",
				}
			);
			const markerSpy = vi.spyOn(service as any, "createCommentMarkerOverlay");
			const styleSpy = vi.spyOn(service as any, "createStyledAnnotationOverlay");
			const focusSpy = vi.spyOn(service as any, "createTemporaryFocusOverlay");
			const compositeSpy = vi.spyOn(service as any, "createCompositeAnnotationOverlay");
			const draw = vi.fn((factory: (rects: unknown[], options?: unknown) => SVGElement) => {
				factory([
					{
						left: 10,
						top: 10,
						width: 24,
						height: 12,
					},
				]);
			});

			await (service as any).drawAnnotation(annotation, draw);

			expect(draw).toHaveBeenCalledTimes(1);
			expect(compositeSpy).toHaveBeenCalledTimes(1);
			expect(markerSpy).toHaveBeenCalledTimes(1);
			expect(styleSpy).toHaveBeenCalledTimes(1);
			expect(focusSpy).toHaveBeenCalledTimes(1);
		} finally {
			service.destroy();
		}
	});

	it("draws a reference badge inside the composite overlay when a styled highlight has multiple references", async () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const annotation = (service as any).createAnnotation({
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				style: "underline",
				text: "Selection text for testing",
				referenceCount: 5,
				referenceHeat: 60,
				presentation: "highlight",
			});
			const badgeSpy = vi.spyOn(service as any, "createReferenceBadgeOverlay");
			const styleSpy = vi.spyOn(service as any, "createStyledAnnotationOverlay");
			const compositeSpy = vi.spyOn(service as any, "createCompositeAnnotationOverlay");
			const draw = vi.fn((factory: (rects: unknown[], options?: unknown) => SVGElement) => {
				factory([
					{
						left: 10,
						top: 10,
						width: 24,
						height: 12,
					},
				]);
			});

			await (service as any).drawAnnotation(annotation, draw);

			expect(draw).toHaveBeenCalledTimes(1);
			expect(compositeSpy).toHaveBeenCalledTimes(1);
			expect(styleSpy).toHaveBeenCalledTimes(1);
			expect(badgeSpy).toHaveBeenCalledTimes(1);
		} finally {
			service.destroy();
		}
	});

	it("keeps the reference badge geometry inside the highlight bounds so it is not clipped", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const annotation = (service as any).createAnnotation({
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				referenceCount: 5,
				referenceHeat: 60,
				presentation: "highlight",
			});

			const overlay = (service as any).createReferenceBadgeOverlay(annotation, [
				{
					left: 10,
					top: 10,
					width: 24,
					height: 12,
				},
			]) as SVGGElement;

			const background = overlay.querySelector('[data-weave-reference-badge="background"]');
			const hitArea = overlay.querySelector('[data-weave-reference-badge="hit-area"]');
			expect(background).toBeTruthy();
			expect(hitArea).toBeTruthy();

			const x = Number(background?.getAttribute("x"));
			const y = Number(background?.getAttribute("y"));
			const width = Number(background?.getAttribute("width"));
			const height = Number(background?.getAttribute("height"));

			expect(x).toBeGreaterThanOrEqual(10);
			expect(y).toBeGreaterThanOrEqual(10);
			expect(x + width).toBeLessThanOrEqual(34);
			expect(y + height).toBeLessThanOrEqual(22);
		} finally {
			service.destroy();
		}
	});

	it("treats reference count changes as an annotation render change", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const base = (service as any).createAnnotation({
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				referenceCount: 1,
				presentation: "highlight",
			});
			const updated = (service as any).createAnnotation({
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				referenceCount: 3,
				presentation: "highlight",
			});

			expect((service as any).isSameAnnotation(base, updated)).toBe(false);
			expect((service as any).getAnnotationRenderSignature(base)).not.toBe(
				(service as any).getAnnotationRenderSignature(updated)
			);
		} finally {
			service.destroy();
		}
	});

	it("routes reference badge clicks through the highlight click callback chain when highlight geometry is available", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			const notifySpy = vi.spyOn(service as any, "notifyHighlightClick");
			(service as any).foliateView = {
				addEventListener: vi.fn(),
				close: vi.fn(),
				dispatchEvent: vi.fn(),
				remove: vi.fn(),
				removeEventListener: vi.fn(),
			};
			const fallbackDispatchSpy = vi.spyOn((service as any).foliateView, "dispatchEvent");
			const info = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				sourceFile: "",
				interactionTarget: "reference-badge",
				rect: {
					top: 10,
					left: 10,
					bottom: 22,
					right: 34,
					width: 24,
					height: 12,
				},
			};
			vi.spyOn(service, "getHighlightClickInfo").mockReturnValue(info as any);

			(service as any).notifyReferenceBadgeClick(info.cfiRange);

			expect(notifySpy).toHaveBeenCalledWith(info);
			expect(fallbackDispatchSpy).toHaveBeenCalledTimes(1);
		} finally {
			service.destroy();
		}
	});

	it("notifies dedicated reference badge listeners from click-time badge geometry even when runtime lookup is unavailable", () => {
		const service = new FoliateReaderService(createMockApp(new ArrayBuffer(0)) as any);
		try {
			(service as any).foliateView = {
				addEventListener: vi.fn(),
				close: vi.fn(),
				dispatchEvent: vi.fn(),
				remove: vi.fn(),
				removeEventListener: vi.fn(),
			};
			const callback = vi.fn();
			service.onReferenceBadgeClick(callback);
			const highlight = {
				cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
				color: "yellow",
				text: "Selection text for testing",
				sourceFile: "",
				presentation: "highlight",
			};
			(service as any).highlightDataMap.set("epubcfi(/6/2!/4/2,/1:0,/1:9)", highlight);
			vi.spyOn(service, "getHighlightClickInfo").mockReturnValue(null);

			(service as any).notifyReferenceBadgeClick("epubcfi(/6/2!/4/2,/1:0,/1:9)", {
				rect: {
					top: 11,
					left: 22,
					bottom: 19,
					right: 32,
					width: 10,
					height: 8,
				},
				rects: [
					{
						top: 10,
						left: 10,
						bottom: 22,
						right: 34,
						width: 24,
						height: 12,
					},
				],
				anchorPoint: {
					x: 27,
					y: 15,
				},
			});

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:9)",
					interactionTarget: "reference-badge",
					rect: expect.objectContaining({
						left: 22,
						top: 11,
					}),
					anchorPoint: expect.objectContaining({
						x: 27,
						y: 15,
					}),
				})
			);
			expect((service as any).foliateView.dispatchEvent).toHaveBeenCalledTimes(1);
		} finally {
			service.destroy();
		}
	});
});
