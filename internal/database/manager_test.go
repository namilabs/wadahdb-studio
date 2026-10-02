package database

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

type testConnection struct {
	version string
	closed  atomic.Int32
}

func (c *testConnection) Version() string { return c.version }
func (c *testConnection) Close() error    { c.closed.Add(1); return nil }

type testDriver struct {
	id       string
	opened   []*testConnection
	password string
	failure  error
}

func (d *testDriver) Descriptor() engine.Descriptor {
	return engine.Descriptor{ID: d.id, Kind: "key-value"}
}
func (d *testDriver) ValidateProfile(p model.ConnectionProfile) error {
	if p.Engine != d.id {
		return errors.New("wrong engine")
	}
	return nil
}
func (d *testDriver) Open(ctx context.Context, p model.ConnectionProfile, password string) (engine.Connection, error) {
	if d.failure != nil {
		return nil, d.failure
	}
	c := &testConnection{version: d.id}
	d.opened = append(d.opened, c)
	d.password = password
	return c, nil
}
func registry(t *testing.T, drivers ...*testDriver) *engine.Registry {
	t.Helper()
	r := engine.NewRegistry()
	for _, d := range drivers {
		if e := r.Register(d); e != nil {
			t.Fatal(e)
		}
	}
	return r
}
func TestRouteIndependentEngineSessions(t *testing.T) {
	redis := &testDriver{id: "redis"}
	mongo := &testDriver{id: "mongodb"}
	m := NewManager(registry(t, redis, mongo))
	defer m.Close()
	for _, p := range []model.ConnectionProfile{{ID: "cache", Engine: "redis"}, {ID: "documents", Engine: "mongodb"}} {
		v, e := m.Connect(context.Background(), p, "secret")
		if e != nil || v != p.Engine {
			t.Fatalf("%s: %s %v", p.Engine, v, e)
		}
	}
	cache, e := m.Get("cache")
	if e != nil {
		t.Fatal(e)
	}
	documents, e := m.Get("documents")
	if e != nil {
		t.Fatal(e)
	}
	if cache == documents || redis.password != "secret" || mongo.password != "secret" {
		t.Fatal("connections or credentials routed incorrectly")
	}
	// A non-SQL engine works without database/sql, query, transaction, or backup methods.
	if _, e = engine.Require[engine.QueryExecutor](cache, "query"); !errors.Is(e, engine.ErrUnsupported) {
		t.Fatal(e)
	}
	if e = m.Disconnect("cache"); e != nil {
		t.Fatal(e)
	}
	if _, e = m.Get("cache"); e == nil {
		t.Fatal("disconnected session remains available")
	}
	if _, e = m.Get("documents"); e != nil {
		t.Fatal("disconnect affected another engine", e)
	}
}
func TestConcurrentReplacementAndShutdown(t *testing.T) {
	d := &testDriver{id: "redis"}
	m := NewManager(registry(t, d))
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := m.Connect(context.Background(), model.ConnectionProfile{ID: "same", Engine: "redis"}, ""); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if e := m.Close(); e != nil {
		t.Fatal(e)
	}
	if e := m.Close(); e != nil {
		t.Fatal(e)
	}
	for _, c := range d.opened {
		if c.closed.Load() != 1 {
			t.Fatal("session leaked or closed twice", c.closed.Load())
		}
	}
	if _, e := m.Connect(context.Background(), model.ConnectionProfile{ID: "same", Engine: "redis"}, ""); e == nil {
		t.Fatal("shutdown manager accepted connection")
	}
}
func TestConnectionFailureAndUnknownEngine(t *testing.T) {
	d := &testDriver{id: "redis"}
	m := NewManager(registry(t, d))
	defer m.Close()
	p := model.ConnectionProfile{ID: "same", Engine: "redis"}
	if _, e := m.Connect(context.Background(), p, ""); e != nil {
		t.Fatal(e)
	}
	if _, e := m.Connect(context.Background(), model.ConnectionProfile{ID: "same", Engine: "unregistered"}, ""); !errors.Is(e, engine.ErrUnsupported) {
		t.Fatal(e)
	}
	if _, e := m.Get("same"); e != nil {
		t.Fatal("unknown engine displaced valid session", e)
	}
	d.failure = errors.New("dial failed")
	if _, e := m.Connect(context.Background(), p, ""); !errors.Is(e, d.failure) {
		t.Fatal(e)
	}
	if _, e := m.Get("same"); e == nil {
		t.Fatal("failed replacement left old session routed")
	}
	if d.opened[0].closed.Load() != 1 {
		t.Fatal("old session leaked on failed reconnect")
	}
}
