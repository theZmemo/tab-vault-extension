# Changelog

All notable changes to Tab Vault are documented in this file.

## [0.0.14] - 2026-09-29

### Added

- Packaged `about.html` product introduction page that works offline inside the
  installed extension.
- Explicit Settings entry for opening the product introduction.
- Official website button in the packaged introduction page, targeting
  `https://tidr.dev/xxx`.

### Changed

- Removed the external GitHub Pages deployment and its `gh-pages` branch.
- Removed `homepage_url` from the Manifest so the extension introduction is no
  longer coupled to an external or unresolved URL.
- Clarified that Chrome Web Store listing content is prepared separately and
  has not yet been submitted or published.

## [0.0.13] - 2026-09-29

### Fixed

- Deployed the product introduction page to GitHub Pages instead of treating a
  local file preview as a public page.
- Replaced the unresolved `https://tidr.dev/xxx` homepage with the live
  `https://thezmemo.github.io/tab-vault-extension/xxx/` URL in the extension,
  product page metadata, documentation, and Chrome Web Store materials.
- Kept `https://tidr.dev/xxx` documented only as a future custom-domain target.

## [0.0.12] - 2026-09-29

### Changed

- Adopted the selected open-and-collapse page mark: two neutral page surfaces
  with one teal fold indicator on a dark rounded-square field.
- Synchronized the approved mark across extension icons, the side panel,
  product page, product screenshot, and Chrome Web Store artwork.
- Pointed the Chrome Web Store homepage field to the provisional product page
  at `https://tidr.dev/xxx`.

## [0.0.11] - 2026-09-29

### Changed

- Adopted the selected TV monogram: a white `T` and teal `V` sharing one
  centerline on a dark rounded-square field.
- Synchronized the approved mark across extension icons, the side panel,
  product page, product screenshot, and Chrome Web Store artwork.

## [0.0.10] - 2026-09-29

### Changed

- Simplified the extension mark to a browser-tab window and keyhole using a
  monochrome base with one teal accent.
- Rebuilt the product introduction page around one concise message, one real
  product screenshot, three capabilities, privacy, and a single download path.
- Removed decorative color layers, stat-heavy sections, simulated interface
  controls, and scroll-dependent content visibility.

## [0.0.9] - 2026-09-29

### Added

- Self-contained responsive product introduction page for the provisional
  `https://tidr.dev/xxx` address, with light/dark themes and a live interface
  preview.
- Automated desktop and mobile landing-page checks for overflow, first-viewport
  composition, links, and preview interaction.

### Changed

- Redesigned the extension mark as stacked browser tabs with a vault dial,
  improving product identity while retaining 16px legibility.
- Updated the extension homepage and Chrome Web Store artwork to use the new
  brand and current Level 4 deep-sleep behavior.

## [0.0.8] - 2026-09-29

### Fixed

- Deep-sleep reconstruction is now serialized, so overlapping refresh requests
  cannot create multiple placeholder tabs for the same recovery record.
- Refresh now removes inactive placeholder duplicates left by earlier recovery
  races while preserving intentional duplicate tabs with independent recovery
  records.

## [0.0.7] - 2026-09-29

### Fixed

- Automatic deep-sleep recovery now restores Chrome tab groups, including
  group membership, title, color, and collapsed state.
- Legacy recovery prefers the newest snapshot that still contains group
  metadata, avoiding snapshots created after the group had already vanished.

## [0.0.6] - 2026-09-29

### Fixed

- Deep-sleep recovery metadata is now persisted independently from extension
  placeholder tabs, so reloading or upgrading the extension can rebuild tabs
  that Chrome closes during the reload.
- A one-time migration reconstructs deep-sleep records created by v0.0.2 through
  v0.0.5 from their local event journal and restores missing placeholders.
- Normal wake and manual tab-close flows clean up their recovery records to
  avoid reopening intentionally closed pages in later sessions.

## [0.0.5] - 2026-09-29

### Added

