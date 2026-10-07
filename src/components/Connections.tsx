import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Braces, Check, ChevronRight, CircleAlert, Crown, Download, Eye, EyeOff, FileCode2, Link, LoaderCircle, LockKeyhole, Pencil, Play, Plug, Plus, Search, Share2, Star, Table2, Trash2, Upload, Wifi } from 'lucide-react'
import { api, errorMessage, type ConnectionProfile } from '../api'
import DatabaseIcon, { databaseTypes } from './DatabaseIcon'
import logo from '../assets/logo.png'

export const blankProfile = (): ConnectionProfile => ({
  id: '', name: '', engine: 'mysql', host: 'localhost', port: 3306,
  username: 'root', defaultDatabase: null, tls: false, ssh: null, hasSavedPassword: false,
})

function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}

interface Props {
  profiles: ConnectionProfile[]
  selected: ConnectionProfile | null
  connectedId: string | null
  busy: boolean
  error: string
  onClearError: () => void
  onSelect: (profile: ConnectionProfile) => void
  onSave: (profile: ConnectionProfile, password: string, savePassword: boolean, connect: boolean) => Promise<ConnectionProfile>
  onConnect: (profile: ConnectionProfile) => void
  onDelete: (profile: ConnectionProfile) => void
  onNavigate: (page: 'query' | 'explorer' | 'snippets') => void
  onImport: () => void
  onExport: () => void
}

