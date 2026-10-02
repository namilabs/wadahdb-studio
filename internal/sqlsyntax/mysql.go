// Package sqlsyntax implements MySQL/MariaDB SQL syntax, not a universal SQL dialect.
package sqlsyntax

import "strings"

// scan skips SQL literals and comments, retaining identifiers and nesting depth.
func Scan(s string, visit func(int, int) bool) {
	depth := 0
	for i := 0; i < len(s); {
		c := s[i]
		if !visit(i, depth) {
			return
		}
		if c == '\'' || c == '"' || c == '`' {
			q := c
			i++
			for i < len(s) {
				if s[i] == '\\' && q != '`' {
					i += 2
					continue
				}
				if s[i] == q {
					i++
					if i < len(s) && s[i] == q {
						i++
						continue
					}
					break
				}
				i++
			}
			continue
		}
		if c == '#' || (c == '-' && i+2 < len(s) && s[i+1] == '-' && s[i+2] <= ' ') {
			for i < len(s) && s[i] != '\n' {
				i++
			}
			continue
		}
		if c == '/' && i+1 < len(s) && s[i+1] == '*' {
			i += 2
			for i+1 < len(s) && s[i:i+2] != "*/" {
				i++
			}
			i += 2
			continue
		}
		if c == '(' {
			depth++
		}
		if c == ')' && depth > 0 {
			depth--
		}
		i++
	}
}
func Statements(s string) []string {
	out := []string{}
	delimiter := ";"
	buffer := ""
	for _, line := range strings.SplitAfter(s, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && strings.EqualFold(fields[0], "DELIMITER") && len(TopWords(buffer)) == 0 {
			delimiter = fields[1]
			buffer = ""
			continue
		}
		buffer += line
		start := 0
		Scan(buffer, func(i, depth int) bool {
			if i >= start && strings.HasPrefix(buffer[i:], delimiter) {
				part := strings.TrimSpace(buffer[start:i])
				if len(TopWords(part)) > 0 {
					out = append(out, part)
				}
				start = i + len(delimiter)
			}
			return true
		})
		buffer = buffer[start:]
	}
	if len(TopWords(buffer)) > 0 {
		out = append(out, strings.TrimSpace(buffer))
	}
	return out
}
func TopWords(s string) []string {
	out := []string{}
	end := 0
	Scan(s, func(i, depth int) bool {
		if depth == 0 && i >= end && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || s[i] == '_') {
			end = i + 1
			for end < len(s) && ((s[end] >= 'a' && s[end] <= 'z') || (s[end] >= 'A' && s[end] <= 'Z') || (s[end] >= '0' && s[end] <= '9') || s[end] == '_') {
				end++
			}
			out = append(out, strings.ToUpper(s[i:end]))
		}
		return true
	})
	return out
}
func Keyword(s string) string {
	w := TopWords(s)
	if len(w) == 0 {
		return ""
	}
	return w[0]
}
func Warning(s string) string {
	for _, st := range Statements(s) {
		w := TopWords(st)
		for _, op := range w {
			if op == "UPDATE" || op == "DELETE" {
				found := false
				for _, v := range w {
					if v == "WHERE" {
						found = true
					}
				}
				if !found {
					return op + " has no WHERE clause. Confirm before running it."
				}
			}
			if op == "CREATE" || op == "ALTER" || op == "DROP" || op == "TRUNCATE" || op == "RENAME" {
				return op + " changes the database schema. Confirm before running it."
			}
		}
	}
	return ""
}
func ReadOnly(s string) bool {
	st := Statements(s)
	if len(st) != 1 {
		return false
	}
	w := TopWords(st[0])
	if len(w) == 0 {
		return false
	}
	switch w[0] {
	case "SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN":
		return true
	case "WITH":
		selectFound := false
		for _, v := range w {
			if v == "SELECT" {
				selectFound = true
			}
			if v == "UPDATE" || v == "DELETE" || v == "INSERT" || v == "REPLACE" {
				return false
			}
		}
		return selectFound
	}
	return false
}
func QuoteIdentifier(s string) string { return "`" + strings.ReplaceAll(s, "`", "``") + "`" }

// Only rewrite exact schema identifiers, never string literals or comments.
func Relocate(s, source, target string) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		start := i
		c := s[i]
		if c == '\'' || c == '"' {
			q := c
			i++
			for i < len(s) {
				if s[i] == '\\' {
					i += 2
					continue
				}
				if s[i] == q {
					i++
					if i < len(s) && s[i] == q {
						i++
						continue
					}
					break
				}
				i++
			}
			if i > len(s) {
				i = len(s)
			}
			b.WriteString(s[start:i])
			continue
		}
		if c == '#' || (c == '-' && i+2 < len(s) && s[i+1] == '-' && s[i+2] <= ' ') {
			for i < len(s) && s[i] != '\n' {
				i++
			}
			b.WriteString(s[start:i])
			continue
		}
		if c == '/' && i+1 < len(s) && s[i+1] == '*' {
			i += 2
			for i+1 < len(s) && s[i:i+2] != "*/" {
				i++
			}
			i += 2
			if i > len(s) {
				i = len(s)
			}
			b.WriteString(s[start:i])
			continue
		}
		name := ""
		if c == '`' {
			i++
			for i < len(s) {
				if s[i] == '`' {
					if i+1 < len(s) && s[i+1] == '`' {
						name += "`"
						i += 2
						continue
					}
					i++
					break
				}
				name += string(s[i])
				i++
			}
		} else if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' {
			i++
			for i < len(s) && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9') || s[i] == '_' || s[i] == '$') {
				i++
			}
			name = s[start:i]
		} else {
			i++
			b.WriteByte(c)
			continue
		}
		j := i
		for j < len(s) && s[j] <= ' ' {
			j++
		}
		if name == source && j < len(s) && s[j] == '.' {
			b.WriteString(QuoteIdentifier(target))
		} else {
			b.WriteString(s[start:i])
		}
	}
	return b.String()
}
