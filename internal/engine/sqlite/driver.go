package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
	"wadahdb-studio/internal/sqlsyntax"
)

type Driver struct{}

func NewDriver() *Driver { return &Driver{} }
func (d *Driver) Descriptor() engine.Descriptor {
	return engine.Descriptor{ID: "sqlite", Name: "SQLite", Kind: "sql", DefaultPort: 0,
		Capabilities: engine.Capabilities{SQL: true, Transactions: true, Schema: true, Tables: true}}
}
func (d *Driver) ValidateProfile(p model.ConnectionProfile) error {
	if p.Engine != "sqlite" || p.DatabasePath == nil || strings.TrimSpace(*p.DatabasePath) == "" {
		return errors.New("Valid SQLite engine and database file path are required")
	}
	return nil
}
func (d *Driver) Open(ctx context.Context, p model.ConnectionProfile, _ string) (engine.Connection, error) {
	if e := d.ValidateProfile(p); e != nil {
		return nil, e
	}
	c := &Connection{ctx: ctx}
	if e := c.connect(*p.DatabasePath); e != nil {
		return nil, e
	}
	return c, nil
}

type Connection struct {
	ctx      context.Context
	mu       sync.Mutex
	db       *sql.DB
	conn     *sql.Conn
	tx       bool
	version  string
	database string
}

