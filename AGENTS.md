# Repository Guidelines

## Project Structure & Module Organization

wadahdb-studio uses Go/Wails v2 and React/TypeScript for a Linux MySQL/MariaDB client.

- `main.go` wires the desktop app; `app.go` exposes Wails methods and `dialogs.go` handles native dialogs.
- `internal/engine/` defines driver and optional feature contracts; `internal/engine/mysql/` implements MySQL/MariaDB.
- `internal/database/` manages sessions; `internal/profiles/` owns profile repositories and credentials.
- `internal/backup/`, `sqlsyntax/`, `transfer/`, and `fileio/` handle formats, SQL syntax, CSV, and files.
- `src/` contains React components, `api.ts` (backend facade), dialogs, and styles.
- Go tests live beside their packages; `app_test.go` checks desktop compatibility.
- `scripts/` contains AppImage packaging; `build/icons/` contains application artwork.
- `docs/` contains specifications, migration notes, and architecture decisions.
- `_rust/` archives the previous Tauri implementation. Develop the active Go/Wails app.
- `dist/`, `wailsjs/`, and `build/bin/` are generated outputs; avoid editing them manually.

## Build, Test, and Development Commands

Install Node.js, Go 1.25+, Wails v2, and GTK3/WebKitGTK 4.1 development libraries; see `README.md`.

- `npm ci`: install locked frontend dependencies.
- `npm run desktop:dev`: start the native app.
- `npm run dev`: start the Vite frontend server alone.
- `npm run build`: check TypeScript and bundle the frontend.
- `npm run desktop:build`: build `build/bin/wadahdb-studio`.
- `npm run desktop:appimage`: package the Linux AppImage.
- `go test -tags webkit2_41 ./...`: run backend tests.
- `go vet -tags webkit2_41 ./...`: check Go code.

## Coding Style & Naming Conventions

Format Go changes with `gofmt`; use tabs and idiomatic exported names. Follow existing TypeScript style: two-space indentation, single quotes, and omitted semicolons. Use PascalCase component names and camelCase functions. Preserve strict TypeScript checks and keep backend calls behind `src/api.ts`. No dedicated frontend linter is configured.

## Testing Guidelines

Use Go's `testing` package, `*_test.go` filenames, and `TestXxx` functions. Add regression coverage for query safety, backup parsing, restore behavior, and profile compatibility. No numeric coverage threshold is configured.

The live roundtrip test uses `GUI_SQL_TEST_DSN` and creates/drops databases; use a disposable server. Otherwise it skips. For UI changes, build the frontend and check the native app.

## Commit & Pull Request Guidelines

Git history is unavailable. Prefer imperative commit messages, optionally using `fix:` or `feat:`. Pull requests should describe behavior, validation, and relevant issues. Include UI screenshots and document compatibility changes.

## Security & Compatibility

Keep credentials and real database exports out of commits. Use the system keyring for saved passwords. Add engines through registered drivers and optional feature interfaces; see `docs/backend-architecture.md`. Preserve existing profile fields and backup formats; review `docs/go-migration.md` before changing persistence or restore behavior.
