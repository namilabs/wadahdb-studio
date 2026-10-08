# Go migration

## Active implementation

The root Go module and Wails configuration replace the Tauri backend. React keeps the same typed API facade and feature UI. The SQL editor is bundled locally for offline use. Build output is `build/bin/wadahdb-studio`; AppImage output is `build/appimage/`.

## Compatibility

- Profiles retain `$XDG_CONFIG_HOME/dev.nanti.sql/profiles.json` (default `~/.config/dev.nanti.sql/profiles.json`), with the existing camelCase JSON fields.
- SQLite profiles add an optional `databasePath` field while preserving existing MySQL/MariaDB profile fields.
- Saved passwords use Secret Service attributes `service=dev.nanti.sql` and `username=<profile id>`. Existing secrets in the default collection are discoverable. Secrets in another collection may require entering and saving the password again.
- Version 1 SQL backups retain their header, manifest, and statement delimiters. Restore relocates schema identifiers without rewriting strings or comments.
- Wails has a different webview origin. Browser-local saved queries/history from the Tauri window are not automatically transferred. Keep the previous app available to copy saved SQL before switching. No existing profile or backup files are deleted.

## Rollback

The previous Rust/Tauri sources, local Cargo cache, and Rust toolchains are grouped under `_rust/` (`src-tauri/`, `.cargo/`, and `.rustup/`).

`_rust/src-tauri/` retains the previous sources and local artifact as an inactive rollback reference. Do not run both applications while changing shared connection profiles. To resume the previous app, launch its existing AppImage, or restore the Tauri npm dependencies and development command. Newly created backups and profiles remain readable by the old implementation; oversized integer cells are represented as strings in the Go UI to avoid JavaScript precision loss.

## Verification

Automated tests cover legacy backup parsing, SQL delimiters/literals, schema relocation, profile JSON, and a live MariaDB roundtrip. The live test covers full and selected backups, binary/Unicode data, views/triggers/routines/events, overwrite collisions, unrelated-object retention, transactions, CSV rollback, export, and query cancellation.

The full MySQL/MariaDB version matrix and cross-distribution AppImage validation remain release gates. TLS and SSH need live environment verification; TLS validates server certificates using the system trust store.

Local validation on CachyOS: Go 1.27.1 / Wails 2.16.0; GTK 3.24.52 / WebKitGTK 2.52.6. TypeScript/Vite build, Go tests, `go vet`, live MariaDB integration, native desktop startup, and rendered Monaco UI passed. The generated AppImage is approximately 110 MiB; the native executable is approximately 24 MiB.

The packaged AppImage startup also passed after bundling WebKit subprocesses and setting their paths in the custom AppRun launcher. Native and packaged applications were closed after verification; the disposable MariaDB container was stopped.
