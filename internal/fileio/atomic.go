package fileio

import (
	"os"
	"path/filepath"
)

func Atomic(path string, write func(*os.File) error) error {
	f, e := os.CreateTemp(filepath.Dir(path), ".wadahdb-studio-*.partial")
	if e != nil {
		return e
	}
	defer os.Remove(f.Name())
	if e = write(f); e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e != nil {
		return e
	}
	return os.Rename(f.Name(), path)
}
