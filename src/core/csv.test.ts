import { parseCsv, parseCsvWithErrors, stringifyCsv } from "./csv";

describe("parseCsv", () => {
	it("reads quoted line breaks, commas, and quotes as a single value", () => {
		expect(parseCsv('名前,メモ\n山田,"1行目\n2行目"\n鈴木,"a, ""b"""')).toEqual([
			["名前", "メモ"],
			["山田", "1行目\n2行目"],
			["鈴木", 'a, "b"'],
		]);
	});

	it("does not add an empty row for a trailing line break and strips the BOM", () => {
		expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

describe("parseCsvWithErrors", () => {
	it("treats CRLF, LF, and CR outside quotes as row separators and keeps line breaks inside quotes in the value", () => {
		expect(parseCsvWithErrors('a,b\r\nc,"d\r\ne"\nf,g\rh,i\r\n')).toEqual({
			rows: [
				["a", "b"],
				["c", "d\r\ne"],
				["f", "g"],
				["h", "i"],
			],
			errors: [],
		});
	});

	it("reads only the value with an unclosed quote as unquoted and reads the following rows normally", () => {
		expect(parseCsvWithErrors('a,"b\nc,d\n')).toEqual({
			rows: [
				["a", '"b'],
				["c", "d"],
			],
			errors: [{ code: "unclosed-quote", row: 0, col: 1 }],
		});
	});
});

describe("stringifyCsv", () => {
	it("quotes only values that need it and by default separates rows with CRLF and adds a trailing line break", () => {
		expect(
			stringifyCsv([
				["a", "1\n2"],
				['"x"', "y,z"],
			]),
		).toBe('a,"1\n2"\r\n"""x""","y,z"\r\n');
	});

	it("does not add a trailing line break when trailingNewline is false", () => {
		expect(stringifyCsv([["a"], ["b"]], { lineEnding: "\n", trailingNewline: false })).toBe("a\nb");
	});
});
