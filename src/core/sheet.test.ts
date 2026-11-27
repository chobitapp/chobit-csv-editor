import { createSheet, deleteColumns, deleteRows, insertColumns, insertRows, pasteValues } from "./sheet";

describe("createSheet", () => {
	it("列数が揃っていない行を最大の列数まで空文字で埋める", () => {
		expect(createSheet([["a"], ["b", "c", "d"]]).rows).toEqual([
			["a", "", ""],
			["b", "c", "d"],
		]);
	});
});

describe("pasteValues", () => {
	it("表からはみ出す分の行と列を追加して書き込む", () => {
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

	it("1 セル分の値を複数セルの選択範囲に貼ると範囲を埋める", () => {
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

describe("行と列の削除", () => {
	it("全行を削除しても空の 1 行を残す", () => {
		expect(deleteRows(createSheet([["a", "b"]]), 0, 1).rows).toEqual([["", ""]]);
	});

	it("列を削除しても残りの列の ID を保つ", () => {
		const sheet = insertColumns(createSheet([["a", "b"]]), 2);
		const [, second, third] = sheet.colIds;
		expect(deleteColumns(sheet, 0, 1).colIds).toEqual([second, third]);
	});

	it("行を挿入・削除しても残りの行の ID を保ち、列の操作では行の ID を変えない", () => {
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
