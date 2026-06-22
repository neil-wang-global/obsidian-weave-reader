import { domInstanceOf } from "../../utils/dom-instance-of";
import {
	readObsidianColorScheme,
	readObsidianCssVar,
	type ReaderColorScheme,
} from "./reader-theme-tokens";

export interface ReaderThemeHostSurfaceInput {
	styleSource: HTMLElement;
	renderContainer: HTMLElement | null;
	foliateView: HTMLElement | null;
	renderer?: HTMLElement | null;
	colorScheme?: ReaderColorScheme;
}

export function applyReaderThemeHostSurfaces(input: ReaderThemeHostSurfaceInput): void {
	const background = readObsidianCssVar(input.styleSource, "--background-primary", "rgb(255, 255, 255)");
	const textColor = readObsidianCssVar(input.styleSource, "--text-normal", "rgb(28, 29, 31)");
	const colorScheme = input.colorScheme ?? readObsidianColorScheme();
	const targets = [input.renderContainer, input.foliateView, input.renderer ?? null].filter(
		Boolean
	) as HTMLElement[];

	for (const target of targets) {
		if (!domInstanceOf(target, HTMLElement) || !target.style) {
			continue;
		}
		target.style.backgroundColor = background;
		target.style.color = textColor;
		target.style.colorScheme = colorScheme;
	}

	for (const iframe of Array.from(input.renderContainer?.querySelectorAll("iframe") || [])) {
		iframe.style.backgroundColor = background;
		iframe.style.colorScheme = colorScheme;
	}
}
