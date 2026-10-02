package mysql

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"wadahdb-studio/internal/backup"
	"wadahdb-studio/internal/fileio"
	"wadahdb-studio/internal/sqlsyntax"
)

func (a *Connection) ImportCsv(database, table, path string, columns []string) (int, error) {
	available, e := a.ListColumns(database, table)
	if e != nil {
		return 0, e
	}
	seen := map[string]bool{}
	quoted := []string{}
	params := []string{}
	for _, c := range columns {
		if !contains(available, c) || seen[c] {
			return 0, errors.New("Invalid or duplicate mapped column")
		}
		seen[c] = true
		quoted = append(quoted, sqlsyntax.QuoteIdentifier(c))
		params = append(params, "?")
	}
	f, e := os.Open(path)
	if e != nil {
		return 0, e
	}
	defer f.Close()
	r := csv.NewReader(f)
	headers, e := r.Read()
	if e != nil {
		return 0, e
	}
	if len(headers) != len(columns) || len(columns) == 0 {
		return 0, errors.New("Map every CSV column to a distinct table column")
	}
	s, e := a.get()
	if e != nil {
		return 0, e
	}
	tx, e := s.db.BeginTx(a.ctx, nil)
	if e != nil {
		return 0, e
	}
	defer tx.Rollback()
	stmt, e := tx.PrepareContext(a.ctx, "INSERT INTO "+sqlsyntax.QuoteIdentifier(database)+"."+sqlsyntax.QuoteIdentifier(table)+" ("+strings.Join(quoted, ",")+") VALUES ("+strings.Join(params, ",")+")")
	if e != nil {
		return 0, e
	}
	defer stmt.Close()
	count := 0
	for {
		record, e := r.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return 0, fmt.Errorf("CSV record %d, import rolled back: %w", count+2, e)
		}
		args := make([]interface{}, len(record))
		for i, v := range record {
			args[i] = v
		}
		if _, e = stmt.ExecContext(a.ctx, args...); e != nil {
			return 0, fmt.Errorf("CSV record %d, import rolled back: %w", count+2, e)
		}
		count++
	}
	return count, tx.Commit()
}
func (a *Connection) ImportSql(database, path string) (int, error) {
	b, e := os.ReadFile(path)
	if e != nil {
		return 0, e
	}
	if strings.HasPrefix(string(b), backup.Header) {
		return 0, errors.New("Use Restore for wadahdb-studio backups")
	}
	s, e := a.get()
	if e != nil {
		return 0, e
	}
	c, e := s.db.Conn(a.ctx)
	if e != nil {
		return 0, e
	}
	defer c.Close()
	if _, e = c.ExecContext(a.ctx, "USE "+sqlsyntax.QuoteIdentifier(database)); e != nil {
		return 0, e
	}
	parts := sqlsyntax.Statements(string(b))
	for i, q := range parts {
		if _, e = c.ExecContext(a.ctx, q); e != nil {
			return i, fmt.Errorf("SQL import stopped at statement %d; earlier sqlsyntax.Statements may have been applied: %w", i+1, e)
		}
	}
	return len(parts), nil
}
func (a *Connection) ExportQuery(query, path, format string) (int, error) {
	if !sqlsyntax.ReadOnly(query) {
		return 0, errors.New("Export requires a single read-only query")
	}
	if format != "csv" && format != "json" {
		return 0, errors.New("Unsupported export format")
	}
	s, e := a.get()
	if e != nil {
		return 0, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	r, e := s.conn.QueryContext(a.ctx, query)
	if e != nil {
		return 0, e
	}
	defer r.Close()
	cols, e := r.Columns()
	if e != nil {
		return 0, e
	}
	count := 0
	e = fileio.Atomic(path, func(f *os.File) error {
		w := bufio.NewWriter(f)
		if format == "csv" {
			cw := csv.NewWriter(w)
			if e = cw.Write(cols); e != nil {
				return e
			}
			for r.Next() {
				v, e := cells(r, false)
				if e != nil {
					return e
				}
				values := make([]string, len(v))
				for i, x := range v {
					if x != nil {
						values[i] = fmt.Sprint(x)
					}
				}
				if e = cw.Write(values); e != nil {
					return e
				}
				count++
			}
			cw.Flush()
			if e = cw.Error(); e != nil {
				return e
			}
		} else {
			if _, e = w.WriteString("[\n"); e != nil {
				return e
			}
			for r.Next() {
				v, e := cells(r, false)
				if e != nil {
					return e
				}
				obj := map[string]interface{}{}
				for i, col := range cols {
					key := col
					for suffix := 2; ; suffix++ {
						if _, ok := obj[key]; !ok {
							break
						}
						key = fmt.Sprintf("%s_%d", col, suffix)
					}
					obj[key] = v[i]
				}
				b, e := json.Marshal(obj)
				if e != nil {
					return e
				}
				if count > 0 {
					if _, e = w.WriteString(",\n"); e != nil {
						return e
					}
				}
				if _, e = w.Write(b); e != nil {
					return e
				}
				count++
			}
			if _, e = w.WriteString("\n]\n"); e != nil {
				return e
			}
		}
		if e = r.Err(); e != nil {
			return e
		}
		return w.Flush()
	})
	return count, e
}
