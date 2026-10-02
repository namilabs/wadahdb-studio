# Desktop SQL client: product brief

Status: accepted direction; implementation underway.

## Settled direction

- Audience: solo developers and solo DevOps practitioners who want a capable SQL desktop client without a subscription.
- Initial platform: Linux desktop. The first distributable format is AppImage; development and early testing happen on CachyOS.
- Initial database engines: MySQL and MariaDB.
- Name: undecided.
- License: Apache-2.0 (see [ADR 0002](adr/0002-apache-2-license.md)).
- Desktop stack: Go and Wails v2 (see [ADR 0005](adr/0005-go-and-wails.md)).
- Connections: direct TCP, TLS, and SSH tunneling. Existing system-level private networking should work through a reachable host and port; dedicated VPN integrations are not in the initial scope.
- Credentials: save passwords in the operating system keyring, with an option to enter them each time.
- Destructive SQL: warn and ask for confirmation before running an `UPDATE` or `DELETE` without a `WHERE` clause, or schema-changing SQL. This is a user-interface safeguard, not a database permission boundary.
- Backup selection: default to the entire database and allow the user to select individual tables.
- A full-database backup includes tables and data, views, triggers, procedures, functions, and events. A selected-table backup includes table definitions, data, indexes, and their triggers.
- The public MVP includes SQL tabs, schema browsing, editable data grids, query history, saved queries, EXPLAIN, visual table and index editing, user and privilege management, process inspection, and database creation/deletion.
- Backup and restore are scheduled before import and export in implementation work.
- Import includes CSV and SQL files. Export includes CSV and JSON for tables and query results, plus SQL for databases and tables.
- Restore allows choosing a different target database. If target objects already exist, it stops and requires an explicit choice of an empty target or an overwrite operation.
- Backup and restore must work from the AppImage without separately installed dump utilities.
- MySQL and MariaDB are explicit connection profile types so engine-specific behavior can be handled correctly.

## Proposed compatibility targets

- Test against MySQL 8.0 and 8.4, and MariaDB 10.11, 11.4, and 11.8. Other versions are not promised until tested.