export default function Connections({ profiles, selected, connectedId, busy, error, onClearError, onSelect, onSave, onConnect, onDelete, onNavigate, onImport, onExport }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [profile, setProfile] = useState(selected ?? blankProfile())
  const [password, setPassword] = useState('')
  const [savePassword, setSavePassword] = useState(selected?.hasSavedPassword ?? false)
  const [showPassword, setShowPassword] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [status, setStatus] = useState('')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<'save' | 'connect' | 'test' | null>(null)
  const [favorites, setFavorites] = useState<string[]>(() => readLocal('wadahdb:favorites', []))
  const [tags, setTags] = useState<Record<string, string>>(() => readLocal('wadahdb:connection-tags', {}))
  const [color, setColor] = useState('blue')
  const [showURL, setShowURL] = useState(false)
  const [url, setURL] = useState('')
  const colors = ['blue', 'violet', 'pink', 'red', 'orange', 'yellow', 'green', 'cyan', 'slate']

  useEffect(() => {
    const next = selected ?? blankProfile()
    setProfile(next); setPassword(''); setSavePassword(next.hasSavedPassword)
    setColor(tags[next.id] ?? 'blue'); setStatus(''); setFormError(''); onClearError()
  }, [selected])
  useEffect(() => { localStorage.setItem('wadahdb:favorites', JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem('wadahdb:connection-tags', JSON.stringify(tags)) }, [tags])

  const update = <K extends keyof ConnectionProfile>(key: K, value: ConnectionProfile[K]) => {
    setProfile(current => ({ ...current, [key]: value })); setStatus(''); setFormError(''); onClearError()
  }
  function importURL() {
    try {
      const parsed = new URL(url.trim())
      const engine = parsed.protocol.slice(0, -1)
      if (engine !== 'mysql' && engine !== 'mariadb') throw new Error('Use a mysql:// or mariadb:// connection URL.')
      setProfile({ ...blankProfile(), engine, name: `${engine === 'mysql' ? 'MySQL' : 'MariaDB'} connection`, host: parsed.hostname, port: Number(parsed.port || 3306), username: decodeURIComponent(parsed.username), defaultDatabase: decodeURIComponent(parsed.pathname.slice(1)) || null, tls: ['true', '1', 'required'].includes(parsed.searchParams.get('ssl') ?? '') })
      setPassword(decodeURIComponent(parsed.password)); setURL(''); setShowURL(false); setFormError(''); setStatus('Connection URL imported. Review the details before connecting.')
    } catch (cause) { setFormError(errorMessage(cause)) }
  }
  async function submit(connect: boolean) {
    setPending(connect ? 'connect' : 'save'); setFormError(''); setStatus(''); onClearError()
    try {
      const saved = await onSave(profile, password, savePassword, connect)
      setProfile(saved); const nextTags = { ...tags, [saved.id]: color }; localStorage.setItem('wadahdb:connection-tags', JSON.stringify(nextTags)); setTags(nextTags)
      setStatus(connect ? '' : 'Connection saved.')
    } catch (cause) { setFormError(errorMessage(cause)) }
    finally { setPending(null) }
  }
  async function test() {
    setPending('test'); setFormError(''); setStatus(''); onClearError()
    try {
      const version = await api.testConnection(profile, password || (profile.hasSavedPassword ? null : ''))
      setStatus(`Connection successful · ${version}`)
    } catch (cause) { setFormError(errorMessage(cause)) }
    finally { setPending(null) }
  }
  const visible = profiles.filter(p => (filter === 'all' || p.engine === filter) && `${p.name} ${p.host} ${p.username}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)))
  const selectedType = databaseTypes.find(type => type.id === profile.engine)!
  const locked = busy || pending !== null

  return <div className="connections-page">
    <div className="connections-grid">
      <section className="connections-list panel">
        <div className="section-heading"><div><h1>Connections</h1><p>Manage your database connections</p></div><button className="primary" onClick={() => onSelect(blankProfile())}><Plus size={18} /> New connection</button></div>
        <div className="connection-filters"><div className="search-field"><Search size={17} /><input aria-label="Search connections" placeholder="Search connections…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter connection type" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All types</option><option value="mysql">MySQL</option><option value="mariadb">MariaDB</option></select></div>
        <div className="connection-rows">
          {visible.map(p => <div className={`connection-row ${selected?.id === p.id || connectedId === p.id ? 'selected' : ''}`} key={p.id}>
            <button className="connection-row-main" onClick={() => onSelect(p)}>
              <DatabaseIcon engine={p.engine} size={38} /><span className="connection-detail"><strong>{p.name}<i className={`color-dot tag-${tags[p.id] ?? 'blue'}`} /></strong><small>{p.username} · {p.host}:{p.port} · {p.defaultDatabase || '(no database)'}</small></span>
            </button>
            <div className="connection-row-status"><span className={connectedId === p.id ? 'connected' : ''}><i className={connectedId === p.id ? 'online-dot' : 'offline-dot'} />{connectedId === p.id ? 'Connected' : 'Offline'}</span><button className="row-connect" disabled={busy} onClick={() => onConnect(p)}>{connectedId === p.id ? 'Open workspace' : 'Connect'}<ChevronRight size={13} /></button></div>
            <button className={`icon-button favorite ${favorites.includes(p.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(p.id) ? 'Unfavorite' : 'Favorite'} ${p.name}`} aria-pressed={favorites.includes(p.id)} onClick={() => setFavorites(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id])}><Star size={18} fill={favorites.includes(p.id) ? 'currentColor' : 'none'} /></button>
            <details className="connection-menu"><summary aria-label={`Actions for ${p.name}`}><span>⋮</span></summary><div className="connection-menu-content"><button onClick={e => { onSelect(p); e.currentTarget.closest('details')?.removeAttribute('open') }}><Pencil size={14} /> Edit connection</button><button className="danger-text" onClick={() => onDelete(p)}><Trash2 size={14} /> Delete connection</button></div></details>
          </div>)}
          {visible.length === 0 && <div className="connection-empty"><div className="empty-icon"><DatabaseIcon engine="postgres" size={36} /></div><h3>{profiles.length ? 'No matching connections' : 'Your databases, in one place'}</h3><p>{profiles.length ? 'Try a different name or database type.' : 'Create your first connection to explore tables, write queries, and work with your data.'}</p><button className="secondary" onClick={() => profiles.length ? (setSearch(''), setFilter('all')) : onSelect(blankProfile())}>{profiles.length ? 'Clear filters' : 'Create a connection'}<ArrowRight size={15} /></button></div>}
        </div>
        <div className="connection-list-footer"><LockKeyhole size={14} /><span>Credentials stay on your device.</span><span>{profiles.length} connection{profiles.length === 1 ? '' : 's'}</span></div>
      </section>
      <section className="connection-create panel">
        <div className="section-heading"><div><h2>{profile.id ? 'Edit connection' : 'Create connection'}</h2><p>Set up a new database connection</p></div><button className="secondary import-url" aria-expanded={showURL} onClick={() => setShowURL(!showURL)}><Link size={16} /> Import from URL</button></div>
        {showURL && <div className="url-import"><label htmlFor="connection-url">Connection URL</label><div><input id="connection-url" type="password" autoComplete="off" placeholder="mysql://user:password@localhost:3306/database" value={url} onChange={e => setURL(e.target.value)} /><button className="secondary" onClick={importURL}>Import</button></div></div>}
        <form ref={formRef} onSubmit={e => { e.preventDefault(); void submit(true) }}>
          <fieldset className="database-types"><legend>Database type</legend><div className="engine-options">{databaseTypes.map(type => <button type="button" key={type.id} disabled={!type.available || locked} className={`engine-option ${profile.engine === type.id ? 'selected' : ''}`} aria-pressed={profile.engine === type.id} title={!type.available ? `${type.name} support is coming soon` : type.name} onClick={() => { update('engine', type.id as ConnectionProfile['engine']); update('port', type.port); if (!profile.name) update('name', `My ${type.name} connection`) }}><DatabaseIcon engine={type.id} size={32} /><strong>{type.name}</strong>{!type.available && <small>Soon</small>}</button>)}</div></fieldset>
          <div className="connection-form-grid">
            <label>Connection name<input required value={profile.name} onChange={e => update('name', e.target.value)} placeholder={`My ${selectedType.name} connection`} /><small>A friendly name to identify this connection</small></label>
            <label>Port<input required type="number" min={1} max={65535} value={profile.port} onChange={e => update('port', Number(e.target.value))} /><small>Default port for {selectedType.name} is {selectedType.port}</small></label>
            <label>Host<input required value={profile.host} onChange={e => update('host', e.target.value)} placeholder="localhost" /><small>Hostname or IP address</small></label>
            <label>Username<input required value={profile.username} onChange={e => update('username', e.target.value)} autoComplete="off" placeholder="root" /></label>
            <label>Database<input value={profile.defaultDatabase ?? ''} onChange={e => update('defaultDatabase', e.target.value || null)} placeholder="my_database" /><small>Optional database to connect to</small></label>
            <div className="form-field"><label htmlFor="connection-password">Password</label><div className="password-field"><input id="connection-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setStatus('') }} autoComplete="off" placeholder={profile.hasSavedPassword ? 'Saved in system keyring' : 'Connection password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><small><label className="save-password"><input type="checkbox" checked={savePassword} onChange={e => setSavePassword(e.target.checked)} /> Save in system keyring</label></small></div>
          </div>
          <div className="connection-toggles"><label className="toggle-field"><LockKeyhole size={22} /><span><strong>Use SSL</strong><small>Encrypt connection with SSL/TLS</small></span><input type="checkbox" role="switch" checked={profile.tls} onChange={e => update('tls', e.target.checked)} /></label><label className="toggle-field"><Share2 size={22} /><span><strong>Use SSH tunnel</strong><small>Connect through an SSH server</small></span><input type="checkbox" role="switch" checked={!!profile.ssh} onChange={e => update('ssh', e.target.checked ? { host: '', port: 22, username: '', identityFile: null } : null)} /></label></div>
          {profile.ssh && <div className="connection-form-grid ssh-fields"><label>SSH host<input required value={profile.ssh.host} onChange={e => update('ssh', { ...profile.ssh!, host: e.target.value })} /></label><label>SSH port<input required type="number" min={1} max={65535} value={profile.ssh.port} onChange={e => update('ssh', { ...profile.ssh!, port: Number(e.target.value) })} /></label><label>SSH username<input required value={profile.ssh.username} onChange={e => update('ssh', { ...profile.ssh!, username: e.target.value })} /></label><label>Identity file<input value={profile.ssh.identityFile ?? ''} onChange={e => update('ssh', { ...profile.ssh!, identityFile: e.target.value || null })} placeholder="Uses SSH agent by default" /></label></div>}
          <div className="color-tags"><strong>Color tag</strong><div><div className="color-options">{colors.map(tag => <button type="button" key={tag} className={`color-choice tag-${tag} ${color === tag ? 'selected' : ''}`} aria-label={`${tag} color tag`} aria-pressed={color === tag} onClick={() => setColor(tag)}>{color === tag && <Check size={14} />}</button>)}</div><small>Organize your connections with a color tag</small></div></div>
          {(formError || error) && <div className="form-feedback error" role="alert"><CircleAlert size={16} />{formError || error}</div>}
          {status && <div className="form-feedback success" role="status"><Check size={16} />{status}</div>}
          <div className="connection-form-actions"><button type="button" className="ghost-action" disabled={locked} onClick={() => { if (formRef.current?.reportValidity()) void submit(false) }}>Save connection</button><button type="button" className="secondary" disabled={locked} onClick={() => { if (formRef.current?.reportValidity()) void test() }}>{pending === 'test' ? <LoaderCircle className="spin" size={17} /> : <Wifi size={17} />} Test connection</button><button type="submit" className="primary" disabled={locked}>{pending === 'connect' ? <LoaderCircle className="spin" size={17} /> : <Plug size={17} />} Connect</button></div>
        </form>
      </section>
    </div>
    <section className="feature-strip panel"><div className="feature-strip-heading"><img src={logo} alt="" /><div><h3>Everything you need. All free.</h3><p>Powerful database tools, right on your desktop.</p></div><span><Crown size={15} /> Free & open source</span></div><div className="feature-cards">
      <button onClick={() => onNavigate('query')}><Play /><span><strong>Query editor</strong><small>Write and run SQL with a modern editor.</small></span><b>Free</b></button>
      <button onClick={() => onNavigate('explorer')}><Table2 /><span><strong>Table explorer</strong><small>Browse databases, tables, and views.</small></span><b>Free</b></button>
      <button onClick={() => onNavigate('snippets')}><Braces /><span><strong>Saved snippets</strong><small>Keep your favorite SQL close at hand.</small></span><b>Free</b></button>
      <button disabled={!connectedId} onClick={onImport}><Upload /><span><strong>Data import</strong><small>Import CSV data and SQL scripts.</small></span><b>Free</b></button>
      <button disabled={!connectedId} onClick={onExport}><Download /><span><strong>Data export</strong><small>Export query results to CSV or JSON.</small></span><b>Free</b></button>
      <button onClick={() => onNavigate('query')}><FileCode2 /><span><strong>SQL workbench</strong><small>Explain queries and manage transactions.</small></span><b>Free</b></button>
    </div></section>
  </div>
}
