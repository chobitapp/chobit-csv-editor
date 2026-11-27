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
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type CellPosition,
	collapsed,
	type Direction,
	isInRange,
	movePosition,
	type Selection,
	toRange,
} from "../core/selection";
import {
	ContextMenu,
	type ContextMenuContext,
	type ContextMenuItem,
	type ContextMenuOption,
	defaultContextMenuItems,
} from "./ContextMenu";
import type { CsvEditorInstance } from "./useCsvEditor";

type GridRow = readonly string[];

const noRows: GridRow[] = [];

const features = tableFeatures({ columnSizingFeature, columnResizingFeature });

export interface CsvEditorProps {
	editor: CsvEditorInstance;
	/** Height of the viewport. Defaults to 400 */
	height?: number | string;
	className?: string;
	style?: CSSProperties;
	/** Defaults to 120 */
	defaultColumnWidth?: number;
	/** Defaults to 40 */
	minColumnWidth?: number;
	/** Estimated height of each row. Defaults to 28 */
	estimatedRowHeight?: number;
	/** Minimum row height when resizing a row by dragging. Defaults to 20 */
	minRowHeight?: number;
	/**
	 * Width of the row number column in pixels. By default the column fits the largest row number in the current font
	 * (at least 48px), so it widens as rows are added, e.g. for 100,000 rows
	 */
	rowHeaderWidth?: number;
	readOnly?: boolean;
	/** Column header labels. Defaults to A, B, ..., Z, AA, ... */
	columnLabel?: (index: number) => ReactNode;
	/**
	 * The right-click menu. Defaults to true, which shows row and column insert and delete items. false disables it.
	 * Pass a function to receive the default items and return the items to show. Not shown when readOnly
	 */
	contextMenu?: ContextMenuOption;
	/** Called when a cell, row number, or column header is right-clicked. Calling preventDefault() suppresses the menu */
	onContextMenu?: (context: ContextMenuContext, event: MouseEvent) => void;
}

type EditMode = "type" | "edit";

