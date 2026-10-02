---
status: accepted
---

# Go and Wails for Linux desktop

User decision: migrate the existing implementation to Go. Go owns connections, SQL execution, SSH lifecycle, keyring access, native dialogs, and file operations. Wails v2 embeds the existing React/Monaco interface through GTK3 and WebKitGTK 4.1 (`webkit2_41`). `database/sql` with `go-sql-driver/mysql` supports both MySQL and MariaDB profiles.

A pinned connection preserves the editor database and transaction state. Separate pool connections handle metadata, snapshots, import, and restore. Backup files keep version 1 of the existing manifest format. Passwords stay in Secret Service, not profile JSON.

This supersedes ADR 0001. Existing Rust sources remain inactive for rollback during the migration window; npm scripts and release artifacts use Go. Performance claims require measurements; database/network latency and grid rendering remain major contributors to desktop responsiveness.

References: [Wails installation](https://wails.io/docs/gettingstarted/installation/), [Go MySQL driver](https://github.com/go-sql-driver/mysql).
