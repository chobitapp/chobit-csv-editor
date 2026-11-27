import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CellRange } from "../core/selection";
import { type CsvEditorLocale, messages } from "./locale";
import type { CsvEditorInstance } from "./useCsvEditor";

export type ContextMenuTarget = "cell" | "row" | "column";

export interface ContextMenuContext {
	/** Where the right-click happened. "row" is a row number and "column" is a column header */
	target: ContextMenuTarget;
	/** Position of the right-clicked cell, row, or column. col is 0 for a row number, and row is 0 for a column header */
	row: number;
	col: number;
	/** The selection after the right-click */
	range: CellRange;
	clientX: number;
	clientY: number;
	editor: CsvEditorInstance;
	/** Language of the menu labels */
	locale: CsvEditorLocale;
}

export type ContextMenuItem =
	| {
			id: string;
			label: string;
			disabled?: boolean;
			onSelect: (context: ContextMenuContext) => void;
	  }
	| { type: "separator" };

export type ContextMenuOption =
	| boolean
	| ((context: ContextMenuContext, defaultItems: ContextMenuItem[]) => ContextMenuItem[]);

export function defaultContextMenuItems(context: ContextMenuContext): ContextMenuItem[] {
	const { target, range, editor } = context;
	const m = messages[context.locale];
	const rowCount = range.bottom - range.top + 1;
	const colCount = range.right - range.left + 1;
	const rowItems: ContextMenuItem[] = [
		{
			id: "insert-row-above",
			label: m.insertRowAbove,
			// Do not insert above the header row
			disabled: editor.hasHeader && range.top === 0,
			onSelect: () => editor.insertRows(range.top),
		},
		{
			id: "insert-row-below",
			label: m.insertRowBelow,
			onSelect: () => editor.insertRows(range.bottom + 1),
		},
		{
			id: "delete-rows",
			label: m.deleteRows(rowCount),
			onSelect: () => editor.deleteRows(range.top, rowCount),
		},
	];
	const columnItems: ContextMenuItem[] = [
		{
			id: "insert-column-left",
			label: m.insertColumnLeft,
			onSelect: () => editor.insertColumns(range.left),
		},
		{
			id: "insert-column-right",
			label: m.insertColumnRight,
			onSelect: () => editor.insertColumns(range.right + 1),
		},
		{
			id: "delete-columns",
			label: m.deleteColumns(colCount),
			onSelect: () => editor.deleteColumns(range.left, colCount),
		},
	];
	if (target === "row") return rowItems;
	if (target === "column") return columnItems;
	return [...rowItems, { type: "separator" }, ...columnItems];
}

interface ContextMenuProps {
	items: ContextMenuItem[];
	context: ContextMenuContext;
	onClose: () => void;
}

export function ContextMenu({ items, context, onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ x: context.clientX, y: context.clientY });
	const enabledIndexes = items.flatMap((item, i) => ("type" in item || item.disabled ? [] : [i]));
	const [active, setActive] = useState<number | undefined>(enabledIndexes[0]);

	// Once the menu size is known, adjust its position so it is not cut off at the edge of the screen
	useLayoutEffect(() => {
		const menu = menuRef.current;
		if (!menu) return;
		const { width, height } = menu.getBoundingClientRect();
		setPosition({
			x: Math.max(0, Math.min(context.clientX, window.innerWidth - width)),
			y: Math.max(0, Math.min(context.clientY, window.innerHeight - height)),
		});
		menu.focus({ preventScroll: true });
	}, [context.clientX, context.clientY]);

	useEffect(() => {
		const outside = (event: Event) => {
			if (!menuRef.current?.contains(event.target as Node)) onClose();
		};
		document.addEventListener("mousedown", outside, true);
		document.addEventListener("contextmenu", outside, true);
		window.addEventListener("blur", onClose);
		window.addEventListener("resize", onClose);
		document.addEventListener("scroll", onClose, true);
		return () => {
			document.removeEventListener("mousedown", outside, true);
			document.removeEventListener("contextmenu", outside, true);
			window.removeEventListener("blur", onClose);
			window.removeEventListener("resize", onClose);
			document.removeEventListener("scroll", onClose, true);
		};
	}, [onClose]);

	const choose = (index: number) => {
		const item = items[index];
		if (!item || "type" in item || item.disabled) return;
		onClose();
		item.onSelect(context);
	};

	const move = (step: 1 | -1) => {
		if (enabledIndexes.length === 0) return;
		const current = active === undefined ? -1 : enabledIndexes.indexOf(active);
		const next = (current + step + enabledIndexes.length) % enabledIndexes.length;
		setActive(enabledIndexes[next]);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		switch (event.key) {
			case "ArrowDown":
				move(1);
				break;
			case "ArrowUp":
				move(-1);
				break;
			case "Home":
				setActive(enabledIndexes[0]);
				break;
			case "End":
				setActive(enabledIndexes[enabledIndexes.length - 1]);
				break;
			case "Enter":
			case " ":
				if (active !== undefined) choose(active);
				break;
			case "Escape":
			case "Tab":
				onClose();
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	return (
		<div
			ref={menuRef}
			role="menu"
			tabIndex={-1}
			className="tce-menu"
			style={{ left: position.x, top: position.y }}
			onKeyDown={handleKeyDown}
			onContextMenu={(event) => event.preventDefault()}
		>
			{items.map((item, i) =>
				"type" in item ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: separators have no ID
					<hr key={`separator-${i}`} className="tce-menu-separator" />
				) : (
					// biome-ignore lint/a11y/useFocusableInteractive lint/a11y/useKeyWithClickEvents: focus and keyboard input are handled by the menu as a whole
					<div
						key={item.id}
						role="menuitem"
						aria-disabled={item.disabled || undefined}
						className={`tce-menu-item${active === i ? " tce-menu-item--active" : ""}${item.disabled ? " tce-menu-item--disabled" : ""}`}
						onMouseEnter={() => !item.disabled && setActive(i)}
						onClick={() => choose(i)}
					>
						{item.label}
					</div>
				),
			)}
		</div>
	);
}
