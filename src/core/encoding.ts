import Encoding from "encoding-japanese";

export type InputEncoding = "auto" | "utf-8" | "shift_jis" | "utf-16le" | "utf-16be";
/** "utf-16le" and "utf-16be" are written with a BOM. Excel cannot open UTF-16 without a BOM correctly */
export type OutputEncoding = "utf-8" | "utf-8-bom" | "shift_jis" | "utf-16le" | "utf-16be";
/** Returned as a value usable directly as an OutputEncoding, so a file can be saved in the same format it was read in */
export type DetectedEncoding = OutputEncoding;

/** "error" throws UnencodableCharacterError if any character cannot be encoded. "replace" replaces such characters with `?` */
export type UnencodableHandling = "error" | "replace";

export interface CellPositionWithChars {
	row: number;
	col: number;
	chars: string[];
}

export class UnencodableCharacterError extends Error {
	readonly encoding: OutputEncoding;
	/** Characters that cannot be encoded, without duplicates */
	readonly chars: string[];
	/** The cells containing characters that cannot be encoded. Populated only when thrown from exportBlob */
	readonly cells: CellPositionWithChars[];

	constructor(encoding: OutputEncoding, chars: string[], cells: CellPositionWithChars[] = []) {
		super(`Some characters cannot be encoded in ${encoding}: ${chars.join(" ")}`);
		this.name = "UnencodableCharacterError";
		this.encoding = encoding;
		this.chars = chars;
		this.cells = cells;
	}
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) => prefix.every((byte, i) => bytes[i] === byte);

/**
 * In UTF-16 without a BOM, the high byte of each ASCII character is NUL. NUL does not appear in UTF-8 or Shift_JIS CSV, so
 * the input is detected as UTF-16 if NULs appear only at even offsets or only at odd offsets
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
	// TextDecoder strips the BOM for its encoding by default
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

/** Returns the characters that cannot be encoded in encoding, without duplicates, in order of appearance */
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

/** The charset to put in the Blob type */
export function charsetOf(encoding: OutputEncoding): string {
	return encoding === "utf-8-bom" ? "utf-8" : encoding;
}
