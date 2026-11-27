import { detectLocale } from "./locale";

describe("detectLocale", () => {
	it("returns the first supported language in preference order", () => {
		expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
		expect(detectLocale(["fr-FR", "en-GB", "ja"])).toBe("en");
		expect(detectLocale(["fr", "JA"])).toBe("ja");
	});

	it("falls back to en when no language is supported", () => {
		expect(detectLocale(["fr-FR", "de"])).toBe("en");
		expect(detectLocale([])).toBe("en");
	});
});