interface EditingCell extends CellPosition {
	/** "type" is editing started by typing a character; arrow keys commit and move */
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
	minRowHeight = 20,
	rowHeaderWidth,
	readOnly = false,
	columnLabel = defaultColumnLabel,
	contextMenu = true,
	onContextMenu,
}: CsvEditorProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const cornerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const draggingRef = useRef<"cell" | "row" | "column" | null>(null);
	const editingRef = useRef<EditingCell | null>(null);
	const [editing, setEditingState] = useState<EditingCell | null>(null);
	const [bodyOffset, setBodyOffset] = useState(0);
	// Height per row ID. Rows without an entry are sized to fit their content
	const [rowHeights, setRowHeights] = useState<Readonly<Record<string, number>>>({});
	const [resizingRowId, setResizingRowId] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ context: ContextMenuContext; items: ContextMenuItem[] } | null>(null);

	const { rows, columnIds, rowIds, rowCount, columnCount, hasHeader, selection, selectionRange } = editor;
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

	// Used only to manage column widths. Building a row model would process every row on each edit, so rows are rendered directly from rows
	const table = useTable({
		features,
		columns,
		data: noRows,
		columnResizeMode: "onChange",
	});

	const leafColumns = table.getAllLeafColumns();
	const widths = leafColumns.map((column) => column.getSize());
	// Without an explicit width, size the row number column in CSS: `ch` is the width of a digit in the actual font,
	// so it fits even when the font or font size is customized. 20px covers the default padding and border
	const bodyRowCount = Math.max(1, rowCount - bodyStart);
	const rowHeaderWidthCss =
		rowHeaderWidth === undefined ? `max(48px, calc(${String(bodyRowCount).length}ch + 20px))` : `${rowHeaderWidth}px`;
	const totalWidth = `calc(var(--tce-rowheader-width) + ${table.getTotalSize()}px)`;

	const virtualizer = useVirtualizer({
		count: Math.max(0, rowCount - bodyStart),
		getScrollElement: () => scrollRef.current,
		getItemKey: (index) => rowIds[index + bodyStart] ?? index,
		estimateSize: (index) => rowHeights[rowIds[index + bodyStart] ?? ""] ?? estimatedRowHeight,
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

	// Scroll the cell moved to by the keyboard into view. Other actions such as paste do not move the scroll position
	const revealCell = (pos: CellPosition) => {
		if (pos.row >= bodyStart) virtualizer.scrollToIndex(pos.row - bodyStart, { align: "auto" });
		const scroller = scrollRef.current;
		if (!scroller) return;
		const left = starts[pos.col] ?? 0;
		// The row number column's width may come from CSS, so read the rendered width
		const right = left + (cornerRef.current?.offsetWidth ?? rowHeaderWidth ?? 48) + (widths[pos.col] ?? 0);
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
			// Keep focus but move it off-screen so key input still works for cells not rendered by virtual scrolling
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
		// Keys pressed during IME composition (such as Enter to confirm a conversion) are not treated as table commands
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
				// In the edge column, leave it to the browser default so focus can move out of the table
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
			// Some browsers do not fire the copy event without selected text, so put the selection's TSV in the textarea and select it
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
		// Keep editing when the window itself loses focus (for example, switching to another app)
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

	const closeMenu = useCallback(() => {
		setMenu(null);
		focusInput();
	}, [focusInput]);

	const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
		const element = event.target as HTMLElement;
		const cell = element.closest<HTMLElement>("[data-cell]");
		const rowHeader = element.closest<HTMLElement>("[data-rowheader]");
		const colHeader = element.closest<HTMLElement>("[data-colheader]");
		let target: ContextMenuContext["target"];
		let row = 0;
		let col = 0;
		if (cell) {
			target = "cell";
			[row, col] = (cell.dataset.cell ?? "").split(":").map(Number) as [number, number];
		} else if (rowHeader) {
			target = "row";
			row = Number(rowHeader.dataset.rowheader);
		} else if (colHeader) {
			target = "column";
			col = Number(colHeader.dataset.colheader);
		} else {
			return;
		}

		if (editingRef.current) commitEdit();
		const current = toRange(editor.selection);
		let next: Selection | null = null;
		if (target === "cell" && !isInRange(current, row, col)) {
			next = collapsed({ row, col });
		} else if (target === "row" && (row < current.top || row > current.bottom)) {
			next = { anchor: { row, col: 0 }, focus: { row, col: columnCount - 1 } };
		} else if (target === "column" && (col < current.left || col > current.right)) {
			next = { anchor: { row: 0, col }, focus: { row: rowCount - 1, col } };
		}
		if (next) editor.setSelection(next);
		// A row number is treated as a range spanning all columns, and a column header as one spanning all rows
		const base = next ? toRange(next) : current;
		const range =
			target === "row"
				? { ...base, left: 0, right: columnCount - 1 }
				: target === "column"
					? { ...base, top: 0, bottom: rowCount - 1 }
					: base;

		const context: ContextMenuContext = {
			target,
			row,
			col,
			range,
			clientX: event.clientX,
			clientY: event.clientY,
			editor,
		};
		onContextMenu?.(context, event);
		if (event.defaultPrevented) return;
		if (!contextMenu || readOnly) {
			setMenu(null);
			return;
		}
		event.preventDefault();
		const defaults = defaultContextMenuItems(context);
		const items = typeof contextMenu === "function" ? contextMenu(context, defaults) : defaults;
		setMenu(items.length > 0 ? { context, items } : null);
	};

	const handleRowResizeStart = (event: PointerEvent<HTMLDivElement>, rowId: string) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		const rowElement = event.currentTarget.closest<HTMLElement>(".tce-row");
		const startHeight = rowElement?.getBoundingClientRect().height ?? estimatedRowHeight;
		const startY = event.clientY;
		setResizingRowId(rowId);
		const move = (moveEvent: globalThis.PointerEvent) => {
			const next = Math.max(minRowHeight, Math.round(startHeight + moveEvent.clientY - startY));
			setRowHeights((current) => (current[rowId] === next ? current : { ...current, [rowId]: next }));
		};
		const end = () => {
			setResizingRowId(null);
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", end);
			document.removeEventListener("pointercancel", end);
		};
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", end);
		document.addEventListener("pointercancel", end);
	};

	const resetRowHeight = (rowId: string) => {
		setRowHeights((current) => {
			if (!(rowId in current)) return current;
			const { [rowId]: _removed, ...rest } = current;
			return rest;
		});
	};

	const renderRow = (row: GridRow, rowIndex: number, rowStyle: CSSProperties) => {
		const isHeader = hasHeader && rowIndex === 0;
		const rowSelected = rowIndex >= selectionRange.top && rowIndex <= selectionRange.bottom;
		const rowId = rowIds[rowIndex] ?? "";
		const rowHeight = rowHeights[rowId];
		return (
			<div
				key={rowId}
				role="row"
				aria-rowindex={rowIndex + 2}
				className={`tce-row${isHeader ? " tce-row--header" : ""}${rowHeight === undefined ? "" : " tce-row--sized"}`}
				style={rowHeight === undefined ? rowStyle : { ...rowStyle, height: rowHeight }}
				data-index={isHeader ? undefined : rowIndex - bodyStart}
				ref={isHeader ? undefined : virtualizer.measureElement}
			>
				<div
					role="rowheader"
					data-rowheader={rowIndex}
					className={`tce-rowheader${rowSelected ? " tce-rowheader--selected" : ""}`}
					onMouseDown={(event) => handleRowHeaderMouseDown(event, rowIndex)}
					onMouseEnter={() => handleCellMouseEnter(rowIndex, columnCount - 1)}
				>
					{isHeader ? "H" : rowIndex - bodyStart + 1}
					<div
						className={`tce-row-resizer${resizingRowId === rowId ? " tce-row-resizer--active" : ""}`}
						onPointerDown={(event) => handleRowResizeStart(event, rowId)}
						onMouseDown={(event) => {
							// Do not start a row selection, and keep focus on the textarea that receives table keyboard input
							event.preventDefault();
							event.stopPropagation();
						}}
						onDoubleClick={() => resetRowHeight(rowId)}
					/>
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
				["--tce-rowheader-width" as string]: rowHeaderWidthCss,
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
					onContextMenu={handleContextMenu}
				>
					<div role="row" className="tce-colheaders">
						<div ref={cornerRef} role="columnheader" className="tce-corner" onMouseDown={handleCornerMouseDown} />
						{table.getHeaderGroups()[0]?.headers.map((header, col) => {
							const selected = col >= selectionRange.left && col <= selectionRange.right;
							const resize = header.getResizeHandler();
							return (
								<div
									key={header.id}
									role="columnheader"
									data-colheader={col}
									className={`tce-colheader${selected ? " tce-colheader--selected" : ""}`}
									style={{ width: widths[col] }}
									onMouseDown={(event) => handleColumnHeaderMouseDown(event, col)}
									onMouseEnter={() => handleCellMouseEnter(rowCount - 1, col)}
								>
									{columnLabel(col)}
									<div
										className={`tce-resizer${header.column.getIsResizing() ? " tce-resizer--active" : ""}`}
										onMouseDown={(event) => {
											// Keep focus on the textarea that receives table keyboard input
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
				aria-label="Cell value"
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
			{menu && <ContextMenu items={menu.items} context={menu.context} onClose={closeMenu} />}
		</div>
	);
}
