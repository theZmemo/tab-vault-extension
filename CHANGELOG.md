# Changelog

All notable changes to Tab Vault are documented in this file.

## [0.7.0] - 2026-09-28

### Added

- Three progressive sleep levels for the current window, all windows, and
  broader manual coverage.
- Clear sleeping-state visuals and a dedicated wake action.
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
- Aligned design and README documentation with the implemented v0.7 scope.

### Fixed

- Batch sleep now reports the actual number of discarded tabs.
- Selected-tab sleep uses the same safety checks as batch sleep.
- Persistence failures no longer remove live tab-instance records.
- Imported resource IDs and deduplication keys are reconciled safely.

## [0.6.0] - 2026-09-28

### Added

- One-click sleeping for eligible tabs in the current window or all windows.

## [0.5.0] - 2026-09-20

### Added

- Initial public release with local capture, search, grouping, deduplication,
  archiving, snapshots, and JSON backup.

[0.7.0]: https://github.com/theZmemo/tab-vault-extension/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/theZmemo/tab-vault-extension/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.5.0
