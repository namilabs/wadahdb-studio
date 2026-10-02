package backup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.sql")
	data := Header + "\n-- MANIFEST {\"version\":1,\"engine\":\"mariadb\",\"sourceDatabase\":\"old\",\"objects\":[{\"kind\":\"table\",\"name\":\"t\"}]}\n" + Marker + "\nCREATE TABLE t(x TEXT)\n" + Marker + "\nINSERT INTO t VALUES ('hello\n" + Marker + "\nworld')\n"
	os.WriteFile(path, []byte(data), 0600)
	m, parts, e := Read(path)
	if e != nil || m.SourceDatabase != "old" || len(parts) != 2 {
		t.Fatalf("%+v %#v %v", m, parts, e)
	}
}
