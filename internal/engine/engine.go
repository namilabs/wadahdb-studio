// Package engine defines engine-neutral connection lifecycle and optional SQL features.
package engine

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"wadahdb-studio/internal/model"
)

var ErrUnsupported = errors.New("operation is not supported by this engine")

// Connection is the only mandatory contract. Document, key/value, and search
// engines can add their own feature interfaces without implementing SQL methods.
type Connection interface {
	Version() string
	Close() error
}

type Driver interface {
	Descriptor() Descriptor
	ValidateProfile(model.ConnectionProfile) error
	Open(context.Context, model.ConnectionProfile, string) (Connection, error)
}

type Capabilities struct {
	SQL          bool `json:"sql"`
	Transactions bool `json:"transactions"`
	Schema       bool `json:"schema"`
	Tables       bool `json:"tables"`
	Backup       bool `json:"backup"`
	Transfer     bool `json:"transfer"`
}

type Descriptor struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Kind         string       `json:"kind"`
	DefaultPort  int          `json:"defaultPort"`
	Capabilities Capabilities `json:"capabilities"`
}

// Require checks the feature contract before an operation reaches an adapter.
func Require[T any](c Connection, feature string) (T, error) {
	v, ok := c.(T)
	if !ok {
		var zero T
		return zero, fmt.Errorf("%s: %w", feature, ErrUnsupported)
	}
	return v, nil
}

// Registry is configured at startup, before concurrent use.
type Registry struct{ drivers map[string]Driver }

func NewRegistry() *Registry { return &Registry{drivers: map[string]Driver{}} }
func (r *Registry) Register(d Driver) error {
	id := d.Descriptor().ID
	if id == "" {
		return errors.New("engine ID is required")
	}
	if _, exists := r.drivers[id]; exists {
		return fmt.Errorf("engine %q is already registered", id)
	}
	r.drivers[id] = d
	return nil
}
func (r *Registry) Driver(id string) (Driver, error) {
	d, ok := r.drivers[id]
	if !ok {
		return nil, fmt.Errorf("engine %q: %w", id, ErrUnsupported)
	}
	return d, nil
}
func (r *Registry) ValidateProfile(p model.ConnectionProfile) error {
	d, e := r.Driver(p.Engine)
	if e != nil {
		return e
	}
	return d.ValidateProfile(p)
}
func (r *Registry) List() []Descriptor {
	out := make([]Descriptor, 0, len(r.drivers))
	for _, d := range r.drivers {
		out = append(out, d.Descriptor())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// QueryExecutor is optional; adapters expose it only when supported.
type QueryExecutor interface {
	CancelQuery() error
	ExecuteQuery(query string, confirmed bool) (model.QueryResult, error)
}

// Transactions is optional; adapters expose it only when supported.
type Transactions interface {
	BeginTransaction() error
	FinishTransaction(commit bool) error
}

// SchemaBrowser is optional; adapters expose it only when supported.
type SchemaBrowser interface {
	SelectDatabase(database string) error
	ListDatabases() ([]model.SchemaItem, error)
	ListObjects(database string) ([]model.SchemaItem, error)
	ListColumns(database, table string) ([]string, error)
}

// TableEditor is optional; adapters expose it only when supported.
type TableEditor interface {
	LoadTablePage(database, table string, page int, filter *string, sortBy *string, sortDesc bool) (model.TablePage, error)
	UpdateTableCell(database, table, column string, keys []interface{}, value *string) (int64, error)
}

// Backups is optional; adapters expose it only when supported.
type Backups interface {
	BackupDatabase(engine, database string, selectedTables []string, path string) (int, error)
	InspectRestore(target, path string) (model.RestoreInspection, error)
	RestoreDatabase(target, path string, overwrite bool) (int, error)
}

// Transfers is optional; adapters expose it only when supported.
type Transfers interface {
	ImportCsv(database, table, path string, columns []string) (int, error)
	ImportSql(database, path string) (int, error)
	ExportQuery(query, path, format string) (int, error)
}
