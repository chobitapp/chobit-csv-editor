import { act, fireEvent, render, screen } from "@testing-library/react";
import { CsvEditor, type CsvEditorProps } from "./CsvEditor";
import { type CsvEditorInstance, useCsvEditor } from "./useCsvEditor";

function Harness({ initialCsv, onEditor }: { initialCsv: string; onEditor: (editor: CsvEditorInstance) => void }) {
	const editor = useCsvEditor({ initialCsv });
	onEditor(editor);
	return <CsvEditor editor={editor} height={300} />;
}

function MenuHarness(props: Omit<CsvEditorProps, "editor">) {
	const editor = useCsvEditor({ initialCsv: "a" });
	return <CsvEditor editor={editor} {...props} />;
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
	const input = screen.getByLabelText("Cell value") as HTMLTextAreaElement;
	const editor = () => latest as unknown as CsvEditorInstance;
	return { input, editor };
}

function type(input: HTMLTextAreaElement, text: string) {
	input.value += text;
	fireEvent.input(input);
}

describe("CsvEditor", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("typing into the selected cell starts editing by overwriting, and Enter commits and moves down", () => {
		const { input, editor } = setup("a,b\nc,d");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().rows).toEqual([
			["x", "b"],
			["c", "d"],
		]);
		expect(editor().selection.anchor).toEqual({ row: 1, col: 0 });
	});

	it("Shift+Enter and Alt+Enter insert a line break in the cell", () => {
		const { input, editor } = setup("a");
		type(input, "1");
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		type(input, "2");
		fireEvent.keyDown(input, { key: "Enter", altKey: true });
		type(input, "3");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().getCell(0, 0)).toBe("1\n2\n3");
	});

	it("Enter to confirm an IME conversion does not commit the cell", () => {
		const { input, editor } = setup("a");
		fireEvent.compositionStart(input);
		input.value = "日本語";
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });
		fireEvent.compositionEnd(input);
		expect(editor().getCell(0, 0)).toBe("a");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().getCell(0, 0)).toBe("日本語");
	});

	it("Escape cancels editing", () => {
		const { input, editor } = setup("a");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(editor().getCell(0, 0)).toBe("a");
	});

	it("splits pasted TSV into cells and adds missing rows and columns", () => {
		const { input, editor } = setup("a");
		fireEvent.paste(input, { clipboardData: { getData: () => "1\t2\n3\t4\n" } });
		expect(editor().rows).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	it("exportCsv during editing commits the value being edited before exporting", () => {
		const { input, editor } = setup("a,b");
		type(input, "x");
		let csv = "";
		act(() => {
			csv = editor().exportCsv();
		});
		expect(csv).toBe("x,b\r\n");
	});

	it("load during editing discards the value being edited and does not write it to the loaded table", async () => {
		const { input, editor } = setup("a");
		type(input, "x");
		await act(() => editor().load("b"));
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().rows).toEqual([["b"]]);
	});

	it("shows the content of the later load even if an earlier load finishes after it", async () => {
		const { editor } = setup("a");
		let resolveSlow: (value: ArrayBuffer) => void = () => {};
		const slow = { arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => (resolveSlow = resolve)) } as Blob;
		await act(async () => {
			const first = editor().load(slow);
			await editor().load("new");
			resolveSlow(new TextEncoder().encode("old").buffer as ArrayBuffer);
			await first;
		});
		expect(editor().rows).toEqual([["new"]]);
	});

	it("reports the positions of cells containing characters that cannot be encoded in Shift_JIS in the error", () => {
		const { editor } = setup("a,😀\n𠮷,b");
		expect(() => editor().exportBlob({ encoding: "shift_jis" })).toThrow(
			expect.objectContaining({
				cells: [
					{ row: 0, col: 1, chars: ["😀"] },
					{ row: 1, col: 0, chars: ["𠮷"] },
				],
			}),
		);
	});

	it("Tab in the edge column does not prevent the default so focus can move out of the table", () => {
		const { input } = setup("a,b");
		expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
		expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
	});

	it("editing and then undoing returns to having no unsaved changes", () => {
		const { input, editor } = setup("a");
		type(input, "x");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(editor().isDirty).toBe(true);
		fireEvent.keyDown(input, { key: "z", ctrlKey: true });
		expect(editor().getCell(0, 0)).toBe("a");
		expect(editor().isDirty).toBe(false);
	});

	it("dragging the bottom edge of a row number resizes the row, the height stays with the same row after inserting rows, and double-click resets it", () => {
		// jsdom gives elements a size of 0, so virtual scrolling would not render any rows
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		const { editor } = setup("a\nb");
		const rowOf = (text: string) => screen.getByText(text).closest<HTMLElement>("[role=row]");
		const resizer = rowOf("b")?.querySelector(".tce-row-resizer");
		if (!resizer) throw new Error("resizer not found");
		fireEvent.pointerDown(resizer, { button: 0, clientY: 100 });
		fireEvent.pointerMove(document, { clientY: 160 });
		fireEvent.pointerUp(document);
		const height = rowOf("b")?.style.height;
		expect(height).toMatch(/px$/);

		act(() => editor().insertRows(0));
		expect(rowOf("b")?.style.height).toBe(height);
		expect(rowOf("a")?.style.height).toBe("");

		const moved = rowOf("b")?.querySelector(".tce-row-resizer");
		if (!moved) throw new Error("resizer not found");
		fireEvent.doubleClick(moved);
		expect(rowOf("b")?.style.height).toBe("");
	});

	describe("row number column width", () => {
		const rowHeaderWidth = () =>
			(document.querySelector(".tce-root") as HTMLElement).style.getPropertyValue("--tce-rowheader-width");

		it("fits the number of digits of the largest row number by default", () => {
			setup("x\n".repeat(12_345));
			expect(rowHeaderWidth()).toBe("max(48px, calc(5ch + 20px))");
		});

		it("widens when inserted rows add a digit", () => {
			const { editor } = setup("x\n".repeat(9));
			expect(rowHeaderWidth()).toBe("max(48px, calc(1ch + 20px))");
			act(() => editor().insertRows(0));
			expect(rowHeaderWidth()).toBe("max(48px, calc(2ch + 20px))");
		});

		it("uses rowHeaderWidth as a fixed width when it is given", () => {
			render(<MenuHarness rowHeaderWidth={60} />);
			expect(rowHeaderWidth()).toBe("60px");
		});
	});

	describe("context menu", () => {
		beforeEach(() => {
			// jsdom gives elements a size of 0, so virtual scrolling would not render any rows
			vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
			vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		});

		const cellAt = (row: number, col: number) => document.querySelector(`[data-cell="${row}:${col}"]`) as HTMLElement;
		// The first columnheader is the top-left corner
		const colHeader = (col: number) => screen.getAllByRole("columnheader")[col + 1] as HTMLElement;

		it("right-clicking a cell inserts a row below the selected cell", () => {
			const { editor } = setup("a,b\nc,d");
			fireEvent.contextMenu(cellAt(0, 1));
			expect(editor().selection.anchor).toEqual({ row: 0, col: 1 });
			fireEvent.click(screen.getByText("Insert row below"));
			expect(editor().rows).toEqual([
				["a", "b"],
				["", ""],
				["c", "d"],
			]);
			expect(screen.queryByRole("menu")).toBeNull();
		});

		it("deletes all columns covered by the column header selection at once", () => {
			const { editor } = setup("a,b,c\nd,e,f");
			fireEvent.mouseDown(colHeader(1));
			fireEvent.mouseEnter(colHeader(2));
			fireEvent.contextMenu(colHeader(1));
			fireEvent.click(screen.getByText("Delete 2 columns"));
			expect(editor().rows).toEqual([["a"], ["d"]]);
		});

		it("calling preventDefault in onContextMenu suppresses the menu", () => {
			const onContextMenu = vi.fn((_context, event: { preventDefault: () => void }) => event.preventDefault());
			render(<MenuHarness onContextMenu={onContextMenu} />);
			fireEvent.contextMenu(cellAt(0, 0));
			expect(onContextMenu).toHaveBeenCalledWith(
				expect.objectContaining({ target: "cell", row: 0, col: 0 }),
				expect.anything(),
			);
			expect(screen.queryByRole("menu")).toBeNull();
		});

		it("does not show the menu when read-only", () => {
			render(<MenuHarness readOnly />);
			fireEvent.contextMenu(cellAt(0, 0));
			expect(screen.queryByRole("menu")).toBeNull();
		});

		it("items can be replaced with a function, and Esc closes the menu", () => {
			render(
				<MenuHarness
					contextMenu={(_context, items) => [...items.slice(0, 1), { id: "x", label: "Custom", onSelect: () => {} }]}
				/>,
			);
			fireEvent.contextMenu(cellAt(0, 0));
			expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Insert row above", "Custom"]);
			fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
			expect(screen.queryByRole("menu")).toBeNull();
		});

		const menuLabels = () => screen.getAllByRole("menuitem").map((item) => item.textContent);

		it("follows the browser's language by default", () => {
			vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP", "en-US"]);
			render(<MenuHarness />);
			expect(screen.getByLabelText("セルの値")).toBeTruthy();
			fireEvent.contextMenu(cellAt(0, 0));
			expect(menuLabels()).toEqual([
				"上に行を挿入",
				"下に行を挿入",
				"行を削除",
				"左に列を挿入",
				"右に列を挿入",
				"列を削除",
			]);
		});

		it("switches when the browser's language changes", () => {
			const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
			render(<MenuHarness />);
			languages.mockReturnValue(["ja"]);
			act(() => {
				window.dispatchEvent(new Event("languagechange"));
			});
			expect(screen.getByLabelText("セルの値")).toBeTruthy();
		});

		it("the locale prop overrides the browser's language", () => {
			vi.spyOn(navigator, "languages", "get").mockReturnValue(["ja-JP"]);
			render(<MenuHarness locale="en" />);
			fireEvent.contextMenu(cellAt(0, 0));
			expect(menuLabels()[0]).toBe("Insert row above");
		});

		it("passes the locale to a contextMenu function", () => {
			const contextMenu = vi.fn((_context, items) => items);
			render(<MenuHarness locale="ja" contextMenu={contextMenu} />);
			fireEvent.contextMenu(cellAt(0, 0));
			expect(contextMenu).toHaveBeenCalledWith(expect.objectContaining({ locale: "ja" }), expect.anything());
		});
	});
});
