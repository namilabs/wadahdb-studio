// Package database owns engine-neutral session routing and lifecycle.
package database

import (
	"context"
	"errors"
	"sync"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

type Manager struct {
	registry  *engine.Registry
	lifecycle sync.Mutex
	mu        sync.RWMutex
	sessions  map[string]engine.Connection
	closed    bool
}

func NewManager(r *engine.Registry) *Manager {
	return &Manager{registry: r, sessions: map[string]engine.Connection{}}
}
func (m *Manager) Get(id string) (engine.Connection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.sessions[id]
	if !ok {
		return nil, errors.New("Connect to the server first")
	}
	return c, nil
}

// Connect serializes replacement and shutdown so concurrent reconnects cannot leak sessions.
func (m *Manager) Connect(ctx context.Context, p model.ConnectionProfile, password string) (string, error) {
	m.lifecycle.Lock()
	defer m.lifecycle.Unlock()
	if m.closed {
		return "", errors.New("Database manager is closed")
	}
	d, e := m.registry.Driver(p.Engine)
	if e != nil {
		return "", e
	}
	if e = d.ValidateProfile(p); e != nil {
		return "", e
	}
	if e = m.disconnect(p.ID); e != nil {
		return "", e
	}
	c, e := d.Open(ctx, p, password)
	if e != nil {
		return "", e
	}
	m.mu.Lock()
	m.sessions[p.ID] = c
	m.mu.Unlock()
	return c.Version(), nil
}
func (m *Manager) disconnect(id string) error {
	m.mu.Lock()
	c := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()
	if c != nil {
		return c.Close()
	}
	return nil
}
func (m *Manager) Disconnect(id string) error {
	m.lifecycle.Lock()
	defer m.lifecycle.Unlock()
	return m.disconnect(id)
}
func (m *Manager) Close() error {
	m.lifecycle.Lock()
	defer m.lifecycle.Unlock()
	m.closed = true
	m.mu.Lock()
	sessions := m.sessions
	m.sessions = map[string]engine.Connection{}
	m.mu.Unlock()
	var errs []error
	for _, c := range sessions {
		errs = append(errs, c.Close())
	}
	return errors.Join(errs...)
}
