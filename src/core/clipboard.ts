import { parseCsv } from "./csv";

/**
 * - "auto": split as TSV if the text contains a tab or line break; otherwise paste it unsplit into one cell. Like Excel, commas do not split
 * - "tab" / "comma": use a fixed delimiter
 * - "none": paste unsplit into one cell
 */
export type PasteDelimiter = "auto" | "tab" | "comma" | "none";

export function parseClipboardText(text: string, mode: PasteDelimiter = "auto"): string[][] {
	// Excel and others append one line break to the clipboard text. parseCsv also ignores exactly one trailing line break
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
