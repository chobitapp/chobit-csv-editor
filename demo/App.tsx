import { useState } from "react";
import "../src/styles.css";
import "./demo.css";
import { CsvEditor, type OutputEncoding, stringifyCsv, UnencodableCharacterError, useCsvEditor } from "../src";
import { type SampleId, samples } from "./samples";

const [initialSample] = samples as [(typeof samples)[number]];
/** The preview stringifies only this many rows, so it stays fast with the large sample. */
const previewRowLimit = 100;

export function App() {
	const editor = useCsvEditor({ initialCsv: initialSample.createCsv(), initialHasHeader: true });
	const [fileName, setFileName] = useState(initialSample.fileName);
	const [sampleId, setSampleId] = useState<SampleId | null>(initialSample.id);
	const [loading, setLoading] = useState(false);
	const [encoding, setEncoding] = useState<OutputEncoding>("utf-8");
	const [message, setMessage] = useState("");
	const [previewOpen, setPreviewOpen] = useState(false);

	const confirmDiscard = () => !editor.isDirty || window.confirm("Discard your unsaved changes?");

	const handleSample = async (id: SampleId) => {
		const sample = samples.find((item) => item.id === id);
		if (!sample || !confirmDiscard()) return;
		setLoading(true);
		setMessage(`Loading the ${id} sample…`);
		// Let the browser paint the loading state before generating and parsing up to 100,000 rows
		await new Promise((resolve) => setTimeout(resolve, 0));
		const startedAt = performance.now();
		const result = await editor.load(sample.createCsv(), { hasHeader: true });
		const elapsed = Math.round(performance.now() - startedAt);
		setLoading(false);
		setSampleId(id);
		setFileName(sample.fileName);
		setEncoding(result.encoding);
		setMessage(`Loaded ${sample.fileName} in ${elapsed.toLocaleString("en-US")} ms`);
	};

	const handleFile = async (file: File | undefined) => {
		if (!file || !confirmDiscard()) return;
		const result = await editor.load(file);
		setSampleId(null);
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
	const rowCount = editor.rows.length;
	// Data rows, so the header line is not counted when the first row is a header
	const recordCount = editor.records.length;
	const columnCount = editor.rows[0]?.length ?? 0;
	// Widen the row number column so 6-digit row numbers in the large sample are not cut off
	const rowHeaderWidth = Math.max(48, String(rowCount).length * 8 + 20);

	return (
		<main className="demo">
			<header className="demo-header">
				<h1 className="demo-title">chobit-csv-editor</h1>
				<span className="demo-filename">
					{fileName} · {recordCount.toLocaleString("en-US")} rows × {columnCount} columns
					{editor.isDirty ? " (unsaved changes)" : ""}
				</span>
				<a className="demo-link" href="https://github.com/chobitapp/chobit-csv-editor">
					GitHub
				</a>
			</header>
			<div className="demo-toolbar">
				<div className="demo-group">
					<select
						className="demo-select"
						aria-label="Sample CSV"
						value={sampleId ?? ""}
						disabled={loading}
						onChange={(event) => handleSample(event.target.value as SampleId)}
					>
						{sampleId === null && (
							<option value="" disabled>
								Your file
							</option>
						)}
						{samples.map((sample) => (
							<option key={sample.id} value={sample.id}>
								{sample.label}
							</option>
						))}
					</select>
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
				<CsvEditor editor={editor} height={480} rowHeaderWidth={rowHeaderWidth} />
			</div>
			<p className="demo-status" role="status">
				{message}
			</p>
			<details className="demo-preview" onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
				<summary>
					CSV preview
					{rowCount > previewRowLimit ? ` (first ${previewRowLimit} of ${rowCount.toLocaleString("en-US")} lines)` : ""}
				</summary>
				{previewOpen && <pre>{stringifyCsv(editor.rows.slice(0, previewRowLimit))}</pre>}
			</details>
		</main>
	);
}
