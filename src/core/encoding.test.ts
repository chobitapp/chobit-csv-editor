import { decodeBytes, encodeText } from "./encoding";

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
});
