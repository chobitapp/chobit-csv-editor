# Changelog

All notable changes to this project are documented in this file. Each version's section becomes the release notes of its [GitHub Release](https://github.com/chobitapp/chobit-csv-editor/releases).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-27

### Fixed

- Row numbers of 10,000 and above were cut off in the row number column. By default the column now fits the largest row number in the current font (at least 48px) and widens as rows are added. Pass `rowHeaderWidth` to keep a fixed width.

## [0.2.0] - 2026-11-27

### Added

- Right-click context menu on cells, row numbers, and column headers to insert and delete rows and columns. Customize it with the `contextMenu` prop, or replace it through `onContextMenu`. `defaultContextMenuItems` and the `ContextMenu*` types are exported.

### Changed

- Error messages, the cell editor's `aria-label`, and JSDoc are now in English. If your code matches on the text of the invalid-delimiter error or `UnencodableCharacterError`, update it, or check the error's `name`, `chars`, and `cells` instead.
- The README is now in English.

## [0.1.1] - 2026-11-27

### Changed

- Removed the maintainer-only release instructions from the README shown on npm. No code changes.

## [0.1.0] - 2026-11-27

Initial release.

### Added

- `CsvEditor` component and `useCsvEditor` hook: a spreadsheet-like CSV editor built on TanStack Table, with virtual scrolling.
- IME-friendly editing, and line breaks inside cells with Alt+Enter or Shift+Enter.
- Paste from Excel and Google Sheets, split as TSV.
- Tolerant CSV parsing with mixed line endings; malformed values are reported with their position.
- Reading and writing UTF-8, Shift_JIS, and UTF-16 (LE / BE), saving in the encoding detected on load.
- Row and column insertion and deletion, undo/redo, range selection and copy, and resizable columns and rows.
