package sqlsyntax

import "testing"

func TestSQLBoundaries(t *testing.T) {
	s := "-- hi\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT '雪;$$'; SELECT 2; END$$\nDELIMITER ;\nSELECT 3;"
	if v := Statements(s); len(v) != 2 {
		t.Fatalf("%#v", v)
	}
	if Warning("UPDATE t SET x='WHERE' /* WHERE */") == "" {
		t.Fatal("missing Warning")
	}
	if Warning("UPDATE t SET x=1 WHERE id=2") != "" {
		t.Fatal("false Warning")
	}
	if ReadOnly("WITH t AS (SELECT 1) DELETE FROM x") {
		t.Fatal("write allowed")
	}
	want := "SELECT `new`.t, 'old.t', `oldish`.t /* old.t */"
	if got := Relocate("SELECT `old`.t, 'old.t', `oldish`.t /* old.t */", "old", "new"); got != want {
		t.Fatal(got)
	}
}
