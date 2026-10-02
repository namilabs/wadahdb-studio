package mysql

import (
	"context"
	"errors"
	"strings"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

// Driver serves the MySQL protocol family; each Open owns an independent session.
type Driver struct{ id string }

func NewDriver(id string) *Driver { return &Driver{id: id} }
func (d *Driver) Descriptor() engine.Descriptor {
	name := "MySQL"
	if d.id == "mariadb" {
		name = "MariaDB"
	}
	return engine.Descriptor{ID: d.id, Name: name, Kind: "sql", DefaultPort: 3306,
		Capabilities: engine.Capabilities{SQL: true, Transactions: true, Schema: true, Tables: true, Backup: true, Transfer: true}}
}
func (d *Driver) ValidateProfile(p model.ConnectionProfile) error {
	if (d.id != "mysql" && d.id != "mariadb") || p.Engine != d.id || strings.TrimSpace(p.Username) == "" {
		return errors.New("Valid MySQL/MariaDB engine and username are required")
	}
	return nil
}
func (d *Driver) Open(ctx context.Context, p model.ConnectionProfile, password string) (engine.Connection, error) {
	if e := d.ValidateProfile(p); e != nil {
		return nil, e
	}
	c := &Connection{ctx: ctx}
	if _, e := c.connect(p, password); e != nil {
		return nil, e
	}
	return c, nil
}

var (
	_ engine.Driver        = (*Driver)(nil)
	_ engine.Connection    = (*Connection)(nil)
	_ engine.QueryExecutor = (*Connection)(nil)
	_ engine.Transactions  = (*Connection)(nil)
	_ engine.SchemaBrowser = (*Connection)(nil)
	_ engine.TableEditor   = (*Connection)(nil)
	_ engine.Backups       = (*Connection)(nil)
	_ engine.Transfers     = (*Connection)(nil)
)
