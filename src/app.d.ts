// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

// Svelte component type declarations
declare module "*.svelte" {
	const component: any;
	export default component;
}

declare module "*.css" {
	const css: string;
	export default css;
}

declare module "*.png" {
	const assetUrl: string;
	export default assetUrl;
}

export {};
