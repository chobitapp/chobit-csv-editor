import { createSheet, deleteColumns, deleteRows, insertColumns, insertRows, pasteValues } from "./sheet";

describe("createSheet", () => {
	it("pads ragged rows with empty strings up to the widest row", () => {
		expect(createSheet([["a"], ["b", "c", "d"]]).rows).toEqual([
			["a", "", ""],
			["b", "c", "d"],
		]);
	});
});

describe("pasteValues", () => {
	it("adds rows and columns for values that extend past the table", () => {
		const sheet = createSheet([["a", "b"]]);
		const result = pasteValues(sheet, 0, 1, [
			["1", "2"],
			["3", "4"],
		]);
		expect(result.sheet.rows).toEqual([
			["a", "1", "2"],
			["", "3", "4"],
		]);
		expect(result.sheet.colIds).toHaveLength(3);
		expect(result.range).toEqual({ top: 0, left: 1, bottom: 1, right: 2 });
	});

	it("fills the range when a single value is pasted into a multi-cell selection", () => {
		const sheet = createSheet([
			["a", "b"],
			["c", "d"],
		]);
		const result = pasteValues(sheet, 0, 0, [["x"]], { top: 0, left: 0, bottom: 1, right: 0 });
		expect(result.sheet.rows).toEqual([
			["x", "b"],
			["x", "d"],
		]);
	});
});

describe("deleting rows and columns", () => {
	it("keeps one empty row when all rows are deleted", () => {
		expect(deleteRows(createSheet([["a", "b"]]), 0, 1).rows).toEqual([["", ""]]);
	});

	it("keeps the IDs of the remaining columns when a column is deleted", () => {
		const sheet = insertColumns(createSheet([["a", "b"]]), 2);
		const [, second, third] = sheet.colIds;
		expect(deleteColumns(sheet, 0, 1).colIds).toEqual([second, third]);
	});

	it("keeps the IDs of the remaining rows when rows are inserted or deleted, and column operations do not change row IDs", () => {
		const sheet = createSheet([["a"], ["b"]]);
		const [first, second] = sheet.rowIds;
		const inserted = insertRows(sheet, 1);
		expect(inserted.rowIds).toHaveLength(3);
		expect(inserted.rowIds[0]).toBe(first);
		expect(inserted.rowIds[2]).toBe(second);
		expect(deleteRows(inserted, 0, 2).rowIds).toEqual([second]);
		expect(deleteColumns(insertColumns(sheet, 0), 0, 2).rowIds).toEqual(sheet.rowIds);
	});
});
