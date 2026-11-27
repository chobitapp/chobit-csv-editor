import { decodeBytes, encodeText, UnencodableCharacterError } from "./encoding";

describe("decodeBytes / encodeText", () => {
	it("UTF-8 として読めないバイト列を Shift_JIS と判定して読む", () => {
		const sjis = encodeText("名前,住所", "shift_jis");
		expect(decodeBytes(sjis)).toEqual({ text: "名前,住所", encoding: "shift_jis" });
	});

	it("BOM 付き UTF-8 は BOM を除いて UTF-8 と判定する", () => {
		const bytes = encodeText("あ", "utf-8-bom");
		expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		expect(decodeBytes(bytes)).toEqual({ text: "あ", encoding: "utf-8" });
	});

	it("BOM 付き UTF-16LE を判定して読む", () => {
		expect(decodeBytes(Uint8Array.from([0xff, 0xfe, 0x42, 0x30]))).toEqual({ text: "あ", encoding: "utf-16le" });
	});

	it("Shift_JIS で表せない文字があれば、既定では置き換えずにエラーにする", () => {
		expect(() => encodeText("髙😀𠮷😀", "shift_jis")).toThrow(
			expect.objectContaining({ name: UnencodableCharacterError.name, chars: ["😀", "𠮷"] }),
		);
		expect(decodeBytes(encodeText("髙😀", "shift_jis", "replace"), "shift_jis").text).toBe("髙?");
	});
});
