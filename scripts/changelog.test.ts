// @vitest-environment node
import { readFileSync } from "node:fs";
import { extractReleaseNotes } from "./changelog.mjs";

const changelog = `# Changelog

## [Unreleased]

- Not released yet

## [1.1.0] - 2026-12-01

### Added

- New feature

## 1.0.0

- First

[Unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
`;

describe("extractReleaseNotes", () => {
	it("returns the section body up to the next version heading", () => {
		expect(extractReleaseNotes(changelog, "1.1.0")).toBe("### Added\n\n- New feature");
	});

	it("accepts headings without brackets and stops at link references", () => {
		expect(extractReleaseNotes(changelog, "1.0.0")).toBe("- First");
	});

	it("does not match a version that only shares a prefix", () => {
		expect(() => extractReleaseNotes(changelog, "1.1")).toThrow("no section for 1.1");
	});

	it("throws when the section is empty", () => {
		expect(() => extractReleaseNotes("## [2.0.0]\n\n## [1.0.0]\n- x\n", "2.0.0")).toThrow("is empty");
	});

	it("handles CRLF line endings", () => {
		expect(extractReleaseNotes("## [1.0.0]\r\n\r\n- a\r\n- b\r\n", "1.0.0")).toBe("- a\n- b");
	});

	it("finds a section for every released version in the real CHANGELOG.md", () => {
		const real = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
		expect(extractReleaseNotes(real, "0.1.0")).toContain("Initial release.");
		expect(extractReleaseNotes(real, "0.1.1")).toContain("No code changes.");
	});
});
