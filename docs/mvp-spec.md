# First public release: implementation target

This specification records the accepted product boundary. The application is being implemented against it; the release checks below remain required before calling the first public release complete.

## Product and platform

- A free, Apache-2.0, Linux desktop SQL client for solo developers and solo DevOps practitioners.
- MySQL and MariaDB are both required in the first public release. Connection profiles explicitly select the engine.
- AppImage is the first release artifact. No name has been selected.
- The application works without a subscription or application account. Database access uses the user's own server credentials.

## Connection workflow

- Create, edit, test, and save profiles for direct TCP, TLS, or SSH tunnel connections.
- Existing Tailscale, Cloudflare, or other system networking can be used by entering its reachable host and port; the application has no dedicated VPN setup flow in this release.
- Store a saved password in the Linux keyring. Users can choose to enter it for each connection instead.
- Display connection errors and the detected server version without exposing saved credentials.

## Query and data workflow

- Multiple SQL tabs with syntax highlighting, schema-aware completion, execute statement/selection/script, cancellation, results, and errors.
- Browse databases, tables, columns, indexes, views, and routines. View table rows in a paged grid, filter and sort them, and edit rows when they have an unambiguous key.
- Save queries and inspect query history. Show execution time and affected row count. Run EXPLAIN and display its result.
- Provide explicit transaction controls. Warn and require confirmation for `UPDATE` or `DELETE` without `WHERE`, and for schema-changing statements.
- Provide visual creation and editing of tables and indexes, with the SQL previewed before it is applied.
- Manage database users and grants, inspect active processes, and create or delete databases through SQL permissions the connected user already has.

## File and recovery workflow

- Import CSV into a chosen table with column mapping and preview; run an external SQL file against a chosen database with progress and errors.
- Export tables and query results to CSV or JSON. SQL export of a database or chosen tables uses the same artifact as backup so it has one restore contract.
- Back up the whole database by default, including tables, rows, views, triggers, procedures, functions, and events. Users may select tables; that backup includes their definitions, indexes, rows, and triggers.
- Restore an application backup to its source database or a different target database. Before writing, show the target and detected object conflicts. Stop on conflicts until the user chooses an empty target or explicitly chooses overwrite.
- Backup and restore run inside the AppImage without separately installed dump utilities. A completed backup is a readable SQL artifact; incomplete work is reported as incomplete, not as a valid backup.
- The app tests backup-to-restore round trips against both engines and each supported server series.

## Release checks

- Test on MySQL 8.0 and 8.4, and MariaDB 10.11, 11.4, and 11.8. Older or newer versions are not promised until tested.
- Verify direct, TLS, and SSH connections; keyring storage; destructive-query confirmation; import/export; and full and selected-table backup/restore.
- Build the AppImage on a Linux baseline suitable for its supported distributions and smoke-test it on CachyOS plus at least one non-Arch distribution.

## Build order

1. Desktop shell, connection profiles, transport, and query execution.
2. Backup and restore, including round-trip tests and alternate-target conflict handling.
3. Data grid, schema editor, history, saved queries, EXPLAIN, and administrative actions.
4. Import/export and AppImage release validation.

All four stages are required before the first public release. Intermediate builds are development milestones, not a reduced public MVP.
