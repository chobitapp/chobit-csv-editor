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
	/**
	 * `=` `+` `-` `@` タブ CR で始まる値の先頭に `'` を付け、表計算ソフトで数式として実行されないようにする（CSV インジェクション対策）。
	 * 値そのものが変わるので、省略時は false
	 */
	escapeFormulae?: boolean;
}

/**
 * - "unclosed-quote": 引用符が閉じないまま行末まで来た。その値は先頭の `"` も含めて引用符の無い値として読む
 * - "text-after-quote": 閉じた引用符の後に区切り文字以外が続いた。続きの文字はその値に連結する
 */
export interface CsvParseError {
	code: "unclosed-quote" | "text-after-quote";
	/** 0 始まりの行番号（読み込んだ表の行） */
	row: number;
	col: number;
}

export interface ParseCsvResult {
	rows: string[][];
	errors: CsvParseError[];
}

/**
 * RFC 4180 の CSV を読む。引用符の外にある CRLF・LF・CR はどれも行の区切りとして扱うので、改行コードが混在していても読める。
 * 末尾の改行は空行として数えない。
 */
export function parseCsvWithErrors(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
	const delimiter = options.delimiter ?? ",";
	if (delimiter.length !== 1 || delimiter === '"' || delimiter === "\r" || delimiter === "\n") {
		throw new Error(`区切り文字には引用符と改行以外の 1 文字を指定してください: ${JSON.stringify(delimiter)}`);
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
				// 閉じない引用符で残り全体を 1 つの値として飲み込まないよう、この値だけを引用符の無い値として読み直す
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
