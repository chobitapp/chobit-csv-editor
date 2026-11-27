import { parseClipboardText, toTsv } from "./clipboard";

describe("parseClipboardText", () => {
	it("タブを含めば TSV として分割し、末尾の改行を無視する", () => {
		expect(parseClipboardText("a\tb,c\r\n1\t2\r\n")).toEqual([
			["a", "b,c"],
			["1", "2"],
		]);
	});

	it("タブも改行も含まなければ、カンマがあっても分割しない", () => {
		expect(parseClipboardText("Hello, world\n")).toEqual([["Hello, world"]]);
	});

	it('"comma" は CSV として分割する', () => {
		expect(parseClipboardText('a,"b\nc"\n1,2', "comma")).toEqual([
			["a", "b\nc"],
			["1", "2"],
		]);
	});

	it("Excel からコピーしたセル内改行を含む TSV を読む", () => {
		expect(parseClipboardText('"1行目\n2行目"\tx\n')).toEqual([["1行目\n2行目", "x"]]);
	});

	it("引用符が閉じていない値は素朴に分割する", () => {
		expect(parseClipboardText('5" display\t10')).toEqual([['5" display', "10"]]);
	});

	it('"none" は分割しない', () => {
		expect(parseClipboardText("a,b", "none")).toEqual([["a,b"]]);
	});
});

describe("toTsv", () => {
	it("タブ・改行・引用符を含む値だけ引用符で囲む", () => {
		expect(
			toTsv([
				["a", "b\tc"],
				['"q"', "1\n2"],
			]),
		).toBe('a\t"b\tc"\n"""q"""\t"1\n2"');
	});

	it("parseClipboardText で元に戻せる", () => {
		const rows = [
			["改行\nあり", "タブ\tあり"],
			["", '"'],
		];
		expect(parseClipboardText(toTsv(rows))).toEqual(rows);
	});
});
