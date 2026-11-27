import {
	type ColumnDef,
	columnResizingFeature,
	columnSizingFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type ClipboardEvent,
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type CellPosition, collapsed, type Direction, isInRange, movePosition } from "../core/selection";
import type { CsvEditorInstance } from "./useCsvEditor";

type GridRow = readonly string[];

const noRows: GridRow[] = [];

const features = tableFeatures({ columnSizingFeature, columnResizingFeature });

export interface CsvEditorProps {
	editor: CsvEditorInstance;
	/** 表示領域の高さ。省略時は 400 */
	height?: number | string;
	className?: string;
	style?: CSSProperties;
	/** 省略時は 120 */
	defaultColumnWidth?: number;
	/** 省略時は 40 */
	minColumnWidth?: number;
	/** 1 行あたりの高さの見積もり。省略時は 28 */
	estimatedRowHeight?: number;
	/** 行番号の列の幅。省略時は 48 */
	rowHeaderWidth?: number;
	readOnly?: boolean;
	/** 列見出しの表示。省略時は A, B, ..., Z, AA, ... */
	columnLabel?: (index: number) => ReactNode;
}

type EditMode = "type" | "edit";

interface EditingCell extends CellPosition {
	/** "type" は文字の入力で始めた編集で、矢印キーで確定して移動する */
	mode: EditMode;
}

export function defaultColumnLabel(index: number): string {
	let label = "";
	let n = index + 1;
	while (n > 0) {
		const rest = (n - 1) % 26;
		label = String.fromCharCode(65 + rest) + label;
		n = Math.floor((n - 1) / 26);
	}
	return label;
}

const arrowDirections: Record<string, Direction> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

