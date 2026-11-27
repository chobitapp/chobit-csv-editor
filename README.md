# tanstack-table-csv-editor

[TanStack Table](https://tanstack.com/table) を使った、React 向けのスプレッドシート風 CSV エディタです。
CSV の文字列やファイルを渡すと、ブラウザ上で表として編集できます。

- 日本語の IME 入力に対応しています。変換を確定する Enter でセルが確定されることはありません
- セル内で改行できます（Alt+Enter または Shift+Enter）
- Excel やスプレッドシートからコピーした表を貼り付けると、セルに分けて書き込みます。タブか改行を含む文字列は TSV として分割し、含まない文字列は 1 つのセルに貼り付けます
- 改行コード（CRLF・LF・CR）が混在した CSV も読めます。引用符が閉じていないなどの誤りがあっても、その値だけを引用符の無い値として読み、誤りの位置を返します
- UTF-8、Shift_JIS、UTF-16（LE / BE）の CSV を読み書きできます。読み込んだ時に判定した文字コードを `exportBlob()` にそのまま渡すと、同じ文字コードで保存できます。Shift_JIS で表せない文字があれば、既定では保存せずにエラーにします
- 行・列の追加と削除、Undo/Redo、範囲選択とコピー、列幅と行の高さの変更、仮想スクロールに対応しています

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

	const open = async (file: File) => {
		const { errors } = await editor.load(file);
		const [first] = errors;
		if (first) alert(`${first.row + 1} 行目などに CSV の書式の誤りがあります`);
	};

	return (
		<>
			<input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
			<button type="button" onClick={save} disabled={!editor.isDirty}>
				保存
			</button>
			<CsvEditor editor={editor} height={480} />
		</>
	);
}
```

`exportCsv()` や `markSaved()`、表を変えるメソッドは、セルを編集している途中で呼ばれると、編集中の値を確定してから処理します。`load()` は編集中の値を捨てます。

## キー操作

| キー                        | 選択中                                                     | 編集中                                 |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| 文字の入力                  | 選択中のセルを上書きして編集を始める                       | 入力する                               |
| Enter / F2 / ダブルクリック | 今の値を残したまま編集を始める                             | Enter で確定して下のセルへ移る         |
| Alt+Enter / Shift+Enter     | —                                                          | セル内で改行する                       |
| Tab / Shift+Tab             | 右 / 左へ移る。右端 / 左端の列では表の外へフォーカスを移す | 確定して右 / 左へ移る                  |
| Esc                         | 範囲選択を解除する                                         | 編集を取り消す                         |
| 矢印キー                    | 移る。Shift で範囲を広げ、Ctrl/Cmd で端まで移る            | 文字の入力で始めた編集なら確定して移る |
| Home / End                  | 行の先頭 / 末尾へ移る。Ctrl/Cmd で表の先頭 / 末尾へ移る    | —                                      |
| Delete / Backspace          | 選択範囲を空にする                                         | —                                      |
| Ctrl/Cmd+C, X, V            | コピー、切り取り、貼り付け                                 | 文字列として扱う                       |
| Ctrl/Cmd+Z, Shift+Z, Y      | 元に戻す、やり直す                                         | 文字列として扱う                       |
| Ctrl/Cmd+A                  | 全体を選択する                                             | —                                      |

行番号や列見出しをクリックすると、その行や列をまとめて選択します。列見出しの右端をドラッグすると列幅を変えられ、ダブルクリックすると元の幅に戻ります。行番号の下端をドラッグすると行の高さを変えられ、ダブルクリックすると内容に合わせた高さに戻ります。変えた高さは、行を挿入・削除してもその行に付いたまま残ります。

貼り付ける値が表の外まではみ出す場合は、足りない行と列を追加します。1 セル分の値を複数セルの選択範囲に貼り付けると、範囲全体をその値で埋めます。

## API

### `useCsvEditor(options?)`

| オプション         | 型                                     | 既定値   | 説明                                                                                |
| ------------------ | -------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `initialCsv`       | `string`                               | `""`     | 最初に表示する CSV                                                                  |
| `initialHasHeader` | `boolean`                              | `false`  | 1 行目をヘッダとして扱うか                                                          |
| `initialDelimiter` | `string`                               | `","`    | `initialCsv` の区切り文字                                                           |
| `historyLimit`     | `number`                               | `100`    | Undo できる最大回数                                                                 |
| `pasteDelimiter`   | `"auto" \| "tab" \| "comma" \| "none"` | `"auto"` | 貼り付けた文字列の分け方。`"auto"` はタブか改行を含めば TSV、含まなければ分割しない |
| `onChange`         | `(rows) => void`                       | —        | 表の内容が変わるたびに呼ばれる                                                      |

戻り値の主なプロパティとメソッドは次のとおりです。

| 名前                                                                        | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rows` / `headers` / `records`                                              | 表全体 / ヘッダ行（`hasHeader` が false なら `null`）/ ヘッダを除いた行                                                                                                                                                                                                                                                                                                                                                                    |
| `load(input, { encoding?, hasHeader?, delimiter? })`                        | CSV の文字列か File / Blob を読み込む。`encoding` は `"auto"`（既定）, `"utf-8"`, `"shift_jis"`, `"utf-16le"`, `"utf-16be"`。`"auto"` は BOM と、BOM が無ければ NUL バイトの位置で UTF-16 を判定する。戻り値の `encoding` は判定した文字コードで、BOM 付き UTF-8 なら `"utf-8-bom"` になる。`exportBlob()` の `encoding` にそのまま渡せる。`errors` は書式の誤り（`{ code, row, col }`）。読み込み中に再び呼ぶと、後から呼んだ方を表示する |
| `exportCsv({ lineEnding?, delimiter?, trailingNewline?, escapeFormulae? })` | CSV の文字列を返す。既定は CRLF 区切りで、末尾にも改行を付ける。`escapeFormulae: true` で `=` `+` `-` `@` などで始まる値の先頭に `'` を付ける（CSV インジェクション対策）                                                                                                                                                                                                                                                                  |
| `exportBlob({ encoding?, unencodable?, ... })`                              | CSV の Blob を返す。`encoding` は `"utf-8"`（既定）, `"utf-8-bom"`, `"shift_jis"`, `"utf-16le"`, `"utf-16be"`。UTF-16 は BOM を付けて書き出す。表せない文字があると、`unencodable` が `"error"`（既定）なら `UnencodableCharacterError` を投げ、`"replace"` なら `?` に置き換える                                                                                                                                                          |
| `findUnencodableCells(encoding)`                                            | `encoding` で表せない文字を含むセルを `{ row, col, chars }` の配列で返す                                                                                                                                                                                                                                                                                                                                                                   |
| `isDirty` / `markSaved()`                                                   | 最後に読み込むか `markSaved()` してから内容が変わったか / 今の内容を保存済みとして記録する                                                                                                                                                                                                                                                                                                                                                 |
| `hasHeader` / `setHasHeader(value)`                                         | 1 行目をヘッダとして扱うか。表示が変わるだけで、出力する CSV は変わらない                                                                                                                                                                                                                                                                                                                                                                  |
| `undo()` / `redo()` / `canUndo` / `canRedo`                                 | 履歴の操作                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `selection` / `selectionRange` / `setSelection()`                           | 選択範囲                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `insertRows(at, count?)` / `deleteRows(start, count?)`                      | 行の追加と削除                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `insertColumns(at, count?)` / `deleteColumns(start, count?)`                | 列の追加と削除                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `deleteSelectedRows()` / `deleteSelectedColumns()`                          | 選択範囲にかかる行や列を削除する                                                                                                                                                                                                                                                                                                                                                                                                           |
| `getCell(row, col)` / `setCell(row, col, value)`                            | セルの読み書き                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pasteText(text)` / `getSelectedText()` / `clearSelectedCells()`            | 選択範囲への貼り付け / 選択範囲を TSV で返す / 選択範囲を空にする                                                                                                                                                                                                                                                                                                                                                                          |

行と列は、全て削除しても空の 1 行・1 列が残ります。

Shift_JIS で保存する時、`〜`（U+301C）や `−`（U+2212）のように Windows と Mac で対応する文字が違う記号は、Shift_JIS の対応する文字に変換します。読み込み直すと `～`（U+FF5E）や `－`（U+FF0D）になります。

### `<CsvEditor>`

| Prop                                    | 型                        | 既定値            |
| --------------------------------------- | ------------------------- | ----------------- |
| `editor`                                | `useCsvEditor()` の戻り値 | 必須              |
| `height`                                | `number \| string`        | `400`             |
| `readOnly`                              | `boolean`                 | `false`           |
| `defaultColumnWidth` / `minColumnWidth` | `number`                  | `120` / `40`      |
| `estimatedRowHeight`                    | `number`                  | `28`              |
| `minRowHeight`                          | `number`                  | `20`              |
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
