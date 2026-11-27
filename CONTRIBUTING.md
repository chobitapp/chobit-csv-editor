# Contributing to chobit-csv-editor

Thanks for your interest in contributing! Bug reports, feature requests, and pull requests are all welcome.

## Reporting bugs and requesting features

Open an issue on [GitHub](https://github.com/chobitapp/chobit-csv-editor/issues). For bugs, please include:

- The version of chobit-csv-editor, React, and your browser
- Steps to reproduce, ideally with a small CSV sample
- What you expected and what happened instead

If the problem involves a specific encoding (for example Shift_JIS or UTF-16), attaching the file helps a lot.

To report a security vulnerability, do not open a public issue. Follow [SECURITY.md](SECURITY.md) instead.

## Development setup

You need Node.js 22 or later and pnpm (the version is pinned in the `packageManager` field of `package.json`).

```sh
git clone https://github.com/chobitapp/chobit-csv-editor.git
cd chobit-csv-editor
pnpm install
pnpm dev   # Start the demo app at http://localhost:5173
```

The library source is in `src/` (`src/core/` for framework-independent logic, `src/react/` for the React components and hooks). The demo app in `demo/` imports the source directly, so changes show up immediately.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Make your change, and add or update tests in the `*.test.ts(x)` files next to the code.
3. If you change the public API or behavior, update `README.md`. Add a line for user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.
4. Run the full check before opening a pull request:

   ```sh
   pnpm validate   # Biome lint, typecheck, tests, and package checks
   ```

   `pnpm format` fixes formatting and import order.
5. Open a pull request describing what you changed and why.

Please keep pull requests focused on one change. For larger changes, opening an issue to discuss the approach first saves everyone time.

## Releasing (maintainers)

Releases are published from a maintainer's machine, not from GitHub Actions, so no publishing credentials are stored on GitHub. The release notes on [GitHub Releases](https://github.com/chobitapp/chobit-csv-editor/releases) come from [CHANGELOG.md](CHANGELOG.md).

1. Rename the `## [Unreleased]` section of `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it. Write the entries for users of the library: what changed for them, and what they need to do when upgrading.
2. Bump `version` in `package.json` to `X.Y.Z`, commit, and push `main`.
3. Check, then release:

   ```sh
   pnpm release -- --dry-run   # Runs the checks and prints the release notes
   pnpm release
   ```

   `pnpm release` refuses to run unless `CHANGELOG.md` has a non-empty section for the version, the working tree is clean, and `main` matches `origin/main`. It then publishes to npm (`prepublishOnly` runs `pnpm validate` first), pushes the `vX.Y.Z` tag, and creates the GitHub Release with that section as its notes. Prerelease versions (`X.Y.Z-beta.N`) are published under the npm `next` tag and marked as prereleases on GitHub. If a step fails, fix the cause and run `pnpm release` again; steps already done are skipped. To fix the notes of a published release, edit `CHANGELOG.md` and run `pnpm release` again: it updates the existing GitHub Release.
4. Deploy the demo with `pnpm deploy:demo` (see [Deploying the demo](README.md#deploying-the-demo)).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
