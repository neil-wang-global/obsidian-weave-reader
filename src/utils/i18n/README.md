# EPUB reader i18n

## Locale model

| Language | Source | Missing keys |
|----------|--------|--------------|
| `zh-CN` | `resources/epub.ts` + `app-shell-epub.ts` | — |
| `en-US` | same (English tree) | — |
| `ja-JP` | `en-US` catalog + `overlays/ja-JP.json` | fall back to **en-US** (via merged catalog + runtime fallback) |
| `ko-KR` | `en-US` catalog + `overlays/ko-KR.json` | fall back to **en-US** |

We **do not** ship full 800+ key machine translations. Low-quality MT is worse than English fallback.

Curated overlays cover user-critical paths (premium, license, bookshelf modals, settings tabs/notifications, errors, reading reference). Other strings stay English until a human adds them under `scripts/curated-overlay-data/manual-*.json` (multiple files are merged by `i18n:build-overlays`).

## Adding or changing UI copy

1. Update `resources/epub.ts` (and `app-shell-epub.ts` if needed) for **zh-CN** and **en-US**.
2. Run `npm run i18n:export-keys` to refresh `flat-locales/en-US.template.json`.
3. Add curated **ja** / **ko** strings in:
   - `scripts/curated-overlay-data/manual-ja.json`
   - `scripts/curated-overlay-data/manual-ko.json`
4. Run `npm run i18n:build-overlays` to regenerate `overlays/ja-JP.json` and `overlays/ko-KR.json`.
5. Run `npm run i18n:validate`.

Optional: legacy draft files under `flat-locales/ja-JP.json` may be consulted by the build script if present, but only entries that pass quality checks are kept.

## Tutorial

Tutorial **tab labels** are localized in `epub-tutorial-content.ts`. Tutorial **body** is authored for `zh-CN` and `en-US` only; `ja-JP` / `ko-KR` reuse English body until dedicated copy is written (not machine-generated).

## Scripts

| Script | Purpose |
|--------|---------|
| `i18n:export-keys` | Export English key template |
| `i18n:export-zh-snapshot` | Export zh-CN flat snapshot (overlay QA) |
| `i18n:build-overlays` | Build curated `overlays/*.json` |
| `i18n:validate` | Policy + tests for overlays |

Do **not** use `i18n:complete-ko` / `i18n:generate-locales` for production catalogs; they produce draft MT only.
