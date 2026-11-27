import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PasteDelimiter, parseClipboardText, toTsv } from "../core/clipboard";
import { type CsvParseError, parseCsvWithErrors, type StringifyCsvOptions, stringifyCsv } from "../core/csv";
import {
	type CellPositionWithChars,
	charsetOf,
	type DetectedEncoding,
	encodeText,
	findUnencodableChars,
	type InputEncoding,
	type OutputEncoding,
	readTextInput,
	UnencodableCharacterError,
	type UnencodableHandling,
} from "../core/encoding";
import { commit, createHistory, type HistoryState, redo, undo } from "../core/history";
import { type CellRange, clampSelection, collapsed, type Selection, toRange } from "../core/selection";
import {
	clearRange,
	createSheet,
	deleteColumns,
	deleteRows,
	getRange,
	insertColumns,
	insertRows,
	pasteValues,
	type Sheet,
	setCell,
} from "../core/sheet";

export interface UseCsvEditorOptions {
	/** The CSV string to show initially */
	initialCsv?: string;
	/** Whether to treat the first row as a header. Defaults to false */
	initialHasHeader?: boolean;
	/** The delimiter of initialCsv. Defaults to "," */
	initialDelimiter?: string;
	/** The maximum number of undo steps. Defaults to 100 */
	historyLimit?: number;
	/** How pasted text is split. Defaults to "auto" */
	pasteDelimiter?: PasteDelimiter;
	/** Called whenever the table content changes */
	onChange?: (rows: readonly (readonly string[])[]) => void;
}

export interface LoadOptions {
	/** The encoding used to read a File / Blob. Defaults to "auto" (detects UTF-16 from the BOM or NUL positions; otherwise uses UTF-8, falling back to Shift_JIS if the bytes are not valid UTF-8) */
	encoding?: InputEncoding;
	hasHeader?: boolean;
	/** Defaults to "," */
	delimiter?: string;
}

export interface LoadResult {
	encoding: DetectedEncoding;
	/** Format errors in the loaded CSV. Even with errors, as much as possible is loaded */
	errors: CsvParseError[];
}

export type ExportCsvOptions = StringifyCsvOptions;

export interface ExportBlobOptions extends ExportCsvOptions {
	/** Defaults to "utf-8" */
	encoding?: OutputEncoding;
	/** How to handle characters that cannot be encoded in encoding. Defaults to "error", which throws UnencodableCharacterError */
	unencodable?: UnencodableHandling;
}

/** @internal Registered by the CsvEditor component so the hook can commit or discard the cell being edited */
export interface EditSession {
	commit: () => void;
	cancel: () => void;
}

export interface CsvEditorInstance {
	readonly rows: readonly (readonly string[])[];
	readonly columnIds: readonly string[];
	/** Stable IDs that stay attached to rows across insertions and deletions. Same length as rows */
	readonly rowIds: readonly string[];
	readonly rowCount: number;
	readonly columnCount: number;
	readonly hasHeader: boolean;
	setHasHeader: (value: boolean) => void;
	/** The first row when hasHeader is true; null when it is false */
	readonly headers: readonly string[] | null;
	/** The data rows, excluding the header row */
	readonly records: readonly (readonly string[])[];

	readonly selection: Selection;
	readonly selectionRange: CellRange;
	setSelection: (selection: Selection) => void;

	/** If load is called again before the previous load finishes, the content from the later call is shown. Any value being edited is discarded */
	load: (input: string | Blob, options?: LoadOptions) => Promise<LoadResult>;
	exportCsv: (options?: ExportCsvOptions) => string;
	exportBlob: (options?: ExportBlobOptions) => Blob;
	/** Returns the cells containing characters that cannot be encoded in encoding */
	findUnencodableCells: (encoding: OutputEncoding) => CellPositionWithChars[];

	getCell: (row: number, col: number) => string;
	setCell: (row: number, col: number, value: string) => void;
	/** Pastes clipboard text with the top-left of the selection as the starting point */
	pasteText: (text: string) => void;
	/** Converts the selection to a TSV string */
	getSelectedText: () => string;
	clearSelectedCells: () => void;

	insertRows: (at: number, count?: number) => void;
	deleteRows: (start: number, count?: number) => void;
	insertColumns: (at: number, count?: number) => void;
	deleteColumns: (start: number, count?: number) => void;
	deleteSelectedRows: () => void;
	deleteSelectedColumns: () => void;

