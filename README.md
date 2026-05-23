# Weave EPUB Reader

[中文版 README](./README.zh-CN.md)

<div align="center">

![Weave EPUB Reader](https://img.shields.io/badge/Obsidian-EPUB%20Reader-8a5cf6?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.6.8-green?style=for-the-badge)
![Min Obsidian](https://img.shields.io/badge/Obsidian-1.7.0+-purple?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)

</div>

Weave EPUB Reader is a multi-format ebook reader plugin for Obsidian. It focuses on unifying reading, excerpting, backlinks, source navigation, and review into a single workflow.

It can open multiple book file types directly from your vault and provides a reading-centered toolset including bookshelf management, persisted reading position, chapter navigation, in-text highlights, excerpt backlinks, Canvas binding, screenshots, export actions, and entry points for AI or incremental reading workflows.

Minimum supported Obsidian version: `1.7.0`

## Project Scope

This repository is a **standalone book reader project**, not the documentation hub for the full Weave plugin ecosystem. The source tree is pruned to EPUB reader code paths; legacy Weave study/card/kanban modules are not shipped in `main.js`. Legacy IR resume-point migration reads and writes vault JSON directly (`EpubIrResumePointAccess`) instead of bundling the full incremental-reading service stack. Run `npm run verify:plugin-scope` to ensure tracked sources stay within the reader boundary.

Optional integrations with the main **Weave** plugin (AI split menu, license inheritance, `.wdeck` highlight sync) remain as bridges when Weave is installed.

This plugin is designed for users who want to:

- Read multiple supported book formats directly inside Obsidian
- Write excerpts back into Markdown, Canvas, or Weave card data
- Jump from generated EPUB deep links back to exact positions in the book
- See note-derived highlights rendered back into the reader body
- Keep reading progress, bookmarks, navigation, and visual settings consistent

## Reader Engine and Supported Formats

### Reader engine

- The current reader engine is fixed to `foliate-js`
- The concrete runtime service in this project is `FoliateReaderService`
- `TXT` uses a dedicated plain-text adapter path
- Supported non-EPUB book formats are currently loaded through the Foliate generic loader path

### Currently supported formats

- `epub`
- `mobi`
- `azw3`
- `fb2`
- `fbz` (`fb2.zip`)
- `cbz`
- `txt`

So although the plugin is named EPUB Reader, the current project is **not limited to EPUB only**.

## Recent architecture updates (0.6.x)

- **NavigationHub**: Bookshelf opens, deep links, and Markdown / Canvas / card source tracing now go through a single `NavigationIntent` pipeline. Bookshelf opens use `preferredLeaf`; locate jumps still require the premium source-location capability.
- **ExcerptPipeline**: In-reader highlights and deck excerpts sync through an indexed pipeline to avoid redundant full rescans. `.wdeck` excerpts use `persistenceSourcePath` / `customFields.wdeck.sourcePath`, separate from the EPUB semantic source in `we_source`.
- **BookSessionManager**: Per-book parse/render sessions are released when no leaf still references them.
- **Settings**: New **Open source navigation in a new tab by default** option (`sourceNavigationOpenInNewTab`, on by default).

See [`src/services/navigation/NAVIGATION_ENTRYPOINTS.md`](src/services/navigation/NAVIGATION_ENTRYPOINTS.md) for migration notes.

## Core Features

### 1. Book Reading Experience

- Open multiple supported book formats directly from the Obsidian vault
- Manage imported books from a bookshelf view
- Use paginated mode or continuous scrolling mode
- Navigate with chapter TOC, reading progress, and pagination info
- Customize font, line height, letter spacing, page margin, width mode, and theme

### 2. Excerpts and Highlights

- Create excerpts from selected text
- Insert excerpts into Markdown, copy them, or send them to Canvas
- Render highlights and concealed text directly in the reader body
- Click highlights to locate source notes, copy text, delete highlights, or change color

### 3. Backlinks and Live Rendering

- The reader aggregates excerpts for the current EPUB from:
  - Markdown files
  - Canvas files
  - Weave deck / structured card data files
- When those source files change, the reader refreshes highlight rendering automatically
- Under normal conditions, new excerpts should appear in the reading body in roughly 2 seconds or less

### 4. Deep Links and Source Tracing

- Supports plugin-generated EPUB deep links
- Jump from excerpt notes back to the exact place in the book
- Navigate from in-text highlights back to their source excerpts
- Preserve source link information when exporting or creating chapter reading points

### 5. Workflow Extensions

- Bookmarks and last-open location persistence
- Export the current chapter to Markdown
- Screenshot capture and screenshot save modes
- Canvas binding and excerpt node creation
- Incremental reading entry points
- AI actions for selected text

## Free and Premium

Weave EPUB Reader follows a model of free core functionality with optional paid premium capabilities.

### Free core functionality

- Local reading and bookshelf management
- Chapter navigation, reading progress, bookmarks, and reader appearance settings
- Core excerpting, highlighting, and backlink navigation
- Core local integrations with Markdown, Canvas, and Weave data

### Premium capabilities

- Advanced features that require activation
- More complete advanced reading workflows, enhanced integrations, or ongoing extended capabilities
- Some premium capabilities may depend on license validation or companion online services

### Boundary notes

- Whether a feature requires activation depends on the current plugin version and its actual UI/feature gating
- AI-related features usually also require your own API key for the third-party AI provider you choose
- Even when premium capabilities are enabled, your EPUB, Markdown, Canvas, and vault data remain under your control

## Installation

### Option 1: Manual installation

1. Get the following files from a [GitHub release](https://github.com/zhuzhige123/obsidian-weave-reader/releases) tagged with the version in `manifest.json` (for example `0.6.8`):
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `versions.json` (recommended)
2. Copy them into:

   `.obsidian/plugins/weave-epub-reader/`

3. Restart Obsidian
4. Enable `Weave EPUB Reader` under **Settings → Community plugins**

### Option 2: Community plugins (when listed)

Search for **Weave EPUB Reader** in Obsidian **Settings → Community plugins → Browse**, then install and enable it.

## Basic usage

1. Enable the plugin in **Settings → Community plugins**.
2. Open the bookshelf from the ribbon icon or command palette, then import or open a book from your vault.
3. Select text in the reader to create excerpts, highlights, or bookmarks.
4. Use the reader toolbar for chapter navigation, display settings, and export actions.

## Recommended Workflows

### Markdown excerpt workflow

Best for users who want to integrate reading into their Obsidian note system:

1. Select text in the reader
2. Insert the excerpt into the active Markdown note
3. Refine, reorganize, and expand the notes later
4. Reopen the EPUB and the reader can render those excerpts back as highlights

### Canvas excerpt workflow

Best for visual structuring, research mapping, and concept clustering:

1. Bind a Canvas to the current book
2. Send excerpts from the reader into the Canvas
3. Continue organizing nodes in the Canvas
4. The reader detects those related excerpts and renders them back into the book

### Backlink review workflow

Best for “excerpt first, review later, return to source” reading habits:

1. Revisit historical excerpts in your notes
2. Jump back into the book through EPUB deep links
3. Inspect nearby highlights and source context in the reader
4. Continue review and refinement from the original text

## Data and Sync Notes

### Vault data

The following content typically lives inside your Obsidian vault and is suitable for syncing:

- EPUB files
- Markdown excerpt notes
- Canvas files
- Weave-related card or deck data files

### Plugin directory data

The following content typically lives inside the plugin directory and is more local-state oriented:

- Reader cache
- Index data
- Local state
- Reading progress and UI state
- Debugging or migration cache

Typical plugin directory:

`.obsidian/plugins/weave-epub-reader/`

If you sync across devices, it is generally better to sync vault content rather than plugin cache files directly.

## Privacy and Network Behavior

### Local-first behavior

- Reading, rendering, excerpting, backlinks, and caching are local by default
- The plugin does not proactively upload your vault content to external services

### Possible network use

- Premium activation, license validation, and device entitlement management may contact the plugin's companion license service
- AI-related features may call the AI service you configured
- Any additional external integration depends on your own setup

### Data that may be involved in license validation

When you use activation or license-related features, the plugin may send the following data in order to complete authorization checks:

- Activation code
- Purchase or bound email address
- Device fingerprint summary
- Platform information

Notes:

- The device fingerprint is used for device authorization management, anomaly checks, and activation-slot control
- License validation results may be cached locally for a period of time to reduce repeated requests
- This README summarizes behavior visible in the current public codebase; if the service policy changes later, the updated public documentation should take precedence

### File access scope

The plugin may read and write:

- EPUB, Markdown, Canvas, and related data files inside the current vault
- State, cache, and build output inside the plugin directory

## Good Fit For

- Managing reading and knowledge capture entirely inside Obsidian
- Building a workflow around source text, excerpts, notes, and backlinks
- Combining EPUB reading with Markdown and Canvas-based organization
- Returning to precise source context through deep links

## FAQ

### Why are excerpt highlights not showing in the reader body

Please verify that:

- The excerpt was written using the plugin-generated EPUB link format
- The excerpt exists in Markdown, Canvas, or Weave structured card data files
- The currently open book is the same EPUB referenced by that excerpt

If the source files were updated very recently, the reader will re-aggregate them and try to refresh the in-text highlights shortly afterward.

### What should the plugin folder be called

The plugin ID of this project is:

`weave-epub-reader`

So the manual installation path should be:

`.obsidian/plugins/weave-epub-reader/`

## License

The source code of this project is released under the [GPL-3.0-or-later](LICENSE) license.

### Relationship between open source licensing and the paid model

- The open-source code in this repository is governed by GPL-3.0-or-later
- Free core plus paid premium is a product and service model; it does not remove the rights GPL grants for the published source code
- Paid value mainly corresponds to premium features, license services, online capabilities, ongoing maintenance, or related add-on services
- If a capability depends on online services, activation systems, or account entitlements, its use may also be described by separate service, purchase, or privacy notices

### What to keep in mind

- If you only use the local core functionality, you typically do not need additional online services
- If you use premium licensing, activation validation, or AI features, you should also review the related purchase, activation, and privacy notices

Related public notes:

- [Privacy notice](./PRIVACY.md)
- [Premium terms overview](./PREMIUM_TERMS.md)
- [Support guide](./SUPPORT.md)
- [Security policy](./SECURITY.md)

## Obsidian community review and releases

In your **obsidian-releases** pull request, use **Preview branch scan** to run the automated review against a branch, tag, or commit SHA. You do **not** need to bump the version or create a new GitHub Release for every fix iteration.

Before submitting, run locally:

```bash
npm run verify:public-repo
npm run lint:obsidian
npm run build
npm run verify:release
```

Each GitHub Release **title** must match its tag exactly (for example `0.6.8`). An empty title makes ObsidianReviewBot report `` as the release name. Edit the release on GitHub (**Releases → Edit → Title**) or run `gh release edit 0.6.8 --title 0.6.8` before the directory review.

The repository ships the standard [GPL-3.0](./LICENSE) text (see [COPYRIGHT](./COPYRIGHT) for the notice) so GitHub and the review bot can recognize the license. See [PLUGIN_AUDIT.md](./PLUGIN_AUDIT.md) for review-bot capability notes.

## Author and Feedback

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
- Privacy: [PRIVACY.md](./PRIVACY.md)
- Premium: [PREMIUM_TERMS.md](./PREMIUM_TERMS.md)
- Support: [SUPPORT.md](./SUPPORT.md)
- Security: [SECURITY.md](./SECURITY.md)
