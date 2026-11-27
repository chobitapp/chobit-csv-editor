import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PasteDelimiter, parseClipboardText, toTsv } from "../core/clipboard";
import { parseCsv, type StringifyCsvOptions, stringifyCsv } from "../core/csv";
import {
	type DetectedEncoding,
	encodeText,
	type InputEncoding,
	type OutputEncoding,
	readTextInput,
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
	/** 初期表示する CSV 文字列 */
	initialCsv?: string;
	/** 1 行目をヘッダとして扱うか。省略時は false */
	initialHasHeader?: boolean;
	/** Undo できる最大回数。省略時は 100 */
	historyLimit?: number;
	/** ペーストした文字列の区切り方。省略時は "auto" */
	pasteDelimiter?: PasteDelimiter;
	/** 表の内容が変わるたびに呼ばれる */
	onChange?: (rows: readonly (readonly string[])[]) => void;
}

export interface LoadOptions {
	/** File / Blob を読む時の文字コード。省略時は "auto"（UTF-8 として読めなければ Shift_JIS） */
	encoding?: InputEncoding;
	hasHeader?: boolean;
}

export type ExportCsvOptions = StringifyCsvOptions;

export interface ExportBlobOptions extends ExportCsvOptions {
	/** 省略時は "utf-8" */
	encoding?: OutputEncoding;
}

export interface CsvEditorInstance {
	readonly rows: readonly (readonly string[])[];
	readonly columnIds: readonly string[];
	readonly rowCount: number;
	readonly columnCount: number;
	readonly hasHeader: boolean;
	setHasHeader: (value: boolean) => void;
	/** hasHeader が true の時の 1 行目。false なら null */
	readonly headers: readonly string[] | null;
	/** ヘッダ行を除いたデータ行 */
	readonly records: readonly (readonly string[])[];

	readonly selection: Selection;
	readonly selectionRange: CellRange;
	setSelection: (selection: Selection) => void;

	load: (input: string | Blob, options?: LoadOptions) => Promise<{ encoding: DetectedEncoding }>;
	exportCsv: (options?: ExportCsvOptions) => string;
	exportBlob: (options?: ExportBlobOptions) => Blob;

	getCell: (row: number, col: number) => string;
	setCell: (row: number, col: number, value: string) => void;
	/** 選択範囲の左上を起点にクリップボードの文字列を貼り付ける */
	pasteText: (text: string) => void;
	/** 選択範囲を TSV 文字列にする */
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

	/** 最後に load / markSaved した時点から内容が変わっているか */
	readonly isDirty: boolean;
	markSaved: () => void;

	/** @internal CsvEditor コンポーネントが編集中セルの確定処理を登録する */
	readonly _registerEditCommitter: (committer: (() => void) | null) => void;
}

interface EditorState {
	history: HistoryState<Sheet>;
	saved: Sheet;
	selection: Selection;
	hasHeader: boolean;
}

const origin = collapsed({ row: 0, col: 0 });

function initialState(csv: string | undefined, hasHeader: boolean): EditorState {
	const sheet = createSheet(parseCsv(csv ?? ""));
	return {
		history: createHistory(sheet),
		saved: sheet,
		selection: origin,
		hasHeader,
	};
}

export function useCsvEditor(options: UseCsvEditorOptions = {}): CsvEditorInstance {
	const { historyLimit = 100, pasteDelimiter = "auto" } = options;
	const [state, setState] = useState(() => initialState(options.initialCsv, options.initialHasHeader ?? false));
	// メソッドが常に最新の状態を同期的に読めるよう ref にも持つ
	const stateRef = useRef(state);
	const committerRef = useRef<(() => void) | null>(null);
	const onChangeRef = useRef(options.onChange);
	onChangeRef.current = options.onChange;

	const update = useCallback((fn: (current: EditorState) => EditorState) => {
		const next = fn(stateRef.current);
		if (next === stateRef.current) return;
		stateRef.current = next;
		setState(next);
	}, []);

	const editSheet = useCallback(
		(fn: (sheet: Sheet, selection: Selection) => Sheet | { sheet: Sheet; selection: Selection }) => {
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
		[update, historyLimit],
	);

	const flushEdit = useCallback(() => committerRef.current?.(), []);

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
		const moveHistory = (fn: typeof undo) =>
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
				const { text, encoding } = await readTextInput(input, opts.encoding);
				const sheet = createSheet(parseCsv(text));
				update((current) => ({
					history: createHistory(sheet),
					saved: sheet,
					selection: origin,
					hasHeader: opts.hasHeader ?? current.hasHeader,
				}));
				return { encoding };
			},
			exportCsv,
			exportBlob: (opts: ExportBlobOptions = {}) => {
				const encoding = opts.encoding ?? "utf-8";
				const charset = encoding === "shift_jis" ? "shift_jis" : "utf-8";
				return new Blob([encodeText(exportCsv(opts), encoding)], {
					type: `text/csv;charset=${charset}`,
				});
			},
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
			_registerEditCommitter: (committer: (() => void) | null) => {
				committerRef.current = committer;
			},
		};
	}, [update, editSheet, flushEdit, pasteDelimiter]);

	return useMemo(() => {
		const { rows, colIds } = state.history.present;
		return {
			...methods,
			rows,
			columnIds: colIds,
			rowCount: rows.length,
			columnCount: colIds.length,
			hasHeader: state.hasHeader,
			headers: state.hasHeader ? (rows[0] ?? null) : null,
			records: state.hasHeader ? rows.slice(1) : rows,
			selection: state.selection,
			selectionRange: toRange(state.selection),
			canUndo: state.history.past.length > 0,
			canRedo: state.history.future.length > 0,
			isDirty: state.history.present !== state.saved,
		};
	}, [state, methods]);
}
