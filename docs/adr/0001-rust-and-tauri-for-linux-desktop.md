---
status: superseded by ADR 0005
---

# Use Rust and Tauri for the desktop application

The first release is a Linux desktop SQL editor for MySQL and MariaDB. We chose Rust for the database and application core, and Tauri for the desktop shell and web-based interface. This lets the interface use a mature code editor while keeping database operations in a typed native core; Tauri supports Linux through the system webview. Go with Wails was a viable alternative, but Rust and Tauri better fit the planned boundary between an interactive SQL interface and native query execution. The choice does not settle the release feature set.

References: [Tauri architecture](https://tauri.app/concept/architecture/), [SQLx MySQL support](https://docs.rs/sqlx/latest/sqlx/mysql/index.html), [Wails introduction](https://wails.io/docs/introduction/).
