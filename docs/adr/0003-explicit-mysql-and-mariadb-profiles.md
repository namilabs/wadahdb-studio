---
status: accepted
---

# Keep MySQL and MariaDB explicit in connection profiles

The public MVP supports both MySQL and MariaDB, including backup and restore. A connection profile records which engine it targets; shared workflows can use a common interface, while engine-specific SQL and dump behavior remain separate. Treating the engines as indistinguishable would make backup compatibility and future dialect differences difficult to explain or fix.

References: [MySQL mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html), [MariaDB mariadb-dump](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump).
