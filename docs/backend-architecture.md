# Backend architecture

The backend is a modular monolith: one desktop executable, with packages owning specific behavior. MySQL and MariaDB are the implemented engines. PostgreSQL, Redis, Elasticsearch, and MongoDB are future adapters, not currently usable connections.

```text
React → src/api.ts → App (Wails interface)
                       ├─ profiles.Service → Repository / SecretStore
                       ├─ database.Manager → engine.Driver → engine.Connection
                       │                                      └─ optional features
                       └─ native dialogs / CSV preview
```

## Package responsibilities

| Package | Responsibility |
| --- | --- |
| Root `main` | Wiring, Wails lifecycle, desktop method contract, native dialogs |
| `internal/model` | Existing profile fields and desktop result types |
| `internal/engine` | Driver registry, engine metadata, connection and feature contracts |
| `internal/database` | Session routing by profile ID, replacement, disconnect, shutdown |
| `internal/engine/mysql` | MySQL/MariaDB protocol, TLS/SSH, query execution, schema, transactions, table editing, backup, import/export |
| `internal/profiles` | Validation orchestration, JSON repository, keyring adapter, credential resolution |
| `internal/sqlsyntax` | MySQL/MariaDB statement splitting, identifier quoting, safety checks, schema relocation |
| `internal/backup` | Reading legacy v1 MySQL/MariaDB backup files |
| `internal/transfer` | Connection-independent CSV preview |
| `internal/fileio` | Atomic file replacement |

SQL execution and snapshot/restore logic stay in the MySQL adapter because their syntax and behavior depend on the engine. They must not become shared Redis or MongoDB implementations.

## Adding an engine

1. Add `internal/engine/<engine>/` with a driver implementing `engine.Driver`.
2. Provide metadata, profile validation, and `Open(ctx, profile, password)`. Register the driver in `NewApp()` before concurrent use.
3. Return a connection implementing only `Version()` and `Close()` as the mandatory contract. Each opened connection owns its resources; a failed open must release partial resources. Close must terminate work and release clients, connections, and tunnels.
4. Implement applicable optional feature interfaces. SQL adapters can use query, schema, table, transaction, backup, and transfer contracts. Key/value, document, and search adapters can introduce small feature interfaces and corresponding desktop methods when their UI is implemented. They do not need SQL or `database/sql`.
5. Advertise only implemented capabilities. `ListEngines()` and `api.engines()` expose metadata; desktop methods check the actual feature contract and return `engine.ErrUnsupported` for unsupported operations.
6. Add adapter tests and extend the frontend profile types, connection options, and workbench views. The current UI still offers MySQL/MariaDB. Add URI, authentication, or engine-specific profile fields only when an adapter needs them, preserving old JSON compatibility.

The manager serializes connection replacement and shutdown. Different profile IDs remain independently routed, including across engine families. Adapter operations own execution synchronization; MySQL preserves its pinned editor connection and transaction state. Separate pool connections continue to serve metadata, backup snapshots, import, and restore.

## Persistence and compatibility

`App` keeps the existing method names and argument order. Root model aliases retain JSON fields. Profile storage and keyring identity remain `dev.nanti.sql`; browser saved-query/history keys and backup markers remain unchanged. Engine-specific profile validation lives in the driver, so non-SQL engines can accept different credentials.

Dependencies are wired explicitly in `NewApp()`. Tests substitute repositories, secret stores, and drivers without desktop runtime or live databases.

## Verification

```sh
npm run build
go test -race -tags webkit2_41 ./...
go vet -tags webkit2_41 ./...
npm run desktop:build
```

The MySQL adapter roundtrip test covers backup/restore, schema objects, table editing, transactions, CSV rollback, large integers, and cancellation. Set `GUI_SQL_TEST_DSN` to a disposable database server to run it; otherwise it skips. Manager tests use Redis/MongoDB-like fakes to prove independent routing and unsupported SQL handling, not actual engine connectivity.
