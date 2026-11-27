import Encoding from "encoding-japanese";

export type InputEncoding = "auto" | "utf-8" | "shift_jis" | "utf-16le" | "utf-16be";
/** "utf-16le" と "utf-16be" は BOM 付きで書き出す。Excel は BOM の無い UTF-16 を正しく開けない */
export type OutputEncoding = "utf-8" | "utf-8-bom" | "shift_jis" | "utf-16le" | "utf-16be";
/** 読み込んだ時と同じ形式で保存できるよう、そのまま OutputEncoding として使える値を返す */
export type DetectedEncoding = OutputEncoding;

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

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) => prefix.every((byte, i) => bytes[i] === byte);

/**
 * BOM の無い UTF-16 は、ASCII の文字の上位バイトが NUL になる。UTF-8 や Shift_JIS の CSV に NUL は現れないので、
 * NUL が偶数番目と奇数番目のどちらか一方にだけ現れれば UTF-16 と判定する
 */
function guessUtf16WithoutBom(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
	if (bytes.length < 2 || bytes.length % 2 !== 0) return null;
	let evenNuls = 0;
	let oddNuls = 0;
	const end = Math.min(bytes.length, 8192);
	for (let i = 0; i < end; i++) {
		if (bytes[i] !== 0) continue;
		if (i % 2 === 0) evenNuls++;
		else oddNuls++;
	}
	if (oddNuls > 0 && evenNuls === 0) return "utf-16le";
	if (evenNuls > 0 && oddNuls === 0) return "utf-16be";
	return null;
}

const utf8Bom = [0xef, 0xbb, 0xbf];

export function decodeBytes(
	bytes: Uint8Array,
	encoding: InputEncoding = "auto",
): { text: string; encoding: DetectedEncoding } {
	// TextDecoder は既定でその文字コードの BOM を取り除く
	if (encoding === "shift_jis" || encoding === "utf-16le" || encoding === "utf-16be") {
		return { text: new TextDecoder(encoding).decode(bytes), encoding };
	}
	const utf8Encoding = startsWith(bytes, utf8Bom) ? "utf-8-bom" : "utf-8";
	if (encoding === "utf-8") {
		return { text: new TextDecoder("utf-8").decode(bytes), encoding: utf8Encoding };
	}
	const utf16 = startsWith(bytes, [0xff, 0xfe])
		? "utf-16le"
		: startsWith(bytes, [0xfe, 0xff])
			? "utf-16be"
			: guessUtf16WithoutBom(bytes);
	if (utf16) return { text: new TextDecoder(utf16).decode(bytes), encoding: utf16 };
	try {
		return {
			text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			encoding: utf8Encoding,
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
	if (encoding === "utf-16le" || encoding === "utf-16be") {
		const littleEndian = encoding === "utf-16le";
		const bytes = new Uint8Array(2 + text.length * 2);
		const view = new DataView(bytes.buffer);
		view.setUint16(0, 0xfeff, littleEndian);
		for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), littleEndian);
		return bytes;
	}
	const body = new TextEncoder().encode(text);
	if (encoding === "utf-8") return body;
	const withBom = new Uint8Array(body.length + 3);
	withBom.set(utf8Bom, 0);
	withBom.set(body, 3);
	return withBom;
}

/** Blob の type に付ける charset */
export function charsetOf(encoding: OutputEncoding): string {
	return encoding === "utf-8-bom" ? "utf-8" : encoding;
}
