package profiles

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"wadahdb-studio/internal/model"
)

type memorySecrets map[string]string

func (m memorySecrets) Get(id string) (string, error) {
	s, ok := m[id]
	if !ok {
		return "", ErrSecretNotFound
	}
	return s, nil
}
func (m memorySecrets) Set(id, s string) error { m[id] = s; return nil }
func (m memorySecrets) Delete(id string) error { delete(m, id); return nil }
func str(s string) *string                     { return &s }
func TestProfileCredentialsAndLegacyStorage(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	secrets := memorySecrets{}
	validate := func(p model.ConnectionProfile) error {
		if p.Engine != "mysql" {
			return errors.New("unsupported engine")
		}
		return nil
	}
	s := New(JSONRepository{}, secrets, validate)
	p, e := s.SaveProfile(model.SaveProfileInput{Profile: model.ConnectionProfile{Name: "dev", Engine: "mysql", Host: "localhost", Port: 3306, Username: "root"}, Password: str("password")})
	if e != nil || !p.HasSavedPassword {
		t.Fatal(p, e)
	}
	data, e := os.ReadFile(filepath.Join(os.Getenv("XDG_CONFIG_HOME"), StorageID, "profiles.json"))
	if e != nil || strings.Contains(string(data), "password") || !strings.Contains(string(data), "hasSavedPassword") {
		t.Fatal("profile compatibility or credential exposure", string(data), e)
	}
	_, password, e := s.Resolve(p.ID, nil)
	if e != nil || password != "password" {
		t.Fatal(password, e)
	}
	_, password, e = s.Resolve(p.ID, str(""))
	if e != nil || password != "" {
		t.Fatal("explicit empty password not honored", e)
	}
	p, e = s.SaveProfile(model.SaveProfileInput{Profile: p})
	if e != nil || !p.HasSavedPassword {
		t.Fatal("saved password lost", e)
	}
	p, e = s.SaveProfile(model.SaveProfileInput{Profile: p, ForgetPassword: true})
	if e != nil || p.HasSavedPassword {
		t.Fatal("password not forgotten", e)
	}
	if _, e = secrets.Get(p.ID); !errors.Is(e, ErrSecretNotFound) {
		t.Fatal("secret not deleted", e)
	}
	if e = s.DeleteProfile(p.ID); e != nil {
		t.Fatal(e)
	}
	v, e := s.ListProfiles()
	if e != nil || len(v) != 0 {
		t.Fatal(v, e)
	}
}
func TestEngineSpecificValidation(t *testing.T) {
	// Redis-like adapters may accept profiles without SQL usernames.
	validate := func(p model.ConnectionProfile) error {
		if p.Engine != "redis" {
			return errors.New("engine unavailable")
		}
		return nil
	}
	repo := JSONRepository{Path: filepath.Join(t.TempDir(), "profiles.json")}
	s := New(repo, memorySecrets{}, validate)
	p := model.ConnectionProfile{Name: "cache", Engine: "redis", Host: "localhost", Port: 6379}
	if _, e := s.SaveProfile(model.SaveProfileInput{Profile: p}); e != nil {
		t.Fatal("SQL requirements leaked into profile service", e)
	}
	p.Engine = "missing"
	if _, e := s.SaveProfile(model.SaveProfileInput{Profile: p}); e == nil {
		t.Fatal("unregistered engine accepted")
	}
	v, e := s.ListProfiles()
	if e != nil || len(v) != 1 || v[0].Engine != "redis" {
		t.Fatal("failed validation changed repository", v, e)
	}
}
func TestMissingSavedPassword(t *testing.T) {
	p := model.ConnectionProfile{ID: "legacy", HasSavedPassword: true}
	repo := JSONRepository{Path: filepath.Join(t.TempDir(), "profiles.json")}
	if e := repo.Store([]model.ConnectionProfile{p}); e != nil {
		t.Fatal(e)
	}
	s := New(repo, memorySecrets{}, func(model.ConnectionProfile) error { return nil })
	if _, _, e := s.Resolve(p.ID, nil); !errors.Is(e, ErrSecretNotFound) {
		t.Fatal(e)
	}
	if _, secret, e := s.Resolve(p.ID, str("temporary")); e != nil || secret != "temporary" {
		t.Fatal(secret, e)
	}
}

func TestSqliteProfileValidationAndPersistence(t *testing.T) {
	repo := JSONRepository{Path: filepath.Join(t.TempDir(), "profiles.json")}
	dbPath := filepath.Join(t.TempDir(), "sample.db")
	s := New(repo, memorySecrets{}, func(p model.ConnectionProfile) error {
		if p.Engine != "sqlite" || p.DatabasePath == nil || *p.DatabasePath == "" {
			return errors.New("invalid sqlite profile")
		}
		return nil
	})
	p := model.ConnectionProfile{Name: "local", Engine: "sqlite", DatabasePath: &dbPath}
	saved, e := s.SaveProfile(model.SaveProfileInput{Profile: p})
	if e != nil {
		t.Fatal(e)
	}
	if saved.DatabasePath == nil || *saved.DatabasePath != dbPath || saved.Host != "" || saved.Port != 0 || saved.Username != "" {
		t.Fatal(saved)
	}
}
