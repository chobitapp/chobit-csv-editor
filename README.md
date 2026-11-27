# tanstack-table-csv-editor

[TanStack Table](https://tanstack.com/table) を使った、React 向けのスプレッドシート風 CSV エディタです。
CSV の文字列やファイルを渡すと、ブラウザ上で表として編集できます。

- 日本語の IME 入力に対応しています。変換を確定する Enter でセルが確定されることはありません
- セル内で改行できます（Alt+Enter または Shift+Enter）
- Excel やスプレッドシートからコピーした表を貼り付けると、セルに分けて書き込みます。タブを含む文字列は TSV、含まない文字列は CSV として分割します
- Shift_JIS の CSV を読み込めます。保存時は UTF-8、BOM 付き UTF-8、Shift_JIS から選べます
- 行・列の追加と削除、Undo/Redo、範囲選択とコピー、列幅の変更、仮想スクロールに対応しています

保存ボタンはライブラリに含めていません。利用する側で `exportCsv()` または `exportBlob()` を呼んで、ダウンロードやサーバへの送信など任意の処理を行ってください。

## インストール

```sh
pnpm add tanstack-table-csv-editor
```

React 18 以降が必要です。

## 使い方

```tsx
import { CsvEditor, useCsvEditor } from "tanstack-table-csv-editor";
import "tanstack-table-csv-editor/styles.css";

export function Page({ csv }: { csv: string }) {
	const editor = useCsvEditor({ initialCsv: csv, initialHasHeader: true });

	const save = async () => {
		await fetch("/api/csv", { method: "PUT", body: editor.exportCsv() });
		editor.markSaved();
	};

	return (
		<>
			<input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && editor.load(e.target.files[0])} />
			<button type="button" onClick={save} disabled={!editor.isDirty}>
				保存
			</button>
			<CsvEditor editor={editor} height={480} />
		</>
	);
}
```

`exportCsv()` と `markSaved()` は、セルを編集している途中で呼ばれても、編集中の値を確定してから処理します。

## キー操作

| キー                        | 選択中                                                  | 編集中                                 |
| --------------------------- | ------------------------------------------------------- | -------------------------------------- |
| 文字の入力                  | 選択中のセルを上書きして編集を始める                    | 入力する                               |
| Enter / F2 / ダブルクリック | 今の値を残したまま編集を始める                          | Enter で確定して下のセルへ移る         |
| Alt+Enter / Shift+Enter     | —                                                       | セル内で改行する                       |
| Tab / Shift+Tab             | 右 / 左へ移る                                           | 確定して右 / 左へ移る                  |
| Esc                         | 範囲選択を解除する                                      | 編集を取り消す                         |
| 矢印キー                    | 移る。Shift で範囲を広げ、Ctrl/Cmd で端まで移る         | 文字の入力で始めた編集なら確定して移る |
| Home / End                  | 行の先頭 / 末尾へ移る。Ctrl/Cmd で表の先頭 / 末尾へ移る | —                                      |
| Delete / Backspace          | 選択範囲を空にする                                      | —                                      |
| Ctrl/Cmd+C, X, V            | コピー、切り取り、貼り付け                              | 文字列として扱う                       |
| Ctrl/Cmd+Z, Shift+Z, Y      | 元に戻す、やり直す                                      | 文字列として扱う                       |
| Ctrl/Cmd+A                  | 全体を選択する                                          | —                                      |

行番号や列見出しをクリックすると、その行や列をまとめて選択します。列見出しの右端をドラッグすると列幅を変えられ、ダブルクリックすると元の幅に戻ります。

貼り付ける値が表の外まではみ出す場合は、足りない行と列を追加します。1 セル分の値を複数セルの選択範囲に貼り付けると、範囲全体をその値で埋めます。

## API

### `useCsvEditor(options?)`

| オプション         | 型                                     | 既定値   | 説明                           |
| ------------------ | -------------------------------------- | -------- | ------------------------------ |
| `initialCsv`       | `string`                               | `""`     | 最初に表示する CSV             |
| `initialHasHeader` | `boolean`                              | `false`  | 1 行目をヘッダとして扱うか     |
| `historyLimit`     | `number`                               | `100`    | Undo できる最大回数            |
| `pasteDelimiter`   | `"auto" \| "tab" \| "comma" \| "none"` | `"auto"` | 貼り付けた文字列の分け方       |
| `onChange`         | `(rows) => void`                       | —        | 表の内容が変わるたびに呼ばれる |

戻り値の主なプロパティとメソッドは次のとおりです。

| 名前                                                             | 説明                                                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `rows` / `headers` / `records`                                   | 表全体 / ヘッダ行（`hasHeader` が false なら `null`）/ ヘッダを除いた行                                                           |
| `load(input, { encoding?, hasHeader? })`                         | CSV の文字列か File / Blob を読み込む。`encoding` は `"auto"`（既定）, `"utf-8"`, `"shift_jis"`。戻り値で判定した文字コードを返す |
| `exportCsv({ lineEnding?, delimiter?, trailingNewline? })`       | CSV の文字列を返す。既定は CRLF 区切りで、末尾にも改行を付ける                                                                    |
| `exportBlob({ encoding?, ... })`                                 | CSV の Blob を返す。`encoding` は `"utf-8"`（既定）, `"utf-8-bom"`, `"shift_jis"`                                                 |
| `isDirty` / `markSaved()`                                        | 最後に読み込むか `markSaved()` してから内容が変わったか / 今の内容を保存済みとして記録する                                        |
| `hasHeader` / `setHasHeader(value)`                              | 1 行目をヘッダとして扱うか。表示が変わるだけで、出力する CSV は変わらない                                                         |
| `undo()` / `redo()` / `canUndo` / `canRedo`                      | 履歴の操作                                                                                                                        |
| `selection` / `selectionRange` / `setSelection()`                | 選択範囲                                                                                                                          |
| `insertRows(at, count?)` / `deleteRows(start, count?)`           | 行の追加と削除                                                                                                                    |
| `insertColumns(at, count?)` / `deleteColumns(start, count?)`     | 列の追加と削除                                                                                                                    |
| `deleteSelectedRows()` / `deleteSelectedColumns()`               | 選択範囲にかかる行や列を削除する                                                                                                  |
| `getCell(row, col)` / `setCell(row, col, value)`                 | セルの読み書き                                                                                                                    |
| `pasteText(text)` / `getSelectedText()` / `clearSelectedCells()` | 選択範囲への貼り付け / 選択範囲を TSV で返す / 選択範囲を空にする                                                                 |

行と列は、全て削除しても空の 1 行・1 列が残ります。

### `<CsvEditor>`

| Prop                                    | 型                        | 既定値            |
| --------------------------------------- | ------------------------- | ----------------- |
| `editor`                                | `useCsvEditor()` の戻り値 | 必須              |
| `height`                                | `number \| string`        | `400`             |
| `readOnly`                              | `boolean`                 | `false`           |
| `defaultColumnWidth` / `minColumnWidth` | `number`                  | `120` / `40`      |
| `estimatedRowHeight`                    | `number`                  | `28`              |
| `rowHeaderWidth`                        | `number`                  | `48`              |
| `columnLabel`                           | `(index) => ReactNode`    | A, B, …, Z, AA, … |
| `className` / `style`                   |                           |                   |

### スタイルの変更

`styles.css` は CSS 変数で色や寸法を決めています。`.tce-root` に対して上書きしてください。

```css
.tce-root {
	--tce-font-size: 14px;
	--tce-active-border: #e8590c;
	--tce-selected-bg: rgba(232, 89, 12, 0.12);
}
```

変数の一覧は [src/styles.css](src/styles.css) を見てください。

## 開発

```sh
pnpm install
pnpm dev        # デモアプリを起動する
pnpm test       # Vitest
pnpm typecheck
pnpm lint       # Biome
pnpm build      # dist/ にライブラリを出力する
```
