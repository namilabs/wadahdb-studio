package mysql

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"wadahdb-studio/internal/model"
	"wadahdb-studio/internal/sqlsyntax"
)

func stringsQuery(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error)
}, query string, args ...interface{}) ([]string, error) {
	r, e := q.QueryContext(ctx, query, args...)
	if e != nil {
		return nil, e
	}
	defer r.Close()
	v := []string{}
	for r.Next() {
		var s string
		if e = r.Scan(&s); e != nil {
			return nil, e
		}
		v = append(v, s)
	}
	return v, r.Err()
}
func cells(r *sql.Rows, preview bool) ([]interface{}, error) {
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
		case []byte:
			k := strings.ToUpper(types[i].DatabaseTypeName())
			binary := strings.Contains(k, "BLOB") || k == "BINARY" || k == "VARBINARY" || k == "BIT" || k == "GEOMETRY"
			if binary || !utf8.Valid(val) {
				suffix := ""
				if preview && len(val) > 64 {
					val = val[:64]
					suffix = "…"
				}
				v[i] = "0x" + strings.ToUpper(hex.EncodeToString(val)) + suffix
			} else {
				v[i] = string(val)
			}
		case int64:
			if val > 9007199254740991 || val < -9007199254740991 {
				v[i] = strconv.FormatInt(val, 10)
			}
		case uint64:
			if val > 9007199254740991 {
				v[i] = strconv.FormatUint(val, 10)
			}
		}
	}
	return v, nil
}
func (a *Connection) ExecuteQuery(query string, confirmed bool) (model.QueryResult, error) {
	out := model.QueryResult{Columns: []string{}, Rows: [][]interface{}{}}
	if w := sqlsyntax.Warning(query); w != "" && !confirmed {
		return out, errors.New("CONFIRM_REQUIRED:" + w)
	}
	s, e := a.get()
	if e != nil {
		return out, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	start := time.Now()
	defer func() { out.ElapsedMs = time.Since(start).Milliseconds() }()
	for n, st := range sqlsyntax.Statements(query) {
		switch sqlsyntax.Keyword(st) {
		case "SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH", "CALL":
			r, e := s.conn.QueryContext(a.ctx, st)
			if e != nil {
				return out, fmt.Errorf("Statement %d: %w", n+1, e)
			}
			for {
				cols, e := r.Columns()
				if e != nil {
					r.Close()
					return out, e
				}
				if len(cols) > 0 {
					out.Columns = cols
					out.Rows = [][]interface{}{}
					out.Truncated = false
				}
				for r.Next() {
					row, e := cells(r, true)
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
				if e = r.Err(); e != nil {
					r.Close()
					return out, e
				}
				if !r.NextResultSet() {
					break
				}
			}
			e = r.Err()
			r.Close()
			if e != nil {
				return out, e
			}
		default:
			r, e := s.conn.ExecContext(a.ctx, st)
			if e != nil {
				return out, fmt.Errorf("Statement %d: %w", n+1, e)
			}
			count, _ := r.RowsAffected()
			out.AffectedRows += count
		}
	}
	out.ElapsedMs = time.Since(start).Milliseconds()
	return out, nil
}
func (a *Connection) ListDatabases() ([]model.SchemaItem, error) {
	s, e := a.get()
	if e != nil {
		return nil, e
	}
	v, e := stringsQuery(a.ctx, s.db, "SHOW DATABASES")
	out := []model.SchemaItem{}
	for _, n := range v {
		out = append(out, model.SchemaItem{Name: n, Kind: "database"})
	}
	return out, e
}
func (a *Connection) ListObjects(database string) ([]model.SchemaItem, error) {
	s, e := a.get()
	if e != nil {
		return nil, e
	}
	out := []model.SchemaItem{}
	queries := []string{"SELECT TABLE_NAME, IF(TABLE_TYPE='VIEW','view','table') FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME", "SELECT ROUTINE_NAME, LOWER(ROUTINE_TYPE) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? ORDER BY ROUTINE_NAME", "SELECT TRIGGER_NAME,'trigger' FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY TRIGGER_NAME", "SELECT EVENT_NAME,'event' FROM information_schema.EVENTS WHERE EVENT_SCHEMA=? ORDER BY EVENT_NAME"}
	for _, q := range queries {
		r, e := s.db.QueryContext(a.ctx, q, database)
		if e != nil {
			return nil, e
		}
		for r.Next() {
			var v model.SchemaItem
			if e = r.Scan(&v.Name, &v.Kind); e != nil {
				r.Close()
				return nil, e
			}
			out = append(out, v)
		}
		e = r.Err()
		r.Close()
		if e != nil {
			return nil, e
		}
	}
	r, e := s.db.QueryContext(a.ctx, "SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? GROUP BY TABLE_NAME,INDEX_NAME ORDER BY TABLE_NAME,INDEX_NAME", database)
	if e != nil {
		return nil, e
	}
	defer r.Close()
	for r.Next() {
		var table, name string
		if e = r.Scan(&table, &name); e != nil {
			return nil, e
		}
		out = append(out, model.SchemaItem{Name: name, Kind: "index", Table: &table})
	}
	return out, r.Err()
}
func (a *Connection) ListColumns(database, table string) ([]string, error) {
	s, e := a.get()
	if e != nil {
		return nil, e
	}
	return stringsQuery(a.ctx, s.db, "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", database, table)
}
func primaryKeys(ctx context.Context, c *sql.Conn, database, table string) ([]string, error) {
	return stringsQuery(ctx, c, "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION", database, table)
}
func contains(v []string, s string) bool {
	for _, x := range v {
		if x == s {
			return true
		}
	}
	return false
}
func (a *Connection) LoadTablePage(database, table string, page int, filter *string, sortBy *string, sortDesc bool) (model.TablePage, error) {
	out := model.TablePage{Rows: [][]interface{}{}, PrimaryKeys: []string{}, Columns: []string{}, Page: page}
	s, e := a.get()
	if e != nil {
		return out, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if page < 0 || page > 100000000 {
		return out, errors.New("Invalid page")
	}
	out.Columns, e = stringsQuery(a.ctx, s.conn, "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", database, table)
	if e != nil {
		return out, e
	}
	if len(out.Columns) == 0 {
		return out, errors.New("Table not found")
	}
	out.PrimaryKeys, e = primaryKeys(a.ctx, s.conn, database, table)
	if e != nil {
		return out, e
	}
	q := "SELECT * FROM " + sqlsyntax.QuoteIdentifier(database) + "." + sqlsyntax.QuoteIdentifier(table)
	args := []interface{}{}
	if filter != nil && strings.TrimSpace(*filter) != "" {
		parts := []string{}
		for _, c := range out.Columns {
			parts = append(parts, "LOCATE(?,CAST("+sqlsyntax.QuoteIdentifier(c)+" AS CHAR))>0")
			args = append(args, *filter)
		}
		q += " WHERE (" + strings.Join(parts, " OR ") + ")"
	}
	if sortBy != nil {
		if !contains(out.Columns, *sortBy) {
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
		for _, k := range out.PrimaryKeys {
			parts = append(parts, sqlsyntax.QuoteIdentifier(k))
		}
		q += " ORDER BY " + strings.Join(parts, ",")
	}
	q += fmt.Sprintf(" LIMIT 101 OFFSET %d", page*100)
	r, e := s.conn.QueryContext(a.ctx, q, args...)
	if e != nil {
		return out, e
	}
	defer r.Close()
	for r.Next() {
		v, e := cells(r, true)
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
func (a *Connection) UpdateTableCell(database, table, column string, keys []interface{}, value *string) (int64, error) {
	s, e := a.get()
	if e != nil {
		return 0, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cols, e := stringsQuery(a.ctx, s.conn, "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", database, table)
	if e != nil {
		return 0, e
	}
	pk, e := primaryKeys(a.ctx, s.conn, database, table)
	if e != nil {
		return 0, e
	}
	if !contains(cols, column) || contains(pk, column) || len(pk) == 0 || len(pk) != len(keys) {
		return 0, errors.New("A valid non-key column and complete primary key are required")
	}
	args := []interface{}{value}
	parts := []string{}
	for i, k := range pk {
		if keys[i] == nil {
			return 0, errors.New("Null primary key")
		}
		parts = append(parts, sqlsyntax.QuoteIdentifier(k)+"=?")
		args = append(args, keys[i])
	}
	r, e := s.conn.ExecContext(a.ctx, "UPDATE "+sqlsyntax.QuoteIdentifier(database)+"."+sqlsyntax.QuoteIdentifier(table)+" SET "+sqlsyntax.QuoteIdentifier(column)+"=? WHERE "+strings.Join(parts, " AND ")+" LIMIT 1", args...)
	if e != nil {
		return 0, e
	}
	return r.RowsAffected()
}
