import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { open, save } from './dialogs'
import {
  Archive, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Database, Download, FileCode2,
  FolderInput, LoaderCircle, Pencil, Play, Plus, RefreshCw, Save, Server, Square, Table2, Upload,
  Settings2,
  Trash2, Unplug, X,
} from 'lucide-react'
import { api, errorMessage, type ConnectionProfile, type CsvPreview, type QueryResult, type RestoreInspection, type SchemaItem } from './api'
import Tools from './Tools'

interface Tab {
  id: string
  title: string
  sql: string
  result: QueryResult | null
  table: { database: string; name: string; page: number; hasMore: boolean; primaryKeys: string[]; filter: string; sortBy: string | null; sortDesc: boolean } | null
}

interface SavedQuery { id: string; name: string; sql: string }
interface HistoryEntry { id: string; sql: string; when: string }

function storedList<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] }
  catch { return [] }
}

const newTab = (index: number): Tab => ({
  id: crypto.randomUUID(), title: `Query ${index}`, sql: 'SELECT VERSION();', result: null, table: null,
})

const blankProfile = (): ConnectionProfile => ({
  id: '', name: '', engine: 'mysql', host: '127.0.0.1', port: 3306,
  username: 'root', defaultDatabase: null, tls: false, ssh: null, hasSavedPassword: false,
})

