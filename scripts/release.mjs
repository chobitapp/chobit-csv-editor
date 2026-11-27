#!/usr/bin/env node
// Publishes the version in package.json to npm and creates its GitHub Release, with the notes taken from
// that version's section in CHANGELOG.md. Run from the maintainer's machine: `pnpm release` (`-- --dry-run`
// only runs the checks and prints the notes).
//
// Each step is skipped if it was already done, so the script can be re-run after a failure partway
// (for example, npm publish succeeded but creating the GitHub Release failed).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extractReleaseNotes } from "./changelog.mjs";

const dryRun = process.argv.includes("--dry-run");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { name, version } = pkg;
const tag = `v${version}`;
// Ask the registry we publish to, not a mirror or proxy set in the user's npm config, which may lag behind.
const registry = pkg.publishConfig?.registry ?? "https://registry.npmjs.org/";
// A prerelease (e.g. 1.0.0-beta.1) must not become "latest" on npm or on GitHub.
const prerelease = version.includes("-");

/**
 * Runs a command and returns its trimmed stdout. Throws if it exits with a non-zero status.
 * @param {string} command
 * @param {string[]} args
 * @param {import("node:child_process").ExecFileSyncOptions} [options]
 * @returns {string}
 */
function run(command, args, options = {}) {
	return String(
		execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }),
	).trim();
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function succeeds(command, args) {
	try {
		run(command, args);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

/** @param {string} message */
function step(message) {
	console.log(`\n▶ ${message}`);
}

// --- Checks: everything that can fail is checked before anything is published. ---

/** @type {string} */
let notes;
try {
	notes = extractReleaseNotes(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), version);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`Releases are made from main, but the current branch is ${branch}.`);

// Same condition as pnpm publish's own git check, so it fails here before anything happens.
if (run("git", ["status", "--porcelain"]) !== "") {
	fail("The working tree has uncommitted or untracked files. Commit or remove them first.");
}

run("git", ["fetch", "--quiet", "--tags", "origin", "main"]);
const head = run("git", ["rev-parse", "HEAD"]);
if (head !== run("git", ["rev-parse", "origin/main"])) {
	fail("main is not the same as origin/main. Push (or pull) first, so the release commit is on GitHub.");
}

const localTag = succeeds("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
if (localTag && run("git", ["rev-parse", `${tag}^{commit}`]) !== head) {
	fail(`Tag ${tag} already exists and points to a different commit.`);
}

if (!succeeds("gh", ["auth", "status"])) fail("The GitHub CLI is not signed in. Run `gh auth login`.");

/** Whether this exact version is already on npm. Compares the output, not only the exit status. */
function isPublished() {
	try {
		return run("npm", ["view", `${name}@${version}`, "version", "--registry", registry]) === version;
	} catch {
		return false;
	}
}
const published = isPublished();
const releaseExists = succeeds("gh", ["release", "view", tag]);

console.log(`Releasing ${name}@${version} (${tag})${prerelease ? " as a prerelease" : ""}`);
console.log(`\n--- Release notes from CHANGELOG.md ---\n${notes}\n---------------------------------------`);

if (dryRun) {
	console.log("\nDry run: all checks passed. Nothing was published.");
	console.log(`npm publish: ${published ? "already done" : "to do"}`);
	console.log(`git tag:     ${localTag ? "already done" : "to do"}`);
	console.log(`GitHub Release: ${releaseExists ? "exists, notes will be updated" : "to do"}`);
	process.exit(0);
}

// --- Release ---

if (published) {
	step(`${name}@${version} is already on npm. Skipping publish.`);
} else {
	step("Publishing to npm (prepublishOnly runs pnpm validate first)");
	// stdio is inherited so npm can prompt for a one-time password.
	execFileSync("pnpm", ["publish", ...(prerelease ? ["--tag", "next"] : [])], { stdio: "inherit" });
}

if (!localTag) {
	step(`Creating tag ${tag}`);
	run("git", ["tag", "--annotate", tag, "--message", tag]);
}
step(`Pushing tag ${tag}`);
execFileSync("git", ["push", "origin", `refs/tags/${tag}`], { stdio: "inherit" });

// Link to the full diff since the previous release tag, when there is one.
let body = notes;
try {
	const previous = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*", `${tag}^`]);
	body += `\n\n**Full Changelog**: https://github.com/chobitapp/chobit-csv-editor/compare/${previous}...${tag}`;
} catch {
	// First tagged release: no previous tag to compare with.
}

if (releaseExists) {
	step(`Updating the notes of the existing GitHub Release ${tag}`);
	run("gh", ["release", "edit", tag, "--notes-file", "-"], { input: body, stdio: ["pipe", "pipe", "pipe"] });
} else {
	step(`Creating GitHub Release ${tag}`);
	const args = ["release", "create", tag, "--verify-tag", "--title", tag, "--notes-file", "-"];
	if (prerelease) args.push("--prerelease");
	run("gh", args, { input: body, stdio: ["pipe", "pipe", "pipe"] });
}

console.log(`\n✔ Released ${name}@${version}: ${run("gh", ["release", "view", tag, "--json", "url", "--jq", ".url"])}`);
