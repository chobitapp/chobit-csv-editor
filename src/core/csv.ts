import Papa from "papaparse";

export type LineEnding = "\r\n" | "\n";

export interface ParseCsvOptions {
	/** Defaults to "," */
	delimiter?: string;
}

export interface StringifyCsvOptions {
	/** Defaults to "\r\n" (RFC 4180) */
	lineEnding?: LineEnding;
	/** Defaults to "," */
	delimiter?: string;
	/** Whether to add a line break after the last row too. Defaults to true */
	trailingNewline?: boolean;
	/**
	 * Prefixes `'` to values starting with `=` `+` `-` `@`, tab, or CR so spreadsheet apps do not run them as formulas (CSV injection protection).
	 * Because this changes the values themselves, defaults to false
	 */
	escapeFormulae?: boolean;
}

/**
 * - "unclosed-quote": a quote was not closed before the end of the line. The value is read as unquoted, including its leading `"`
 * - "text-after-quote": a closing quote was followed by something other than a delimiter. The following characters are appended to the value
 */
export interface CsvParseError {
	code: "unclosed-quote" | "text-after-quote";
	/** Zero-based row index (a row of the parsed table) */
	row: number;
	col: number;
}

export interface ParseCsvResult {
	rows: string[][];
	errors: CsvParseError[];
}

/**
 * Parses RFC 4180 CSV. CRLF, LF, and CR outside quotes are all treated as row separators, so mixed line endings are supported.
 * A trailing line break does not count as an empty row.
 */
export function parseCsvWithErrors(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
	const delimiter = options.delimiter ?? ",";
	if (delimiter.length !== 1 || delimiter === '"' || delimiter === "\r" || delimiter === "\n") {
		throw new Error(
			`Delimiter must be a single character other than a quote or line break: ${JSON.stringify(delimiter)}`,
		);
	}
	const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
	const rows: string[][] = [];
	const errors: CsvParseError[] = [];
	let row: string[] = [];
	let i = 0;
	const length = source.length;

	const isLineBreak = (ch: string | undefined) => ch === "\r" || ch === "\n";
	const skipLineBreak = () => {
		if (source[i] === "\r" && source[i + 1] === "\n") i += 2;
		else i += 1;
	};
	const readUnquoted = (start: number) => {
		let end = start;
		while (end < length && source[end] !== delimiter && !isLineBreak(source[end])) end++;
		const value = source.slice(start, end);
		i = end;
		return value;
	};

	while (true) {
		let value: string;
		if (source[i] === '"') {
			const start = i;
			let buffer = "";
			let closed = false;
			let j = i + 1;
			while (true) {
				const quote = source.indexOf('"', j);
				if (quote === -1) break;
				buffer += source.slice(j, quote);
				if (source[quote + 1] === '"') {
					buffer += '"';
					j = quote + 2;
					continue;
				}
				closed = true;
				j = quote + 1;
				break;
			}
			if (closed) {
				i = j;
				if (i < length && source[i] !== delimiter && !isLineBreak(source[i])) {
					errors.push({ code: "text-after-quote", row: rows.length, col: row.length });
					buffer += readUnquoted(i);
				}
				value = buffer;
			} else {
				// Re-read only this value as unquoted so an unclosed quote does not swallow the rest of the input as one value
				errors.push({ code: "unclosed-quote", row: rows.length, col: row.length });
				value = readUnquoted(start);
			}
		} else {
			value = readUnquoted(i);
		}
		row.push(value);

		if (i >= length) {
			rows.push(row);
			break;
		}
		if (source[i] === delimiter) {
			i += 1;
			continue;
		}
		skipLineBreak();
		rows.push(row);
		row = [];
		if (i >= length) break;
	}
	return { rows, errors };
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): string[][] {
	return parseCsvWithErrors(text, options).rows;
}

export function stringifyCsv(rows: readonly (readonly string[])[], options: StringifyCsvOptions = {}): string {
	const lineEnding = options.lineEnding ?? "\r\n";
	const body = Papa.unparse(rows as string[][], {
		delimiter: options.delimiter ?? ",",
		newline: lineEnding,
		quotes: false,
		header: false,
		escapeFormulae: options.escapeFormulae ?? false,
	});
	return options.trailingNewline === false ? body : body + lineEnding;
}
