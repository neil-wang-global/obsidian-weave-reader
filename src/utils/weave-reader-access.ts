import type { App } from "obsidian";

export const WEAVE_MAIN_PLUGIN_ID = "weave";

export type WeaveSelectedTextAISplitHost = {
	openSelectedTextAIPanelFromEpub?: (options: {
		filePath: string;
		selectedText: string;
		actionId: string;
		sourceLink?: string;
	}) => Promise<void>;
	closeSelectedTextAIPanelFromEpub?: (filePath: string) => Promise<void>;
	openSelectedTextAISplitMenu?: (options: {
		event: MouseEvent | KeyboardEvent;
		selectedText: string;
		onSelectAction: (actionId: string) => void;
	}) => void;
};

export function getWeaveMainPlugin(app: App): WeaveSelectedTextAISplitHost | null {
	const plugin = app.plugins?.getPlugin?.(WEAVE_MAIN_PLUGIN_ID);
	if (!plugin || typeof plugin !== "object") {
		return null;
	}
	return plugin as WeaveSelectedTextAISplitHost;
}

export function isWeaveMainPluginEnabled(app: App): boolean {
	return Boolean(getWeaveMainPlugin(app));
}

export function requireWeaveMainPlugin(app: App): WeaveSelectedTextAISplitHost | null {
	return getWeaveMainPlugin(app);
}
