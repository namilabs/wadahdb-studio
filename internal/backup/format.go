// Package backup reads the legacy v1 MySQL/MariaDB backup format.
package backup

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"

	"wadahdb-studio/internal/sqlsyntax"
)

const Header = "-- GUI-SQL-BACKUP 1"
const Marker = "-- GUI-SQL-STMT"

type Object struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}
type Manifest struct {
	Version        int      `json:"version"`
	Engine         string   `json:"engine"`
	SourceDatabase string   `json:"sourceDatabase"`
	Objects        []Object `json:"objects"`
}

func Read(path string) (Manifest, []string, error) {
	m := Manifest{}
	f, e := os.Open(path)
	if e != nil {
		return m, nil, e
	}
	defer f.Close()
	r := bufio.NewReader(f)
	line, e := r.ReadString('\n')
	if e != nil || strings.TrimSpace(line) != Header {
		return m, nil, errors.New("Not a wadahdb-studio backup")
	}
	line, e = r.ReadString('\n')
	if e != nil || !strings.HasPrefix(line, "-- MANIFEST ") {
		return m, nil, errors.New("Backup manifest missing")
	}
	if e = json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "-- MANIFEST "))), &m); e != nil {
		return m, nil, e
	}
	if m.Version != 1 || m.SourceDatabase == "" {
		return m, nil, errors.New("Unsupported backup manifest")
	}
	for _, o := range m.Objects {
		switch o.Kind {
		case "table", "view", "trigger", "procedure", "function", "event":
		default:
			return m, nil, errors.New("Invalid backup object kind")
		}
		if o.Name == "" {
			return m, nil, errors.New("Invalid backup object name")
		}
	}
	b, e := io.ReadAll(r)
	if e != nil {
		return m, nil, e
	}
	parts := []string{}
	text := string(b)
	start := 0
	sqlsyntax.Scan(text, func(i, depth int) bool {
		if (i == 0 || text[i-1] == '\n') && strings.HasPrefix(text[i:], Marker) && (i+len(Marker) == len(text) || text[i+len(Marker)] == '\n' || text[i+len(Marker)] == '\r') {
			if part := strings.TrimSpace(text[start:i]); part != "" {
				parts = append(parts, part)
			}
			start = i + len(Marker)
		}
		return true
	})
	if part := strings.TrimSpace(text[start:]); part != "" {
		parts = append(parts, part)
	}
	if len(parts) == 0 {
		return m, nil, errors.New("Empty backup")
	}
	return m, parts, nil
}
