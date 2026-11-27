import Papa from "papaparse";

/**
 * - "auto": タブを含めば TSV、含まなければ CSV として分割する
 * - "tab" / "comma": 区切り文字を固定する
 * - "none": 分割せず 1 セルに貼り付ける
 */
export type PasteDelimiter = "auto" | "tab" | "comma" | "none";

export function parseClipboardText(text: string, mode: PasteDelimiter = "auto"): string[][] {
	// Excel などはクリップボードの末尾に改行を 1 つ付けるので取り除く
	const source = text.replace(/\r?\n$/, "");
	if (mode === "none") return [[source]];
	const delimiter = mode === "tab" || (mode === "auto" && source.includes("\t")) ? "\t" : ",";
	const result = Papa.parse<string[]>(source, {
		delimiter,
		header: false,
		skipEmptyLines: false,
	});
	if (result.errors.some((error) => error.type === "Quotes")) {
		// `5" display` のように引用符が閉じていない値は CSV として解釈せず素朴に分割する
		return source.split(/\r?\n/).map((line) => line.split(delimiter));
	}
	return result.data.length > 0 ? result.data : [[""]];
}

const needsQuote = /[\t\n\r"]/;

export function toTsv(rows: readonly (readonly string[])[]): string {
	return rows
		.map((row) => row.map((value) => (needsQuote.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join("\t"))
		.join("\n");
}
