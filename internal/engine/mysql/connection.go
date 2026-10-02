package mysql

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"sync"
	"time"

	"github.com/go-sql-driver/mysql"

	"wadahdb-studio/internal/model"
	"wadahdb-studio/internal/sqlsyntax"
)

type Connection struct {
	ctx     context.Context
	session *session
	version string
}
type session struct {
	closed bool
	mu     sync.Mutex
	db     *sql.DB
	conn   *sql.Conn
	tx     bool
	thread uint64
	tunnel *exec.Cmd
	config *mysql.Config
}

func (a *Connection) Version() string { return a.version }
func (a *Connection) get() (*session, error) {
	if a.session == nil {
		return nil, errors.New("Connect to the server first")
	}
	return a.session, nil
}
func (a *Connection) connect(p model.ConnectionProfile, password string) (string, error) {
	cfg := mysql.NewConfig()
	cfg.User = p.Username
	cfg.Passwd = password
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(p.Host, strconv.Itoa(p.Port))
	cfg.Timeout = 12 * time.Second
	cfg.AllowNativePasswords = true
	if p.DefaultDatabase != nil {
		cfg.DBName = *p.DefaultDatabase
	}
	if p.TLS {
		cfg.TLSConfig = "true"
	}
	var tunnel *exec.Cmd
	keepTunnel := false
	defer func() {
		if !keepTunnel && tunnel != nil && tunnel.Process != nil {
			_ = tunnel.Process.Kill()
			_ = tunnel.Wait()
		}
	}()
	if p.SSH != nil {
		l, e := net.Listen("tcp", "127.0.0.1:0")
		if e != nil {
			return "", e
		}
		port := l.Addr().(*net.TCPAddr).Port
		l.Close()
		ssh := p.SSH
		args := []string{"-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=10", "-N", "-p", strconv.Itoa(ssh.Port)}
		if ssh.IdentityFile != nil && *ssh.IdentityFile != "" {
			args = append(args, "-i", *ssh.IdentityFile)
		}
		args = append(args, "-L", fmt.Sprintf("127.0.0.1:%d:%s:%d", port, p.Host, p.Port), "--", ssh.Username+"@"+ssh.Host)
		tunnel = exec.Command("ssh", args...)
		if e = tunnel.Start(); e != nil {
			return "", e
		}
		cfg.Addr = net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
		ready := false
		for n := 0; n < 100; n++ {
			c, e := net.DialTimeout("tcp", cfg.Addr, 100*time.Millisecond)
			if e == nil {
				c.Close()
				ready = true
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		if !ready {
			return "", errors.New("SSH tunnel did not become ready")
		}
	}
	connector, e := mysql.NewConnector(cfg)
	if e != nil {
		return "", e
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(4)
	ctx, cancel := context.WithTimeout(a.ctx, 12*time.Second)
	defer cancel()
	conn, e := db.Conn(ctx)
	if e != nil {
		db.Close()
		return "", e
	}
	s := &session{db: db, conn: conn, tunnel: tunnel, config: cfg}
	version := ""
	e = conn.QueryRowContext(ctx, "SELECT VERSION(), CONNECTION_ID()").Scan(&version, &s.thread)
	if e != nil {
		conn.Close()
		db.Close()
		return "", e
	}
	keepTunnel = true
	a.session = s
	a.version = version
	return version, nil
}
func (a *Connection) Close() error {
	s := a.session
	if s == nil {
		return nil
	}
	_, _ = s.db.ExecContext(a.ctx, fmt.Sprintf("KILL QUERY %d", s.thread))
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	if s.tx {
		_, _ = s.conn.ExecContext(a.ctx, "ROLLBACK")
	}
	s.conn.Close()
	s.db.Close()
	if s.tunnel != nil {
		s.tunnel.Process.Kill()
		s.tunnel.Wait()
	}
	return nil
}
func (a *Connection) BeginTransaction() error {
	s, e := a.get()
	if e != nil {
		return e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tx {
		return errors.New("Transaction is already active")
	}
	_, e = s.conn.ExecContext(a.ctx, "START TRANSACTION")
	if e == nil {
		s.tx = true
	}
	return e
}
func (a *Connection) FinishTransaction(commit bool) error {
	s, e := a.get()
	if e != nil {
		return e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.tx {
		return errors.New("No active transaction")
	}
	q := "ROLLBACK"
	if commit {
		q = "COMMIT"
	}
	_, e = s.conn.ExecContext(a.ctx, q)
	if e == nil {
		s.tx = false
	}
	return e
}
func (a *Connection) CancelQuery() error {
	s, e := a.get()
	if e != nil {
		return e
	}
	_, e = s.db.ExecContext(a.ctx, fmt.Sprintf("KILL QUERY %d", s.thread))
	return e
}
func (a *Connection) SelectDatabase(database string) error {
	s, e := a.get()
	if e != nil {
		return e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tx {
		return errors.New("Commit or roll back before switching databases")
	}
	_, e = s.conn.ExecContext(a.ctx, "USE "+sqlsyntax.QuoteIdentifier(database))
	if e == nil {
		s.config.DBName = database
	}
	return e
}
