# chobit-csv-editor

[![npm](https://img.shields.io/npm/v/chobit-csv-editor)](https://www.npmjs.com/package/chobit-csv-editor)
[![CI](https://github.com/chobitapp/chobit-csv-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/chobitapp/chobit-csv-editor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A spreadsheet-like CSV editor component for React, built on TanStack Table.

**[Live demo](https://chobit-csv-editor-demo.zaru.workers.dev)**

- **IME-friendly.** Pressing Enter to confirm an IME composition (Japanese, Chinese, Korean, …) never commits the cell.
- **Multi-line cells.** Insert a line break inside a cell with Alt+Enter or Shift+Enter.
- **Paste from spreadsheets.** Tables copied from Excel or Google Sheets are split across cells. Text containing a tab or a line break is split as TSV; anything else goes into a single cell.
- **Tolerant parsing.** Reads CSV with mixed line endings (CRLF, LF, CR). A malformed value, such as an unclosed quote, is read as an unquoted value and its position is reported, instead of failing the whole file.
- **Encodings.** Reads and writes UTF-8, Shift_JIS, and UTF-16 (LE / BE). Pass the encoding detected on load straight to `exportBlob()` to save in the same encoding. By default, saving fails with an error if a character cannot be represented in Shift_JIS.
- **Editing essentials.** Insert and delete rows and columns, undo/redo, range selection and copy, resizable columns and rows, context menu, and virtual scrolling.

The library has no save button. Call `exportCsv()` or `exportBlob()` from your app to download the file, send it to a server, or do whatever you need.

## Installation

```sh
npm install chobit-csv-editor
# or
pnpm add chobit-csv-editor
```

Requires React 18 or later.

## Usage

```tsx
import { CsvEditor, useCsvEditor } from "chobit-csv-editor";
import "chobit-csv-editor/styles.css";

export function Page({ csv }: { csv: string }) {
	const editor = useCsvEditor({ initialCsv: csv, initialHasHeader: true });

	const save = async () => {
		await fetch("/api/csv", { method: "PUT", body: editor.exportCsv() });
		editor.markSaved();
	};

	const open = async (file: File) => {
		const { errors } = await editor.load(file);
		const [first] = errors;
		if (first) alert(`The CSV is malformed (first error at row ${first.row + 1})`);
	};

	return (
		<>
			<input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
			<button type="button" onClick={save} disabled={!editor.isDirty}>
				Save
			</button>
			<CsvEditor editor={editor} height={480} />
		</>
	);
}
```

If `exportCsv()`, `markSaved()`, or any method that changes the table is called while a cell is being edited, the value being edited is committed first. `load()` discards it.

## Keyboard shortcuts

| Key                       | While selecting                                                                 | While editing                                     |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Typing a character        | Start editing, replacing the selected cell's value                              | Type                                              |
| Enter / F2 / double-click | Start editing, keeping the current value                                        | Enter commits and moves down                      |
| Alt+Enter / Shift+Enter   | —                                                                               | Insert a line break in the cell                   |
| Tab / Shift+Tab           | Move right / left. At the last / first column, move focus out of the table      | Commit and move right / left                      |
| Esc                       | Clear the range selection                                                       | Cancel editing                                    |
| Arrow keys                | Move. Shift extends the range; Ctrl/Cmd jumps to the edge                       | Commit and move, if editing was started by typing |
| Home / End                | Move to the start / end of the row. With Ctrl/Cmd, the start / end of the table | —                                                 |
| Delete / Backspace        | Clear the selected cells                                                        | —                                                 |
| Ctrl/Cmd+C, X, V          | Copy, cut, paste                                                                | Act on the text                                   |
| Ctrl/Cmd+Z, Shift+Z, Y    | Undo, redo                                                                      | Act on the text                                   |
| Ctrl/Cmd+A                | Select all                                                                      | —                                                 |

Click a row number or column header to select the whole row or column. Drag the right edge of a column header to resize the column; double-click it to restore the default width. Drag the bottom edge of a row number to resize the row; double-click it to fit the row to its content. A resized row keeps its height when other rows are inserted or deleted.

If pasted data extends past the table, the missing rows and columns are added. Pasting a single value into a multi-cell selection fills the whole selection with that value.

## API

### `useCsvEditor(options?)`

| Option             | Type                                   | Default  | Description                                                                                                     |
| ------------------ | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `initialCsv`       | `string`                               | `""`     | CSV to show initially                                                                                           |
| `initialHasHeader` | `boolean`                              | `false`  | Whether the first row is a header                                                                               |
| `initialDelimiter` | `string`                               | `","`    | Delimiter of `initialCsv`                                                                                       |
| `historyLimit`     | `number`                               | `100`    | Maximum number of undo steps                                                                                    |
| `pasteDelimiter`   | `"auto" \| "tab" \| "comma" \| "none"` | `"auto"` | How pasted text is split. `"auto"` splits as TSV if the text contains a tab or a line break, otherwise does not |
| `onChange`         | `(rows) => void`                       | —        | Called whenever the table content changes                                                                       |

The main properties and methods of the return value:

| Name                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rows` / `headers` / `records`                                              | The whole table / the header row (`null` when `hasHeader` is false) / the rows without the header                                                                                                                                                                                                                                                                                                                                                                     |
| `load(input, { encoding?, hasHeader?, delimiter? })`                        | Load a CSV string or a File / Blob. `encoding` is `"auto"` (default), `"utf-8"`, `"shift_jis"`, `"utf-16le"`, or `"utf-16be"`. `"auto"` detects UTF-16 from the BOM, or from the position of NUL bytes when there is no BOM. The returned `encoding` is the detected encoding (`"utf-8-bom"` for UTF-8 with a BOM) and can be passed as-is to `exportBlob()`. `errors` lists format errors (`{ code, row, col }`). If called again while loading, the later call wins |
| `exportCsv({ lineEnding?, delimiter?, trailingNewline?, escapeFormulae? })` | Return the CSV as a string. Defaults to CRLF line endings with a trailing newline. `escapeFormulae: true` prefixes values starting with `=`, `+`, `-`, `@`, etc. with `'` (CSV injection protection)                                                                                                                                                                                                                                                                  |
| `exportBlob({ encoding?, unencodable?, ... })`                              | Return the CSV as a Blob. `encoding` is `"utf-8"` (default), `"utf-8-bom"`, `"shift_jis"`, `"utf-16le"`, or `"utf-16be"`. UTF-16 is written with a BOM. If a character cannot be encoded, `unencodable: "error"` (default) throws `UnencodableCharacterError` and `"replace"` replaces it with `?`                                                                                                                                                                    |
| `findUnencodableCells(encoding)`                                            | Return the cells containing characters that cannot be encoded in `encoding`, as an array of `{ row, col, chars }`                                                                                                                                                                                                                                                                                                                                                     |
| `isDirty` / `markSaved()`                                                   | Whether the content changed since the last load or `markSaved()` / record the current content as saved                                                                                                                                                                                                                                                                                                                                                                |
| `hasHeader` / `setHasHeader(value)`                                         | Whether the first row is a header. This only changes the display, not the exported CSV                                                                                                                                                                                                                                                                                                                                                                                |
| `undo()` / `redo()` / `canUndo` / `canRedo`                                 | History                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `selection` / `selectionRange` / `setSelection()`                           | Selection                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `insertRows(at, count?)` / `deleteRows(start, count?)`                      | Insert and delete rows                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `insertColumns(at, count?)` / `deleteColumns(start, count?)`                | Insert and delete columns                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `deleteSelectedRows()` / `deleteSelectedColumns()`                          | Delete the rows or columns covered by the selection                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `getCell(row, col)` / `setCell(row, col, value)`                            | Read and write a cell                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pasteText(text)` / `getSelectedText()` / `clearSelectedCells()`            | Paste into the selection / return the selection as TSV / clear the selection                                                                                                                                                                                                                                                                                                                                                                                          |

Deleting every row or column always leaves one empty row and one empty column.

When saving as Shift_JIS, symbols that map differently on Windows and macOS, such as `〜` (U+301C) and `−` (U+2212), are converted to their Shift_JIS counterparts. They read back as `～` (U+FF5E) and `－` (U+FF0D).

### `<CsvEditor>`

| Prop                                    | Type                                          | Default           |
| --------------------------------------- | --------------------------------------------- | ----------------- |
| `editor`                                | Return value of `useCsvEditor()`              | Required          |
| `height`                                | `number \| string`                            | `400`             |
| `readOnly`                              | `boolean`                                     | `false`           |
| `defaultColumnWidth` / `minColumnWidth` | `number`                                      | `120` / `40`      |
| `estimatedRowHeight`                    | `number`                                      | `28`              |
| `minRowHeight`                          | `number`                                      | `20`              |
| `rowHeaderWidth`                        | `number`                                      | `48`              |
| `columnLabel`                           | `(index) => ReactNode`                        | A, B, …, Z, AA, … |
| `contextMenu`                           | `boolean \| (context, defaultItems) => items` | `true`            |
| `onContextMenu`                         | `(context, event) => void`                    | —                 |
| `className` / `style`                   |                                               |                   |

### Context menu

Right-clicking a cell, row number, or column header opens a menu to insert and delete rows and columns (not shown when `readOnly`). Right-clicking outside the current selection selects that cell, row, or column first. Insertion always adds one row or column; deletion removes all selected rows or columns.

- `contextMenu={false}` disables the menu.
- `contextMenu={(context, defaultItems) => items}` lets you add, remove, or replace items. An item is `{ id, label, disabled?, onSelect(context) }` or `{ type: "separator" }`.
- `onContextMenu(context, event)` is called on every right-click. Call `event.preventDefault()` to suppress the default menu and show your own. `context` is `{ target: "cell" | "row" | "column", row, col, range, clientX, clientY, editor }`, and you can call the `editor` methods directly.

```tsx
<CsvEditor
	editor={editor}
	contextMenu={(context, items) => [
		...items,
		{ type: "separator" },
		{ id: "clear", label: "Clear cells", onSelect: () => context.editor.clearSelectedCells() },
	]}
/>;
```

The menu's look can be changed with classes such as `.tce-menu` and `.tce-menu-item`.

### Styling

`styles.css` defines colors and sizes with CSS custom properties. Override them on `.tce-root`:

```css
.tce-root {
	--tce-font-size: 14px;
	--tce-active-border: #e8590c;
	--tce-selected-bg: rgba(232, 89, 12, 0.12);
}
```

See [src/styles.css](src/styles.css) for the full list of variables.

## Development

Requires Node.js 22 or later and pnpm (the version is pinned in the `packageManager` field of `package.json`).

```sh
pnpm install
pnpm dev        # Start the demo app
pnpm test       # Vitest
pnpm typecheck
pnpm lint       # Biome
pnpm build      # Build the library into dist/
pnpm validate   # Lint, typecheck, and test, then check the published contents with publint and pnpm pack --dry-run
```

### Deploying the demo

The demo app in [`demo/`](demo) is deployed to [Cloudflare Workers](https://chobit-csv-editor-demo.zaru.workers.dev) as static assets with the [`cf` CLI](https://github.com/cloudflare/cf), which is installed as a dev dependency. The Worker is configured in [`demo/cloudflare.config.ts`](demo/cloudflare.config.ts).

```sh
pnpm exec cf auth login   # First time only
pnpm deploy:demo          # Build the demo and deploy it
```

`pnpm preview:demo` builds the demo and serves it locally in the Workers runtime. Pushes to `main` deploy the demo automatically through GitHub Actions when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are set.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
