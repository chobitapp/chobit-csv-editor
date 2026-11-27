import Papa from "papaparse";

export type LineEnding = "\r\n" | "\n";

export interface ParseCsvOptions {
	/** 省略時は "," */
	delimiter?: string;
}

export interface StringifyCsvOptions {
	/** 省略時は "\r\n"（RFC 4180） */
	lineEnding?: LineEnding;
	/** 省略時は "," */
	delimiter?: string;
	/** 最後の行の後にも改行を付けるか。省略時は true */
	trailingNewline?: boolean;
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): string[][] {
	const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
	if (source === "") return [[""]];
	const result = Papa.parse<string[]>(source, {
		delimiter: options.delimiter ?? ",",
		header: false,
		skipEmptyLines: false,
		dynamicTyping: false,
	});
	const rows = result.data;
	// 末尾改行で終わる CSV は Papa が空行を 1 つ余分に返すので取り除く
	const last = rows[rows.length - 1];
	if (rows.length > 1 && last && last.length === 1 && last[0] === "" && /\r?\n$/.test(source)) {
		rows.pop();
	}
	return rows;
}

export function stringifyCsv(rows: readonly (readonly string[])[], options: StringifyCsvOptions = {}): string {
	const lineEnding = options.lineEnding ?? "\r\n";
	const body = Papa.unparse(rows as string[][], {
		delimiter: options.delimiter ?? ",",
		newline: lineEnding,
		quotes: false,
		header: false,
	});
	return options.trailingNewline === false ? body : body + lineEnding;
}
