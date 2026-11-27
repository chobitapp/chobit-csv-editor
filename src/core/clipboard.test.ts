import { parseClipboardText, toTsv } from "./clipboard";

describe("parseClipboardText", () => {
	it("splits as TSV when it contains a tab and ignores the trailing line break", () => {
		expect(parseClipboardText("a\tb,c\r\n1\t2\r\n")).toEqual([
			["a", "b,c"],
			["1", "2"],
		]);
	});

	it("does not split when there is no tab or line break, even with commas", () => {
		expect(parseClipboardText("Hello, world\n")).toEqual([["Hello, world"]]);
	});

	it('"comma" splits as CSV', () => {
		expect(parseClipboardText('a,"b\nc"\n1,2', "comma")).toEqual([
			["a", "b\nc"],
			["1", "2"],
		]);
	});

	it("reads TSV copied from Excel that contains line breaks inside cells", () => {
		expect(parseClipboardText('"1行目\n2行目"\tx\n')).toEqual([["1行目\n2行目", "x"]]);
	});

	it("splits values with an unclosed quote naively", () => {
		expect(parseClipboardText('5" display\t10')).toEqual([['5" display', "10"]]);
	});

	it('"none" does not split', () => {
		expect(parseClipboardText("a,b", "none")).toEqual([["a,b"]]);
	});
});

describe("toTsv", () => {
	it("quotes only values containing tabs, line breaks, or quotes", () => {
		expect(
			toTsv([
				["a", "b\tc"],
				['"q"', "1\n2"],
			]),
		).toBe('a\t"b\tc"\n"""q"""\t"1\n2"');
	});

	it("round-trips through parseClipboardText", () => {
		const rows = [
			["改行\nあり", "タブ\tあり"],
			["", '"'],
		];
		expect(parseClipboardText(toTsv(rows))).toEqual(rows);
	});
});
