package mysql

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"wadahdb-studio/internal/backup"
	"wadahdb-studio/internal/fileio"
	"wadahdb-studio/internal/model"
	"wadahdb-studio/internal/sqlsyntax"
)

func (a *Connection) backupObjects(c *sql.Conn, database string, selected []string) ([]backup.Object, error) {
	out := []backup.Object{}
	tables, e := stringsQuery(a.ctx, c, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME", database)
	if e != nil {
		return nil, e
	}
	if selected != nil {
		if len(selected) == 0 {
			return nil, errors.New("Select at least one table")
		}
		for _, t := range selected {
			if !contains(tables, t) {
				return nil, fmt.Errorf("Table %s not found", t)
			}
		}
	}
	for _, t := range tables {
		if selected == nil || contains(selected, t) {
			out = append(out, backup.Object{Kind: "table", Name: t})
		}
	}
	if selected == nil {
		views, e := stringsQuery(a.ctx, c, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='VIEW' ORDER BY TABLE_NAME", database)
		if e != nil {
			return nil, e
		}
		for _, v := range views {
			out = append(out, backup.Object{Kind: "view", Name: v})
		}
	}
	r, e := c.QueryContext(a.ctx, "SELECT TRIGGER_NAME,EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY TRIGGER_NAME", database)
	if e != nil {
		return nil, e
	}
	for r.Next() {
		var name, table string
		if e = r.Scan(&name, &table); e != nil {
			r.Close()
			return nil, e
		}
		if selected == nil || contains(selected, table) {
			out = append(out, backup.Object{Kind: "trigger", Name: name})
		}
	}
	e = r.Err()
	r.Close()
	if e != nil {
		return nil, e
	}
	if selected == nil {
		r, e := c.QueryContext(a.ctx, "SELECT LOWER(ROUTINE_TYPE),ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? ORDER BY ROUTINE_TYPE,ROUTINE_NAME", database)
		if e != nil {
			return nil, e
		}
		for r.Next() {
			var v backup.Object
			if e = r.Scan(&v.Kind, &v.Name); e != nil {
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
		events, e := stringsQuery(a.ctx, c, "SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=? ORDER BY EVENT_NAME", database)
		if e != nil {
			return nil, e
		}
		for _, v := range events {
			out = append(out, backup.Object{Kind: "event", Name: v})
		}
	}
	return out, nil
}
func (a *Connection) BackupDatabase(engine, database string, selectedTables []string, path string) (int, error) {
	s, e := a.get()
	if e != nil {
		return 0, e
	}
	c, e := s.db.Conn(a.ctx)
	if e != nil {
		return 0, e
	}
	defer c.Close()
	if _, e = c.ExecContext(a.ctx, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"); e != nil {
		return 0, e
	}
	if _, e = c.ExecContext(a.ctx, "START TRANSACTION WITH CONSISTENT SNAPSHOT"); e != nil {
		return 0, e
	}
	defer c.ExecContext(a.ctx, "ROLLBACK")
	objects, e := a.backupObjects(c, database, selectedTables)
	if e != nil {
		return 0, e
	}
	m := backup.Manifest{Version: 1, Engine: engine, SourceDatabase: database, Objects: objects}
	count := 0
	e = fileio.Atomic(path, func(f *os.File) error {
		w := bufio.NewWriter(f)
		b, e := json.Marshal(m)
		if e != nil {
			return e
		}
		if _, e = fmt.Fprintf(w, "%s\n-- MANIFEST %s\n", backup.Header, b); e != nil {
			return e
		}
		stmt := func(q string) error { _, e := fmt.Fprintf(w, "%s\n%s\n", backup.Marker, q); return e }
		if e = stmt("SET NAMES utf8mb4"); e != nil {
			return e
		}
		if e = stmt("SET FOREIGN_KEY_CHECKS=0"); e != nil {
			return e
		}
		for _, o := range objects {
			if o.Kind != "table" {
				continue
			}
			ddl, e := a.showCreate(c, database, o)
			if e != nil {
				return e
			}
			if e = stmt(ddl); e != nil {
				return e
			}
			r, e := c.QueryContext(a.ctx, "SELECT COLUMN_NAME,DATA_TYPE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", database, o.Name)
			if e != nil {
				return e
			}
			cols := []string{}
			expr := []string{}
			for r.Next() {
				var name, kind, extra string
				if e = r.Scan(&name, &kind, &extra); e != nil {
					r.Close()
					return e
				}
				if strings.Contains(extra, "GENERATED") {
					continue
				}
				q := sqlsyntax.QuoteIdentifier(name)
				cols = append(cols, q)
				switch kind {
				case "binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob", "bit":
					expr = append(expr, "IF("+q+" IS NULL,'NULL',CONCAT('0x',HEX("+q+")))")
				case "geometry", "point", "linestring", "polygon", "multipoint", "multilinestring", "multipolygon", "geometrycollection":
					expr = append(expr, "IF("+q+" IS NULL,'NULL',CONCAT('ST_GeomFromWKB(0x',HEX(ST_AsWKB("+q+")),',',ST_SRID("+q+"),')'))")
				default:
					expr = append(expr, "IFNULL(QUOTE("+q+"),'NULL')")
				}
			}
			e = r.Err()
			r.Close()
			if e != nil {
				return e
			}
			if len(cols) == 0 {
				continue
			}
			r, e = c.QueryContext(a.ctx, "SELECT "+strings.Join(expr, ",")+" FROM "+sqlsyntax.QuoteIdentifier(database)+"."+sqlsyntax.QuoteIdentifier(o.Name))
			if e != nil {
				return e
			}
			for r.Next() {
				values := make([]string, len(cols))
				dest := make([]interface{}, len(cols))
				for i := range values {
					dest[i] = &values[i]
				}
				if e = r.Scan(dest...); e != nil {
					r.Close()
					return e
				}
				if e = stmt("INSERT INTO " + sqlsyntax.QuoteIdentifier(o.Name) + " (" + strings.Join(cols, ",") + ") VALUES (" + strings.Join(values, ",") + ")"); e != nil {
					r.Close()
					return e
				}
				count++
			}
			e = r.Err()
			r.Close()
			if e != nil {
				return e
			}
		}
		for _, o := range objects {
			if o.Kind == "table" {
				continue
			}
			ddl, e := a.showCreate(c, database, o)
			if e != nil {
				return e
			}
			if e = stmt(ddl); e != nil {
				return e
			}
		}
		if e = stmt("SET FOREIGN_KEY_CHECKS=1"); e != nil {
			return e
		}
		return w.Flush()
	})
	return len(objects), e
}
func (a *Connection) showCreate(c *sql.Conn, database string, o backup.Object) (string, error) {
	r, e := c.QueryContext(a.ctx, "SHOW CREATE "+strings.ToUpper(o.Kind)+" "+sqlsyntax.QuoteIdentifier(database)+"."+sqlsyntax.QuoteIdentifier(o.Name))
	if e != nil {
		return "", e
	}
	defer r.Close()
	cols, e := r.Columns()
	if e != nil {
		return "", e
	}
	if !r.Next() {
		return "", errors.New("SHOW CREATE returned no definition")
	}
	v := make([]interface{}, len(cols))
	ptr := make([]interface{}, len(cols))
	for i := range v {
		ptr[i] = &v[i]
	}
	if e = r.Scan(ptr...); e != nil {
		return "", e
	}
	for i, col := range cols {
		if strings.HasPrefix(strings.ToLower(col), "create ") || col == "SQL Original Statement" {
			switch x := v[i].(type) {
			case []byte:
				return string(x), nil
			case string:
				return x, nil
			}
			return "", errors.New("Definition unavailable; check SHOW CREATE privileges")
		}
	}
	return "", errors.New("No CREATE definition found")
}
func (a *Connection) targetObjects(target string) ([]backup.Object, error) {
	items, e := a.ListObjects(target)
	out := []backup.Object{}
	for _, x := range items {
		if x.Kind != "index" {
			out = append(out, backup.Object{Kind: x.Kind, Name: x.Name})
		}
	}
	return out, e
}
func collision(x, y backup.Object) bool {
	return x.Name == y.Name && (x.Kind == y.Kind || ((x.Kind == "table" || x.Kind == "view") && (y.Kind == "table" || y.Kind == "view")))
}
func label(o backup.Object) string { return o.Kind + ": " + o.Name }
func (a *Connection) InspectRestore(target, path string) (model.RestoreInspection, error) {
	out := model.RestoreInspection{Objects: []string{}, TargetObjects: []string{}, Conflicts: []string{}}
	m, _, e := backup.Read(path)
	if e != nil {
		return out, e
	}
	out.SourceDatabase = m.SourceDatabase
	existing, e := a.targetObjects(target)
	if e != nil {
		return out, e
	}
	for _, o := range m.Objects {
		out.Objects = append(out.Objects, label(o))
		for _, x := range existing {
			if collision(o, x) {
				out.Conflicts = append(out.Conflicts, label(o))
				break
			}
		}
	}
	for _, x := range existing {
		out.TargetObjects = append(out.TargetObjects, label(x))
	}
	return out, nil
}
func (a *Connection) RestoreDatabase(target, path string, overwrite bool) (int, error) {
	if strings.TrimSpace(target) == "" {
		return 0, errors.New("Target database is required")
	}
	m, parts, e := backup.Read(path)
	if e != nil {
		return 0, e
	}
	existing, e := a.targetObjects(target)
	if e != nil {
		return 0, e
	}
	if len(existing) > 0 && !overwrite {
		return 0, errors.New("Target database is not empty; explicit overwrite confirmation is required")
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
	if _, e = c.ExecContext(a.ctx, "CREATE DATABASE IF NOT EXISTS "+sqlsyntax.QuoteIdentifier(target)); e != nil {
		return 0, e
	}
	if _, e = c.ExecContext(a.ctx, "USE "+sqlsyntax.QuoteIdentifier(target)); e != nil {
		return 0, e
	}
	if _, e = c.ExecContext(a.ctx, "SET FOREIGN_KEY_CHECKS=0"); e != nil {
		return 0, e
	}
	defer c.ExecContext(a.ctx, "SET FOREIGN_KEY_CHECKS=1")
	if overwrite {
		for i := len(m.Objects) - 1; i >= 0; i-- {
			for _, x := range existing {
				if collision(m.Objects[i], x) {
					if _, e = c.ExecContext(a.ctx, "DROP "+strings.ToUpper(x.Kind)+" IF EXISTS "+sqlsyntax.QuoteIdentifier(target)+"."+sqlsyntax.QuoteIdentifier(x.Name)); e != nil {
						return 0, e
					}
				}
			}
		}
	}
	for i, q := range parts {
		if _, e = c.ExecContext(a.ctx, sqlsyntax.Relocate(q, m.SourceDatabase, target)); e != nil {
			return i, fmt.Errorf("Restore stopped at statement %d; target may be partially restored: %w", i+1, e)
		}
	}
	return len(m.Objects), nil
}
