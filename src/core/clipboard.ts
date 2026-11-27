import { parseCsv } from "./csv";

/**
 * - "auto": タブか改行を含めば TSV として分割し、含まなければ分割せず 1 セルに貼り付ける。Excel と同じく、カンマでは分割しない
 * - "tab" / "comma": 区切り文字を固定する
 * - "none": 分割せず 1 セルに貼り付ける
 */
export type PasteDelimiter = "auto" | "tab" | "comma" | "none";

export function parseClipboardText(text: string, mode: PasteDelimiter = "auto"): string[][] {
	// Excel などはクリップボードの末尾に改行を 1 つ付ける。parseCsv も末尾の改行を 1 つだけ無視する
	const single = text.replace(/\r?\n$/, "");
	if (mode === "none" || (mode === "auto" && !/[\t\r\n]/.test(single))) return [[single]];
	return parseCsv(text, { delimiter: mode === "comma" ? "," : "\t" });
}

const needsQuote = /[\t\n\r"]/;

export function toTsv(rows: readonly (readonly string[])[]): string {
	return rows
		.map((row) => row.map((value) => (needsQuote.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join("\t"))
		.join("\n");
}
