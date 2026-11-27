import { decodeBytes, encodeText, UnencodableCharacterError } from "./encoding";

describe("decodeBytes / encodeText", () => {
	it("detects bytes that are not valid UTF-8 as Shift_JIS and decodes them", () => {
		const sjis = encodeText("名前,住所", "shift_jis");
		expect(decodeBytes(sjis)).toEqual({ text: "名前,住所", encoding: "shift_jis" });
	});

	it("strips the BOM from UTF-8 with BOM and detects it as UTF-8 with BOM", () => {
		const bytes = encodeText("あ", "utf-8-bom");
		expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		expect(decodeBytes(bytes)).toEqual({ text: "あ", encoding: "utf-8-bom" });
	});

	it.each(["utf-16le", "utf-16be"] as const)(
		"writes %s with a BOM and detects the same encoding when reading it back",
		(encoding) => {
			const text = "a,𠮷\r\n";
			const bytes = encodeText(text, encoding);
			expect(Array.from(bytes.slice(0, 2))).toEqual(encoding === "utf-16le" ? [0xff, 0xfe] : [0xfe, 0xff]);
			expect(decodeBytes(bytes)).toEqual({ text, encoding });
			expect(decodeBytes(bytes.slice(2))).toEqual({ text, encoding });
		},
	);

	it("throws instead of replacing by default when some characters cannot be encoded in Shift_JIS", () => {
		expect(() => encodeText("髙😀𠮷😀", "shift_jis")).toThrow(
			expect.objectContaining({ name: UnencodableCharacterError.name, chars: ["😀", "𠮷"] }),
		);
		expect(decodeBytes(encodeText("髙😀", "shift_jis", "replace"), "shift_jis").text).toBe("髙?");
	});
});
