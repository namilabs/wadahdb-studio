# wadahdb-studio
 
wadahdb-studio is a free, open-source Linux desktop client for MySQL, MariaDB, and SQLite. The project is an early pre-release implementation for solo developers and solo DevOps practitioners who want a capable SQL workbench without a subscription.

## Current features

- MySQL or MariaDB connection profiles over TCP, TLS, or an SSH tunnel.
- SQLite connection profiles using a local database file path.
- Optional password storage in the Linux Secret Service keyring.
- Multi-tab SQL editor with schema-aware completion, query history, saved queries, cancellation, EXPLAIN, and transaction controls.
- Schema browser for databases, tables, views, routines, triggers, and indexes.
- Paged data grid with server-side filtering and sorting; rows can be edited when the table has a primary key.
- SQL tools for tables, indexes, databases, users, grants, and process inspection. Generated SQL is shown in the editor before execution.
- Native backup and restore without `mysqldump` or `mysql` binaries. Full backups include table data, views, triggers, routines, and events; selected-table backups include their table data and triggers.
- Restore inspection with object conflict detection and explicit overwrite confirmation.
- CSV and SQL import, plus CSV and JSON export for query results and full tables.

**Status: early pre-release.** The source is available for experimentation and contributions, but there is no stable release yet. Use a disposable database for evaluation; do not rely on the app as your only production backup tool. The database-version compatibility matrix and cross-distribution AppImage behavior still need release validation. See [the MVP specification](docs/mvp-spec.md) for the target and remaining release checks.

## Getting started

Clone the repository, then follow the development instructions below:

```sh
git clone https://github.com/namilabs/wadahdb-studio.git
cd wadahdb-studio
```

The active application uses Go/Wails v2 and React/TypeScript. Linux is the primary development target. Release automation also builds experimental macOS and Windows packages; their native workflows still need validation. MySQL and MariaDB connections require a running server; SQLite uses local database files. To save passwords, run a Linux Secret Service provider (such as GNOME Keyring or KDE Wallet); SSH tunneling also requires the system `ssh` command.

## Development

Install Node.js, Go 1.25 or newer, Wails v2, and GTK3/WebKitGTK 4.1 development libraries. Use Node.js 22.13 or newer. Install Go and Wails outside this repository.

On Arch Linux / CachyOS:

```sh
sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk-4.1
```

```sh
go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0
# Ensure $(go env GOPATH)/bin is in PATH.
npm ci
npm run desktop:dev
```

Build the native Linux application:

```sh
npm run desktop:build
./build/bin/wadahdb-studio
```

Build an AppImage with linuxdeploy and its GTK/AppImage plugins available:

```sh
npm run desktop:appimage
./build/appimage/wadahdb-studio_0.1.0_amd64.AppImage
```

Set `APPIMAGE_RUNTIME_FILE` to a downloaded x86_64 AppImage runtime for offline packaging. Set `LINUXDEPLOY` and `LINUXDEPLOY_DIR` if the tools are installed elsewhere. This script bundles GTK/WebKit dependencies. AppImages inherit the build host's glibc requirements; release artifacts must be built and tested on the supported distribution baseline. See [Wails Linux dependencies](https://wails.io/docs/gettingstarted/installation/) and [migration notes](docs/go-migration.md).

Verify the backend:

```sh
go test -tags webkit2_41 ./...
# Optional disposable database integration test:
GUI_SQL_TEST_DSN='user:password@tcp(127.0.0.1:3306)/' go test -tags webkit2_41 -v ./...
```

## Release packages

Run **Actions → Release → Run workflow** with a version to build and publish through CI/CD without a version-bump commit or pre-created tag. Publishing an existing GitHub release also triggers native builds. Packages include Linux x86_64 AppImage, macOS Apple Silicon/Intel `.tar.gz` bundles, Windows x86_64 portable ZIP, and `SHA256SUMS`. macOS and Windows builds are experimental and unsigned; macOS builds are not notarized. See [release instructions and platform requirements](docs/releases.md).

The package version is currently `0.1.0`; the recommended first public milestone is `0.1.0-alpha.1`, not beta or RC, until compatibility and native release checks are complete. Release builds use the version from the tag or workflow input; CI applies it only in its build workspace, without committing package changes.

## Backend architecture

Go packages are organized by feature, with an engine registry and optional capabilities for future database adapters. MySQL, MariaDB, and SQLite are currently implemented. See [backend architecture](docs/backend-architecture.md) for module responsibilities and adding engines.

## Product decisions

- Linux desktop is first; AppImage is the first distribution format.
- MySQL and MariaDB are explicit profile choices. Compatibility is being targeted at MySQL 8.0/8.4 and MariaDB 10.11/11.4/11.8.
- Apache-2.0 license; see [LICENSE](LICENSE).
- No app account, subscription, telemetry, or vendor-hosted database service is required.
- Tailscale, Cloudflare Tunnel, and other system networking work through a reachable host and port; there are no dedicated VPN setup flows yet.
- SSH tunnels use the system `ssh` client.

## Backup format

Backups are readable `.sql` files with a small wadahdb-studio manifest and statement markers. The native restore flow understands that format and can move a backup to another database. Keep an independent copy of important production backups and inspect the target before confirming an overwrite.

## Contributing and support

Bug reports, documentation improvements, tests, and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation, and contribution expectations, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards.

Use [GitHub Issues](https://github.com/namilabs/wadahdb-studio/issues) for reproducible bugs and feature requests. Remove credentials, connection details, real database contents, and sensitive SQL from reports. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. This is a community project, with no guaranteed support or response times.

## AI-assisted development

This project is developed with the help of AI coding tools, including assistance with code, documentation, and design. AI assistance is disclosed openly; it is not a guarantee of correctness or security. Maintainers remain responsible for reviewing changes, and contributors must understand and validate everything they submit. AI-assisted contributions are welcome under the same standards as any other contribution.

Never submit passwords, private keys, production data, or confidential SQL to AI services while working on this project.

## License

Licensed under [Apache-2.0](LICENSE). Third-party dependencies retain their own licenses. The software is provided without warranty; review and test it before using it with important data.