- Redesigned Tab Vault logo with a tab-stack and vault-mark silhouette that
  remains legible at 16, 32, 48, and 128 pixels.
- Complete in-product and manifest localization for Traditional Chinese,
  Japanese, Korean, Spanish, French, German, Brazilian Portuguese, and Russian.
- Region-aware locale fallback and automated interpolation-placeholder checks
  across all ten supported UI languages.

### Changed

- The side-panel brand mark and Chrome Web Store assets now use the new logo.
- Locale smoke tests cover Japanese, Korean, and Traditional Chinese layouts.

## [0.0.4] - 2026-09-28

### Changed

- Level 4 now deep-sleeps every browser-operable web or local-file tab,
  including active, pinned, audible, loading, and natively discarded tabs.
- Active tabs remain on the local placeholder until manually restored or
  selected again, preventing immediate self-restoration.
- The Level 4 warning is shown again to existing users and now explicitly
  describes interruption of active pages, audio, and loading work.
- User-protected resources and browser-internal pages remain excluded.

## [0.0.3] - 2026-09-28

### Fixed

- Level 4 deep sleep now accepts tabs that Levels 1-3 already unloaded with
  Chrome's native discard mechanism.
- Deep sleep keeps the same active, pinned, audible, loading, protected, and
  browser-internal page safeguards while upgrading native sleeping tabs.

## [0.0.2] - 2026-09-28

### Added

- Fourth-level deep sleep that replaces eligible background pages with a
  lightweight packaged placeholder after persisting the original resource.
- Redundant recovery data in IndexedDB and the placeholder URL fragment.
- Automatic restoration when a deep-sleeping tab is activated, plus explicit
  wake actions from the side panel and placeholder page.
- A first-use warning that explains unsaved form and in-page runtime state
  cannot be preserved.
- Dedicated deep-sleep state visuals and snapshot handling that always stores
  the original page URL.
- Unit and Chromium smoke coverage for payload validation, placeholder
  replacement, original-URL snapshots, and activation recovery.

## [0.0.1] - 2026-09-28

### Added

- Initial public release of the local-first Tab Vault extension.
- Automatic capture, normalized URL deduplication, local search, permanent
  groups, deterministic grouping rules, and session snapshots.
- Three progressive sleep levels for the current window, all windows, and
  broader manual coverage.
- Clear sleeping-state visuals and a dedicated wake action.
- Safe archiving, individual and batch restoration, and browser tab-group
  restoration.
- Permanent deletion for archived resources, including related group,
  event, and snapshot records.
- Validated JSON backup imports with a 50 MB file limit.
- In-product privacy disclosure, bilingual privacy policy, Chrome Web Store
  submission notes, and compliant promotional assets.
- Automated Chrome Web Store package validation.

### Changed

- Reduced production permissions to `alarms`, `contextMenus`, `sidePanel`,
  `tabGroups`, `tabs`, and `unlimitedStorage`.
- Disabled Incognito operation and added an explicit extension-page CSP.
- Normalized persisted settings and limited local event retention.
- Added confirmation before restoring snapshots containing more than 20 tabs.
- Aligned design and README documentation with the implemented v0.0.1 scope.

### Fixed

- Batch sleep now reports the actual number of discarded tabs.
- Selected-tab sleep uses the same safety checks as batch sleep.
- All-resources rendering is progressive, reducing a 2,000-item view switch
  from about 489 ms to about 30–38 ms in the automated performance fixture.
- Persistence failures no longer remove live tab-instance records.
- Imported resource IDs and deduplication keys are reconciled safely.

[0.0.14]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.14
[0.0.13]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.13
[0.0.12]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.12
[0.0.11]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.11
[0.0.10]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.10
[0.0.9]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.9
[0.0.8]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.8
[0.0.7]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.7
[0.0.6]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.6
[0.0.5]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.5
[0.0.4]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.4
[0.0.3]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.3
[0.0.2]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.2
[0.0.1]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.1
