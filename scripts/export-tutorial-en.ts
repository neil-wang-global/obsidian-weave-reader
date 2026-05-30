import { mkdirSync, writeFileSync } from "node:fs";
import { EPUB_TUTORIAL_CONTENT_BY_LANG } from "../src/components/epub/epub-tutorial-content.ts";

const dir = "src/components/epub/tutorial-locales";
mkdirSync(dir, { recursive: true });
writeFileSync(
	`${dir}/en-US.json`,
	`${JSON.stringify(EPUB_TUTORIAL_CONTENT_BY_LANG["en-US"], null, 2)}\n`,
	"utf8"
);
console.log("Exported en-US tutorial to", dir);
