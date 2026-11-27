export interface CellPosition {
	row: number;
	col: number;
}

/** anchor は範囲選択の起点、focus は Shift やドラッグで動く側の角 */
export interface Selection {
	anchor: CellPosition;
	focus: CellPosition;
}

export interface CellRange {
	top: number;
	left: number;
	bottom: number;
	right: number;
}

export type Direction = "up" | "down" | "left" | "right";

export function toRange(selection: Selection): CellRange {
	const { anchor, focus } = selection;
	return {
		top: Math.min(anchor.row, focus.row),
		left: Math.min(anchor.col, focus.col),
		bottom: Math.max(anchor.row, focus.row),
		right: Math.max(anchor.col, focus.col),
	};
}

export function isInRange(range: CellRange, row: number, col: number): boolean {
	return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
}

export function clampPosition(pos: CellPosition, rowCount: number, colCount: number): CellPosition {
	return {
		row: Math.max(0, Math.min(pos.row, rowCount - 1)),
		col: Math.max(0, Math.min(pos.col, colCount - 1)),
	};
}

export function clampSelection(selection: Selection, rowCount: number, colCount: number): Selection {
	return {
		anchor: clampPosition(selection.anchor, rowCount, colCount),
		focus: clampPosition(selection.focus, rowCount, colCount),
	};
}

export function movePosition(
	pos: CellPosition,
	direction: Direction,
	rowCount: number,
	colCount: number,
	toEdge = false,
): CellPosition {
	const next = { ...pos };
	switch (direction) {
		case "up":
			next.row = toEdge ? 0 : pos.row - 1;
			break;
		case "down":
			next.row = toEdge ? rowCount - 1 : pos.row + 1;
			break;
		case "left":
			next.col = toEdge ? 0 : pos.col - 1;
			break;
		case "right":
			next.col = toEdge ? colCount - 1 : pos.col + 1;
			break;
	}
	return clampPosition(next, rowCount, colCount);
}

export function collapsed(pos: CellPosition): Selection {
	return { anchor: pos, focus: pos };
}
