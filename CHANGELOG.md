# Changelog

All notable changes to Tab Vault are documented in this file.

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

[0.0.1]: https://github.com/theZmemo/tab-vault-extension/releases/tag/v0.0.1
