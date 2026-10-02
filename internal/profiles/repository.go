package profiles

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"wadahdb-studio/internal/fileio"
	"wadahdb-studio/internal/model"
)

// StorageID is retained for profile and keyring compatibility.
const StorageID = "dev.nanti.sql"

type Repository interface {
	Load() ([]model.ConnectionProfile, error)
	Store([]model.ConnectionProfile) error
}

// JSONRepository uses Path when provided, otherwise the legacy XDG location.
type JSONRepository struct{ Path string }

func (r JSONRepository) path() (string, error) {
	if r.Path != "" {
		return r.Path, nil
	}
	dir, e := os.UserConfigDir()
	if e != nil {
		return "", e
	}
	return filepath.Join(dir, StorageID, "profiles.json"), nil
}
func (r JSONRepository) Load() ([]model.ConnectionProfile, error) {
	p, e := r.path()
	if e != nil {
		return nil, e
	}
	b, e := os.ReadFile(p)
	if errors.Is(e, os.ErrNotExist) {
		return []model.ConnectionProfile{}, nil
	}
	if e != nil {
		return nil, e
	}
	v := []model.ConnectionProfile{}
	e = json.Unmarshal(b, &v)
	return v, e
}
func (r JSONRepository) Store(v []model.ConnectionProfile) error {
	p, e := r.path()
	if e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
		return e
	}
	return fileio.Atomic(p, func(f *os.File) error { return json.NewEncoder(f).Encode(v) })
}
