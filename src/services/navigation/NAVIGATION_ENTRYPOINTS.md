# Navigation entrypoints (migration reference)

| Entry | Current implementation | Target `NavigationIntent.kind` |
|-------|------------------------|--------------------------------|
| `EpubLinkService.navigateToEpubLocation` | `openBookForSourceNavigation` + pendingCfi | `book` |
| `EpubLinkPostProcessor` click | → LinkService | `book` |
| `epub-plugin-support.openEpubReader` | `openEpubInPreferredLeaf` | `book` (`policy.preferredLeaf: true`) |
| `BookshelfView` open | `NavigationHub` (`policy.preferredLeaf: true`) | `book` |
| `EpubReaderApp.navigateToReferenceSource` etc. | `SourceNavigationService` | `markdown` / `canvas` / `card` |
| `EpubReaderApp.requestIRNavigation` | in-session engine | `BookLocateIntent` (not NavigationHub) |
