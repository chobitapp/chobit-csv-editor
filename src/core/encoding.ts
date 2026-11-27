import Encoding from "encoding-japanese";

export type InputEncoding = "auto" | "utf-8" | "shift_jis";
export type DetectedEncoding = "utf-8" | "shift_jis" | "utf-16le" | "utf-16be";
export type OutputEncoding = "utf-8" | "utf-8-bom" | "shift_jis";

/** "error" は変換できない文字があれば UnencodableCharacterError を投げる。"replace" はその文字を `?` に置き換える */
export type UnencodableHandling = "error" | "replace";

export interface CellPositionWithChars {
	row: number;
	col: number;
	chars: string[];
}

export class UnencodableCharacterError extends Error {
	readonly encoding: OutputEncoding;
	/** 変換できない文字。重複は除く */
	readonly chars: string[];
	/** exportBlob から投げた時だけ、変換できない文字を含むセルが入る */
	readonly cells: CellPositionWithChars[];

	constructor(encoding: OutputEncoding, chars: string[], cells: CellPositionWithChars[] = []) {
		super(`${encoding} で表せない文字があります: ${chars.join(" ")}`);
		this.name = "UnencodableCharacterError";
		this.encoding = encoding;
		this.chars = chars;
		this.cells = cells;
	}
}

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
	// Excel の「Unicode テキスト」は BOM 付き UTF-16 で保存される
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
	}
	if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" };
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

const sjisEncodable = new Map<string, boolean>();

function canEncodeToSjis(char: string): boolean {
	const cached = sjisEncodable.get(char);
	if (cached !== undefined) return cached;
	let ok = true;
	try {
		Encoding.convert(Encoding.stringToCode(char), { to: "SJIS", from: "UNICODE", fallback: "error" });
	} catch {
		ok = false;
	}
	sjisEncodable.set(char, ok);
	return ok;
}

/** encoding で表せない文字を、重複を除いて出現順に返す */
export function findUnencodableChars(text: string, encoding: OutputEncoding): string[] {
	if (encoding !== "shift_jis") return [];
	const found = new Set<string>();
	for (const char of text) {
		if (char.charCodeAt(0) >= 0x80 && !canEncodeToSjis(char)) found.add(char);
	}
	return [...found];
}

export function encodeText(
	text: string,
	encoding: OutputEncoding = "utf-8",
	unencodable: UnencodableHandling = "error",
): Uint8Array<ArrayBuffer> {
	if (encoding === "shift_jis") {
		if (unencodable === "error") {
			const chars = findUnencodableChars(text, encoding);
			if (chars.length > 0) throw new UnencodableCharacterError(encoding, chars);
		}
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