func (c *Connection) Version() string { return c.version }
func (c *Connection) connect(path string) error {
	db, e := sql.Open("sqlite", path)
	if e != nil {
		return e
	}
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(c.ctx, 12*time.Second)
	defer cancel()
	conn, e := db.Conn(ctx)
	if e != nil {
		db.Close()
		return e
	}
	var version string
	if e = conn.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&version); e != nil {
		conn.Close()
		db.Close()
		return e
	}
	c.db = db
	c.conn = conn
	c.version = "SQLite " + version
	c.database = "main"
	return nil
}
func (c *Connection) get() (*sql.Conn, error) {
	if c.conn == nil {
		return nil, errors.New("Connect to the server first")
	}
	return c.conn, nil
}
func (c *Connection) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return nil
	}
	if c.tx {
		_, _ = c.conn.ExecContext(c.ctx, "ROLLBACK")
	}
	e := c.conn.Close()
	c.conn = nil
	if closeErr := c.db.Close(); e == nil {
		e = closeErr
	}
	c.db = nil
	return e
}
func (c *Connection) BeginTransaction() error {
	conn, e := c.get()
	if e != nil {
		return e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.tx {
		return errors.New("Transaction is already active")
	}
	if _, e = conn.ExecContext(c.ctx, "BEGIN"); e != nil {
		return e
	}
	c.tx = true
	return nil
}
func (c *Connection) FinishTransaction(commit bool) error {
	conn, e := c.get()
	if e != nil {
		return e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.tx {
		return errors.New("No active transaction")
	}
	q := "ROLLBACK"
	if commit {
		q = "COMMIT"
	}
	if _, e = conn.ExecContext(c.ctx, q); e != nil {
		return e
	}
	c.tx = false
	return nil
}
func (c *Connection) CancelQuery() error { return nil }
func (c *Connection) SelectDatabase(database string) error {
	list, e := c.ListDatabases()
	if e != nil {
		return e
	}
	for _, item := range list {
		if item.Name == database {
			c.database = database
			return nil
		}
	}
	return errors.New("Database not found")
}
func (c *Connection) ExecuteQuery(query string, confirmed bool) (model.QueryResult, error) {
	out := model.QueryResult{Columns: []string{}, Rows: [][]interface{}{}}
	if w := sqlsyntax.Warning(query); w != "" && !confirmed {
		return out, errors.New("CONFIRM_REQUIRED:" + w)
	}
	conn, e := c.get()
	if e != nil {
		return out, e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	start := time.Now()
	defer func() { out.ElapsedMs = time.Since(start).Milliseconds() }()
	for n, st := range sqlsyntax.Statements(query) {
		switch sqlsyntax.Keyword(st) {
		case "SELECT", "WITH", "EXPLAIN", "PRAGMA":
			r, e := conn.QueryContext(c.ctx, st)
			if e != nil {
				return out, fmt.Errorf("Statement %d: %w", n+1, e)
			}
			cols, e := r.Columns()
			if e != nil {
				r.Close()
				return out, e
			}
			out.Columns = cols
			out.Rows = [][]interface{}{}
			out.Truncated = false
			for r.Next() {
				row, e := cells(r)
				if e != nil {
					r.Close()
					return out, e
				}
				if len(out.Rows) < 1000 {
					out.Rows = append(out.Rows, row)
				} else {
					out.Truncated = true
				}
			}
			e = r.Err()
			r.Close()
			if e != nil {
				return out, e
			}
		default:
			r, e := conn.ExecContext(c.ctx, st)
			if e != nil {
				return out, fmt.Errorf("Statement %d: %w", n+1, e)
			}
			count, _ := r.RowsAffected()
			out.AffectedRows += count
		}
	}
	return out, nil
}
func (c *Connection) ListDatabases() ([]model.SchemaItem, error) {
	conn, e := c.get()
	if e != nil {
		return nil, e
	}
	r, e := conn.QueryContext(c.ctx, "PRAGMA database_list")
	if e != nil {
		return nil, e
	}
	defer r.Close()
	out := []model.SchemaItem{}
	for r.Next() {
		var seq int
		var name, path string
		if e = r.Scan(&seq, &name, &path); e != nil {
			return nil, e
		}
		out = append(out, model.SchemaItem{Name: name, Kind: "database"})
	}
	return out, r.Err()
}
func (c *Connection) ListObjects(database string) ([]model.SchemaItem, error) {
	conn, e := c.get()
	if e != nil {
		return nil, e
	}
	q := "SELECT name, lower(type) FROM " + sqlsyntax.QuoteIdentifier(database) + ".sqlite_master WHERE type IN ('table','view','trigger','index') AND name NOT LIKE 'sqlite_%' ORDER BY type,name"
	r, e := conn.QueryContext(c.ctx, q)
	if e != nil {
		return nil, e
	}
	defer r.Close()
	out := []model.SchemaItem{}
	for r.Next() {
		var item model.SchemaItem
		if e = r.Scan(&item.Name, &item.Kind); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, r.Err()
}
func (c *Connection) ListColumns(database, table string) ([]string, error) {
	conn, e := c.get()
	if e != nil {
		return nil, e
	}
	r, e := conn.QueryContext(c.ctx, "PRAGMA "+sqlsyntax.QuoteIdentifier(database)+".table_info("+quoteString(table)+")")
	if e != nil {
		return nil, e
	}
	defer r.Close()
	out := []string{}
	for r.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var dflt interface{}
		if e = r.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); e != nil {
			return nil, e
		}
		out = append(out, name)
	}
	return out, r.Err()
}
func (c *Connection) primaryKeys(database, table string) ([]string, error) {
	conn, e := c.get()
	if e != nil {
		return nil, e
	}
	r, e := conn.QueryContext(c.ctx, "PRAGMA "+sqlsyntax.QuoteIdentifier(database)+".table_info("+quoteString(table)+")")
	if e != nil {
		return nil, e
	}
	defer r.Close()
	type key struct {
		name  string
		order int
	}
	keys := []key{}
	for r.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var dflt interface{}
		if e = r.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); e != nil {
			return nil, e
		}
		if pk > 0 {
			keys = append(keys, key{name: name, order: pk})
		}
	}
	if e = r.Err(); e != nil {
		return nil, e
	}
	out := make([]string, len(keys))
	for i := range keys {
		for _, k := range keys {
			if k.order == i+1 {
				out[i] = k.name
				break
			}
		}
	}
	return out, nil
}
func (c *Connection) LoadTablePage(database, table string, page int, filter *string, sortBy *string, sortDesc bool) (model.TablePage, error) {
	out := model.TablePage{Rows: [][]interface{}{}, PrimaryKeys: []string{}, Columns: []string{}, Page: page}
	if page < 0 || page > 100000000 {
		return out, errors.New("Invalid page")
	}
	cols, e := c.ListColumns(database, table)
	if e != nil {
		return out, e
	}
	if len(cols) == 0 {
		return out, errors.New("Table not found")
	}
	out.Columns = cols
	out.PrimaryKeys, e = c.primaryKeys(database, table)
	if e != nil {
		return out, e
	}
	q := "SELECT * FROM " + sqlsyntax.QuoteIdentifier(database) + "." + sqlsyntax.QuoteIdentifier(table)
	args := []interface{}{}
	if filter != nil && strings.TrimSpace(*filter) != "" {
		parts := []string{}
		for _, name := range cols {
			parts = append(parts, "instr(COALESCE(CAST("+sqlsyntax.QuoteIdentifier(name)+" AS TEXT),''),?)>0")
			args = append(args, *filter)
		}
		q += " WHERE (" + strings.Join(parts, " OR ") + ")"
	}
	if sortBy != nil {
		if !contains(cols, *sortBy) {
			return out, errors.New("Sort column not found")
		}
		q += " ORDER BY " + sqlsyntax.QuoteIdentifier(*sortBy)
		if sortDesc {
			q += " DESC"
		} else {
			q += " ASC"
		}
	} else if len(out.PrimaryKeys) > 0 {
		parts := []string{}
		for _, key := range out.PrimaryKeys {
			parts = append(parts, sqlsyntax.QuoteIdentifier(key))
		}
		q += " ORDER BY " + strings.Join(parts, ",")
	}
	q += fmt.Sprintf(" LIMIT 101 OFFSET %d", page*100)
	conn, e := c.get()
	if e != nil {
		return out, e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	r, e := conn.QueryContext(c.ctx, q, args...)
	if e != nil {
		return out, e
	}
	defer r.Close()
	for r.Next() {
		v, e := cells(r)
		if e != nil {
			return out, e
		}
		if len(out.Rows) < 100 {
			out.Rows = append(out.Rows, v)
		} else {
			out.HasMore = true
		}
	}
	return out, r.Err()
}
func (c *Connection) UpdateTableCell(database, table, column string, keys []interface{}, value *string) (int64, error) {
	cols, e := c.ListColumns(database, table)
	if e != nil {
		return 0, e
	}
	pk, e := c.primaryKeys(database, table)
	if e != nil {
		return 0, e
	}
	if !contains(cols, column) || contains(pk, column) || len(pk) == 0 || len(pk) != len(keys) {
		return 0, errors.New("A valid non-key column and complete primary key are required")
	}
	args := []interface{}{value}
	parts := []string{}
	for i, name := range pk {
		if keys[i] == nil {
			return 0, errors.New("Null primary key")
		}
		parts = append(parts, sqlsyntax.QuoteIdentifier(name)+"=?")
		args = append(args, keys[i])
	}
	q := "UPDATE " + sqlsyntax.QuoteIdentifier(database) + "." + sqlsyntax.QuoteIdentifier(table) + " SET " + sqlsyntax.QuoteIdentifier(column) + "=? WHERE " + strings.Join(parts, " AND ")
	conn, e := c.get()
	if e != nil {
		return 0, e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	r, e := conn.ExecContext(c.ctx, q, args...)
	if e != nil {
		return 0, e
	}
	return r.RowsAffected()
}

func cells(r *sql.Rows) ([]interface{}, error) {
	types, e := r.ColumnTypes()
	if e != nil {
		return nil, e
	}
	v := make([]interface{}, len(types))
	ptr := make([]interface{}, len(v))
	for i := range v {
		ptr[i] = &v[i]
	}
	if e = r.Scan(ptr...); e != nil {
		return nil, e
	}
	for i, x := range v {
		switch val := x.(type) {
		case int64:
			if val > 9007199254740991 || val < -9007199254740991 {
				v[i] = fmt.Sprintf("%d", val)
			}
		case []byte:
			v[i] = string(val)
		}
	}
	return v, nil
}
func contains(v []string, s string) bool {
	for _, x := range v {
		if x == s {
			return true
		}
	}
	return false
}
func quoteString(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

var (
	_ engine.Driver        = (*Driver)(nil)
	_ engine.Connection    = (*Connection)(nil)
	_ engine.QueryExecutor = (*Connection)(nil)
	_ engine.Transactions  = (*Connection)(nil)
	_ engine.SchemaBrowser = (*Connection)(nil)
	_ engine.TableEditor   = (*Connection)(nil)
)
