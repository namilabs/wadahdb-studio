package main

import (
	"context"
	"log"

	"wadahdb-studio/internal/database"
	"wadahdb-studio/internal/engine"
	mysqlengine "wadahdb-studio/internal/engine/mysql"
	"wadahdb-studio/internal/profiles"
	"wadahdb-studio/internal/transfer"
)

// App is the Wails interface; engine-specific implementations live in internal/.
type App struct {
	ctx      context.Context
	registry *engine.Registry
	profiles *profiles.Service
	database *database.Manager
}

func NewApp() *App {
	registry := engine.NewRegistry()
	for _, id := range []string{"mysql", "mariadb"} {
		if e := registry.Register(mysqlengine.NewDriver(id)); e != nil {
			panic(e)
		}
	}
	return &App{ctx: context.Background(), registry: registry,
		profiles: profiles.New(profiles.JSONRepository{}, profiles.SystemKeyring{}, registry.ValidateProfile),
		database: database.NewManager(registry)}
}
func (a *App) startup(ctx context.Context) { a.ctx = ctx }
func (a *App) shutdown(ctx context.Context) {
	if e := a.database.Close(); e != nil {
		log.Printf("close database sessions: %v", e)
	}
}
func (a *App) ListEngines() []engine.Descriptor           { return a.registry.List() }
func (a *App) ListProfiles() ([]ConnectionProfile, error) { return a.profiles.ListProfiles() }
func (a *App) SaveProfile(in SaveProfileInput) (ConnectionProfile, error) {
	return a.profiles.SaveProfile(in)
}
func (a *App) DeleteProfile(id string) error {
	if e := a.database.Disconnect(id); e != nil {
		return e
	}
	return a.profiles.DeleteProfile(id)
}
func (a *App) ConnectProfile(id string, password *string) (string, error) {
	p, secret, e := a.profiles.Resolve(id, password)
	if e != nil {
		return "", e
	}
	return a.database.Connect(a.ctx, p, secret)
}
func (a *App) DisconnectProfile(id string) error          { return a.database.Disconnect(id) }
func (a *App) PreviewCsv(path string) (CsvPreview, error) { return transfer.PreviewCsv(path) }

func feature[T any](a *App, id, name string) (T, error) {
	c, e := a.database.Get(id)
	if e != nil {
		var zero T
		return zero, e
	}
	return engine.Require[T](c, name)
}

func (a *App) BeginTransaction(id string) error {
	c, e := feature[engine.Transactions](a, id, "Transactions")
	if e != nil {
		return e
	}
	return c.BeginTransaction()
}

func (a *App) FinishTransaction(id string, commit bool) error {
	c, e := feature[engine.Transactions](a, id, "Transactions")
	if e != nil {
		return e
	}
	return c.FinishTransaction(commit)
}

func (a *App) CancelQuery(id string) error {
	c, e := feature[engine.QueryExecutor](a, id, "QueryExecutor")
	if e != nil {
		return e
	}
	return c.CancelQuery()
}

func (a *App) SelectDatabase(id, database string) error {
	c, e := feature[engine.SchemaBrowser](a, id, "SchemaBrowser")
	if e != nil {
		return e
	}
	return c.SelectDatabase(database)
}

func (a *App) ExecuteQuery(id, query string, confirmed bool) (QueryResult, error) {
	c, e := feature[engine.QueryExecutor](a, id, "QueryExecutor")
	if e != nil {
		var zero QueryResult
		return zero, e
	}
	return c.ExecuteQuery(query, confirmed)
}

func (a *App) ListDatabases(id string) ([]SchemaItem, error) {
	c, e := feature[engine.SchemaBrowser](a, id, "SchemaBrowser")
	if e != nil {
		var zero []SchemaItem
		return zero, e
	}
	return c.ListDatabases()
}

func (a *App) ListObjects(id, database string) ([]SchemaItem, error) {
	c, e := feature[engine.SchemaBrowser](a, id, "SchemaBrowser")
	if e != nil {
		var zero []SchemaItem
		return zero, e
	}
	return c.ListObjects(database)
}

func (a *App) ListColumns(id, database, table string) ([]string, error) {
	c, e := feature[engine.SchemaBrowser](a, id, "SchemaBrowser")
	if e != nil {
		var zero []string
		return zero, e
	}
	return c.ListColumns(database, table)
}

func (a *App) LoadTablePage(id, database, table string, page int, filter *string, sortBy *string, sortDesc bool) (TablePage, error) {
	c, e := feature[engine.TableEditor](a, id, "TableEditor")
	if e != nil {
		var zero TablePage
		return zero, e
	}
	return c.LoadTablePage(database, table, page, filter, sortBy, sortDesc)
}

func (a *App) UpdateTableCell(id, database, table, column string, keys []interface{}, value *string) (int64, error) {
	c, e := feature[engine.TableEditor](a, id, "TableEditor")
	if e != nil {
		var zero int64
		return zero, e
	}
	return c.UpdateTableCell(database, table, column, keys, value)
}

func (a *App) BackupDatabase(id, engineID, database string, selectedTables []string, path string) (int, error) {
	c, e := feature[engine.Backups](a, id, "Backups")
	if e != nil {
		var zero int
		return zero, e
	}
	return c.BackupDatabase(engineID, database, selectedTables, path)
}

func (a *App) InspectRestore(id, target, path string) (RestoreInspection, error) {
	c, e := feature[engine.Backups](a, id, "Backups")
	if e != nil {
		var zero RestoreInspection
		return zero, e
	}
	return c.InspectRestore(target, path)
}

func (a *App) RestoreDatabase(id, target, path string, overwrite bool) (int, error) {
	c, e := feature[engine.Backups](a, id, "Backups")
	if e != nil {
		var zero int
		return zero, e
	}
	return c.RestoreDatabase(target, path, overwrite)
}

func (a *App) ImportCsv(id, database, table, path string, columns []string) (int, error) {
	c, e := feature[engine.Transfers](a, id, "Transfers")
	if e != nil {
		var zero int
		return zero, e
	}
	return c.ImportCsv(database, table, path, columns)
}

func (a *App) ImportSql(id, database, path string) (int, error) {
	c, e := feature[engine.Transfers](a, id, "Transfers")
	if e != nil {
		var zero int
		return zero, e
	}
	return c.ImportSql(database, path)
}

func (a *App) ExportQuery(id, query, path, format string) (int, error) {
	c, e := feature[engine.Transfers](a, id, "Transfers")
	if e != nil {
		var zero int
		return zero, e
	}
	return c.ExportQuery(query, path, format)
}
