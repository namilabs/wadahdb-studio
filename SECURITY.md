# Security policy

## Project status

wadahdb-studio is early pre-release software. Security fixes target the current `main` branch; there are no maintained stable release branches or guaranteed response times yet.

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, or sensitive reproduction data in public issues or pull requests.

Use the repository's GitHub **Security → Advisories → Report a vulnerability** feature when private vulnerability reporting is enabled:

https://github.com/namilabs/wadahdb-studio/security/advisories/new

If that option is unavailable, open an issue asking the maintainers to enable private vulnerability reporting, without describing the vulnerability or including exploit details. Wait for a private reporting channel before sharing sensitive information.

Include the affected commit/version, platform, impact, and minimal reproduction using synthetic data. Redact credentials, hostnames, private keys, and database contents. Coordinate public disclosure with the maintainers after a fix is available.

## Safe use

- Treat database access as privileged. Use least-privilege accounts and disposable servers for evaluation and integration tests.
- Query confirmation dialogs are convenience safeguards, not authorization boundaries.
- Inspect SQL imports and restore targets. Backups and exports may contain sensitive data; store and share them securely.
- Keep independent backups. Do not assume a backup is valid until you have tested restoration.
- Use TLS or a trusted SSH tunnel when appropriate. Protect local profile files, query history, and the operating system keyring.
- Do not send confidential SQL or production data to AI tools.
