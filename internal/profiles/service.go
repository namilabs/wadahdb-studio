// Package profiles manages profiles and credentials independently of desktop UI.
package profiles

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"

	"wadahdb-studio/internal/model"
)

type Service struct {
	mu         sync.Mutex
	repository Repository
	secrets    SecretStore
	validate   func(model.ConnectionProfile) error
}

func New(repository Repository, secrets SecretStore, validate func(model.ConnectionProfile) error) *Service {
	return &Service{repository: repository, secrets: secrets, validate: validate}
}
func (s *Service) ListProfiles() ([]model.ConnectionProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.repository.Load()
}
func (s *Service) SaveProfile(in model.SaveProfileInput) (model.ConnectionProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := in.Profile
	if strings.TrimSpace(p.Name) == "" || strings.TrimSpace(p.Host) == "" || p.Port < 1 || p.Port > 65535 {
		return p, errors.New("Valid name, host, port and engine are required")
	}
	if e := s.validate(p); e != nil {
		return p, e
	}
	if p.SSH != nil && (p.SSH.Host == "" || p.SSH.Username == "" || p.SSH.Port < 1 || p.SSH.Port > 65535 || strings.HasPrefix(p.SSH.Username, "-")) {
		return p, errors.New("Invalid SSH settings")
	}
	if p.ID == "" {
		b := make([]byte, 16)
		if _, e := rand.Read(b); e != nil {
			return p, e
		}
		p.ID = hex.EncodeToString(b)
	}
	v, e := s.repository.Load()
	if e != nil {
		return p, e
	}
	saved := false
	for _, old := range v {
		if old.ID == p.ID {
			saved = old.HasSavedPassword
		}
	}
	if in.ForgetPassword && saved {
		e = s.secrets.Delete(p.ID)
		if e != nil && !errors.Is(e, ErrSecretNotFound) {
			return p, e
		}
		saved = false
	} else if in.Password != nil && *in.Password != "" {
		if e = s.secrets.Set(p.ID, *in.Password); e != nil {
			return p, e
		}
		saved = true
	}
	p.HasSavedPassword = saved
	out := []model.ConnectionProfile{}
	for _, old := range v {
		if old.ID != p.ID {
			out = append(out, old)
		}
	}
	out = append(out, p)
	return p, s.repository.Store(out)
}
func (s *Service) DeleteProfile(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, e := s.repository.Load()
	if e != nil {
		return e
	}
	out := []model.ConnectionProfile{}
	for _, p := range v {
		if p.ID == id && p.HasSavedPassword {
			if e = s.secrets.Delete(id); e != nil && !errors.Is(e, ErrSecretNotFound) {
				return e
			}
		}
		if p.ID != id {
			out = append(out, p)
		}
	}
	return s.repository.Store(out)
}

// Resolve honors an explicitly supplied temporary password, including an empty one.
func (s *Service) Resolve(id string, temporaryPassword *string) (model.ConnectionProfile, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, e := s.repository.Load()
	if e != nil {
		return model.ConnectionProfile{}, "", e
	}
	for _, p := range v {
		if p.ID != id {
			continue
		}
		if temporaryPassword != nil {
			return p, *temporaryPassword, nil
		}
		if !p.HasSavedPassword {
			return p, "", nil
		}
		password, e := s.secrets.Get(id)
		if e != nil {
			return p, "", fmt.Errorf("Enter the connection password: %w", e)
		}
		return p, password, nil
	}
	return model.ConnectionProfile{}, "", errors.New("Connection profile not found")
}
