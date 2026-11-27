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
	/** 初期表示する CSV 文字列 */
	initialCsv?: string;
	/** 1 行目をヘッダとして扱うか。省略時は false */
	initialHasHeader?: boolean;
	/** initialCsv の区切り文字。省略時は "," */
	initialDelimiter?: string;
	/** Undo できる最大回数。省略時は 100 */
	historyLimit?: number;
	/** ペーストした文字列の区切り方。省略時は "auto" */
	pasteDelimiter?: PasteDelimiter;
	/** 表の内容が変わるたびに呼ばれる */
	onChange?: (rows: readonly (readonly string[])[]) => void;
}

export interface LoadOptions {
	/** File / Blob を読む時の文字コード。省略時は "auto"（BOM か NUL の位置で UTF-16 を判定し、それ以外は UTF-8 として読めなければ Shift_JIS） */
	encoding?: InputEncoding;
	hasHeader?: boolean;
	/** 省略時は "," */
	delimiter?: string;
}

export interface LoadResult {
	encoding: DetectedEncoding;
	/** 読み込んだ CSV の書式の誤り。誤りがあっても読める範囲で読み込む */
	errors: CsvParseError[];
}

export type ExportCsvOptions = StringifyCsvOptions;

export interface ExportBlobOptions extends ExportCsvOptions {
	/** 省略時は "utf-8" */
	encoding?: OutputEncoding;
	/** encoding で表せない文字の扱い。省略時は "error" で、UnencodableCharacterError を投げる */
	unencodable?: UnencodableHandling;
}

/** @internal CsvEditor コンポーネントが編集中のセルを hook から確定・破棄できるよう登録する */
export interface EditSession {
	commit: () => void;
	cancel: () => void;
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

	/** 読み込みが終わる前に再び load を呼ぶと、後から呼んだ方の内容を表示する。編集中の値は破棄する */
	load: (input: string | Blob, options?: LoadOptions) => Promise<LoadResult>;
	exportCsv: (options?: ExportCsvOptions) => string;
	exportBlob: (options?: ExportBlobOptions) => Blob;
	/** encoding で表せない文字を含むセルを返す */
	findUnencodableCells: (encoding: OutputEncoding) => CellPositionWithChars[];

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

	/** @internal 登録を解除する関数を返す */
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
	// メソッドが常に最新の状態を同期的に読めるよう ref にも持つ
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

	// 編集中の値を先に確定してから表を変えないと、確定した値が変更後の表の同じ座標に書き込まれる
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
	// 選択を動かすたびに全行をコピーしないよう、rows が変わった時だけ作り直す
	const records = useMemo(() => (hasHeader ? present.rows.slice(1) : present.rows), [present.rows, hasHeader]);

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
			records,
			selection: state.selection,
			selectionRange: toRange(state.selection),
			canUndo: state.history.past.length > 0,
			canRedo: state.history.future.length > 0,
			isDirty: state.history.present !== state.saved,
		};
	}, [state, methods, records]);
}
