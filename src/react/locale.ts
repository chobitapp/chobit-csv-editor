import { useSyncExternalStore } from "react";

export type CsvEditorLocale = "en" | "ja";

export interface Messages {
	insertRowAbove: string;
	insertRowBelow: string;
	deleteRows: (count: number) => string;
	insertColumnLeft: string;
	insertColumnRight: string;
	deleteColumns: (count: number) => string;
	cellValue: string;
}

export const messages: Record<CsvEditorLocale, Messages> = {
	en: {
		insertRowAbove: "Insert row above",
		insertRowBelow: "Insert row below",
		deleteRows: (count) => (count === 1 ? "Delete row" : `Delete ${count} rows`),
		insertColumnLeft: "Insert column left",
		insertColumnRight: "Insert column right",
		deleteColumns: (count) => (count === 1 ? "Delete column" : `Delete ${count} columns`),
		cellValue: "Cell value",
	},
	ja: {
		insertRowAbove: "上に行を挿入",
		insertRowBelow: "下に行を挿入",
		deleteRows: (count) => (count === 1 ? "行を削除" : `${count} 行を削除`),
		insertColumnLeft: "左に列を挿入",
		insertColumnRight: "右に列を挿入",
		deleteColumns: (count) => (count === 1 ? "列を削除" : `${count} 列を削除`),
		cellValue: "セルの値",
	},
};

/** Picks the first supported locale in the user's preference order, falling back to "en" */
export function detectLocale(languages: readonly string[]): CsvEditorLocale {
	for (const language of languages) {
		const primary = language.toLowerCase().split("-")[0];
		if (primary === "en" || primary === "ja") return primary;
	}
	return "en";
}

function subscribe(onChange: () => void) {
	window.addEventListener("languagechange", onChange);
	return () => window.removeEventListener("languagechange", onChange);
}

function getBrowserLocale(): CsvEditorLocale {
	const { languages, language } = navigator;
	return detectLocale(languages?.length ? languages : [language]);
}

// The server cannot know the browser's language, so it renders "en" and the client switches after hydration
function getServerLocale(): CsvEditorLocale {
	return "en";
}

export function useBrowserLocale(): CsvEditorLocale {
	return useSyncExternalStore(subscribe, getBrowserLocale, getServerLocale);
}
