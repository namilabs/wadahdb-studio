package sqlite

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

func ptr(s string) *string { return &s }

func TestRegisteredEngineAndValidation(t *testing.T) {
	r := engine.NewRegistry()
	d := NewDriver()
	if e := r.Register(d); e != nil {
		t.Fatal(e)
	}
	path := filepath.Join(t.TempDir(), "app.db")
	if e := d.ValidateProfile(model.ConnectionProfile{Engine: "sqlite", DatabasePath: &path}); e != nil {
		t.Fatal(e)
	}
	if e := d.ValidateProfile(model.ConnectionProfile{Engine: "sqlite"}); e == nil {
		t.Fatal("missing database path accepted")
	}
	list := r.List()
	if len(list) != 1 || list[0].ID != "sqlite" || !list[0].Capabilities.SQL {
		t.Fatal(list)
	}
}

func TestConnectionQuerySchemaAndTableEditing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "workspace.db")
	d := NewDriver()
	c, e := d.Open(context.Background(), model.ConnectionProfile{Engine: "sqlite", DatabasePath: &path}, "")
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	if !strings.HasPrefix(c.Version(), "SQLite ") {
		t.Fatal(c.Version())
	}
	q, e := engine.Require[engine.QueryExecutor](c, "QueryExecutor")
	if e != nil {
		t.Fatal(e)
	}
	schema, e := engine.Require[engine.SchemaBrowser](c, "SchemaBrowser")
	if e != nil {
		t.Fatal(e)
	}
	table, e := engine.Require[engine.TableEditor](c, "TableEditor")
	if e != nil {
		t.Fatal(e)
	}
	tx, e := engine.Require[engine.Transactions](c, "Transactions")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = q.ExecuteQuery("CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes(body) VALUES ('one'), ('two');", true); e != nil {
		t.Fatal(e)
	}
	result, e := q.ExecuteQuery("SELECT body FROM notes ORDER BY id", false)
	if e != nil || len(result.Rows) != 2 || result.Rows[0][0] != "one" {
		t.Fatal(result, e)
	}
	dbs, e := schema.ListDatabases()
	if e != nil || len(dbs) == 0 || dbs[0].Kind != "database" {
		t.Fatal(dbs, e)
	}
	if e = schema.SelectDatabase("main"); e != nil {
		t.Fatal(e)
	}
	objects, e := schema.ListObjects("main")
	if e != nil || len(objects) == 0 {
		t.Fatal(objects, e)
	}
	columns, e := schema.ListColumns("main", "notes")
	if e != nil || len(columns) != 2 || columns[1] != "body" {
		t.Fatal(columns, e)
	}
	page, e := table.LoadTablePage("main", "notes", 0, nil, nil, false)
	if e != nil || len(page.Rows) != 2 || page.PrimaryKeys[0] != "id" {
		t.Fatal(page, e)
	}
	if e = tx.BeginTransaction(); e != nil {
		t.Fatal(e)
	}
	if _, e = table.UpdateTableCell("main", "notes", "body", []interface{}{int64(1)}, ptr("updated")); e != nil {
		t.Fatal(e)
	}
	if e = tx.FinishTransaction(false); e != nil {
		t.Fatal(e)
	}
	rolledBack, e := q.ExecuteQuery("SELECT body FROM notes WHERE id=1", false)
	if e != nil || rolledBack.Rows[0][0] != "one" {
		t.Fatal(rolledBack, e)
	}
	if e = q.CancelQuery(); e != nil {
		t.Fatal(e)
	}
}
