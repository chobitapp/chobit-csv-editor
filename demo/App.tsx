import { useState } from "react";
import "../src/styles.css";
import "./demo.css";
import { CsvEditor, type OutputEncoding, stringifyCsv, UnencodableCharacterError, useCsvEditor } from "../src";

const sample = `Name,City,Note
Alice Smith,London,"Line 1
Line 2"
山田太郎,東京,"A value with a comma, inside"
José García,Madrid,"A value with ""quotes"" inside"
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
		const warning = firstError ? `. Malformed quotes found (first at row ${firstError.row + 1})` : "";
		setMessage(`Loaded ${file.name} as ${result.encoding}${warning}`);
	};

	// The library has no save button: the app calls exportBlob / exportCsv itself
	const handleSave = () => {
		let blob: Blob;
		try {
			blob = editor.exportBlob({ encoding });
		} catch (error) {
			if (!(error instanceof UnencodableCharacterError)) throw error;
			const first = error.cells[0];
			const where = first ? ` (first at row ${first.row + 1}, column ${first.col + 1})` : "";
			setMessage(`Cannot save: ${error.chars.join(" ")} cannot be encoded in ${encoding}${where}`);
			return;
		}
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(url);
		editor.markSaved();
		setMessage(`Saved ${fileName}`);
	};

	const { top, left } = editor.selectionRange;

	return (
		<main className="demo">
			<header className="demo-header">
				<h1 className="demo-title">chobit-csv-editor</h1>
				<span className="demo-filename">
					{fileName}
					{editor.isDirty ? " (unsaved changes)" : ""}
				</span>
				<a className="demo-link" href="https://github.com/chobitapp/chobit-csv-editor">
					GitHub
				</a>
			</header>
			<div className="demo-toolbar">
				<div className="demo-group">
					<label className="demo-button demo-file">
						Open file
						<input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
					</label>
					<label className="demo-checkbox">
						<input
							type="checkbox"
							checked={editor.hasHeader}
							onChange={(event) => editor.setHasHeader(event.target.checked)}
						/>
						First row is header
					</label>
				</div>
				<span className="demo-separator" />
				<div className="demo-group">
					<span className="demo-group-label">Row</span>
					<button type="button" className="demo-button" onClick={() => editor.insertRows(top)}>
						Insert above
					</button>
					<button type="button" className="demo-button demo-button--danger" onClick={editor.deleteSelectedRows}>
						Delete
					</button>
				</div>
				<div className="demo-group">
					<span className="demo-group-label">Column</span>
					<button type="button" className="demo-button" onClick={() => editor.insertColumns(left)}>
						Insert left
					</button>
					<button type="button" className="demo-button demo-button--danger" onClick={editor.deleteSelectedColumns}>
						Delete
					</button>
				</div>
				<span className="demo-separator" />
				<div className="demo-group">
					<button type="button" className="demo-button" onClick={editor.undo} disabled={!editor.canUndo}>
						Undo
					</button>
					<button type="button" className="demo-button" onClick={editor.redo} disabled={!editor.canRedo}>
						Redo
					</button>
				</div>
				<div className="demo-group demo-group--end">
					<select
						className="demo-select"
						aria-label="Encoding to save as"
						value={encoding}
						onChange={(event) => setEncoding(event.target.value as OutputEncoding)}
					>
						<option value="utf-8">UTF-8</option>
						<option value="utf-8-bom">UTF-8 with BOM</option>
						<option value="shift_jis">Shift_JIS</option>
						<option value="utf-16le">UTF-16LE with BOM</option>
						<option value="utf-16be">UTF-16BE with BOM</option>
					</select>
					<button type="button" className="demo-button demo-button--primary" onClick={handleSave}>
						Save
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
				<summary>CSV preview</summary>
				<pre>{stringifyCsv(editor.rows)}</pre>
			</details>
		</main>
	);
}
