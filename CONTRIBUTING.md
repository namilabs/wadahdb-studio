# Contributing

Thanks for helping improve wadahdb-studio. This is an early pre-release Linux MySQL/MariaDB desktop client, built with Go/Wails v2 and React/TypeScript.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For larger features, new engines, dependencies, or persistence changes, discuss the approach in an issue first.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

Fork and clone the repository, then follow the prerequisites and setup in [README.md](README.md). Use Node.js 22 or newer, Go 1.25 or newer, Wails v2.16.0, and GTK3/WebKitGTK 4.1 development libraries.

```sh
npm ci
npm run desktop:dev
```

The frontend-only Vite server (`npm run dev`) does not provide the native backend. Use the desktop app to check database and native-dialog behavior.

## Code and compatibility

- Format Go with `gofmt`. Follow existing TypeScript style: two-space indentation, single quotes, no semicolons.
- Keep backend calls behind `src/api.ts`. Add engine capabilities through the existing driver interfaces.
- Do not manually edit generated `dist/`, `wailsjs/`, or `build/bin/` files.
- Preserve profile fields, keyring identities, and backup compatibility. Read [backend architecture](docs/backend-architecture.md) and [migration notes](docs/go-migration.md) before changing these contracts.
- Add regression tests for behavior changes, especially query safety, backup parsing, restore, and profile compatibility.
- Keep pull requests focused; avoid unrelated refactoring.

## Validation

```sh
npm run build
go test -tags webkit2_41 ./...
go vet -tags webkit2_41 ./...
npm run desktop:build
```

For UI changes, check the native app and include screenshots where useful. State which commands you ran and which checks you could not perform.

The optional live integration test uses `GUI_SQL_TEST_DSN` and creates/drops databases. Use only a disposable server and a dedicated test account. Without that variable, the test skips. Never run it against production.

## Submitting a pull request

Describe the problem, the approach, user-visible effects, and validation. Link the relevant issue if one exists. Sanitize screenshots, logs, SQL, fixtures, and exports: no credentials, private keys, personal information, or real database dumps. `.gitignore` is a convenience, not a secret scanner.

AI-assisted contributions are welcome. Disclose substantial AI assistance in the pull request, understand the submitted code, verify generated claims, and run the relevant checks. Do not send confidential project or database data to AI services. The contributor remains responsible for correctness, security, and the right to contribute the work.

Unless explicitly stated otherwise, contributions intentionally submitted for inclusion are licensed under the project's [Apache-2.0 license](LICENSE), consistent with its contribution terms. Retain required third-party license and attribution notices.