export function CsvEditor({
	editor,
	height = 400,
	className,
	style,
	defaultColumnWidth = 120,
	minColumnWidth = 40,
	estimatedRowHeight = 28,
	rowHeaderWidth = 48,
	readOnly = false,
	columnLabel = defaultColumnLabel,
}: CsvEditorProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const draggingRef = useRef<"cell" | "row" | "column" | null>(null);
	const editingRef = useRef<EditingCell | null>(null);
	const [editing, setEditingState] = useState<EditingCell | null>(null);
	const [bodyOffset, setBodyOffset] = useState(0);

	const { rows, columnIds, rowCount, columnCount, hasHeader, selection, selectionRange } = editor;
	const anchor = selection.anchor;
	const bodyStart = hasHeader ? 1 : 0;

	const columns = useMemo<ColumnDef<typeof features, GridRow>[]>(
		() =>
			columnIds.map((id) => ({
				id,
				size: defaultColumnWidth,
				minSize: minColumnWidth,
			})),
		[columnIds, defaultColumnWidth, minColumnWidth],
	);

	// 列幅の管理だけに使う。行モデルは作ると編集のたびに全行分の処理が走るので、行は rows から直接描画する
	const table = useTable({
		features,
		columns,
		data: noRows,
		columnResizeMode: "onChange",
	});

	const leafColumns = table.getAllLeafColumns();
	const widths = leafColumns.map((column) => column.getSize());
	const totalWidth = rowHeaderWidth + table.getTotalSize();

	const virtualizer = useVirtualizer({
		count: Math.max(0, rowCount - bodyStart),
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimatedRowHeight,
		overscan: 10,
		scrollMargin: bodyOffset,
		scrollPaddingStart: bodyOffset,
		initialRect: {
			width: 800,
			height: typeof height === "number" ? height : 400,
		},
	});

	const setEditing = useCallback((value: EditingCell | null) => {
		editingRef.current = value;
		setEditingState(value);
	}, []);

	const focusInput = useCallback(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

	const select = useCallback(
		(focus: CellPosition, anchorPos: CellPosition = focus) => editor.setSelection({ anchor: anchorPos, focus }),
		[editor],
	);

	const starts = widths.reduce<number[]>((acc, _width, i) => {
		acc.push(i === 0 ? 0 : (acc[i - 1] ?? 0) + (widths[i - 1] ?? 0));
		return acc;
	}, []);

	// キー操作で動かした先のセルが見えるようにスクロールする。ペーストなど他の操作では表示位置を動かさない
	const revealCell = (pos: CellPosition) => {
		if (pos.row >= bodyStart) virtualizer.scrollToIndex(pos.row - bodyStart, { align: "auto" });
		const scroller = scrollRef.current;
		if (!scroller) return;
		const left = starts[pos.col] ?? 0;
		const right = left + rowHeaderWidth + (widths[pos.col] ?? 0);
		if (left < scroller.scrollLeft) {
			scroller.scrollLeft = left;
		} else if (right > scroller.scrollLeft + scroller.clientWidth) {
			scroller.scrollLeft = right - scroller.clientWidth;
		}
	};
	const revealCellRef = useRef(revealCell);
	revealCellRef.current = revealCell;

	const moveActive = useCallback(
		(direction: Direction, options: { extend?: boolean; toEdge?: boolean } = {}) => {
			const { anchor: currentAnchor, focus } = editor.selection;
			if (options.extend) {
				const next = movePosition(focus, direction, rowCount, columnCount, options.toEdge);
				editor.setSelection({ anchor: currentAnchor, focus: next });
				revealCellRef.current(next);
			} else {
				const next = movePosition(currentAnchor, direction, rowCount, columnCount, options.toEdge);
				editor.setSelection(collapsed(next));
				revealCellRef.current(next);
			}
		},
		[editor, rowCount, columnCount],
	);

	const commitEdit = useCallback(
		(move?: Direction) => {
			const current = editingRef.current;
			const input = inputRef.current;
			if (!current || !input) return;
			const value = input.value;
			input.value = "";
			setEditing(null);
			if (!readOnly && value !== editor.getCell(current.row, current.col)) {
				editor.setCell(current.row, current.col, value);
			}
			if (move) moveActive(move);
		},
		[editor, readOnly, moveActive, setEditing],
	);

	const cancelEdit = useCallback(() => {
		if (inputRef.current) inputRef.current.value = "";
		setEditing(null);
	}, [setEditing]);

	const commitEditRef = useRef(commitEdit);
	commitEditRef.current = commitEdit;
	const { _registerEditSession } = editor;
	useEffect(
		() =>
			_registerEditSession({
				commit: () => commitEditRef.current(),
				cancel: () => {
					if (editingRef.current) cancelEdit();
				},
			}),
		[_registerEditSession, cancelEdit],
	);

	const startEdit = useCallback(
		(mode: EditMode, initialValue?: string) => {
			if (readOnly) return;
			const input = inputRef.current;
			if (!input) return;
			const { row, col } = editor.selection.anchor;
			if (initialValue !== undefined) {
				input.value = initialValue;
				input.setSelectionRange(initialValue.length, initialValue.length);
			}
			setEditing({ row, col, mode });
			focusInput();
		},
		[editor, readOnly, setEditing, focusInput],
	);

	const positionInput = useCallback(() => {
		const input = inputRef.current;
		const root = rootRef.current;
		if (!input || !root) return;
		const target = editingRef.current ?? editor.selection.anchor;
		const cell = root.querySelector<HTMLElement>(`[data-cell="${target.row}:${target.col}"]`);
		if (!cell) {
			// 仮想スクロールで描画されていないセルでもキー入力を受けられるよう、フォーカスは保ったまま画面外へ置く
			input.style.transform = "translate(-10000px, 0)";
			return;
		}
		const cellRect = cell.getBoundingClientRect();
		const rootRect = root.getBoundingClientRect();
		input.style.transform = "";
		input.style.left = `${cellRect.left - rootRect.left}px`;
		input.style.top = `${cellRect.top - rootRect.top}px`;
		input.style.width = `${cellRect.width}px`;
		input.style.height = `${cellRect.height}px`;
		if (editingRef.current) {
			input.style.height = "auto";
			input.style.height = `${Math.max(cellRect.height, input.scrollHeight)}px`;
		}
	}, [editor]);

	useLayoutEffect(() => {
		positionInput();
	});

	useLayoutEffect(() => {
		const offset = bodyRef.current?.offsetTop ?? 0;
		if (offset !== bodyOffset) setBodyOffset(offset);
	});

	useEffect(() => {
		const end = () => {
			draggingRef.current = null;
		};
		document.addEventListener("mouseup", end);
		return () => document.removeEventListener("mouseup", end);
	}, []);

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		// IME の変換中に押されたキー（変換確定の Enter など）は表の操作として扱わない
		if (event.nativeEvent.isComposing || event.keyCode === 229) return;
		const mod = event.metaKey || event.ctrlKey;
		const current = editingRef.current;

		if (current) {
			if (event.key === "Enter" && (event.altKey || event.shiftKey)) {
				event.preventDefault();
				const input = event.currentTarget;
				input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end");
				positionInput();
			} else if (event.key === "Enter") {
				event.preventDefault();
				commitEdit("down");
			} else if (event.key === "Tab") {
				event.preventDefault();
				commitEdit(event.shiftKey ? "left" : "right");
			} else if (event.key === "Escape") {
				event.preventDefault();
				cancelEdit();
			} else if (current.mode === "type" && arrowDirections[event.key] && !event.shiftKey && !mod) {
				event.preventDefault();
				commitEdit(arrowDirections[event.key]);
			}
			return;
		}

		const direction = arrowDirections[event.key];
		if (direction) {
			event.preventDefault();
			moveActive(direction, { extend: event.shiftKey, toEdge: mod });
			return;
		}
		switch (event.key) {
			case "Tab":
				// 端の列ではフォーカスを表の外へ移せるよう、ブラウザの既定の動作に任せる
				if (event.shiftKey ? anchor.col === 0 : anchor.col === columnCount - 1) return;
				event.preventDefault();
				moveActive(event.shiftKey ? "left" : "right");
				return;
			case "Enter":
			case "F2":
				event.preventDefault();
				startEdit("edit", editor.getCell(anchor.row, anchor.col));
				return;
			case "Delete":
			case "Backspace":
				event.preventDefault();
				if (!readOnly) editor.clearSelectedCells();
				return;
			case "Escape":
				select(editor.selection.anchor);
				return;
			case "Home":
				event.preventDefault();
				{
					const next = mod ? { row: 0, col: 0 } : { row: anchor.row, col: 0 };
					select(next);
					revealCell(next);
				}
				return;
			case "End":
				event.preventDefault();
				{
					const next = mod ? { row: rowCount - 1, col: columnCount - 1 } : { row: anchor.row, col: columnCount - 1 };
					select(next);
					revealCell(next);
				}
				return;
		}
		if (!mod) return;
		const key = event.key.toLowerCase();
		if (key === "z") {
			event.preventDefault();
			if (readOnly) return;
			if (event.shiftKey) editor.redo();
			else editor.undo();
		} else if (key === "y") {
			event.preventDefault();
			if (!readOnly) editor.redo();
		} else if (key === "a") {
			event.preventDefault();
			editor.setSelection({
				anchor: { row: 0, col: 0 },
				focus: { row: rowCount - 1, col: columnCount - 1 },
			});
		} else if (key === "c" || key === "x") {
			// copy イベントは選択文字列が無いと発火しないブラウザがあるため、選択範囲の TSV を textarea に入れて選択しておく
			const input = event.currentTarget;
			input.value = editor.getSelectedText();
			input.select();
		}
	};

	const handleInput = () => {
		if (!editingRef.current) startEdit("type");
		else positionInput();
	};

	const handleCompositionStart = () => {
		if (!editingRef.current) startEdit("type");
	};

	const handleCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		if (editingRef.current) return;
		event.preventDefault();
		event.clipboardData.setData("text/plain", editor.getSelectedText());
		event.currentTarget.value = "";
	};

	const handleCut = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		if (editingRef.current) return;
		handleCopy(event);
		if (!readOnly) editor.clearSelectedCells();
	};

	const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		if (editingRef.current) return;
		event.preventDefault();
		if (readOnly) return;
		const text = event.clipboardData.getData("text/plain");
		if (text !== "") editor.pasteText(text);
	};

	const handleBlur = () => {
		// ウィンドウ自体がフォーカスを失った時（別アプリへの切り替えなど）は編集を続ける
		if (editingRef.current && document.hasFocus()) commitEdit();
	};

	const handleCellMouseDown = (event: MouseEvent, row: number, col: number) => {
		if (event.button !== 0) return;
		event.preventDefault();
		if (editingRef.current) commitEdit();
		if (event.shiftKey) select({ row, col }, editor.selection.anchor);
		else select({ row, col });
		draggingRef.current = "cell";
		focusInput();
	};

	const handleCellMouseEnter = (row: number, col: number) => {
		const dragging = draggingRef.current;
		const { anchor: start } = editor.selection;
		if (dragging === "cell") select({ row, col }, start);
		else if (dragging === "row") select({ row, col: columnCount - 1 }, start);
		else if (dragging === "column") select({ row: rowCount - 1, col }, start);
	};

	const handleRowHeaderMouseDown = (event: MouseEvent, row: number) => {
		if (event.button !== 0) return;
		event.preventDefault();
		if (editingRef.current) commitEdit();
		const start = event.shiftKey ? { row: editor.selection.anchor.row, col: 0 } : { row, col: 0 };
		select({ row, col: columnCount - 1 }, start);
		draggingRef.current = "row";
		focusInput();
	};

	const handleColumnHeaderMouseDown = (event: MouseEvent, col: number) => {
		if (event.button !== 0) return;
		event.preventDefault();
		if (editingRef.current) commitEdit();
		const start = event.shiftKey ? { row: 0, col: editor.selection.anchor.col } : { row: 0, col };
		select({ row: rowCount - 1, col }, start);
		draggingRef.current = "column";
		focusInput();
	};

	const handleCornerMouseDown = (event: MouseEvent) => {
		event.preventDefault();
		if (editingRef.current) commitEdit();
		editor.setSelection({
			anchor: { row: 0, col: 0 },
			focus: { row: rowCount - 1, col: columnCount - 1 },
		});
		focusInput();
	};

	const renderRow = (row: GridRow, rowIndex: number, rowStyle: CSSProperties) => {
		const isHeader = hasHeader && rowIndex === 0;
		const rowSelected = rowIndex >= selectionRange.top && rowIndex <= selectionRange.bottom;
		return (
			<div
				key={rowIndex}
				role="row"
				aria-rowindex={rowIndex + 2}
				className={`tce-row${isHeader ? " tce-row--header" : ""}`}
				style={rowStyle}
				data-index={isHeader ? undefined : rowIndex - bodyStart}
				ref={isHeader ? undefined : virtualizer.measureElement}
			>
				<div
					role="rowheader"
					className={`tce-rowheader${rowSelected ? " tce-rowheader--selected" : ""}`}
					onMouseDown={(event) => handleRowHeaderMouseDown(event, rowIndex)}
					onMouseEnter={() => handleCellMouseEnter(rowIndex, columnCount - 1)}
				>
					{isHeader ? "H" : rowIndex - bodyStart + 1}
				</div>
				{leafColumns.map((column, col) => {
					const selected = isInRange(selectionRange, rowIndex, col);
					const active = anchor.row === rowIndex && anchor.col === col;
					return (
						<div
							key={column.id}
							role="gridcell"
							aria-selected={selected}
							data-cell={`${rowIndex}:${col}`}
							className={`tce-cell${selected ? " tce-cell--selected" : ""}${active ? " tce-cell--active" : ""}`}
							style={{ width: widths[col] }}
							onMouseDown={(event) => handleCellMouseDown(event, rowIndex, col)}
							onMouseEnter={() => handleCellMouseEnter(rowIndex, col)}
							onDoubleClick={() => startEdit("edit", editor.getCell(rowIndex, col))}
						>
							{row[col]}
						</div>
					);
				})}
			</div>
		);
	};

	const headerRow = hasHeader ? rows[0] : undefined;

	return (
		<div
			ref={rootRef}
			className={`tce-root${className ? ` ${className}` : ""}`}
			style={{
				height,
				...style,
				["--tce-rowheader-width" as string]: `${rowHeaderWidth}px`,
			}}
		>
			<div ref={scrollRef} className="tce-scroll" onScroll={positionInput}>
				<div
					role="grid"
					aria-rowcount={rowCount + 1}
					aria-colcount={columnCount + 1}
					aria-readonly={readOnly}
					className="tce-grid"
					style={{ width: totalWidth }}
				>
					<div role="row" className="tce-colheaders">
						<div role="columnheader" className="tce-corner" onMouseDown={handleCornerMouseDown} />
						{table.getHeaderGroups()[0]?.headers.map((header, col) => {
							const selected = col >= selectionRange.left && col <= selectionRange.right;
							const resize = header.getResizeHandler();
							return (
								<div
									key={header.id}
									role="columnheader"
									className={`tce-colheader${selected ? " tce-colheader--selected" : ""}`}
									style={{ width: widths[col] }}
									onMouseDown={(event) => handleColumnHeaderMouseDown(event, col)}
									onMouseEnter={() => handleCellMouseEnter(rowCount - 1, col)}
								>
									{columnLabel(col)}
									<div
										className={`tce-resizer${header.column.getIsResizing() ? " tce-resizer--active" : ""}`}
										onMouseDown={(event) => {
											// 表のキー操作を受ける textarea からフォーカスを外さない
											event.preventDefault();
											event.stopPropagation();
											resize(event);
										}}
										onTouchStart={(event) => {
											event.stopPropagation();
											resize(event);
										}}
										onDoubleClick={() => header.column.resetSize()}
									/>
								</div>
							);
						})}
					</div>
					{headerRow && renderRow(headerRow, 0, {})}
					<div ref={bodyRef} className="tce-body" style={{ height: virtualizer.getTotalSize() }}>
						{virtualizer.getVirtualItems().map((item) => {
							const rowIndex = item.index + bodyStart;
							const row = rows[rowIndex];
							if (!row) return null;
							return renderRow(row, rowIndex, {
								transform: `translateY(${item.start - bodyOffset}px)`,
							});
						})}
					</div>
				</div>
			</div>
			<textarea
				ref={inputRef}
				className={`tce-input${editing ? " tce-input--editing" : ""}`}
				aria-label="セルの値"
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				readOnly={readOnly && !editing}
				onKeyDown={handleKeyDown}
				onInput={handleInput}
				onCompositionStart={handleCompositionStart}
				onCopy={handleCopy}
				onCut={handleCut}
				onPaste={handlePaste}
				onBlur={handleBlur}
			/>
		</div>
	);
}
