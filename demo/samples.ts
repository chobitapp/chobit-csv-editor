import { stringifyCsv } from "../src";

export type SampleId = "small" | "medium" | "large";

export interface Sample {
	id: SampleId;
	label: string;
	fileName: string;
	/** Builds the CSV on demand, so the large sample is only generated when it is picked. */
	createCsv: () => string;
}

// Shows the tricky parts of CSV at a glance: line breaks, commas and quotes inside values, and multibyte text.
const basics = `Name,City,Note
Alice Smith,London,"Line 1
Line 2"
山田太郎,東京,"A value with a comma, inside"
José García,Madrid,"A value with ""quotes"" inside"
`;

const firstNames = [
	"Alice",
	"Bob",
	"Chloé",
	"Daniel",
	"Emma",
	"Farid",
	"Grace",
	"Hiro",
	"Ines",
	"Jonas",
	"太郎",
	"花子",
];
const lastNames = ["Smith", "García", "Müller", "Rossi", "Kim", "Nguyen", "Okafor", "Silva", "山田", "佐藤", "鈴木"];
const places = [
	["United Kingdom", "London"],
	["Spain", "Madrid"],
	["Germany", "Berlin"],
	["France", "Paris"],
	["Japan", "東京"],
	["Japan", "大阪"],
	["United States", "New York"],
	["Brazil", "São Paulo"],
	["South Korea", "Seoul"],
	["Nigeria", "Lagos"],
] as const;
const products = [
	["Notebook", 4.5],
	["Desk lamp", 32],
	["Office chair", 189],
	["USB-C cable", 9.9],
	['Monitor 27"', 279],
	["Keyboard", 59],
	["Coffee beans 1kg", 24],
	["Backpack", 75],
] as const;
const statuses = ["Pending", "Paid", "Shipped", "Delivered", "Cancelled"];
const notes = [
	"Gift wrap, please",
	"Leave at the door\nRing twice",
	'Customer said "urgent"',
	"Call before delivery, after 6 pm",
];

/** Small deterministic PRNG (mulberry32), so every visitor sees the same data. */
function random(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(next: () => number, items: readonly T[]): T {
	return items[Math.floor(next() * items.length)] as T;
}

/** Order data with `count` rows. `wide` adds columns, to exercise horizontal scrolling too. */
function orders(count: number, wide: boolean): string {
	const next = random(count);
	const header = [
		"Order ID",
		"Date",
		"Customer",
		"Country",
		"City",
		"Product",
		"Quantity",
		"Unit price",
		"Total",
		"Status",
	];
	if (wide) header.push("Email", "Note");
	const rows: string[][] = [header];
	const start = Date.UTC(2026, 0, 1);
	for (let i = 0; i < count; i++) {
		const first = pick(next, firstNames);
		const last = pick(next, lastNames);
		const [country, city] = pick(next, places);
		const [product, price] = pick(next, products);
		const quantity = 1 + Math.floor(next() * 5);
		const date = new Date(start + Math.floor(next() * 330) * 86_400_000).toISOString().slice(0, 10);
		const row = [
			`ORD-${String(i + 1).padStart(6, "0")}`,
			date,
			`${first} ${last}`,
			country,
			city,
			product,
			String(quantity),
			price.toFixed(2),
			(price * quantity).toFixed(2),
			pick(next, statuses),
		];
		if (wide) {
			row.push(`customer${i + 1}@example.com`, next() < 0.05 ? pick(next, notes) : "");
		}
		rows.push(row);
	}
	return stringifyCsv(rows);
}

export const samples: Sample[] = [
	{ id: "small", label: "Small · 3 rows", fileName: "sample-small.csv", createCsv: () => basics },
	{ id: "medium", label: "Medium · 1,000 rows", fileName: "sample-medium.csv", createCsv: () => orders(1_000, false) },
	{ id: "large", label: "Large · 100,000 rows", fileName: "sample-large.csv", createCsv: () => orders(100_000, true) },
];
