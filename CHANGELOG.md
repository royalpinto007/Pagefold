# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-09-06

### Added

- Redesigned side panel: blurred sticky header with an article count pill,
  gradient save button with a busy spinner, and icon search with a clear
  button.
- Results line showing how many articles match, an unread pill toggle, and a
  `/` keyboard shortcut that focuses search.
- Reader hero with site and reading-time kicker, a reading progress rail, and
  a drop cap on the first paragraph.
- Per-article progress bars in the list and a storage meter in settings.

## [1.0.0]

Initial release.

### Added

- Save the readable text of any article to a local IndexedDB archive, from the
  keyboard shortcut, the right-click menu, or the side panel.
- Reader view with the article only: no navigation, related rails or footers.
- Search across titles, sites, authors and body text, ranked so a title match
  outranks a body match and every term must appear.
- Unread filter, read/unread toggle, and remembered scroll position.
- Sort by newest, oldest, longest or shortest.
- Export and import a JSON backup, which is the only way the archive leaves the
  device.

### Notes

- No network requests are made by the extension. CI fails the build if any
  appear in the bundles.
- `<all_urls>` is an optional permission, requested only if you use the Save
  button inside the panel. The keyboard shortcut and context menu never ask.
