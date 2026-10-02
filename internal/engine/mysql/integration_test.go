package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"

	"wadahdb-studio/internal/sqlsyntax"
)

func TestMariaDBMigration(t *testing.T) {
	dsn := os.Getenv("GUI_SQL_TEST_DSN")
	if dsn == "" {
		t.Skip("set GUI_SQL_TEST_DSN for live roundtrip")
	}
	cfg, e := mysql.ParseDSN(dsn)
	if e != nil {
		t.Fatal(e)
	}
	connector, e := mysql.NewConnector(cfg)
	if e != nil {
		t.Fatal(e)
	}
	db := sql.OpenDB(connector)
	defer db.Close()
	a := &Connection{ctx: context.Background()}
	conn, e := db.Conn(a.ctx)
	if e != nil {
		t.Fatal(e)
	}
	s := &session{db: db, conn: conn, config: cfg}
	if e = conn.QueryRowContext(a.ctx, "SELECT CONNECTION_ID()").Scan(&s.thread); e != nil {
		t.Fatal(e)
	}
	a.session = s
	defer conn.Close()
	src := fmt.Sprintf("gui_go_%d", time.Now().UnixNano())
	dst := src + "_restore"
	selected := src + "_selected"
	defer func() {
		for _, n := range []string{src, dst, selected} {
			db.Exec("DROP DATABASE IF EXISTS " + sqlsyntax.QuoteIdentifier(n))
		}
	}()
	exec := func(q string) {
		t.Helper()
		if _, e = db.Exec(q); e != nil {
			t.Fatalf("%s: %v", q, e)
		}
	}
	exec("CREATE DATABASE " + sqlsyntax.QuoteIdentifier(src))
	q := sqlsyntax.QuoteIdentifier(src) + "."
	exec("CREATE TABLE " + q + "notes (id BIGINT PRIMARY KEY, body TEXT, payload BLOB)")
	exec("INSERT INTO " + q + "notes VALUES (9007199254740993,'雪',0x00FF10)")
	exec("CREATE TABLE " + q + "child (id INT PRIMARY KEY, note_id BIGINT, FOREIGN KEY(note_id) REFERENCES " + q + "notes(id))")
	exec("CREATE VIEW " + q + "notes_view AS SELECT * FROM " + q + "notes")
	exec("CREATE TRIGGER " + q + "notes_trigger BEFORE INSERT ON " + q + "notes FOR EACH ROW SET NEW.body=COALESCE(NEW.body,'default')")
	exec("CREATE PROCEDURE " + q + "notes_proc() BEGIN SELECT COUNT(*) FROM " + q + "notes; END")
	exec("CREATE FUNCTION " + q + "notes_fn() RETURNS INT DETERMINISTIC RETURN 7")
	exec("CREATE EVENT " + q + "notes_event ON SCHEDULE EVERY 1 DAY DISABLE DO SELECT 1")
	path := filepath.Join(t.TempDir(), "backup.sql")
	if _, e = a.BackupDatabase("mariadb", src, nil, path); e != nil {
		t.Fatal(e)
	}
	inspection, e := a.InspectRestore(dst, path)
	if e != nil || len(inspection.Objects) != 7 {
		t.Fatal(inspection, e)
	}
	if _, e = a.RestoreDatabase(dst, path, false); e != nil {
		t.Fatal(e)
	}
	var hex, body string
	if e = db.QueryRow("SELECT HEX(payload),body FROM "+sqlsyntax.QuoteIdentifier(dst)+".notes").Scan(&hex, &body); e != nil || hex != "00FF10" || body != "雪" {
		t.Fatal(hex, body, e)
	}
	exec("CREATE TABLE " + sqlsyntax.QuoteIdentifier(dst) + ".unrelated(id INT)")
	if _, e = a.RestoreDatabase(dst, path, false); e == nil {
		t.Fatal("nonempty restore allowed")
	}
	if _, e = a.RestoreDatabase(dst, path, true); e != nil {
		t.Fatal(e)
	}
	exec("SELECT * FROM " + sqlsyntax.QuoteIdentifier(dst) + ".unrelated")
	if _, e = a.BackupDatabase("mariadb", src, []string{"notes"}, path); e != nil {
		t.Fatal(e)
	}
	if _, e = a.RestoreDatabase(selected, path, false); e != nil {
		t.Fatal(e)
	}
	objects, e := a.targetObjects(selected)
	if e != nil || len(objects) != 2 {
		t.Fatal(objects, e)
	}
	if e = a.SelectDatabase(src); e != nil {
		t.Fatal(e)
	}
	if e = a.BeginTransaction(); e != nil {
		t.Fatal(e)
	}
	if _, e = a.UpdateTableCell(src, "notes", "body", []interface{}{"9007199254740993"}, strptr("pending")); e != nil {
		t.Fatal(e)
	}
	page, e := a.LoadTablePage(src, "notes", 0, nil, nil, false)
	if e != nil || page.Rows[0][0] != "9007199254740993" || page.Rows[0][1] != "pending" {
		t.Fatal(page, e)
	}
	if e = a.FinishTransaction(false); e != nil {
		t.Fatal(e)
	}
	export := filepath.Join(t.TempDir(), "result.json")
	if n, e := a.ExportQuery("SELECT * FROM notes", export, "json"); e != nil || n != 1 {
		t.Fatal(n, e)
	}
	b, _ := os.ReadFile(export)
	if !strings.Contains(string(b), "9007199254740993") {
		t.Fatal(string(b))
	}
	csv := filepath.Join(t.TempDir(), "input.csv")
	os.WriteFile(csv, []byte("id,body\n2,new\n9007199254740993,duplicate\n"), 0600)
	if _, e = a.ImportCsv(src, "notes", csv, []string{"id", "body"}); e == nil {
		t.Fatal("bad CSV accepted")
	}
	var count int
	db.QueryRow("SELECT COUNT(*) FROM " + q + "notes").Scan(&count)
	if count != 1 {
		t.Fatal("CSV not rolled back")
	}
	done := make(chan error, 1)
	go func() { _, e := a.ExecuteQuery("SELECT SLEEP(20)", false); done <- e }()
	time.Sleep(300 * time.Millisecond)
	if e = a.CancelQuery(); e != nil {
		t.Fatal(e)
	}
	select {
	case e := <-done:
		if e == nil {
			t.Fatal("cancel failed")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancel timed out")
	}
	if _, e = a.ExecuteQuery("SELECT 1", false); e != nil {
		t.Fatal("connection broken after cancel", e)
	}
}
func strptr(s string) *string { return &s }