function quoteIdentifier(value: string) { return `\`${value.replaceAll('`', '``')}\`` }

function ProfileEditor({ initial, onClose, onSaved }: {
  initial: ConnectionProfile
  onClose: () => void
  onSaved: (profile: ConnectionProfile) => void
}) {
  const [profile, setProfile] = useState(initial)
  const [password, setPassword] = useState('')
  const [savePassword, setSavePassword] = useState(initial.hasSavedPassword)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = <K extends keyof ConnectionProfile>(key: K, value: ConnectionProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }))

  async function save() {
    setBusy(true)
    setError('')
    try {
      const saved = await api.saveProfile(profile, savePassword ? password : '', !savePassword)
      onSaved(saved)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal profile-modal" onMouseDown={event => event.stopPropagation()}>
      <header className="modal-header"><div><span className="eyebrow">CONNECTION PROFILE</span><h2>{initial.id ? 'Edit connection' : 'New connection'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
      <div className="form-grid">
        <label className="full">Display name<input value={profile.name} onChange={e => update('name', e.target.value)} placeholder="Production database" autoFocus /></label>
        <label>Engine<select value={profile.engine} onChange={e => update('engine', e.target.value as ConnectionProfile['engine'])}><option value="mysql">MySQL</option><option value="mariadb">MariaDB</option></select></label>
        <label>Default database<input value={profile.defaultDatabase ?? ''} onChange={e => update('defaultDatabase', e.target.value || null)} placeholder="Optional" /></label>
        <label className="host-field">Host<input value={profile.host} onChange={e => update('host', e.target.value)} /></label>
        <label>Port<input type="number" value={profile.port} onChange={e => update('port', Number(e.target.value))} /></label>
        <label>Username<input value={profile.username} onChange={e => update('username', e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={initial.hasSavedPassword ? 'Saved in keyring' : 'Enter when connecting'} /></label>
        <label className="check"><input type="checkbox" checked={savePassword} onChange={e => setSavePassword(e.target.checked)} /> Save password in system keyring</label>
        <label className="check"><input type="checkbox" checked={profile.tls} onChange={e => update('tls', e.target.checked)} /> Require TLS</label>
        <label className="check full"><input type="checkbox" checked={!!profile.ssh} onChange={e => update('ssh', e.target.checked ? { host: '', port: 22, username: '', identityFile: null } : null)} /> Connect through SSH tunnel</label>
        {profile.ssh && <>
          <label>SSH host<input value={profile.ssh.host} onChange={e => update('ssh', { ...profile.ssh!, host: e.target.value })} /></label>
          <label>SSH port<input type="number" value={profile.ssh.port} onChange={e => update('ssh', { ...profile.ssh!, port: Number(e.target.value) })} /></label>
          <label>SSH username<input value={profile.ssh.username} onChange={e => update('ssh', { ...profile.ssh!, username: e.target.value })} /></label>
          <label>Identity file<input value={profile.ssh.identityFile ?? ''} onChange={e => update('ssh', { ...profile.ssh!, identityFile: e.target.value || null })} placeholder="Uses SSH agent by default" /></label>
        </>}
      </div>
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
      <footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save connection'}</button></footer>
    </section>
  </div>
}

function BackupDialog({ profile, databases, onClose, onDone }: {
  profile: ConnectionProfile
  databases: SchemaItem[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [database, setDatabase] = useState(profile.defaultDatabase ?? databases[0]?.name ?? '')
  const [tables, setTables] = useState<string[]>([])
  const [selected, setSelected] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!database) return
    api.objects(profile.id, database)
      .then(items => setTables(items.filter(item => item.kind === 'table').map(item => item.name)))
      .catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database])

  async function run() {
    if (!database) return
    const path = await save({ title: 'Save SQL backup', defaultPath: `${database}.sql`, filters: [{ name: 'SQL backup', extensions: ['sql'] }] })
    if (!path) return
    setBusy(true)
    setError('')
    try {
      const count = await api.backup(profile.id, profile.engine, database, selected, path)
      onDone(`Backup completed: ${count} objects saved to ${path}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">BACKUP DATABASE</span><h2>Create SQL backup</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><label>Source database<select value={database} onChange={e => { setDatabase(e.target.value); setSelected(null) }}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      <div className="segmented"><button className={selected === null ? 'chosen' : ''} onClick={() => setSelected(null)}>Whole database</button><button className={selected !== null ? 'chosen' : ''} onClick={() => setSelected([])}>Selected tables</button></div>
      {selected === null ? <p className="helper">Includes tables, rows, views, triggers, routines, and events.</p> : <div className="table-checks">{tables.map(table => <label key={table}><input type="checkbox" checked={selected.includes(table)} onChange={e => setSelected(current => e.target.checked ? [...(current ?? []), table] : (current ?? []).filter(name => name !== table))} />{table}</label>)}</div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={run} disabled={busy || !database || (selected !== null && selected.length === 0)}>{busy ? 'Backing up…' : 'Create backup'}</button></footer>
  </section></div>
}

function RestoreDialog({ profile, onClose, onDone }: {
  profile: ConnectionProfile
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [path, setPath] = useState('')
  const [target, setTarget] = useState(profile.defaultDatabase ?? '')
  const [inspection, setInspection] = useState<RestoreInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function chooseFile() {
    const picked = await open({ title: 'Choose SQL backup', multiple: false, filters: [{ name: 'SQL backup', extensions: ['sql'] }] })
    if (typeof picked === 'string') { setPath(picked); setInspection(null); setError('') }
  }

  async function inspect() {
    setBusy(true)
    setError('')
    try { setInspection(await api.inspectRestore(profile.id, target, path)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function restore() {
    if (!inspection) return
    const overwrite = inspection.targetObjects.length > 0
    if (overwrite && !window.confirm(`The target contains ${inspection.targetObjects.length} objects. Matching objects from the backup will be replaced; other target objects will remain. Continue?`)) return
    setBusy(true)
    setError('')
    try {
      const count = await api.restore(profile.id, target, path, overwrite)
      onDone(`Restore completed: ${count} objects in ${target}`)
    } catch (cause) { setError(errorMessage(cause)); setInspection(null) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">RESTORE DATABASE</span><h2>Restore SQL backup</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><label>Backup file<div className="file-picker"><input readOnly value={path} placeholder="Choose a .sql backup" /><button className="secondary" onClick={chooseFile}>Browse</button></div></label>
      <label>Target database<input value={target} onChange={e => { setTarget(e.target.value); setInspection(null) }} placeholder="Can be different from source" /></label>
      {inspection && <div className="inspection"><strong>Source: {inspection.sourceDatabase}</strong><span>{inspection.objects.length} objects in backup</span>{inspection.targetObjects.length ? <p className={inspection.conflicts.length ? 'conflict' : 'clean'}>Target has {inspection.targetObjects.length} objects{inspection.conflicts.length ? `; ${inspection.conflicts.length} will be replaced: ${inspection.conflicts.join(', ')}` : '; no matching names will be replaced.'}</p> : <p className="clean">Target is empty; no conflicts found.</p>}</div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button>{inspection ? <button className="primary" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : inspection.targetObjects.length ? 'Confirm restore' : 'Restore to empty target'}</button> : <button className="primary" disabled={busy || !path || !target} onClick={inspect}>{busy ? 'Inspecting…' : 'Inspect backup'}</button>}</footer>
  </section></div>
}

function ImportDialog({ profile, databases, onClose, onDone }: {
  profile: ConnectionProfile
  databases: SchemaItem[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [format, setFormat] = useState<'csv' | 'sql'>('csv')
  const [database, setDatabase] = useState(profile.defaultDatabase ?? databases[0]?.name ?? '')
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!database) return
    api.objects(profile.id, database).then(items => {
      const names = items.filter(item => item.kind === 'table').map(item => item.name)
      setTables(names)
      setTable(current => names.includes(current) ? current : names[0] ?? '')
    }).catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database])

  useEffect(() => {
    if (!database || !table) return
    api.columns(profile.id, database, table).then(setColumns).catch(cause => setError(errorMessage(cause)))
  }, [profile.id, database, table])

  useEffect(() => {
    if (preview && columns.length) setMapping(preview.headers.map((header, index) => columns.includes(header) ? header : columns[index] ?? ''))
  }, [preview, columns])

  async function chooseFile() {
    const picked = await open({ title: `Choose ${format.toUpperCase()} file`, multiple: false, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (typeof picked !== 'string') return
    setPath(picked)
    setError('')
    if (format === 'csv') {
      try { setPreview(await api.previewCsv(picked)) }
      catch (cause) { setError(errorMessage(cause)) }
    }
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      if (format === 'csv') {
        if (new Set(mapping).size !== mapping.length || mapping.some(column => !column)) throw new Error('Map each CSV column to a different table column')
        const count = await api.importCsv(profile.id, database, table, path, mapping)
        onDone(`Imported ${count} CSV rows into ${database}.${table}`)
      } else {
        if (!window.confirm(`Run SQL from ${path} against ${database}? The file may change data and schema.`)) return
        const count = await api.importSql(profile.id, database, path)
        onDone(`Executed ${count} SQL statements in ${database}`)
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">IMPORT DATA</span><h2>Import file</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><div className="segmented"><button className={format === 'csv' ? 'chosen' : ''} onClick={() => { setFormat('csv'); setPath(''); setPreview(null) }}>CSV data</button><button className={format === 'sql' ? 'chosen' : ''} onClick={() => { setFormat('sql'); setPath(''); setPreview(null) }}>SQL script</button></div>
      <label>Database<select value={database} onChange={e => setDatabase(e.target.value)}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      {format === 'csv' && <label>Target table<select value={table} onChange={e => setTable(e.target.value)}>{tables.map(name => <option key={name}>{name}</option>)}</select></label>}
      <label>File<div className="file-picker"><input readOnly value={path} placeholder={`Choose a .${format} file`} /><button className="secondary" onClick={chooseFile}>Browse</button></div></label>
      {preview && format === 'csv' && <div className="csv-preview"><strong>Column mapping</strong>{preview.headers.map((header, index) => <div key={`${header}:${index}`}><span>{header}</span><span>→</span><select value={mapping[index] ?? ''} onChange={e => setMapping(current => current.map((column, columnIndex) => columnIndex === index ? e.target.value : column))}><option value="">Select column</option>{columns.map(column => <option key={column}>{column}</option>)}</select></div>)}<small>Preview: {preview.rows.length} sample rows</small></div>}
      {error && <p className="form-error"><CircleAlert size={16} />{error}</p>}
    </div><footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !database || !path || (format === 'csv' && (!table || !preview))} onClick={run}>{busy ? 'Importing…' : 'Import'}</button></footer>
  </section></div>
}

function ExportDialog({ profile, sql, onClose, onDone }: {
  profile: ConnectionProfile
  sql: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    const path = await save({ title: 'Export query results', defaultPath: `query-result.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (!path) return
    setBusy(true)
    setError('')
    try {
      const count = await api.exportQuery(profile.id, sql, path, format)
      onDone(`Exported ${count} rows to ${path}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal action-modal" onMouseDown={e => e.stopPropagation()}>
    <header className="modal-header"><div><span className="eyebrow">EXPORT DATA</span><h2>Export query results</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
    <div className="action-body"><p className="helper">Exports all rows from one read-only query, not just the visible preview.</p><div className="segmented"><button className={format === 'csv' ? 'chosen' : ''} onClick={() => setFormat('csv')}>CSV</button><button className={format === 'json' ? 'chosen' : ''} onClick={() => setFormat('json')}>JSON</button></div>{error && <p className="form-error"><CircleAlert size={16} />{error}</p>}</div>
    <footer className="modal-footer"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={run}>{busy ? 'Exporting…' : 'Export'}</button></footer>
  </section></div>
}

export default function App() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState('')
  const [databases, setDatabases] = useState<SchemaItem[]>([])
  const [expandedDb, setExpandedDb] = useState<string | null>(null)
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [objects, setObjects] = useState<SchemaItem[]>([])
  const [completionColumns, setCompletionColumns] = useState<string[]>([])
  const [tabs, setTabs] = useState<Tab[]>([newTab(1)])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [transaction, setTransaction] = useState(false)
  const [gridFilter, setGridFilter] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() => storedList<SavedQuery>('gui-sql:saved-queries'))
  const [history, setHistory] = useState<HistoryEntry[]>(() => storedList<HistoryEntry>('gui-sql:history'))
  const [action, setAction] = useState<'backup' | 'restore' | 'import' | 'export' | 'tools' | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const runRef = useRef<() => void>(() => {})
  const completionRef = useRef<string[]>([])

  useEffect(() => {
    setActiveTabId(current => current || tabs[0].id)
    api.profiles().then(setProfiles).catch(cause => setError(errorMessage(cause)))
  }, [])

  useEffect(() => { localStorage.setItem('gui-sql:saved-queries', JSON.stringify(savedQueries)) }, [savedQueries])
  useEffect(() => { localStorage.setItem('gui-sql:history', JSON.stringify(history)) }, [history])

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0]
  useEffect(() => { setGridFilter(activeTab.table?.filter ?? '') }, [activeTab.id, activeTab.table?.filter])
  const activeProfile = profiles.find(profile => profile.id === connectedId)
  completionRef.current = [...databases.map(item => item.name), ...objects.map(item => item.name), ...completionColumns]

  async function connect(profile: ConnectionProfile) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const temporaryPassword = profile.hasSavedPassword ? null : window.prompt(`Password for ${profile.username}@${profile.host}`)
      if (temporaryPassword === null && !profile.hasSavedPassword) return
      const version = await api.connect(profile.id, temporaryPassword)
      setConnectedId(profile.id)
      setTransaction(false)
      setServerVersion(version)
      setDatabases(await api.databases(profile.id))
      setExpandedDb(null)
      setSelectedDatabase(profile.defaultDatabase)
      setObjects([])
      setMessage(`Connected to ${profile.name}`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    if (connectedId) await api.disconnect(connectedId).catch(cause => setError(errorMessage(cause)))
    setConnectedId(null)
    setTransaction(false)
    setDatabases([])
    setObjects([])
    setExpandedDb(null)
    setSelectedDatabase(null)
    setServerVersion('')
  }

  async function toggleDatabase(name: string) {
    if (!connectedId) return
    if (expandedDb === name) { setExpandedDb(null); return }
    try {
      await api.selectDatabase(connectedId, name)
      setSelectedDatabase(name)
      setExpandedDb(name)
      setObjects(await api.objects(connectedId, name))
    }
    catch (cause) { setError(errorMessage(cause)) }
  }

  function updateSql(sql: string) {
    setTabs(current => current.map(tab => tab.id === activeTab.id ? { ...tab, sql, table: sql === tab.sql ? tab.table : null } : tab))
  }

  function addTab(sql = 'SELECT *\nFROM ;') {
    const next = { ...newTab(tabs.length + 1), sql }
    setTabs(current => [...current, next])
    setActiveTabId(next.id)
  }

  function inspectObject(database: string, object: SchemaItem) {
    if (object.kind === 'table') { void openTable(database, object.name); return }
    if (object.kind === 'index' && object.table) {
      addTab(`SHOW INDEX FROM ${quoteIdentifier(database)}.${quoteIdentifier(object.table)};`)
      return
    }
    addTab(`SHOW CREATE ${object.kind.toUpperCase()} ${quoteIdentifier(database)}.${quoteIdentifier(object.name)};`)
  }

  async function openTable(database: string, name: string, page = 0, tabId?: string, filter = '', sortBy: string | null = null, sortDesc = false) {
    if (!connectedId) return
    setBusy(true)
    setError('')
    try {
      const data = await api.tablePage(connectedId, database, name, page, filter, sortBy, sortDesc)
      setCompletionColumns(data.columns)
      const sql = `SELECT * FROM \`${database.replaceAll('`', '``')}\`.\`${name.replaceAll('`', '``')}\` LIMIT 100 OFFSET ${page * 100};`
      const result: QueryResult = { columns: data.columns, rows: data.rows, affectedRows: 0, elapsedMs: 0, truncated: data.hasMore }
      const table = { database, name, page, hasMore: data.hasMore, primaryKeys: data.primaryKeys, filter, sortBy, sortDesc }
      if (tabId) setTabs(current => current.map(tab => tab.id === tabId ? { ...tab, sql, result, table } : tab))
      else {
        const tab: Tab = { id: crypto.randomUUID(), title: name, sql, result, table }
        setTabs(current => [...current, tab])
        setActiveTabId(tab.id)
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  function closeTab(id: string) {
    setTabs(current => {
      if (current.length === 1) return [newTab(1)]
      const next = current.filter(tab => tab.id !== id)
      if (activeTabId === id) setActiveTabId(next[0].id)
      return next
    })
  }

  async function run(confirmed = false, overrideSql?: string) {
    if (!connectedId) { setError('Connect to a server first'); return }
    const selection = editorRef.current?.getModel()?.getValueInRange(editorRef.current.getSelection()!) ?? ''
    const sql = overrideSql ?? (selection.trim() || activeTab.sql)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.query(connectedId, sql, confirmed)
      setTabs(current => current.map(tab => tab.id === activeTab.id ? { ...tab, result, table: null } : tab))
      setMessage(`Completed in ${result.elapsedMs} ms`)
      if (!/IDENTIFIED\s+BY/i.test(sql)) setHistory(current => [{ id: crypto.randomUUID(), sql, when: new Date().toLocaleString() }, ...current].slice(0, 50))
    } catch (cause) {
      const message = errorMessage(cause)
      if (message.startsWith('CONFIRM_REQUIRED:') && window.confirm(message.slice('CONFIRM_REQUIRED:'.length))) {
        await run(true, sql)
      } else if (!message.startsWith('CONFIRM_REQUIRED:')) setError(message)
    } finally { setBusy(false) }
  }

  runRef.current = () => { void run() }
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current())
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems(model: Monaco.editor.ITextModel, position: Monaco.Position) {
        const word = model.getWordUntilPosition(position)
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        return { suggestions: [...new Set(completionRef.current)].map(label => ({
          label, insertText: `\`${label.replaceAll('`', '``')}\``, kind: monaco.languages.CompletionItemKind.Field, range,
        })) }
      },
    })
  }

  async function deleteProfile(profile: ConnectionProfile) {
    if (!window.confirm(`Delete connection “${profile.name}”?`)) return
    try {
      if (connectedId === profile.id) await disconnect()
      await api.deleteProfile(profile.id)
      setProfiles(current => current.filter(item => item.id !== profile.id))
    } catch (cause) { setError(errorMessage(cause)) }
  }

  async function editCell(row: unknown[], columnIndex: number) {
    if (!connectedId || !activeTab.table || !activeTab.result) return
    const { database, name, primaryKeys, page } = activeTab.table
    const column = activeTab.result.columns[columnIndex]
    if (!primaryKeys.length || primaryKeys.includes(column)) return
    const keys = primaryKeys.map(key => row[activeTab.result!.columns.indexOf(key)])
    if (keys.some(value => value === undefined || value === null)) { setError('Cannot edit a row without its complete primary key'); return }
    const previous = row[columnIndex]
    const entered = window.prompt(`New value for ${column} (type <NULL> to set NULL)`, previous === null ? '<NULL>' : String(previous))
    if (entered === null) return
    try {
      const changed = await api.updateCell(connectedId, database, name, column, keys, entered === '<NULL>' ? null : entered)
      if (changed !== 1) throw new Error('Row was not updated; it may have changed or disappeared')
      await openTable(database, name, page, activeTab.id, activeTab.table.filter, activeTab.table.sortBy, activeTab.table.sortDesc)
      setMessage(`Updated ${name}.${column}`)
    } catch (cause) { setError(errorMessage(cause)) }
  }

  async function changeTransaction(commit?: boolean) {
    if (!connectedId) return
    setError('')
    try {
      if (transaction) {
        await api.finishTransaction(connectedId, !!commit)
        setTransaction(false)
        setMessage(commit ? 'Transaction committed' : 'Transaction rolled back')
      } else {
        await api.beginTransaction(connectedId)
        setTransaction(true)
        setMessage('Transaction started')
      }
    } catch (cause) { setError(errorMessage(cause)) }
  }

  function saveQuery() {
    if (/IDENTIFIED\s+BY|PASSWORD\s*=/i.test(activeTab.sql)) {
      setError('Queries containing password credentials cannot be saved.')
      return
    }
    const name = window.prompt('Name for this query', activeTab.title)
    if (!name?.trim()) return
    setSavedQueries(current => [{ id: crypto.randomUUID(), name: name.trim(), sql: activeTab.sql }, ...current])
    setMessage(`Saved query “${name.trim()}”`)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Database size={21} strokeWidth={2.3} /></div><div><strong>wadahdb-studio</strong><span>MYSQL + MARIADB</span></div></div>
      <div className="sidebar-section-title"><span>CONNECTIONS</span><button className="icon-button" title="Add connection" onClick={() => setEditing(blankProfile())}><Plus size={16} /></button></div>
      <div className="profile-list">
        {profiles.length === 0 && <div className="empty-side">No connections yet.<br />Add one to get started.</div>}
        {profiles.map(profile => <div className={`profile-item ${connectedId === profile.id ? 'selected' : ''}`} key={profile.id}>
          <button className="profile-main" onClick={() => connect(profile)} disabled={busy}>
            <Server size={17} /><span><strong>{profile.name}</strong><small>{profile.username}@{profile.host}</small></span>
            {connectedId === profile.id && <i className="online-dot" />}
          </button>
          <div className="profile-actions"><button title="Edit" onClick={() => setEditing(profile)}><Pencil size={13} /></button><button title="Delete" onClick={() => deleteProfile(profile)}><Trash2 size={13} /></button></div>
        </div>)}
      </div>
      {connectedId && <>
        <div className="sidebar-section-title schema-title"><span>SCHEMAS</span><button className="icon-button" title="Refresh" onClick={() => api.databases(connectedId).then(setDatabases).catch(cause => setError(errorMessage(cause)))}><RefreshCw size={15} /></button></div>
        <div className="schema-list">{databases.map(database => <div key={database.name}>
          <button className="schema-db" onClick={() => toggleDatabase(database.name)}>{expandedDb === database.name ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Database size={15} /><span>{database.name}</span></button>
          {expandedDb === database.name && <div className="object-list">{objects.map(object => <button key={`${object.kind}:${object.table ?? ''}:${object.name}`} onClick={() => inspectObject(database.name, object)}><Table2 size={14} /><span>{object.table ? `${object.table}.` : ''}{object.name}</span><small>{object.kind}</small></button>)}</div>}
        </div>)}</div>
      </>}
      <div className="sidebar-section-title schema-title"><span>SAVED QUERIES</span><button className="icon-button" title="Save current query" onClick={saveQuery}><Plus size={15} /></button></div>
      <div className="saved-list">{savedQueries.length === 0 && <span className="empty-side">No saved queries.</span>}{savedQueries.map(item => <div key={item.id}><button onClick={() => addTab(item.sql)}><FileCode2 size={13} />{item.name}</button><button title="Delete saved query" onClick={() => setSavedQueries(current => current.filter(query => query.id !== item.id))}><X size={12} /></button></div>)}</div>
      <div className="sidebar-section-title schema-title"><span>HISTORY</span></div>
      <div className="saved-list history-list">{history.slice(0, 15).map(item => <button key={item.id} title={item.when} onClick={() => addTab(item.sql)}><span>{item.sql.replaceAll(/\s+/g, ' ').slice(0, 38)}</span></button>)}</div>
      <div className="sidebar-bottom">{activeProfile ? <><span className="connection-status"><i className="online-dot" /> {activeProfile.engine.toUpperCase()} · {serverVersion}</span><button className="icon-button" title="Disconnect" onClick={disconnect}><Unplug size={17} /></button></> : <span>Not connected</span>}</div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activeProfile?.name ?? 'No connection'}</strong></div><div className="topbar-actions"><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('tools')}><Settings2 size={15} /> Tools</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('import')}><Upload size={15} /> Import</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('export')}><Download size={15} /> Export</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('backup')}><Archive size={15} /> Backup</button><button className="secondary" disabled={!connectedId || transaction} onClick={() => setAction('restore')}><FolderInput size={15} /> Restore</button><button className="secondary" onClick={() => setEditing(blankProfile())}><Plus size={15} /> Connection</button></div></header>
      <div className="editor-tabs">{tabs.map(tab => <div className={`editor-tab ${tab.id === activeTab.id ? 'active' : ''}`} key={tab.id}><button onClick={() => setActiveTabId(tab.id)}><FileCode2 size={15} />{tab.title}</button><button className="tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.title}`}><X size={13} /></button></div>)}<button className="new-tab" title="New query tab" onClick={() => addTab('')}><Plus size={16} /></button></div>
      <div className="query-toolbar"><div className="query-context"><span className="context-dot" />{activeProfile ? `${activeProfile.engine.toUpperCase()} / ${selectedDatabase ?? 'no database'}` : 'Select a connection'}{transaction && <b className="tx-badge">TRANSACTION</b>}</div><div className="toolbar-right"><button className="ghost-action" onClick={saveQuery} title="Save query"><Save size={14} /></button><button className="ghost-action" disabled={!connectedId || busy} onClick={() => run(false, `EXPLAIN ${activeTab.sql.trim().replace(/;$/, '')}`)}>EXPLAIN</button>{transaction ? <><button className="ghost-action" onClick={() => changeTransaction(true)}>Commit</button><button className="ghost-action" onClick={() => changeTransaction(false)}>Rollback</button></> : <button className="ghost-action" disabled={!connectedId} onClick={() => changeTransaction()}>Begin tx</button>}{busy ? <button className="secondary cancel-button" onClick={() => connectedId && api.cancelQuery(connectedId).catch(cause => setError(errorMessage(cause)))}><Square size={12} fill="currentColor" /> Cancel</button> : null}<button className="primary run-button" onClick={() => run()} disabled={busy || !connectedId}>{busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />} Run query <kbd>Ctrl↵</kbd></button></div></div>
      <div className="editor-area"><Editor height="100%" language="sql" theme="vs-dark" value={activeTab.sql} onChange={value => updateSql(value ?? '')} onMount={onEditorMount} options={{ minimap: { enabled: false }, fontSize: 14, lineHeight: 23, padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, fontFamily: 'JetBrains Mono, Fira Code, monospace' }} /></div>
      <section className="results">
        <div className="results-header">
          <div>
            <strong>Results</strong>
            {activeTab.result && <span>{activeTab.result.rows.length} rows {activeTab.table ? `· page ${activeTab.table.page + 1}` : activeTab.result.truncated ? '(first 1,000)' : ''} · {activeTab.result.elapsedMs} ms</span>}
            {activeTab.table && <div className="pager">
              <button disabled={busy || activeTab.table.page === 0} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, activeTab.table!.page - 1, activeTab.id, activeTab.table!.filter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Previous</button>
              <button disabled={busy || !activeTab.table.hasMore} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, activeTab.table!.page + 1, activeTab.id, activeTab.table!.filter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Next</button>
            </div>}
          </div>
          <div className="result-state">{error ? <span className="state-error"><CircleAlert size={15} /> Error</span> : message ? <span className="state-ok"><CircleCheck size={15} /> Success</span> : 'Ready'}</div>
        </div>
        {activeTab.table && <div className="grid-controls">
          <input aria-label="Filter table rows" placeholder="Filter rows across all columns…" value={gridFilter} onChange={event => setGridFilter(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, gridFilter, activeTab.table!.sortBy, activeTab.table!.sortDesc) }} />
          <button className="secondary" disabled={busy} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, gridFilter, activeTab.table!.sortBy, activeTab.table!.sortDesc)}>Filter rows</button>
          {activeTab.table.filter && <button className="ghost-action" disabled={busy} onClick={() => { setGridFilter(''); openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, '', activeTab.table!.sortBy, activeTab.table!.sortDesc) }}>Clear</button>}
        </div>}
        {error && <div className="error-banner"><CircleAlert size={17} />{error}</div>}
        {message && !error && <div className="success-banner">{message}</div>}
        {activeTab.result?.columns.length ? <div className="table-wrap"><table><thead><tr><th className="row-num">#</th>{activeTab.result.columns.map((column, index) => <th key={`${column}:${index}`}>{activeTab.table ? <button className="sort-header" title={`Sort by ${column}`} onClick={() => openTable(activeTab.table!.database, activeTab.table!.name, 0, activeTab.id, activeTab.table!.filter, column, activeTab.table!.sortBy === column ? !activeTab.table!.sortDesc : false)}>{column}{activeTab.table.sortBy === column ? (activeTab.table.sortDesc ? ' ↓' : ' ↑') : ''}</button> : column}</th>)}</tr></thead><tbody>{activeTab.result.rows.map((row, rowIndex) => <tr key={rowIndex}><td className="row-num">{activeTab.table ? activeTab.table.page * 100 + rowIndex + 1 : rowIndex + 1}</td>{row.map((value, index) => <td key={index} className={activeTab.table?.primaryKeys.length && !activeTab.table.primaryKeys.includes(activeTab.result!.columns[index]) ? 'editable-cell' : ''} title={activeTab.table ? 'Double-click to edit when table has a primary key' : value === null ? 'NULL' : String(value)} onDoubleClick={() => editCell(row, index)}>{value === null ? <em>NULL</em> : String(value)}</td>)}</tr>)}</tbody></table></div> : <div className="results-empty">{activeTab.result ? `${activeTab.result.affectedRows} rows affected` : 'Run a query to see results here.'}</div>}
      </section>
      <footer className="statusbar"><span><i className={connectedId ? 'online-dot' : 'offline-dot'} />{connectedId ? 'Connected' : 'Disconnected'}</span><span>wadahdb-studio · Open source</span></footer>
    </main>
    {editing && <ProfileEditor initial={editing} onClose={() => setEditing(null)} onSaved={saved => { setProfiles(current => [...current.filter(item => item.id !== saved.id), saved]); setEditing(null) }} />}
    {action === 'backup' && activeProfile && <BackupDialog profile={activeProfile} databases={databases} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'restore' && activeProfile && <RestoreDialog profile={activeProfile} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null); api.databases(activeProfile.id).then(setDatabases).catch(cause => setError(errorMessage(cause))) }} />}
    {action === 'import' && activeProfile && <ImportDialog profile={activeProfile} databases={databases} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'export' && activeProfile && <ExportDialog profile={activeProfile} sql={activeTab.table ? `SELECT * FROM \`${activeTab.table.database.replaceAll('`', '``')}\`.\`${activeTab.table.name.replaceAll('`', '``')}\`` : activeTab.sql} onClose={() => setAction(null)} onDone={result => { setMessage(result); setAction(null) }} />}
    {action === 'tools' && activeProfile && <Tools databases={databases.map(item => item.name)} initialDatabase={expandedDb ?? activeProfile.defaultDatabase ?? ''} onClose={() => setAction(null)} onOpenSql={addTab} />}
  </div>
}
