# Desktop SQL Client

An application for working with MySQL and MariaDB servers from a Linux desktop.

## Language

**Connection profile**:
A saved description of one server connection, including whether the server is MySQL or MariaDB and how it is reached.
_Avoid_: Account, database connection

**Database**:
A named collection of tables and other SQL objects on a MySQL or MariaDB server. In these engines, it is also called a schema.
_Avoid_: Server, connection

**Backup**:
A restorable SQL artifact for one database. It includes the whole database by default or a user-selected set of tables.
_Avoid_: Export

**Restore**:
Applying a backup artifact to a database server to recreate its captured SQL objects and data.
_Avoid_: Import

**Import**:
Loading data from a CSV file or executing an external SQL file against a chosen database.
_Avoid_: Restore

**Export**:
Writing a table or query result as CSV or JSON for use outside the application. SQL output for a database or chosen tables is a backup artifact.
_Avoid_: Backup
