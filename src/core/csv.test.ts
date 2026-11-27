import { parseCsv, stringifyCsv } from "./csv";

describe("parseCsv", () => {
	it("引用符で囲まれた改行・カンマ・引用符を 1 つの値として読む", () => {
		expect(parseCsv('名前,メモ\n山田,"1行目\n2行目"\n鈴木,"a, ""b"""')).toEqual([
			["名前", "メモ"],
			["山田", "1行目\n2行目"],
			["鈴木", 'a, "b"'],
		]);
	});

	it("末尾の改行で空行を増やさず、BOM を取り除く", () => {
		expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

describe("stringifyCsv", () => {
	it("必要な値だけ引用符で囲み、既定では CRLF で区切って末尾にも改行を付ける", () => {
		expect(
			stringifyCsv([
				["a", "1\n2"],
				['"x"', "y,z"],
			]),
		).toBe('a,"1\n2"\r\n"""x""","y,z"\r\n');
	});

	it("trailingNewline: false なら末尾に改行を付けない", () => {
		expect(stringifyCsv([["a"], ["b"]], { lineEnding: "\n", trailingNewline: false })).toBe("a\nb");
	});
});
