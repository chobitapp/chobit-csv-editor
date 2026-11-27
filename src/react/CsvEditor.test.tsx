import { act, fireEvent, render, screen } from "@testing-library/react";
import { CsvEditor } from "./CsvEditor";
import { type CsvEditorInstance, useCsvEditor } from "./useCsvEditor";

function Harness({ initialCsv, onEditor }: { initialCsv: string; onEditor: (editor: CsvEditorInstance) => void }) {
	const editor = useCsvEditor({ initialCsv });
	onEditor(editor);
	return <CsvEditor editor={editor} height={300} />;
}

function setup(initialCsv: string) {
	let latest: CsvEditorInstance | null = null;
	render(
		<Harness
			initialCsv={initialCsv}
			onEditor={(editor) => {
				latest = editor;
			}}
		/>,
	);
	const input = screen.getByLabelText("セルの値") as HTMLTextAreaElement;
	const editor = () => latest as unknown as CsvEditorInstance;
	return { input, editor };
}

function type(input: HTMLTextAreaElement, text: string) {
	input.value += text;
	fireEvent.input(input);
}

describe("CsvEditor", () => {
	it("選択中のセルに直接入力すると上書きで編集が始まり、Enter で確定して下へ移る", () => {
		const { input, editor } = setup("a,b\nc,d");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().rows).toEqual([
			["x", "b"],
			["c", "d"],
		]);
		expect(editor().selection.anchor).toEqual({ row: 1, col: 0 });
	});

	it("Shift+Enter と Alt+Enter でセル内に改行を入れる", () => {
		const { input, editor } = setup("a");
		type(input, "1");
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		type(input, "2");
		fireEvent.keyDown(input, { key: "Enter", altKey: true });
		type(input, "3");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().getCell(0, 0)).toBe("1\n2\n3");
	});

	it("IME の変換確定の Enter ではセルを確定しない", () => {
		const { input, editor } = setup("a");
		fireEvent.compositionStart(input);
		input.value = "日本語";
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });
		fireEvent.compositionEnd(input);
		expect(editor().getCell(0, 0)).toBe("a");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().getCell(0, 0)).toBe("日本語");
	});

	it("Escape で編集を取り消す", () => {
		const { input, editor } = setup("a");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(editor().getCell(0, 0)).toBe("a");
	});

	it("ペーストした TSV をセルに分割し、足りない行と列を追加する", () => {
		const { input, editor } = setup("a");
		fireEvent.paste(input, { clipboardData: { getData: () => "1\t2\n3\t4\n" } });
		expect(editor().rows).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	it("編集中に exportCsv を呼ぶと編集中の値を確定してから出力する", () => {
		const { input, editor } = setup("a,b");
		type(input, "x");
		let csv = "";
		act(() => {
			csv = editor().exportCsv();
		});
		expect(csv).toBe("x,b\r\n");
	});

	it("編集して元に戻すと未保存の変更が無い状態に戻る", () => {
		const { input, editor } = setup("a");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().isDirty).toBe(true);
		fireEvent.keyDown(input, { key: "z", ctrlKey: true });
		expect(editor().getCell(0, 0)).toBe("a");
		expect(editor().isDirty).toBe(false);
	});
});
