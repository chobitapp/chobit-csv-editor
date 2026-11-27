import type { CellRange } from "./selection";

/**
 * 編集対象の表。rows の各行は常に colIds と同じ長さに揃える。
 * colIds・rowIds は挿入・削除をまたいで列幅や行の高さを列・行に紐付けておくための安定 ID。
 * rowIds は常に rows と同じ長さに揃える。
 */
export interface Sheet {
	readonly rows: readonly (readonly string[])[];
	readonly colIds: readonly string[];
	readonly rowIds: readonly string[];
}

let columnSeq = 0;
const newColumnId = () => `col_${++columnSeq}`;
let rowSeq = 0;
const newRowId = () => `row_${++rowSeq}`;

export function createSheet(rows: readonly (readonly string[])[]): Sheet {
	const width = maxLength(rows);
	const normalized = rows.length > 0 ? rows.map((row) => padRow(row, width)) : [padRow([], width)];
	return {
		rows: normalized,
		colIds: Array.from({ length: width }, newColumnId),
		rowIds: Array.from({ length: normalized.length }, newRowId),
	};
}

// Math.max(...rows) は行数が多いと引数の数の上限を超えて RangeError になる
function maxLength(rows: readonly (readonly unknown[])[]): number {
	let max = 1;
	for (const row of rows) if (row.length > max) max = row.length;
	return max;
}

function padRow(row: readonly string[], width: number): readonly string[] {
	if (row.length === width) return row;
	const next = row.slice(0, width);
	while (next.length < width) next.push("");
	return next;
}

export function setCell(sheet: Sheet, row: number, col: number, value: string): Sheet {
	const current = sheet.rows[row];
	if (current === undefined || col < 0 || col >= sheet.colIds.length || current[col] === value) return sheet;
	const nextRow = current.slice();
	nextRow[col] = value;
	const rows = sheet.rows.slice();
	rows[row] = nextRow;
	return { ...sheet, rows };
}

export function getRange(sheet: Sheet, range: CellRange): string[][] {
	return sheet.rows.slice(range.top, range.bottom + 1).map((row) => row.slice(range.left, range.right + 1));
}

export function clearRange(sheet: Sheet, range: CellRange): Sheet {
	let changed = false;
	const rows = sheet.rows.map((row, r) => {
		if (r < range.top || r > range.bottom) return row;
		if (row.slice(range.left, range.right + 1).every((value) => value === "")) return row;
		changed = true;
		return row.map((value, c) => (c >= range.left && c <= range.right ? "" : value));
	});
	return changed ? { ...sheet, rows } : sheet;
}

/**
 * values を (row, col) を左上として書き込む。表からはみ出す分は行・列を追加する。
 * values が 1 セルで fillRange が複数セルなら、その範囲を同じ値で埋める。
 */
export function pasteValues(
	sheet: Sheet,
	row: number,
	col: number,
	values: readonly (readonly string[])[],
	fillRange?: CellRange,
): { sheet: Sheet; range: CellRange } {
	const single = values.length === 1 && values[0]?.length === 1;
	if (single && fillRange && (fillRange.bottom > fillRange.top || fillRange.right > fillRange.left)) {
		const value = values[0]?.[0] ?? "";
		const height = fillRange.bottom - fillRange.top + 1;
		const width = fillRange.right - fillRange.left + 1;
		const filled = Array.from({ length: height }, () => Array.from({ length: width }, () => value));
		return pasteValues(sheet, fillRange.top, fillRange.left, filled);
	}

	const height = values.length;
	const width = maxLength(values);
	let next = sheet;
	if (col + width > next.colIds.length) {
		next = insertColumns(next, next.colIds.length, col + width - next.colIds.length);
	}
	if (row + height > next.rows.length) {
		next = insertRows(next, next.rows.length, row + height - next.rows.length);
	}
	const rows = next.rows.slice();
	values.forEach((line, i) => {
		const target = rows[row + i];
		if (target === undefined) return;
		const updated = target.slice();
		line.forEach((value, j) => {
			updated[col + j] = value;
		});
		rows[row + i] = updated;
	});
	return {
		sheet: { ...next, rows },
		range: {
			top: row,
			left: col,
			bottom: row + height - 1,
			right: col + width - 1,
		},
	};
}

export function insertRows(sheet: Sheet, at: number, count = 1): Sheet {
	if (count <= 0) return sheet;
	const blank = () => Array.from({ length: sheet.colIds.length }, () => "");
	const index = Math.max(0, Math.min(at, sheet.rows.length));
	const rows = [...sheet.rows.slice(0, index), ...Array.from({ length: count }, blank), ...sheet.rows.slice(index)];
	const rowIds = [
		...sheet.rowIds.slice(0, index),
		...Array.from({ length: count }, newRowId),
		...sheet.rowIds.slice(index),
	];
	return { ...sheet, rows, rowIds };
}

/** 最後の 1 行は消さずに空にする（編集できる場所を残すため） */
export function deleteRows(sheet: Sheet, start: number, count = 1): Sheet {
	if (count <= 0 || start >= sheet.rows.length) return sheet;
	const rows = sheet.rows.slice();
	const rowIds = sheet.rowIds.slice();
	rows.splice(start, count);
	rowIds.splice(start, count);
	if (rows.length === 0) {
		rows.push(Array.from({ length: sheet.colIds.length }, () => ""));
		rowIds.push(newRowId());
	}
	return { ...sheet, rows, rowIds };
}

export function insertColumns(sheet: Sheet, at: number, count = 1): Sheet {
	if (count <= 0) return sheet;
	const index = Math.max(0, Math.min(at, sheet.colIds.length));
	const colIds = [
		...sheet.colIds.slice(0, index),
		...Array.from({ length: count }, newColumnId),
		...sheet.colIds.slice(index),
	];
	const blanks = Array.from({ length: count }, () => "");
	const rows = sheet.rows.map((row) => [...row.slice(0, index), ...blanks, ...row.slice(index)]);
	return { ...sheet, rows, colIds };
}

/** 最後の 1 列は消さずに空にする（編集できる場所を残すため） */
export function deleteColumns(sheet: Sheet, start: number, count = 1): Sheet {
	if (count <= 0 || start >= sheet.colIds.length) return sheet;
	if (count >= sheet.colIds.length && start === 0) {
		return { ...sheet, rows: sheet.rows.map(() => [""]), colIds: [newColumnId()] };
	}
	const colIds = sheet.colIds.slice();
	colIds.splice(start, count);
	const rows = sheet.rows.map((row) => {
		const next = row.slice();
		next.splice(start, count);
		return next;
	});
	return { ...sheet, rows, colIds };
}
