---
status: accepted
---

# Modular backend with optional engine capabilities

The application will support SQL, key/value, document, and search engines. A universal SQL repository would force Redis, MongoDB, and Elasticsearch into operations they do not share.

Use feature packages within one Go module. Keep the Wails interface in the root and move engine-specific behavior into registered adapters. The mandatory engine connection contract covers version and cleanup; query, schema, transaction, table, backup, and transfer contracts are optional. Introduce non-SQL feature contracts alongside their adapters and UI.

Profile storage uses a repository and a separate secret-store interface. Profile validation is delegated to the selected driver. Shared packages retain existing JSON fields, keyring identity, and backup compatibility.

MySQL and MariaDB remain the implemented engines. Additional drivers require real adapter implementations and frontend support. See [backend architecture](../backend-architecture.md) for extension steps and verification.
