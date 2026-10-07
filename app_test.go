package main

import (
	"context"
	"errors"
	"testing"
	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

func TestProfileCompatibility(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	a := NewApp()
	p := ConnectionProfile{Name: "dev", Engine: "mariadb", Host: "localhost", Port: 3306, Username: "root"}
	p, e := a.SaveProfile(SaveProfileInput{Profile: p})
	if e != nil {
		t.Fatal(e)
	}
	v, e := a.ListProfiles()
	if e != nil || len(v) != 1 || v[0].ID != p.ID {
		t.Fatal(v, e)
	}
	if e = a.DeleteProfile(p.ID); e != nil {
		t.Fatal(e)
	}
}

type desktopTestDriver struct{ connection *desktopTestConnection }

func (d *desktopTestDriver) Descriptor() engine.Descriptor {
	return engine.Descriptor{ID: "test", Kind: "key-value"}
}
func (d *desktopTestDriver) ValidateProfile(model.ConnectionProfile) error { return nil }
func (d *desktopTestDriver) Open(context.Context, model.ConnectionProfile, string) (engine.Connection, error) {
	return d.connection, nil
}

type desktopTestConnection struct {
	began     bool
	committed bool
	closed    bool
}

func (c *desktopTestConnection) Version() string         { return "test-engine" }
func (c *desktopTestConnection) Close() error            { c.closed = true; return nil }
func (c *desktopTestConnection) BeginTransaction() error { c.began = true; return nil }
func (c *desktopTestConnection) FinishTransaction(commit bool) error {
	c.committed = commit
	return nil
}
func TestDesktopFeatureDispatch(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	a := NewApp()
	defer a.shutdown(context.Background())
	c := &desktopTestConnection{}
	if e := a.registry.Register(&desktopTestDriver{connection: c}); e != nil {
		t.Fatal(e)
	}
	p, e := a.SaveProfile(SaveProfileInput{Profile: ConnectionProfile{Name: "test", Engine: "test", Host: "localhost", Port: 6379}})
	if e != nil {
		t.Fatal(e)
	}
	version, e := a.ConnectProfile(p.ID, nil)
	if e != nil || version != "test-engine" {
		t.Fatal(version, e)
	}
	if e = a.BeginTransaction(p.ID); e != nil || !c.began {
		t.Fatal("transaction not dispatched", e)
	}
	if e = a.FinishTransaction(p.ID, true); e != nil || !c.committed {
		t.Fatal("commit argument lost", e)
	}
	if _, e = a.ExecuteQuery(p.ID, "SELECT 1", false); !errors.Is(e, engine.ErrUnsupported) {
		t.Fatal("unsupported SQL was not rejected", e)
	}
	if e = a.DeleteProfile(p.ID); e != nil || !c.closed {
		t.Fatal("profile deletion did not close session", e)
	}
	if _, e = a.ListDatabases(p.ID); e == nil {
		t.Fatal("deleted profile remains connected")
	}
}

func TestConnectionDoesNotPersistOrRouteSession(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	a := NewApp()
	c := &desktopTestConnection{}
	if e := a.registry.Register(&desktopTestDriver{connection: c}); e != nil {
		t.Fatal(e)
	}
	p := ConnectionProfile{ID: "temporary", Name: "Temporary test", Engine: "test", Host: "localhost", Port: 6379}
	version, e := a.TestConnection(SaveProfileInput{Profile: p})
	if e != nil || version != "test-engine" || !c.closed {
		t.Fatal(version, c.closed, e)
	}
	if _, e = a.database.Get(p.ID); e == nil {
		t.Fatal("connection test changed workspace sessions")
	}
	profiles, e := a.ListProfiles()
	if e != nil || len(profiles) != 0 {
		t.Fatal("connection test persisted a profile", profiles, e)
	}
	c.closed = false
	p.Port = 0
	if _, e = a.TestConnection(SaveProfileInput{Profile: p}); e == nil || c.closed {
		t.Fatal("invalid profile reached driver")
	}
}