	undo: () => void;
	redo: () => void;
	readonly canUndo: boolean;
	readonly canRedo: boolean;

	/** Whether the content has changed since the last load / markSaved */
	readonly isDirty: boolean;
	markSaved: () => void;

	/** @internal Returns a function that unregisters the session */
	readonly _registerEditSession: (session: EditSession) => () => void;
}

interface EditorState {
	history: HistoryState<Sheet>;
	saved: Sheet;
	selection: Selection;
	hasHeader: boolean;
}

const origin = collapsed({ row: 0, col: 0 });

function initialState(csv: string | undefined, hasHeader: boolean, delimiter: string | undefined): EditorState {
	const sheet = createSheet(parseCsvWithErrors(csv ?? "", { delimiter }).rows);
	return {
		history: createHistory(sheet),
		saved: sheet,
		selection: origin,
		hasHeader,
	};
}

export function useCsvEditor(options: UseCsvEditorOptions = {}): CsvEditorInstance {
	const { historyLimit = 100, pasteDelimiter = "auto" } = options;
	const [state, setState] = useState(() =>
		initialState(options.initialCsv, options.initialHasHeader ?? false, options.initialDelimiter),
	);
	// Also kept in a ref so methods can always read the latest state synchronously
	const stateRef = useRef(state);
	const sessionsRef = useRef(new Set<EditSession>());
	const loadSeqRef = useRef(0);
	const onChangeRef = useRef(options.onChange);
	onChangeRef.current = options.onChange;

	const update = useCallback((fn: (current: EditorState) => EditorState) => {
		const next = fn(stateRef.current);
		if (next === stateRef.current) return;
		stateRef.current = next;
		setState(next);
	}, []);

	// Commit the value being edited before changing the table; otherwise it would be written to the same coordinates in the changed table
	const flushEdit = useCallback(() => {
		for (const session of sessionsRef.current) session.commit();
	}, []);

	const editSheet = useCallback(
		(fn: (sheet: Sheet, selection: Selection) => Sheet | { sheet: Sheet; selection: Selection }) => {
			flushEdit();
			update((current) => {
				const result = fn(current.history.present, current.selection);
				const sheet = "sheet" in result ? result.sheet : result;
				const selection = "sheet" in result ? result.selection : current.selection;
				if (sheet === current.history.present && selection === current.selection) return current;
				return {
					...current,
					history: commit(current.history, sheet, historyLimit),
					selection: clampSelection(selection, sheet.rows.length, sheet.colIds.length),
				};
			});
		},
		[update, flushEdit, historyLimit],
	);

	const present = state.history.present;
	const previousRowsRef = useRef(present.rows);
	useEffect(() => {
		if (previousRowsRef.current === present.rows) return;
		previousRowsRef.current = present.rows;
		onChangeRef.current?.(present.rows);
	}, [present.rows]);

	const methods = useMemo(() => {
		const exportCsv = (opts: ExportCsvOptions = {}) => {
			flushEdit();
			return stringifyCsv(stateRef.current.history.present.rows, opts);
		};
		const moveHistory = (fn: typeof undo) => {
			flushEdit();
			update((current) => {
				const history = fn(current.history);
				if (history === current.history) return current;
				const { rows, colIds } = history.present;
				return {
					...current,
					history,
					selection: clampSelection(current.selection, rows.length, colIds.length),
				};
			});
		};
		const findUnencodableCells = (encoding: OutputEncoding) => {
			const cells: CellPositionWithChars[] = [];
			stateRef.current.history.present.rows.forEach((row, r) => {
				row.forEach((value, c) => {
					const chars = findUnencodableChars(value, encoding);
					if (chars.length > 0) cells.push({ row: r, col: c, chars });
				});
			});
			return cells;
		};
		return {
			setHasHeader: (value: boolean) =>
				update((current) => (current.hasHeader === value ? current : { ...current, hasHeader: value })),
			setSelection: (selection: Selection) =>
				update((current) => {
					const { rows, colIds } = current.history.present;
					return {
						...current,
						selection: clampSelection(selection, rows.length, colIds.length),
					};
				}),
			load: async (input: string | Blob, opts: LoadOptions = {}) => {
				const seq = ++loadSeqRef.current;
				const { text, encoding } = await readTextInput(input, opts.encoding);
				const { rows, errors } = parseCsvWithErrors(text, { delimiter: opts.delimiter });
				if (seq !== loadSeqRef.current) return { encoding, errors };
				for (const session of sessionsRef.current) session.cancel();
				const sheet = createSheet(rows);
				update((current) => ({
					history: createHistory(sheet),
					saved: sheet,
					selection: origin,
					hasHeader: opts.hasHeader ?? current.hasHeader,
				}));
				return { encoding, errors };
			},
			exportCsv,
			exportBlob: (opts: ExportBlobOptions = {}) => {
				const encoding = opts.encoding ?? "utf-8";
				const unencodable = opts.unencodable ?? "error";
				const csv = exportCsv(opts);
				if (unencodable === "error") {
					const cells = findUnencodableCells(encoding);
					if (cells.length > 0) {
						const chars = [...new Set(cells.flatMap((cell) => cell.chars))];
						throw new UnencodableCharacterError(encoding, chars, cells);
					}
				}
				return new Blob([encodeText(csv, encoding, unencodable)], {
					type: `text/csv;charset=${charsetOf(encoding)}`,
				});
			},
			findUnencodableCells,
			getCell: (row: number, col: number) => stateRef.current.history.present.rows[row]?.[col] ?? "",
			setCell: (row: number, col: number, value: string) => editSheet((sheet) => setCell(sheet, row, col, value)),
			pasteText: (text: string) =>
				editSheet((sheet, selection) => {
					const range = toRange(selection);
					const values = parseClipboardText(text, pasteDelimiter);
					const result = pasteValues(sheet, range.top, range.left, values, range);
					return {
						sheet: result.sheet,
						selection: {
							anchor: { row: result.range.top, col: result.range.left },
							focus: { row: result.range.bottom, col: result.range.right },
						},
					};
				}),
			getSelectedText: () => {
				const current = stateRef.current;
				return toTsv(getRange(current.history.present, toRange(current.selection)));
			},
			clearSelectedCells: () => editSheet((sheet, selection) => clearRange(sheet, toRange(selection))),
			insertRows: (at: number, count = 1) => editSheet((sheet) => insertRows(sheet, at, count)),
			deleteRows: (start: number, count = 1) => editSheet((sheet) => deleteRows(sheet, start, count)),
			insertColumns: (at: number, count = 1) => editSheet((sheet) => insertColumns(sheet, at, count)),
			deleteColumns: (start: number, count = 1) => editSheet((sheet) => deleteColumns(sheet, start, count)),
			deleteSelectedRows: () =>
				editSheet((sheet, selection) => {
					const { top, bottom } = toRange(selection);
					return deleteRows(sheet, top, bottom - top + 1);
				}),
			deleteSelectedColumns: () =>
				editSheet((sheet, selection) => {
					const { left, right } = toRange(selection);
					return deleteColumns(sheet, left, right - left + 1);
				}),
			undo: () => moveHistory(undo),
			redo: () => moveHistory(redo),
			markSaved: () => {
				flushEdit();
				update((current) => ({ ...current, saved: current.history.present }));
			},
			_registerEditSession: (session: EditSession) => {
				sessionsRef.current.add(session);
				return () => {
					sessionsRef.current.delete(session);
				};
			},
		};
	}, [update, editSheet, flushEdit, pasteDelimiter]);

	const { hasHeader } = state;
	// Rebuild only when rows changes, so moving the selection does not copy every row
	const records = useMemo(() => (hasHeader ? present.rows.slice(1) : present.rows), [present.rows, hasHeader]);

	return useMemo(() => {
		const { rows, colIds, rowIds } = state.history.present;
		return {
			...methods,
			rows,
			columnIds: colIds,
			rowIds,
			rowCount: rows.length,
			columnCount: colIds.length,
			hasHeader: state.hasHeader,
			headers: state.hasHeader ? (rows[0] ?? null) : null,
			records,
			selection: state.selection,
			selectionRange: toRange(state.selection),
			canUndo: state.history.past.length > 0,
			canRedo: state.history.future.length > 0,
			isDirty: state.history.present !== state.saved,
		};
	}, [state, methods, records]);
}
