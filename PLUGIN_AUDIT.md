# Obsidian community plugin audit notes

This document explains capabilities flagged by ObsidianReviewBot for **Weave EPUB Reader**. They are expected for an EPUB bookshelf/reader plugin and are limited to user-initiated workflows.

## Vault access

| Capability | Why it is needed |
| --- | --- |
| Enumerate vault files (`getFiles`, `getMarkdownFiles`) | Build the bookshelf, scan supported book paths, resolve links, and sync reading metadata. |
| Read vault files (`read`, `cachedRead`) | Open EPUB/other supported books stored in the vault and load plugin data files. |
| Write vault files (`create`, `modify`) | Save reading progress, bookmarks, exported notes, and bookshelf metadata under the plugin data folder. |

The plugin does not upload vault contents to third parties except when you explicitly configure optional online services (for example license validation or AI providers).

## Clipboard

Clipboard APIs may be used when you choose actions such as copying excerpts or exported text. Nothing is read from the clipboard unless you trigger a copy-oriented command.

## Dynamic code

Release builds do not use `eval()` or `new Function()`. Scheduling polyfills use `queueMicrotask` / `Promise` instead of injecting `<script>` elements.

## License

- SPDX: `GPL-3.0-or-later`
- Full license text: [LICENSE](./LICENSE)
- Copyright notice: [COPYRIGHT](./COPYRIGHT)

## GitHub release title

ObsidianReviewBot compares the GitHub Release **title** with `manifest.json` `version`. If the title is blank, the bot reports an empty name and warns that it does not include the version (for example `0.6.3`).

Fix an existing release without rebuilding:

```bash
gh release edit 0.6.3 --title 0.6.3
```

Or on GitHub: **Releases → select the tag → Edit → Title** = the tag (for example `0.6.3`).

New releases created by `.github/workflows/release.yml` set `name` to the tag and run a post-step `gh release edit` check.
