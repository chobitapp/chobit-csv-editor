import { useState } from "react";
import "../src/styles.css";
import "./demo.css";
import { CsvEditor, type OutputEncoding, stringifyCsv, UnencodableCharacterError, useCsvEditor } from "../src";

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
		setEncoding(result.encoding);
		const firstError = result.errors[0];
		const warning = firstError ? `。${firstError.row + 1} 行目などに引用符の誤りがあります` : "";
		setMessage(`${file.name} を ${result.encoding} として読み込みました${warning}`);
	};

	// 保存ボタンはライブラリの外に置き、exportBlob / exportCsv を呼ぶ
	const handleSave = () => {
		let blob: Blob;
		try {
			blob = editor.exportBlob({ encoding });
		} catch (error) {
			if (!(error instanceof UnencodableCharacterError)) throw error;
			const first = error.cells[0];
			const where = first ? `（${first.row + 1} 行 ${first.col + 1} 列など）` : "";
			setMessage(`${encoding} で表せない文字 ${error.chars.join(" ")} があるため保存できません${where}`);
			return;
		}
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
		<main className="demo">
			<header className="demo-header">
				<h1 className="demo-title">CSV エディタ デモ</h1>
				<span className="demo-filename">
					{fileName}
					{editor.isDirty ? "（未保存の変更あり）" : ""}
				</span>
			</header>
			<div className="demo-toolbar">
				<div className="demo-group">
					<label className="demo-button demo-file">
						ファイルを開く
						<input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
					</label>
					<label className="demo-checkbox">
						<input
							type="checkbox"
							checked={editor.hasHeader}
							onChange={(event) => editor.setHasHeader(event.target.checked)}
						/>
						1 行目をヘッダにする
					</label>
				</div>
				<span className="demo-separator" />
				<div className="demo-group">
					<span className="demo-group-label">行</span>
					<button type="button" className="demo-button" onClick={() => editor.insertRows(top)}>
						上に挿入
					</button>
					<button type="button" className="demo-button demo-button--danger" onClick={editor.deleteSelectedRows}>
						削除
					</button>
				</div>
				<div className="demo-group">
					<span className="demo-group-label">列</span>
					<button type="button" className="demo-button" onClick={() => editor.insertColumns(left)}>
						左に挿入
					</button>
					<button type="button" className="demo-button demo-button--danger" onClick={editor.deleteSelectedColumns}>
						削除
					</button>
				</div>
				<span className="demo-separator" />
				<div className="demo-group">
					<button type="button" className="demo-button" onClick={editor.undo} disabled={!editor.canUndo}>
						元に戻す
					</button>
					<button type="button" className="demo-button" onClick={editor.redo} disabled={!editor.canRedo}>
						やり直す
					</button>
				</div>
				<div className="demo-group demo-group--end">
					<select
						className="demo-select"
						aria-label="保存する文字コード"
						value={encoding}
						onChange={(event) => setEncoding(event.target.value as OutputEncoding)}
					>
						<option value="utf-8">UTF-8</option>
						<option value="utf-8-bom">UTF-8 (BOM 付き)</option>
						<option value="shift_jis">Shift_JIS</option>
						<option value="utf-16le">UTF-16LE (BOM 付き)</option>
						<option value="utf-16be">UTF-16BE (BOM 付き)</option>
					</select>
					<button type="button" className="demo-button demo-button--primary" onClick={handleSave}>
						保存
						{editor.isDirty && <span className="demo-dirty" aria-hidden="true" />}
					</button>
				</div>
			</div>
			<div className="demo-editor">
				<CsvEditor editor={editor} height={480} />
			</div>
			<p className="demo-status" role="status">
				{message}
			</p>
			<details className="demo-preview">
				<summary>CSV プレビュー</summary>
				<pre>{stringifyCsv(editor.rows)}</pre>
			</details>
		</main>
	);
}
