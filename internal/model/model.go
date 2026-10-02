package model

type SshConfig struct {
	Host         string  `json:"host"`
	Port         int     `json:"port"`
	Username     string  `json:"username"`
	IdentityFile *string `json:"identityFile"`
}
type ConnectionProfile struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	Engine           string     `json:"engine"`
	Host             string     `json:"host"`
	Port             int        `json:"port"`
	Username         string     `json:"username"`
	DefaultDatabase  *string    `json:"defaultDatabase"`
	TLS              bool       `json:"tls"`
	SSH              *SshConfig `json:"ssh"`
	HasSavedPassword bool       `json:"hasSavedPassword"`
}
type SaveProfileInput struct {
	Profile        ConnectionProfile `json:"profile"`
	Password       *string           `json:"password"`
	ForgetPassword bool              `json:"forgetPassword"`
}
type QueryResult struct {
	Columns      []string        `json:"columns"`
	Rows         [][]interface{} `json:"rows"`
	AffectedRows int64           `json:"affectedRows"`
	ElapsedMs    int64           `json:"elapsedMs"`
	Truncated    bool            `json:"truncated"`
}
type SchemaItem struct {
	Name  string  `json:"name"`
	Kind  string  `json:"kind"`
	Table *string `json:"table,omitempty"`
}
type RestoreInspection struct {
	SourceDatabase string   `json:"sourceDatabase"`
	Objects        []string `json:"objects"`
	TargetObjects  []string `json:"targetObjects"`
	Conflicts      []string `json:"conflicts"`
}
type CsvPreview struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}
type TablePage struct {
	Columns     []string        `json:"columns"`
	Rows        [][]interface{} `json:"rows"`
	PrimaryKeys []string        `json:"primaryKeys"`
	Page        int             `json:"page"`
	HasMore     bool            `json:"hasMore"`
}
