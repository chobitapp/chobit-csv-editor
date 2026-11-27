import { useState } from "react";
import "../src/styles.css";
import { CsvEditor, type OutputEncoding, stringifyCsv, useCsvEditor } from "../src";

const sample = `名前,住所,メモ
山田太郎,東京都千代田区,"1行目
2行目"
鈴木花子,大阪府大阪市,"カンマ, を含む値"
佐藤次郎,北海道札幌市,"""引用符"" を含む値"
`;

export function App() {
	const editor = useCsvEditor({ initialCsv: sample, initialHasHeader: true });
	const [fileName, setFileName] = useState("sample.csv");
	const [encoding, setEncoding] = useState<OutputEncoding>("utf-8");
	const [message, setMessage] = useState("");

	const handleFile = async (file: File | undefined) => {
		if (!file) return;
		const result = await editor.load(file);
		setFileName(file.name);
		setEncoding(result.encoding === "shift_jis" ? "shift_jis" : "utf-8");
		setMessage(`${file.name} を ${result.encoding} として読み込みました`);
	};

	// 保存ボタンはライブラリの外に置き、exportBlob / exportCsv を呼ぶ
	const handleSave = () => {
		const blob = editor.exportBlob({ encoding });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(url);
		editor.markSaved();
		setMessage(`${fileName} を保存しました`);
	};

	const { top, left } = editor.selectionRange;

	return (
		<main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
			<h1 style={{ fontSize: 20 }}>CSV エディタ デモ</h1>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					alignItems: "center",
					marginBottom: 8,
				}}
			>
				<input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
				<label>
					<input
						type="checkbox"
						checked={editor.hasHeader}
						onChange={(event) => editor.setHasHeader(event.target.checked)}
					/>
					1 行目をヘッダにする
				</label>
				<button type="button" onClick={() => editor.insertRows(top)}>
					上に行を挿入
				</button>
				<button type="button" onClick={editor.deleteSelectedRows}>
					選択行を削除
				</button>
				<button type="button" onClick={() => editor.insertColumns(left)}>
					左に列を挿入
				</button>
				<button type="button" onClick={editor.deleteSelectedColumns}>
					選択列を削除
				</button>
				<button type="button" onClick={editor.undo} disabled={!editor.canUndo}>
					元に戻す
				</button>
				<button type="button" onClick={editor.redo} disabled={!editor.canRedo}>
					やり直す
				</button>
				<select value={encoding} onChange={(event) => setEncoding(event.target.value as OutputEncoding)}>
					<option value="utf-8">UTF-8</option>
					<option value="utf-8-bom">UTF-8 (BOM 付き)</option>
					<option value="shift_jis">Shift_JIS</option>
				</select>
				<button type="button" onClick={handleSave}>
					保存{editor.isDirty ? " *" : ""}
				</button>
			</div>
			<CsvEditor editor={editor} height={480} />
			<p>{message}</p>
			<details>
				<summary>CSV プレビュー</summary>
				<pre>{stringifyCsv(editor.rows)}</pre>
			</details>
		</main>
	);
}
