import Encoding from "encoding-japanese";

export type InputEncoding = "auto" | "utf-8" | "shift_jis";
export type DetectedEncoding = "utf-8" | "shift_jis";
export type OutputEncoding = "utf-8" | "utf-8-bom" | "shift_jis";

export function decodeBytes(
	bytes: Uint8Array,
	encoding: InputEncoding = "auto",
): { text: string; encoding: DetectedEncoding } {
	if (encoding === "shift_jis") {
		return { text: new TextDecoder("shift_jis").decode(bytes), encoding };
	}
	if (encoding === "utf-8") {
		return { text: new TextDecoder("utf-8").decode(bytes), encoding };
	}
	// TextDecoder は既定で BOM を取り除く
	try {
		return {
			text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			encoding: "utf-8",
		};
	} catch {
		return {
			text: new TextDecoder("shift_jis").decode(bytes),
			encoding: "shift_jis",
		};
	}
}

export async function readTextInput(
	input: string | Blob,
	encoding: InputEncoding = "auto",
): Promise<{ text: string; encoding: DetectedEncoding }> {
	if (typeof input === "string") return { text: input, encoding: "utf-8" };
	const bytes = new Uint8Array(await input.arrayBuffer());
	return decodeBytes(bytes, encoding);
}

export function encodeText(text: string, encoding: OutputEncoding = "utf-8"): Uint8Array<ArrayBuffer> {
	if (encoding === "shift_jis") {
		const codes = Encoding.convert(Encoding.stringToCode(text), {
			to: "SJIS",
			from: "UNICODE",
		});
		return Uint8Array.from(codes);
	}
	const body = new TextEncoder().encode(text);
	if (encoding === "utf-8") return body;
	const withBom = new Uint8Array(body.length + 3);
	withBom.set([0xef, 0xbb, 0xbf], 0);
	withBom.set(body, 3);
	return withBom;
}
