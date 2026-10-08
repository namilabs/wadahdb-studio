package mysql

import (
	"testing"

	"wadahdb-studio/internal/engine"
	"wadahdb-studio/internal/model"
)

func TestRegisteredEnginesAndValidation(t *testing.T) {
	r := engine.NewRegistry()
	for _, id := range []string{"mysql", "mariadb"} {
		d := NewDriver(id)
		if e := r.Register(d); e != nil {
			t.Fatal(e)
		}
		if e := d.ValidateProfile(model.ConnectionProfile{Engine: id, Host: "localhost", Port: 3306, Username: "root"}); e != nil {
			t.Fatal(e)
		}
		if e := d.ValidateProfile(model.ConnectionProfile{Engine: "redis", Username: "root"}); e == nil {
			t.Fatal("wrong protocol accepted")
		}
		if e := d.ValidateProfile(model.ConnectionProfile{Engine: id, Port: 3306, Username: "root"}); e == nil {
			t.Fatal("empty host accepted")
		}
		if e := d.ValidateProfile(model.ConnectionProfile{Engine: id}); e == nil {
			t.Fatal("empty username accepted")
		}
	}
	if e := r.Register(NewDriver("mysql")); e == nil {
		t.Fatal("duplicate engine accepted")
	}
	list := r.List()
	if len(list) != 2 || list[0].ID != "mariadb" || list[1].ID != "mysql" || !list[0].Capabilities.SQL {
		t.Fatal(list)
	}
}
