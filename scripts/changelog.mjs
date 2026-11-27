/**
 * Returns the body of `version`'s section in a Keep a Changelog file, without its heading.
 * A section starts at `## [1.2.3]` (optionally followed by ` - date`) and ends at the next `## ` heading
 * or at the link reference definitions (`[1.2.3]: https://...`) at the end of the file.
 * Throws if the section is missing or empty, so a release cannot go out without notes.
 *
 * @param {string} changelog
 * @param {string} version
 * @returns {string}
 */
export function extractReleaseNotes(changelog, version) {
	const lines = changelog.split(/\r?\n/);
	const start = lines.findIndex((line) => isVersionHeading(line, version));
	if (start === -1) {
		throw new Error(`CHANGELOG.md has no section for ${version}. Add a "## [${version}] - YYYY-MM-DD" section.`);
	}
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith("## ") || /^\[[^\]]+\]:\s/.test(line));
	const notes = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
	if (notes === "") {
		throw new Error(`The CHANGELOG.md section for ${version} is empty.`);
	}
	return notes;
}

/**
 * @param {string} line
 * @param {string} version
 */
function isVersionHeading(line, version) {
	const match = /^##\s+\[?([^\]\s]+)\]?(\s|$)/.exec(line);
	return match?.[1] === version;
}
