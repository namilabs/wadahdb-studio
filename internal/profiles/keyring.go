package profiles

import (
	"errors"

	"github.com/zalando/go-keyring"
)

var ErrSecretNotFound = errors.New("saved password not found")

type SecretStore interface {
	Get(string) (string, error)
	Set(string, string) error
	Delete(string) error
}
type SystemKeyring struct{}

func (SystemKeyring) Get(id string) (string, error) {
	s, e := keyring.Get(StorageID, id)
	if errors.Is(e, keyring.ErrNotFound) {
		e = ErrSecretNotFound
	}
	return s, e
}
func (SystemKeyring) Set(id, password string) error { return keyring.Set(StorageID, id, password) }
func (SystemKeyring) Delete(id string) error {
	e := keyring.Delete(StorageID, id)
	if errors.Is(e, keyring.ErrNotFound) {
		return ErrSecretNotFound
	}
	return e
}
